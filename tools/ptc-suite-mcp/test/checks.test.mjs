import assert from 'node:assert/strict'
import { test } from 'node:test'

import { evaluate, read, validateExpectations } from '../src/checks.js'

const refuse = (message) => {
  throw new Error(message)
}

function observe(overrides = {}) {
  return {
    exitStatus: 0,
    signal: null,
    result: { state: 'available', value: { ok: true, value: { runway_months: 20, note: 'read burn_rate.csv' } } },
    usage: { cost_usd: 0.0004, subordinate_evaluations: 3, capability_calls: {}, capability_refusals: {} },
    ...overrides,
  }
}

const failures = (checks) => checks.filter((check) => check.status === 'fail').map((check) => check.check)

test('a path reads through maps and array indexes', () => {
  const value = { a: { b: [{ c: 1 }] } }
  assert.deepEqual(read(value, 'a.b.0.c'), { present: true, value: 1 })
  assert.equal(read(value, 'a.b.1.c').present, false)
  assert.equal(read(value, 'a.missing').present, false)
})

test('a missing path fails rather than passing vacuously', () => {
  const checks = evaluate({ expect: { result: [{ path: 'value.absent', equals: 1 }] } }, observe())
  assert.deepEqual(failures(checks), ['value.absent is present'])
})

test('every assertion is reported, not only the failing ones', () => {
  const checks = evaluate(
    { expect: { result: [{ path: 'value.runway_months', equals: 20, type: 'integer' }] } },
    observe(),
  )
  assert.deepEqual(
    checks.map((check) => check.status),
    ['pass', 'pass', 'pass'],
  )
})

test('a text claim reads the whole subtree, not only a string leaf', () => {
  const checks = evaluate({ expect: { result: [{ path: 'value', contains: 'burn_rate.csv' }] } }, observe())
  assert.deepEqual(failures(checks), [])
})

test('an unreported cost does not satisfy a cost ceiling', () => {
  const usage = { cost_usd: null, subordinate_evaluations: 3, capability_calls: {}, capability_refusals: {} }
  const checks = evaluate({ expect: { max_cost_usd: 0.01 } }, observe({ usage }))
  assert.deepEqual(failures(checks), ['cost_usd <= 0.01'])
})

test('a capability claim reads the envelope, not the answer', () => {
  const usage = {
    cost_usd: 0,
    subordinate_evaluations: 1,
    capability_calls: { 'mission/files.read': 2 },
    capability_refusals: { 'mission/files/denied': 1 },
  }
  const checks = evaluate(
    { expect: { capabilities_called: ['mission/files.read', 'mission/files.list'], no_capability_refusals: true } },
    observe({ usage }),
  )
  assert.deepEqual(failures(checks), ['called mission/files.list', 'no capability refusals'])
})

test('exit status is asserted even when a case declares no expectations', () => {
  const checks = evaluate({ expected: { ok: true } }, observe({ exitStatus: 5 }))
  assert.ok(failures(checks).includes('exit_status == 0'))
})

test('expected compares the whole value', () => {
  const testCase = { expected: { ok: true, value: { runway_months: 20, note: 'read burn_rate.csv' } } }
  assert.deepEqual(failures(evaluate(testCase, observe())), [])
  assert.deepEqual(failures(evaluate({ expected: { ok: true } }, observe())), ['result equals expected'])
})

test('an unavailable result fails an exact comparison', () => {
  const checks = evaluate({ expected: { ok: true } }, observe({ result: { state: 'unavailable' } }))
  assert.deepEqual(failures(checks), ['result equals expected'])
})

test('a misspelled expect field is refused rather than ignored', () => {
  assert.throws(() => validateExpectations({ resutl: [] }, refuse), /unknown expect field resutl/)
  assert.throws(() => validateExpectations({ result: [{ path: 'a' }] }, refuse), /asserts nothing/)
  assert.throws(() => validateExpectations({ result: [{ path: 'a', type: 'map' }] }, refuse), /type must be one of/)
  assert.throws(() => validateExpectations({ result: [{ path: 'a', matches: '(' }] }, refuse), /not a valid regular/)
})
