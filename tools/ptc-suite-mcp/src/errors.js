/**
 * A bounded, actionable failure reported to the client.
 *
 * The message is the whole payload: never a stacktrace, never a host path the
 * caller did not already name, never a credential.
 */
export class ToolError extends Error {
  name = 'ToolError'
}

/** A configuration failure raised before the server begins serving. */
export class ConfigError extends Error {
  name = 'ConfigError'
}
