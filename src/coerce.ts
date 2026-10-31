/**
 * Turns the strings "true"/"false" into booleans before zod validation. Some
 * MCP clients send boolean tool arguments as strings. Anything else is passed
 * through unchanged, so zod still rejects invalid input.
 *
 * Use as z.preprocess(coerceBool, z.boolean()…).
 */
export const coerceBool = (val: unknown): unknown =>
  val === 'true' ? true : val === 'false' ? false : val;
