/**
 * The operator's installation: what may be run, where, and how much of it.
 *
 * Everything a run needs is fixed here, before the first tool call. A tool
 * argument may only select a suite and a case by name; it can never name a
 * project document, a path, a binary, or a budget. That is the same shape as
 * an MCP installation in a PtcRunner host document, where the operator fixes
 * the transport and the manifest only narrows what was installed.
 */

import { ConfigError } from './errors.js'

export const DEFAULTS = Object.freeze({
  ptc: 'ptc',
  timeoutMs: 300_000,
  maxRuns: 32,
  retries: 0,
})

const USAGE = `ptc-suite-mcp 0.1.0 -- run host-owned validation cases against a PtcRunner project

Usage:
  ptc-suite-mcp --project-root <dir> --suites <path> [options]        # stdio MCP server
  ptc-suite-mcp --project-root <dir> --suites <path> --check [name..] # run every case and exit

Options:
  --project-root <dir>   Directory holding the project documents a suite may name. Required.
  --suites <path>        A suite document, or a directory of *.suite.json. Required, repeatable.
  --artifacts <dir>      Where per-case results, envelopes, and traces are written.
                         Default <project-root>/.ptc-suite.
  --ptc <path>           The ptc executable. Default "ptc", resolved through PATH.
  --retries <n>          Run a case again when it exits 4, provider acquisition, which a
                         cold npx fetch of a stdio MCP server causes. Default 0. A failed
                         workflow or an exceeded limit is never retried: that is the
                         thing under test.
  --timeout-ms <n>       Wall clock ceiling for one case. Default 300000.
  --max-runs <n>         Total cases this process will run before refusing. Default 32.
  --allow-live           Acknowledge that a case executes the project's installed
                         providers, contacts them, and spends credit. Without it
                         run_case refuses and --check does nothing.
  --check [name..]       Do not serve MCP. Run every case, print a summary, and exit
                         non-zero on any failure. A name is "suite" or "suite/case",
                         each half matched by prefix.
  --help                 Print this message.
  --version              Print the version.

A suite names its project document relative to --project-root; a name that escapes
that root, or is not a regular file, is refused at startup rather than at call time.
Protocol messages go to stdout, diagnostics to stderr.`

export function parseArguments(argv) {
  const suites = []
  const check = []
  const options = { ...DEFAULTS, allowLive: false, checkMode: false }

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]

    if (flag === '--help' || flag === '--version') continue
    if (flag === '--allow-live') {
      options.allowLive = true
      continue
    }
    if (flag === '--check') {
      options.checkMode = true
      // Trailing bare words select suites; the next flag ends the list.
      while (index + 1 < argv.length && !argv[index + 1].startsWith('--')) {
        check.push(argv[index + 1])
        index += 1
      }
      continue
    }

    const value = argv[index + 1]
    if (value === undefined) throw new ConfigError(`missing value for ${flag}`)

    if (flag === '--project-root') options.projectRoot = value
    else if (flag === '--suites') suites.push(value)
    else if (flag === '--artifacts') options.artifacts = value
    else if (flag === '--ptc') options.ptc = value
    else if (flag === '--retries') options.retries = nonNegativeInteger(value, flag)
    else if (flag === '--timeout-ms') options.timeoutMs = positiveInteger(value, flag)
    else if (flag === '--max-runs') options.maxRuns = positiveInteger(value, flag)
    else throw new ConfigError(`unknown option ${flag}`)
    index += 1
  }

  if (options.projectRoot === undefined) throw new ConfigError('--project-root is required')
  if (suites.length === 0) throw new ConfigError('--suites is required')
  return { ...options, suites, check }
}

function positiveInteger(value, flag) {
  if (!/^[1-9][0-9]*$/.test(value)) throw new ConfigError(`${flag} must be a positive integer`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new ConfigError(`${flag} is too large`)
  return parsed
}

function nonNegativeInteger(value, flag) {
  if (value === '0') return 0
  return positiveInteger(value, flag)
}

export { USAGE }
