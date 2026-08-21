/**
 * What a case asserts, and how a run is measured against it.
 *
 * `mix ptc.repair` compares a run's value to an exact `expected`, which is the
 * right contract for a deterministic target. A tutorial chapter is not one: a
 * model writes the program and the prose, so the same question yields a
 * different value every run. Exact equality would either fail constantly or,
 * pinned loose enough to pass, prove nothing.
 *
 * So `expected` stays for the deterministic case -- replay installations, and
 * questions whose whole answer is arithmetic -- and `expect` adds bounded
 * assertions over the two things a run cannot fake: the value's shape, and the
 * envelope. "The answer mentions the CSV" is a claim about text. "The mission
 * called files.read" is a claim about what the Kernel let happen.
 */

import { clamp, deepEqual, isPlainObject } from './json.js'

const TYPES = ['array', 'boolean', 'integer', 'null', 'number', 'object', 'string']
const EXPECT_KEYS = [
  'capabilities_called',
  'capabilities_not_called',
  'exit_status',
  'max_cost_usd',
  'max_subordinate_evaluations',
  'no_capability_refusals',
  'result',
  'result_keys',
]
const CHECK_KEYS = ['contains', 'equals', 'length', 'matches', 'max', 'min', 'one_of', 'path', 'type']

/** Rejects an expectation block the runner could not honour. Called at load. */
export function validateExpectations(expect, refuse) {
  if (!isPlainObject(expect)) refuse('expect must be a JSON object')
  for (const key of Object.keys(expect)) {
    if (!EXPECT_KEYS.includes(key)) refuse(`unknown expect field ${key}`)
  }

  if (expect.exit_status !== undefined && !Number.isSafeInteger(expect.exit_status)) {
    refuse('exit_status must be an integer')
  }
  for (const key of ['capabilities_called', 'capabilities_not_called', 'result_keys']) {
    if (expect[key] === undefined) continue
    if (!Array.isArray(expect[key]) || !expect[key].every((item) => typeof item === 'string' && item !== '')) {
      refuse(`${key} must be an array of non-empty strings`)
    }
  }
  if (expect.no_capability_refusals !== undefined && typeof expect.no_capability_refusals !== 'boolean') {
    refuse('no_capability_refusals must be a boolean')
  }
  if (expect.max_subordinate_evaluations !== undefined && !Number.isSafeInteger(expect.max_subordinate_evaluations)) {
    refuse('max_subordinate_evaluations must be an integer')
  }
  if (expect.max_cost_usd !== undefined && typeof expect.max_cost_usd !== 'number') {
    refuse('max_cost_usd must be a number')
  }

  if (expect.result === undefined) return
  if (!Array.isArray(expect.result)) refuse('result must be an array of path checks')
  for (const check of expect.result) {
    if (!isPlainObject(check)) refuse('a result check must be a JSON object')
    for (const key of Object.keys(check)) {
      if (!CHECK_KEYS.includes(key)) refuse(`unknown result check field ${key}`)
    }
    if (typeof check.path !== 'string') refuse('a result check needs a path')
    if (Object.keys(check).length < 2) refuse(`result check ${check.path} asserts nothing`)
    if (check.type !== undefined && !TYPES.includes(check.type)) {
      refuse(`result check ${check.path}: type must be one of ${TYPES.join(', ')}`)
    }
    if (check.one_of !== undefined && !Array.isArray(check.one_of)) {
      refuse(`result check ${check.path}: one_of must be an array`)
    }
    if (check.matches !== undefined) {
      if (typeof check.matches !== 'string') refuse(`result check ${check.path}: matches must be a string`)
      try {
        new RegExp(check.matches, 'i')
      } catch {
        refuse(`result check ${check.path}: matches is not a valid regular expression`)
      }
    }
  }
}

/**
 * Measures one finished run.
 *
 * Every assertion is reported, passing or failing, so a green case says which
 * claims it actually made rather than only that nothing broke.
 */
