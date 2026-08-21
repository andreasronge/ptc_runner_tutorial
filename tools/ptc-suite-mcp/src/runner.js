/**
 * Running one case.
 *
 * A case is one `ptc run` of an installed project document with the case's
 * input, into a per-case artifact directory. Everything the report claims is
 * read back out of that directory afterwards, which is why it is emptied
 * first: a run that publishes nothing must report an unavailable result, never
 * the previous run's value.
 *
 * Cases run one at a time. The obvious reason is cost -- a model asked to
 * "check everything" would otherwise fan out a dozen live runs at once -- but
 * the load-bearing one is that a chapter's artifacts root is shared, so
 * concurrent runs of the same project interleave in `.ptc/`.
 */

import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

import { ToolError } from './errors.js'
import { clamp } from './json.js'
import { evaluate } from './checks.js'

const MAX_RESULT_CHARS = 8_000
const MAX_STDERR_CHARS = 2_000
const KILL_GRACE_MS = 5_000

/**
 * Provider acquisition. A stdio MCP server that npx has to fetch before it can
 * answer is the usual cause, and it says nothing about the chapter under test,
 * so this is the one exit status --retries will run again. A failed workflow
 * (5) or an exceeded limit (6) is the thing being measured and is never
 * retried, however transient it might be.
 */
const PROVIDER_ACQUISITION = 4

export function createRunner(config, suites) {
  let spent = 0
  let queue = Promise.resolve()

  /** Selects an installed case by name. A caller can never name a path. */
  function select(suiteName, caseName) {
    const suite = suites.get(suiteName)
    if (suite === undefined) {
      throw new ToolError(`no suite named ${suiteName}; call list_suites for the installed ones`)
    }
    const testCase = suite.cases.find((entry) => entry.name === caseName)
    if (testCase === undefined) {
      throw new ToolError(`suite ${suiteName} has no case named ${caseName}`)
    }
    return { suite, testCase }
  }

  function runCase(suiteName, caseName) {
    const { suite, testCase } = select(suiteName, caseName)
    if (!config.allowLive) {
      throw new ToolError(
        'this installation was started without --allow-live, so no case may run: a case executes the ' +
          "project's installed providers and spends credit",
      )
    }
    if (spent >= config.maxRuns) {
      throw new ToolError(`the run budget for this process is spent (${config.maxRuns} runs)`)
    }
    spent += 1

    // Chain rather than await: two overlapping tool calls queue instead of
    // racing, and a failed case does not poison the queue for the next one.
    const started = queue.then(
      () => execute(config, suite, testCase),
      () => execute(config, suite, testCase),
    )
    queue = started.catch(() => {})
    return started
  }

  return { runCase, remaining: () => config.maxRuns - spent }
}

async function execute(config, suite, testCase) {
  const caseRoot = join(config.artifacts, suite.name, testCase.name)
  const traces = join(caseRoot, 'traces')
  const resultPath = join(caseRoot, testCase.inputClass === 'private' ? 'result.private.json' : 'result.json')
  const envelopePath = join(caseRoot, 'envelope.json')
  const inputPath = join(caseRoot, 'input.json')

  // Emptied before every attempt, so a run that publishes nothing reports an
  // unavailable result instead of the previous attempt's value.
  const prepare = () => {
    rmSync(caseRoot, { recursive: true, force: true })
    mkdirSync(traces, { recursive: true })
    writeFileSync(inputPath, `${JSON.stringify(testCase.input, null, 2)}\n`, { mode: 0o600 })
  }

  // The project document is named by basename from its own directory, the way
  // the tutorial's own scripts run it: paths inside a project document resolve
  // against the document, not against wherever this server was started.
  const argv = [
    'run',
    basenameOf(suite.project.absolute),
    testCase.inputClass === 'private' ? '--private-input' : '--input',
    inputPath,
    suite.resultClass === 'private' ? '--private-output' : '--output',
    resultPath,
    '--trace-dir',
    traces,
    '--envelope',
    envelopePath,
  ]

  const started = Date.now()
  let attempts = 0
  let outcome
  do {
    attempts += 1
    prepare()
    outcome = await run(config, dirname(suite.project.absolute), argv)
  } while (outcome.status === PROVIDER_ACQUISITION && attempts <= config.retries)
  const durationMs = Date.now() - started

  const envelope = readJson(envelopePath)
  const usage = readUsage(envelope)
  const result = readJson(resultPath)

  const observed = { exitStatus: outcome.status, signal: outcome.signal, result, usage }
  const checks = outcome.timedOut ? [] : evaluate(testCase, observed)
  const failed = checks.filter((check) => check.status === 'fail')

  const report = {
    suite: suite.name,
    case: testCase.name,
    description: testCase.description,
    status: outcome.timedOut || failed.length > 0 ? 'fail' : 'pass',
    reason: reasonFor(outcome, failed),
    exit_status: outcome.status,
    attempts,
    run_ref: envelope.value?.run_ref ?? null,
    envelope_status: envelope.value?.status ?? null,
    error_code: envelope.value?.error?.code ?? null,
    duration_ms: durationMs,
    usage,
    checks,
    result: bounded(result),
    artifacts: {
      input: relative(config.artifacts, inputPath),
      result: relative(config.artifacts, resultPath),
      envelope: relative(config.artifacts, envelopePath),
      traces: relative(config.artifacts, traces),
    },
  }

  // Diagnostics only when something failed: a passing case has nothing to
  // explain, and ptc writes progress noise to stderr on every run.
  if (report.status === 'fail' && outcome.stderr !== '') report.stderr_tail = outcome.stderr
  return report
}

