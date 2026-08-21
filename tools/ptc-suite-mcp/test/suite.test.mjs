import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { loadSuites } from '../src/suite.js'

const workspace = mkdtempSync(join(tmpdir(), 'ptc-suite-mcp-'))
const root = join(workspace, 'project')
const outside = join(workspace, 'outside')
mkdirSync(root)
mkdirSync(outside)
writeFileSync(join(root, 'app.ptc-project.json'), '{}')
writeFileSync(join(outside, 'other.ptc-project.json'), '{}')
symlinkSync(join(outside, 'other.ptc-project.json'), join(root, 'linked.ptc-project.json'))

after(() => rmSync(workspace, { recursive: true, force: true }))

let counter = 0
function suiteFile(document) {
  counter += 1
  const path = join(workspace, `${counter}.suite.json`)
  writeFileSync(path, JSON.stringify(document))
  return path
}

function valid(overrides = {}) {
  return {
    version: 1,
    name: 'chapter',
    project: 'app.ptc-project.json',
    cases: [{ name: 'observed', input: { task: 'go' }, expect: { result_keys: ['ok'] } }],
    ...overrides,
  }
}

const load = (document) => loadSuites([suiteFile(document)], root)

test('a valid suite resolves its project document inside the root', () => {
  const suites = load(valid())
  const suite = suites.get('chapter')
  assert.equal(suite.project.relative, 'app.ptc-project.json')
  assert.equal(suite.cases[0].inputClass, 'normal')
  assert.equal(suite.resultClass, 'normal')
})

test('a project document outside the root is refused, symlink included', () => {
  assert.throws(() => load(valid({ project: '../outside/other.ptc-project.json' })), /outside the project root/)
  assert.throws(() => load(valid({ project: 'linked.ptc-project.json' })), /outside the project root/)
  assert.throws(() => load(valid({ project: '/etc/hosts' })), /must be a relative path/)
  assert.throws(() => load(valid({ project: 'absent.json' })), /does not exist/)
})

test('a case must say what it asserts', () => {
  const cases = [{ name: 'observed', input: { task: 'go' } }]
  assert.throws(() => load(valid({ cases })), /sets expected, expect, or both/)
})

test('a case supplies exactly one input', () => {
  const both = [{ name: 'observed', input: {}, private_input: {}, expect: { result_keys: ['ok'] } }]
  const neither = [{ name: 'observed', expect: { result_keys: ['ok'] } }]
  assert.throws(() => load(valid({ cases: both })), /exactly one of input or private_input/)
  assert.throws(() => load(valid({ cases: neither })), /exactly one of input or private_input/)
})

test('duplicate names are refused, inside a suite and across suites', () => {
  const cases = [
    { name: 'observed', input: {}, expect: { result_keys: ['ok'] } },
    { name: 'observed', input: {}, expect: { result_keys: ['ok'] } },
  ]
  assert.throws(() => load(valid({ cases })), /duplicate case name observed/)
  assert.throws(() => loadSuites([suiteFile(valid()), suiteFile(valid())], root), /two suites are named chapter/)
})

test('an unknown field is refused rather than ignored', () => {
  assert.throws(() => load(valid({ cases: [{ name: 'a', input: {}, expects: {} }] })), /unknown case field expects/)
  assert.throws(() => load(valid({ timeout_ms: 1000 })), /unknown suite field timeout_ms/)
  assert.throws(() => load(valid({ version: 2 })), /version must be 1/)
})

test('a directory of suites loads every document in it', () => {
  const directory = join(workspace, 'suites')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'a.suite.json'), JSON.stringify(valid({ name: 'alpha' })))
  writeFileSync(join(directory, 'b.suite.json'), JSON.stringify(valid({ name: 'beta' })))
  writeFileSync(join(directory, 'notes.md'), 'ignored')
  assert.deepEqual([...loadSuites([directory], root).keys()], ['alpha', 'beta'])
})
