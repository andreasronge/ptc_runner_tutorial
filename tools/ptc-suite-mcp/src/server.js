/**
 * The two tools.
 *
 * `list_suites` is the whole discovery surface, and `run_case` is the whole
 * authority. Neither accepts a path, a command, or a budget: a caller selects
 * one installed case by name, and everything else was fixed by the operator on
 * the command line. That is deliberate -- when a model drives this server, the
 * set of things it can cause to happen must be enumerable by reading the
 * installation, not by reading the model's arguments.
 */

import { fromJsonSchema, McpServer } from '@modelcontextprotocol/server'

import { ToolError } from './errors.js'

export const IDENTITY = { name: 'ptc-suite-mcp', version: '0.1.0' }

export function createServer(config, suites, runner) {
  const server = new McpServer(IDENTITY, {
    instructions:
      'Run host-owned validation cases against installed PtcRunner projects. Call list_suites first: only the ' +
      'suites and cases it names can be run. run_case executes one case against live providers and returns a ' +
      'pass/fail report with every assertion it made, the run reference, and what the run spent. Cases run one ' +
      'at a time and the process has a total run budget, so choose cases rather than running everything.',
  })

  const meta = { 'io.modelcontextprotocol/cacheScope': 'private' }

  server.registerTool(
    'list_suites',
    {
      title: 'List validation suites',
      description: 'The installed suites and the cases each one holds. Nothing else can be run.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: meta,
      inputSchema: fromJsonSchema({
        type: 'object',
        properties: { suite: { type: 'string', description: 'Only this suite, instead of all of them.' } },
        additionalProperties: false,
      }),
      outputSchema: fromJsonSchema({
        type: 'object',
        properties: {
          runs_remaining: { type: 'integer' },
          live_runs_allowed: { type: 'boolean' },
          suites: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                project: { type: 'string' },
                cases: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      description: { type: 'string' },
                      asserts: { type: 'array', items: { type: 'string' } },
                    },
                    additionalProperties: false,
                  },
                },
              },
              additionalProperties: false,
            },
          },
        },
        required: ['suites', 'runs_remaining', 'live_runs_allowed'],
        additionalProperties: false,
      }),
    },
    async (args) => {
      const selected = args.suite === undefined ? [...suites.values()] : [required(suites, args.suite)]
      return structured({
        live_runs_allowed: config.allowLive,
        runs_remaining: runner.remaining(),
        suites: selected.map(describe),
      })
    },
  )

  server.registerTool(
    'run_case',
    {
      title: 'Run one validation case',
      description:
        'Runs one installed case and reports whether it passed. This executes the project with its installed ' +
        'providers, so it takes time and spends credit. One case per call.',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      _meta: meta,
      inputSchema: fromJsonSchema({
        type: 'object',
        properties: {
          suite: { type: 'string', minLength: 1, description: 'A suite name from list_suites.' },
          case: { type: 'string', minLength: 1, description: 'A case name from that suite.' },
        },
        required: ['suite', 'case'],
        additionalProperties: false,
      }),
      // The report is wide and grows with the vocabulary of checks, so the
      // schema pins what a caller must be able to rely on and admits the rest.
      outputSchema: fromJsonSchema({
        type: 'object',
        properties: {
          suite: { type: 'string' },
          case: { type: 'string' },
          status: { type: 'string', enum: ['pass', 'fail'] },
          exit_status: { type: 'integer' },
          duration_ms: { type: 'integer' },
          checks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                check: { type: 'string' },
                status: { type: 'string', enum: ['pass', 'fail'] },
                detail: { type: 'string' },
              },
              required: ['check', 'status'],
              additionalProperties: false,
            },
          },
        },
        required: ['suite', 'case', 'status', 'checks'],
        additionalProperties: true,
      }),
    },
    async (args) => {
      if (typeof args.suite !== 'string' || typeof args.case !== 'string') {
        throw new ToolError('suite and case must be strings')
      }
      return structured(await runner.runCase(args.suite, args.case))
    },
  )

  return server
}

function required(suites, name) {
  const suite = suites.get(name)
  if (suite === undefined) throw new ToolError(`no suite named ${name}`)
  return suite
}

/**
 * What a suite looks like from outside.
 *
 * `asserts` is the case's expectations rendered as short phrases. A caller
 * choosing which case to spend a run on should be able to see what the case
 * would prove without running it.
 */
function describe(suite) {
  return {
    name: suite.name,
    description: suite.description,
    project: suite.project.relative,
    cases: suite.cases.map((testCase) => ({
      name: testCase.name,
      description: testCase.description,
      asserts: assertions(testCase),
    })),
  }
}

function assertions(testCase) {
  const expect = testCase.expect ?? {}
  const phrases = []

  if (testCase.expected !== undefined) phrases.push('the result equals an exact value')
  for (const path of expect.result_keys ?? []) phrases.push(`the result has ${path}`)
  for (const check of expect.result ?? []) {
    phrases.push(`${check.path}: ${Object.keys(check).filter((key) => key !== 'path').join(', ')}`)
  }
  for (const name of expect.capabilities_called ?? []) phrases.push(`${name} was called`)
  for (const name of expect.capabilities_not_called ?? []) phrases.push(`${name} was not called`)
  if (expect.no_capability_refusals) phrases.push('no capability was refused')
  if (expect.max_subordinate_evaluations !== undefined) {
    phrases.push(`at most ${expect.max_subordinate_evaluations} subordinate evaluations`)
  }
  if (expect.max_cost_usd !== undefined) phrases.push(`at most $${expect.max_cost_usd}`)
  return phrases
}

function structured(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value }
}