export function evaluate(testCase, observed) {
  const checks = []
  const expect = testCase.expect ?? {}

  const wantedStatus = expect.exit_status ?? 0
  checks.push(
    record(
      `exit_status == ${wantedStatus}`,
      observed.exitStatus === wantedStatus,
      `exited ${observed.exitStatus}${observed.signal ? ` on ${observed.signal}` : ''}`,
    ),
  )

  if (testCase.expected !== undefined) {
    checks.push(
      record(
        'result equals expected',
        observed.result.state === 'available' && deepEqual(observed.result.value, testCase.expected),
        observed.result.state === 'available' ? preview(observed.result.value) : 'no result value was published',
      ),
    )
  }

  for (const path of expect.result_keys ?? []) {
    const found = read(observed.result.value, path)
    checks.push(record(`result has ${path}`, found.present, found.present ? preview(found.value) : 'missing'))
  }

  for (const check of expect.result ?? []) {
    checks.push(...resultCheck(check, observed.result.value))
  }

  const calls = observed.usage.capability_calls ?? {}
  for (const name of expect.capabilities_called ?? []) {
    const count = calls[name] ?? 0
    checks.push(record(`called ${name}`, count > 0, `${count} call(s)`))
  }
  for (const name of expect.capabilities_not_called ?? []) {
    const count = calls[name] ?? 0
    checks.push(record(`did not call ${name}`, count === 0, `${count} call(s)`))
  }

  if (expect.no_capability_refusals) {
    const refusals = observed.usage.capability_refusals ?? {}
    const names = Object.keys(refusals)
    checks.push(record('no capability refusals', names.length === 0, names.join(', ') || 'none'))
  }

  if (expect.max_subordinate_evaluations !== undefined) {
    const used = observed.usage.subordinate_evaluations
    checks.push(
      record(
        `subordinate_evaluations <= ${expect.max_subordinate_evaluations}`,
        typeof used === 'number' && used <= expect.max_subordinate_evaluations,
        `${used ?? 'unreported'}`,
      ),
    )
  }

  if (expect.max_cost_usd !== undefined) {
    const spent = observed.usage.cost_usd
    // An unreported cost is not a passing cost: a provider that stopped
    // reporting usage would otherwise silently retire this ceiling.
    checks.push(
      record(
        `cost_usd <= ${expect.max_cost_usd}`,
        typeof spent === 'number' && spent <= expect.max_cost_usd,
        spent === null || spent === undefined ? 'the run reported no cost' : `${spent}`,
      ),
    )
  }

  return checks
}

function resultCheck(check, value) {
  const found = read(value, check.path)
  if (!found.present) return [record(`${check.path} is present`, false, 'missing')]

  const actual = found.value
  const checks = []
  const claim = (suffix, ok, detail = preview(actual)) => checks.push(record(`${check.path} ${suffix}`, ok, detail))

  if (check.type !== undefined) claim(`is ${check.type}`, isType(actual, check.type))
  if (check.equals !== undefined) claim(`== ${preview(check.equals)}`, deepEqual(actual, check.equals))
  if (check.one_of !== undefined) claim('is one of the allowed values', check.one_of.some((one) => deepEqual(actual, one)))
  if (check.min !== undefined) claim(`>= ${check.min}`, typeof actual === 'number' && actual >= check.min)
  if (check.max !== undefined) claim(`<= ${check.max}`, typeof actual === 'number' && actual <= check.max)
  if (check.length !== undefined) claim(`has length ${check.length}`, lengthOf(actual) === check.length, `${lengthOf(actual)}`)
  // Text claims read the whole subtree, not only a string leaf, so "the answer
  // mentions the CSV" holds whether the model returned a sentence or a map.
  if (check.contains !== undefined) {
    claim(`contains ${JSON.stringify(check.contains)}`, text(actual).toLowerCase().includes(String(check.contains).toLowerCase()))
  }
  if (check.matches !== undefined) claim(`matches /${check.matches}/i`, new RegExp(check.matches, 'i').test(text(actual)))

  return checks
}

/**
 * Reads a dotted path. A numeric segment indexes an array, so
 * `hiring_plan.hire.0` is the first name. A key containing a dot is not
 * addressable; assert on its parent instead.
 */
export function read(value, path) {
  let current = value
  if (path === '') return { present: current !== undefined, value: current }

  for (const segment of path.split('.')) {
    if (Array.isArray(current) && /^[0-9]+$/.test(segment)) {
      current = current[Number(segment)]
    } else if (isPlainObject(current) && Object.hasOwn(current, segment)) {
      current = current[segment]
    } else {
      return { present: false, value: undefined }
    }
    if (current === undefined) return { present: false, value: undefined }
  }
  return { present: true, value: current }
}

function isType(value, type) {
  if (type === 'null') return value === null
  if (type === 'array') return Array.isArray(value)
  if (type === 'object') return isPlainObject(value)
  if (type === 'integer') return Number.isSafeInteger(value)
  if (type === 'number') return typeof value === 'number'
  return typeof value === type
}

function lengthOf(value) {
  if (Array.isArray(value) || typeof value === 'string') return value.length
  if (isPlainObject(value)) return Object.keys(value).length
  return -1
}

/** Every scalar under a value, flattened, so a text claim can search a subtree. */
function text(value) {
  if (typeof value === 'string') return value
  if (value === null || typeof value !== 'object') return String(value)
  return JSON.stringify(value)
}

function record(check, ok, detail) {
  return { check, status: ok ? 'pass' : 'fail', detail: clamp(detail, 200) }
}

function preview(value) {
  return clamp(typeof value === 'string' ? value : (JSON.stringify(value) ?? 'undefined'), 200)
}
