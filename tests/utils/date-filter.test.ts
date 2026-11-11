import { describe, it, expect } from 'vitest';
import { matchesDateFilter } from '../../src/date-filter.js';

describe('matchesDateFilter', () => {

  // ---------------------------------------------------------------------------
  // No filter → always pass
  // ---------------------------------------------------------------------------

  it('returns true when no filter is set', () => {
    expect(matchesDateFilter(
      { updated_at: '2026-03-20T10:00:00Z', created_at: '2026-03-01T00:00:00Z' },
      {}
    )).toBe(true);
  });

  it('returns true for an item with no dates when no filter is set', () => {
    expect(matchesDateFilter({}, {})).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // updated_after
  // ---------------------------------------------------------------------------

  it('updated_after: passes when updated_at is after the threshold', () => {
    expect(matchesDateFilter(
      { updated_at: '2026-03-25T12:00:00Z' },
      { updated_after: '2026-03-24T00:00:00Z' }
    )).toBe(true);
  });

  it('updated_after: fails when updated_at is before the threshold', () => {
    expect(matchesDateFilter(
      { updated_at: '2026-03-23T12:00:00Z' },
      { updated_after: '2026-03-24T00:00:00Z' }
    )).toBe(false);
  });

  it('updated_after: fails when updated_at equals the threshold (exclusive)', () => {
    expect(matchesDateFilter(
      { updated_at: '2026-03-24T00:00:00Z' },
      { updated_after: '2026-03-24T00:00:00Z' }
    )).toBe(false);
  });

  it('updated_after: fails when updated_at is missing', () => {
    expect(matchesDateFilter(
      { created_at: '2026-03-25T00:00:00Z' },
      { updated_after: '2026-03-24T00:00:00Z' }
    )).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // updated_before
  // ---------------------------------------------------------------------------

  it('updated_before: passes when updated_at is before the threshold', () => {
    expect(matchesDateFilter(
      { updated_at: '2026-03-20T00:00:00Z' },
      { updated_before: '2026-03-25T00:00:00Z' }
    )).toBe(true);
  });

  it('updated_before: fails when updated_at is after the threshold', () => {
    expect(matchesDateFilter(
      { updated_at: '2026-03-26T00:00:00Z' },
      { updated_before: '2026-03-25T00:00:00Z' }
    )).toBe(false);
  });

  it('updated_before: fails when updated_at equals the threshold (exclusive)', () => {
    expect(matchesDateFilter(
      { updated_at: '2026-03-25T00:00:00Z' },
      { updated_before: '2026-03-25T00:00:00Z' }
    )).toBe(false);
  });

  it('updated_before: fails when updated_at is missing', () => {
    expect(matchesDateFilter(
      {},
      { updated_before: '2026-03-25T00:00:00Z' }
    )).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // created_after
  // ---------------------------------------------------------------------------

  it('created_after: passes when created_at is after the threshold', () => {
    expect(matchesDateFilter(
      { created_at: '2026-03-25T12:00:00Z' },
      { created_after: '2026-03-24T00:00:00Z' }
    )).toBe(true);
  });

  it('created_after: fails when created_at is before the threshold', () => {
    expect(matchesDateFilter(
      { created_at: '2026-03-23T00:00:00Z' },
      { created_after: '2026-03-24T00:00:00Z' }
    )).toBe(false);
  });

  it('created_after: fails when created_at is missing', () => {
    expect(matchesDateFilter(
      { updated_at: '2026-03-25T00:00:00Z' },
      { created_after: '2026-03-24T00:00:00Z' }
    )).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // created_before
  // ---------------------------------------------------------------------------

  it('created_before: passes when created_at is before the threshold', () => {
    expect(matchesDateFilter(
      { created_at: '2026-03-20T00:00:00Z' },
      { created_before: '2026-03-25T00:00:00Z' }
    )).toBe(true);
  });

  it('created_before: fails when created_at is after the threshold', () => {
    expect(matchesDateFilter(
      { created_at: '2026-03-26T00:00:00Z' },
      { created_before: '2026-03-25T00:00:00Z' }
    )).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Combined filters (time window)
  // ---------------------------------------------------------------------------

  it('updated_after + updated_before: passes when updated_at is within window', () => {
    expect(matchesDateFilter(
      { updated_at: '2026-03-22T00:00:00Z' },
      { updated_after: '2026-03-20T00:00:00Z', updated_before: '2026-03-25T00:00:00Z' }
    )).toBe(true);
  });

  it('updated_after + updated_before: fails when updated_at is outside window', () => {
    expect(matchesDateFilter(
      { updated_at: '2026-03-26T00:00:00Z' },
      { updated_after: '2026-03-20T00:00:00Z', updated_before: '2026-03-25T00:00:00Z' }
    )).toBe(false);
  });

  it('all four filters: passes only when both dates are within their windows', () => {
    expect(matchesDateFilter(
      { updated_at: '2026-03-22T00:00:00Z', created_at: '2026-03-10T00:00:00Z' },
      {
        updated_after: '2026-03-20T00:00:00Z',
        updated_before: '2026-03-25T00:00:00Z',
        created_after:  '2026-03-05T00:00:00Z',
        created_before: '2026-03-15T00:00:00Z',
      }
    )).toBe(true);
  });

  it('all four filters: fails when one date is out of range', () => {
    expect(matchesDateFilter(
      { updated_at: '2026-03-22T00:00:00Z', created_at: '2026-03-16T00:00:00Z' }, // created_at too late
      {
        updated_after: '2026-03-20T00:00:00Z',
        updated_before: '2026-03-25T00:00:00Z',
        created_after:  '2026-03-05T00:00:00Z',
        created_before: '2026-03-15T00:00:00Z',
      }
    )).toBe(false);
  });
});
