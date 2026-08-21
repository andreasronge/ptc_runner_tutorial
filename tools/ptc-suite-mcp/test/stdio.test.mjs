/**
 * The protocol surface, spoken to the real binary over a pipe.
 *
 * No case runs here: the server is started without --allow-live, so this
 * covers discovery and refusal, which are exactly the paths a caller hits
 * before spending anything.
 */

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/server'

const cli = join(dirname(dirname(fileURLToPath(import.meta.url))), 'src', 'cli.js')
const workspace = mkdtempSync(join(tmpdir(), 'ptc-suite-mcp-stdio-'))
const root = join(workspace, 'project')
mkdirSync(root)
writeFileSync(join(root, 'app.ptc-project.json'), '{}')
writeFileSync(
  join(workspace, 'chapter.suite.json'),
  JSON.stringify({
    version: 1,
    name: 'chapter',
    description: 'a chapter',
    project: 'app.ptc-project.json',
    cases: [
      {
        name: 'observed',
        description: 'the shipped question',
        input: { task: 'go' },
        expect: { result: [{ path: 'ok', equals: true }], capabilities_called: ['mission/files.read'] },
      },
    ],
  }),
)

let client
let rejectedLegacy

before(async () => {
  client = connect(['--project-root', root, '--suites', join(workspace, 'chapter.suite.json')])

  // The server is built with legacy: 'reject'. The 2025 ladder the SDK still
  // exports as "latest" opens with `initialize`, and that is refused -- the
  // refusal names the profile the server does speak, which is handshake-free
  // and carries its version in every request's `_meta`. Reading the version
  // out of the refusal keeps this test off a pinned date.
  rejectedLegacy = await client
    .request('initialize', {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    })
    .then(
      () => null,
      (error) => error,
    )
  client.speak(rejectedLegacy.data.supported[0])
})

after(() => {
  client?.close()
  rmSync(workspace, { recursive: true, force: true })
})

test('the legacy handshake is refused, and the refusal names what is spoken', () => {
  assert.match(rejectedLegacy.message, /Unsupported protocol version/)
  assert.ok(Array.isArray(rejectedLegacy.data.supported) && rejectedLegacy.data.supported.length > 0)
})

test('the server offers exactly the two tools', async () => {
  const { tools } = await client.request('tools/list', {})
  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    ['list_suites', 'run_case'],
  )
})

test('list_suites reports the installation, and what each case would prove', async () => {
  const result = await client.request('tools/call', { name: 'list_suites', arguments: {} })
  const value = result.structuredContent

  assert.equal(value.live_runs_allowed, false)
  assert.equal(value.runs_remaining, 32)
  assert.deepEqual(value.suites[0].cases[0].asserts, ['ok: equals', 'mission/files.read was called'])
})

test('run_case refuses when the installation did not allow live runs', async () => {
  const result = await client.request('tools/call', {
    name: 'run_case',
    arguments: { suite: 'chapter', case: 'observed' },
  })
  assert.equal(result.isError, true)
  assert.match(JSON.stringify(result.content), /--allow-live/)
})

test('a case the operator did not install cannot be named', async () => {
  const result = await client.request('tools/call', {
    name: 'run_case',
    arguments: { suite: 'chapter', case: 'invented' },
  })
  assert.equal(result.isError, true)
  assert.match(JSON.stringify(result.content), /no case named invented/)
})

/** A newline-delimited JSON-RPC client, which is all the stdio transport is. */
function connect(argv) {
  const child = spawn(process.execPath, [cli, ...argv], { stdio: ['pipe', 'pipe', 'pipe'] })
  const pending = new Map()
  let buffer = ''
  let id = 0

  child.stdout.on('data', (chunk) => {
    buffer += chunk
    for (let end = buffer.indexOf('\n'); end !== -1; end = buffer.indexOf('\n')) {
      const line = buffer.slice(0, end).trim()
      buffer = buffer.slice(end + 1)
      if (line === '') continue
      const message = JSON.parse(line)
      const settle = pending.get(message.id)
      if (settle === undefined) continue
      pending.delete(message.id)
      if (message.error) settle.reject(Object.assign(new Error(message.error.message), { data: message.error.data }))
      else settle.resolve(message.result)
    }
  })

  let meta

  return {
    /** Adopt a profile: from here every request carries it in `_meta`. */
    speak(protocolVersion) {
      meta = {
        'io.modelcontextprotocol/protocolVersion': protocolVersion,
        'io.modelcontextprotocol/clientInfo': { name: 'test', version: '0' },
        'io.modelcontextprotocol/clientCapabilities': {},
      }
    },
    request(method, params) {
      id += 1
      const current = id
      const settled = new Promise((resolve, reject) => pending.set(current, { resolve, reject }))
      const payload = meta === undefined ? params : { ...params, _meta: meta }
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: current, method, params: payload })}\n`)
      return settled
    },
    close() {
      child.kill()
    },
  }
}
