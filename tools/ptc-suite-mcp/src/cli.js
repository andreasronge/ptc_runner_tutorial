#!/usr/bin/env node
/**
 * One binary, two front ends over the same suite runner.
 *
 * `--check` is the CI path: run every installed case and exit non-zero if any
 * failed. Without it the process speaks MCP over stdio and a caller -- a PTC
 * agent, or any MCP host -- chooses which cases to spend runs on.
 *
 * Both go through the same loader and the same runner, so a suite that CI
 * accepts is exactly the suite an agent can run, and neither front end can
 * assert something the other cannot.
 */

import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { serveStdio } from '@modelcontextprotocol/server/stdio'

import { parseArguments, USAGE } from './config.js'
import { loadSuites } from './suite.js'
import { createRunner } from './runner.js'
import { createServer, IDENTITY } from './server.js'

export async function main(argv) {
  if (argv.includes('--help')) {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }
  if (argv.includes('--version')) {
    process.stdout.write(`${IDENTITY.version}\n`)
    return 0
  }

  const parsed = parseArguments(argv)
  const config = {
    ...parsed,
    projectRoot: resolve(parsed.projectRoot),
    artifacts: resolve(parsed.artifacts ?? resolve(parsed.projectRoot, '.ptc-suite')),
  }
  const suites = loadSuites(config.suites, config.projectRoot)
  mkdirSync(config.artifacts, { recursive: true })
  const runner = createRunner(config, suites)

  return config.checkMode ? check(config, suites, runner) : serve(config, suites, runner)
}

/** Runs every installed case, or those whose suite name starts with a filter. */
async function check(config, suites, runner) {
  if (!config.allowLive) {
    process.stderr.write('--check needs --allow-live: every case runs the project against its installed providers\n')
    return 64
  }

  const selected = [...suites.values()]
    .map((suite) => ({ suite, cases: suite.cases.filter((testCase) => selects(config.check, suite, testCase)) }))
    .filter((entry) => entry.cases.length > 0)
  if (selected.length === 0) {
    process.stderr.write('no case matched\n')
    return 64
  }

  let failed = 0
  let total = 0
  let cost = 0

  for (const { suite, cases } of selected) {
    process.stdout.write(`==> ${suite.name} (${suite.project.relative})\n`)
    for (const testCase of cases) {
      total += 1
      const report = await runner.runCase(suite.name, testCase.name)
      cost += report.usage.cost_usd ?? 0
      const seconds = (report.duration_ms / 1000).toFixed(1)
      const tries = report.attempts > 1 ? `, ${report.attempts} attempts` : ''
      process.stdout.write(`    ${report.status.toUpperCase()} ${testCase.name} (${seconds}s${tries})\n`)
      if (report.status === 'pass') continue

      failed += 1
      for (const check_ of report.checks.filter((entry) => entry.status === 'fail')) {
        process.stdout.write(`        ${check_.check} -- ${check_.detail}\n`)
      }
      if (report.reason === 'timeout') process.stdout.write('        the run was killed at the time ceiling\n')
      if (report.reason === 'provider_unavailable') {
        process.stdout.write('        a provider never became available; --retries 1 covers a cold npx fetch\n')
      }
      if (report.stderr_tail) {
        for (const line of report.stderr_tail.split('\n').slice(-5)) {
          process.stdout.write(`        stderr: ${line}\n`)
        }
      }
    }
  }

  process.stdout.write(`\n${total - failed}/${total} cases passed, $${cost.toFixed(4)} spent\n`)
  return failed > 0 ? 1 : 0
}

/** A filter is `suite` or `suite/case`, each half matched by prefix. */
function selects(filters, suite, testCase) {
  if (filters.length === 0) return true
  return filters.some((filter) => {
    const [suitePrefix, casePrefix] = filter.split('/')
    if (!suite.name.startsWith(suitePrefix)) return false
    return casePrefix === undefined || testCase.name.startsWith(casePrefix)
  })
}

function serve(config, suites, runner) {
  const transport = serveStdio(() => createServer(config, suites, runner), {
    legacy: 'reject',
    onerror: () => process.stderr.write('ptc-suite-mcp transport error\n'),
  })

  const cases = [...suites.values()].reduce((count, suite) => count + suite.cases.length, 0)
  process.stderr.write(
    `ptc-suite-mcp: ${suites.size} suite(s), ${cases} case(s), ${config.maxRuns} run budget` +
      `${config.allowLive ? '' : ', live runs refused (no --allow-live)'}\n`,
  )

  const shutdown = () => {
    void Promise.resolve()
      .then(() => transport.close())
      .finally(() => process.exit(0))
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  // Serving is open-ended: the transport owns the process from here.
  return new Promise(() => {})
}

main(process.argv.slice(2)).then(
  (status) => {
    if (typeof status === 'number' && status !== 0) process.exitCode = status
  },
  (error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'startup failed'}\n`)
    process.exit(64)
  },
)
