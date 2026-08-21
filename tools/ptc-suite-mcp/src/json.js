/** JSON value helpers shared by the loader, the checks, and the report. */

export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * JSON value equality.
 *
 * This is weaker than the Elixir suite runner's `===`, which separates 42 from
 * 42.0. JavaScript has one number type, so a case that must distinguish them
 * belongs in `expect` with an explicit `type` claim.
 */
export function deepEqual(left, right) {
  if (left === right) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => deepEqual(item, right[index]))
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = Object.keys(left)
    return keys.length === Object.keys(right).length && keys.every((key) => deepEqual(left[key], right[key]))
  }
  return false
}

export function clamp(value, limit) {
  const string = String(value)
  return string.length <= limit ? string : `${string.slice(0, limit - 1)}…`
}
