import { describe, it, expect } from 'vitest';
import { coerceBool } from '../src/coerce.js';

// ---------------------------------------------------------------------------
// coerceBool (#8516) — shared by every boolean tool parameter
// ---------------------------------------------------------------------------

describe('coerceBool', () => {
  it.each([
    ['true', true],
    ['false', false],
  ])('turns the string "%s" into %s', (input, expected) => {
    expect(coerceBool(input)).toBe(expected);
  });

  it.each([true, false, undefined, null, 'TRUE', '1', 0, 'yes'])('passes %s through unchanged for zod to judge', (input) => {
    expect(coerceBool(input)).toBe(input);
  });
});
