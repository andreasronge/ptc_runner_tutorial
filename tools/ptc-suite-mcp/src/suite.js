/**
 * Suite documents: the host-owned cases, loaded and checked once at startup.
 *
 * A suite is authored by the operator, not by a model, so the strictness here
 * is not about hostile input -- it is about a passing report meaning something.
 * A case that is silently ignored, a project path that resolves somewhere
 * unexpected, or two cases sharing a name would each let a green suite certify
 * something other than what it names. All three are refused before serving.
 */

import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve, sep } from 'node:path'

import { ConfigError } from './errors.js'
import { isPlainObject } from './json.js'
import { validateExpectations } from './checks.js'

const MAX_SUITE_BYTES = 1_048_576
const MAX_CASES = 32
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const CASE_KEYS = ['description', 'expect', 'expected', 'input', 'name', 'private_input']
const SUITE_KEYS = ['cases', 'description', 'name', 'project', 'result_class', 'version']

/**
 * Loads every suite named by --suites and binds each to a project document
 * inside --project-root.
 *
 * Returns suites keyed by name, in the order given, with each case's project
 * path already resolved and proven to be a regular file.
 */
export function loadSuites(paths, projectRoot) {
  const root = confinedRoot(projectRoot)
  const suites = new Map()

  for (const path of paths.flatMap(expandSuitePath)) {
    const suite = readSuite(path, root)
    if (suites.has(suite.name)) {
      throw new ConfigError(`two suites are named ${suite.name}; names must be unique`)
    }
    suites.set(suite.name, suite)
  }

  if (suites.size === 0) throw new ConfigError('no suite documents were found')
  return suites
}

function confinedRoot(projectRoot) {
  try {
    const root = realpathSync(resolve(projectRoot))
    if (!statSync(root).isDirectory()) throw new Error('not a directory')
    return root
  } catch {
    throw new ConfigError(`--project-root is not a readable directory: ${projectRoot}`)
  }
}

/** A suite path is either one document or a directory of `*.suite.json`. */
function expandSuitePath(path) {
  const absolute = resolve(path)
  let stats
  try {
    stats = statSync(absolute)
  } catch {
    throw new ConfigError(`--suites path does not exist: ${path}`)
  }
  if (!stats.isDirectory()) return [absolute]

  const found = readdirSync(absolute)
    .filter((name) => name.endsWith('.suite.json'))
    .sort()
    .map((name) => join(absolute, name))
  if (found.length === 0) throw new ConfigError(`no *.suite.json documents under ${path}`)
  return found
}

function readSuite(path, root) {
  const bytes = readBounded(path)
  let document
  try {
    document = JSON.parse(bytes)
  } catch {
    throw new ConfigError(`${path} is not valid JSON`)
  }

  const refuse = (message) => {
    throw new ConfigError(`${path}: ${message}`)
  }

  if (!isPlainObject(document)) refuse('a suite must be a JSON object')
  closedKeys(document, SUITE_KEYS, refuse, 'suite')
  if (document.version !== 1) refuse('version must be 1')
  if (!NAME.test(document.name ?? '')) refuse('name must match [A-Za-z0-9][A-Za-z0-9._-]{0,63}')
  if (document.description !== undefined && typeof document.description !== 'string') {
    refuse('description must be a string')
  }
  const resultClass = document.result_class ?? 'normal'
  if (resultClass !== 'normal' && resultClass !== 'private') {
    refuse('result_class must be "normal" or "private"')
  }

  const project = confinedProject(document.project, root, refuse)
  const cases = readCases(document.cases, refuse)

  return {
    name: document.name,
    description: document.description ?? '',
    project,
    resultClass,
    cases,
  }
}

/**
 * Resolves the project document a suite names.
 *
 * The name is relative to --project-root and must stay there after symlinks
 * are followed: a suite may select what the operator installed, never widen it.
 */
function confinedProject(value, root, refuse) {
  if (typeof value !== 'string' || value === '') refuse('project must name a document')
  if (isAbsolute(value) || value.includes('\0')) refuse('project must be a relative path')

  let real
  try {
    real = realpathSync(resolve(root, value))
  } catch {
    refuse(`project document does not exist: ${value}`)
  }
  if (real !== root && !real.startsWith(root + sep)) {
    refuse(`project document resolves outside the project root: ${value}`)
  }
  if (!lstatSync(real).isFile()) refuse(`project document is not a regular file: ${value}`)
  return { relative: value, absolute: real }
}

function readCases(cases, refuse) {
  if (!Array.isArray(cases) || cases.length === 0) refuse('cases must be a non-empty array')
  if (cases.length > MAX_CASES) refuse(`a suite holds at most ${MAX_CASES} cases`)

  const seen = new Set()
  return cases.map((entry, index) => {
    const where = (message) => refuse(`case ${index + 1}: ${message}`)
    if (!isPlainObject(entry)) where('a case must be a JSON object')
    closedKeys(entry, CASE_KEYS, where, 'case')
    if (!NAME.test(entry.name ?? '')) where('name must match [A-Za-z0-9][A-Za-z0-9._-]{0,63}')
    if (seen.has(entry.name)) where(`duplicate case name ${entry.name}`)
    seen.add(entry.name)

    const hasInput = entry.input !== undefined
    const hasPrivateInput = entry.private_input !== undefined
    if (hasInput === hasPrivateInput) where('a case sets exactly one of input or private_input')
    const input = hasInput ? entry.input : entry.private_input
    if (!isPlainObject(input)) where('the input must be a JSON object')

    if (entry.expected === undefined && entry.expect === undefined) {
      where('a case sets expected, expect, or both')
    }
    if (entry.expect !== undefined) validateExpectations(entry.expect, where)

    return {
      name: entry.name,
      description: entry.description ?? '',
      inputClass: hasInput ? 'normal' : 'private',
      input,
      expected: entry.expected,
      expect: entry.expect,
    }
  })
}

function readBounded(path) {
  let stats
  try {
    stats = statSync(path)
  } catch {
    throw new ConfigError(`suite document does not exist: ${path}`)
  }
  if (!stats.isFile()) throw new ConfigError(`suite document is not a regular file: ${path}`)
  if (stats.size > MAX_SUITE_BYTES) throw new ConfigError(`suite document is larger than ${MAX_SUITE_BYTES} bytes`)
  return readFileSync(path, 'utf8')
}

/**
 * Refuses an unknown key instead of ignoring it. A misspelled `expects` would
 * otherwise turn a case with real assertions into one that checks nothing.
 */
function closedKeys(value, allowed, refuse, what) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) refuse(`unknown ${what} field ${key}`)
  }
}