/**
 * Why a case failed, most environmental first.
 *
 * A caller deciding whether a chapter is broken needs to know that the run
 * never reached the workflow. Reporting that as `expectation_failed` would
 * blame the tutorial for a provider that would not start.
 */
function reasonFor(outcome, failed) {
  if (outcome.timedOut) return 'timeout'
  if (outcome.status === PROVIDER_ACQUISITION) return 'provider_unavailable'
  return failed.length > 0 ? 'expectation_failed' : null
}

function run(config, cwd, argv) {
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(config.ptc, argv, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env })
    } catch {
      reject(new ToolError(`could not start ${config.ptc}`))
      return
    }

    let stderr = ''
    let timedOut = false
    // stdout is the run's value, which is read back from --output instead;
    // it is still drained so a chatty run cannot fill the pipe and block.
    child.stdout.resume()
    child.stderr.on('data', (chunk) => {
      stderr = tail(stderr + chunk, MAX_STDERR_CHARS)
    })

    // SIGTERM first so the release can close its providers; SIGKILL only if it
    // will not go. A run killed either way is reported as a timeout, never as
    // a workflow that failed on its merits.
    const deadline = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS).unref()
    }, config.timeoutMs)

    child.on('error', () => {
      clearTimeout(deadline)
      reject(new ToolError(`could not start ${config.ptc}: is it on PATH?`))
    })
    child.on('close', (status, signal) => {
      clearTimeout(deadline)
      resolve({ status: status ?? -1, signal, stderr: stderr.trim(), timedOut })
    })
  })
}

function readJson(path) {
  try {
    return { state: 'available', value: JSON.parse(readFileSync(path, 'utf8')) }
  } catch {
    return { state: 'unavailable', value: undefined }
  }
}

/**
 * The published result as the report carries it.
 *
 * Checks see the whole value; the report may not. A chapter's answer can be
 * long, and the point of returning it at all is that a caller reasons about
 * it, so an oversized value is truncated rather than dropped -- with the
 * artifact path in the report for whoever needs the rest.
 */
function bounded(result) {
  if (result.state !== 'available') return { state: 'unavailable' }

  const encoded = JSON.stringify(result.value)
  if (encoded !== undefined && encoded.length > MAX_RESULT_CHARS) {
    return { state: 'truncated', preview: clamp(encoded, MAX_RESULT_CHARS) }
  }
  return { state: 'available', value: result.value }
}

/** The envelope facts a case may assert on, flattened to one shape. */
function readUsage(envelope) {
  const usage = envelope.value?.execution?.usage ?? {}
  const models = Array.isArray(usage.llm_usage) ? usage.llm_usage : []
  const costs = models.map((entry) => entry.usage?.total_cost).filter((cost) => typeof cost === 'number')

  return {
    cost_usd: costs.length > 0 ? Number(costs.reduce((total, cost) => total + cost, 0).toFixed(6)) : null,
    subordinate_evaluations: usage.subordinate_evaluations ?? null,
    capability_calls: usage.capability_calls ?? {},
    capability_refusals: usage.capability_refusals ?? {},
  }
}

function basenameOf(path) {
  return path.slice(path.lastIndexOf('/') + 1)
}

function tail(text, limit) {
  const string = String(text)
  return string.length <= limit ? string : string.slice(string.length - limit)
}
