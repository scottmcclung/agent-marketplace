import { expect, test } from 'claude-code/testing'
import { cacheRateSince, emptyLedger, isLedger, isStale, record, recordTokens, WINDOW_MS } from './ledger'
import type { ModelUsage } from 'claude-code'
import type { SessionLedger } from './ledger'

const HOUR_MS: number = 3600000
const DAY_MS: number = 24 * HOUR_MS
// 2026-10-27 09:07 UTC.
const NOW_MS: number = Date.UTC(2026, 9, 27, 9, 7)
const THIS_HOUR: string = String(NOW_MS - (NOW_MS % HOUR_MS))

function usage(input: number, cacheCreation: number, cacheRead: number): ModelUsage {
  return { input_tokens: input, output_tokens: 999, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheCreation }
}

test('records the three input-token counts in the hour they were spent, ignoring output', () => {
  let l: SessionLedger = recordTokens(emptyLedger(), usage(10, 20, 30), NOW_MS)
  l = recordTokens(l, usage(1, 2, 3), NOW_MS + 10 * 60000)
  l = recordTokens(l, usage(5, 0, 50), NOW_MS + HOUR_MS)
  expect(l.tokens).toEqual({
    [THIS_HOUR]: { input: 11, cacheCreation: 22, cacheRead: 33 },
    [String(Number(THIS_HOUR) + HOUR_MS)]: { input: 5, cacheCreation: 0, cacheRead: 50 },
  })
  expect(l.seenUsd).toBe(0)
  expect(l.hours).toEqual({})
})

test('drops token hours older than 30 days when recording tokens or cost', () => {
  const old: string = String(Number(THIS_HOUR) - 31 * DAY_MS)
  const recent: string = String(Number(THIS_HOUR) - 2 * DAY_MS)
  const start: SessionLedger = {
    seenUsd: 1,
    hours: { [recent]: 1 },
    tokens: { [old]: { input: 1, cacheCreation: 1, cacheRead: 1 }, [recent]: { input: 2, cacheCreation: 2, cacheRead: 2 } },
  }
  expect(recordTokens(start, usage(1, 0, 0), NOW_MS).tokens).toEqual({
    [recent]: { input: 2, cacheCreation: 2, cacheRead: 2 },
    [THIS_HOUR]: { input: 1, cacheCreation: 0, cacheRead: 0 },
  })
  expect((record(start, 2, NOW_MS)).tokens).toEqual({
    [recent]: { input: 2, cacheCreation: 2, cacheRead: 2 },
  })
})

test('keeps an old ledger\'s cost when tokens are first added, and keeps tokens when cost is recorded', () => {
  const old: SessionLedger = { seenUsd: 4, hours: { [THIS_HOUR]: 4 } }
  expect(isLedger(old)).toBe(true)
  const withTokens: SessionLedger = recordTokens(old, usage(100, 0, 900), NOW_MS)
  expect(withTokens.seenUsd).toBe(4)
  expect(withTokens.hours).toEqual({ [THIS_HOUR]: 4 })
  expect(isLedger(JSON.parse(JSON.stringify(withTokens)))).toBe(true)
  const after: SessionLedger = record(withTokens, 5, NOW_MS)
  expect(after.hours).toEqual({ [THIS_HOUR]: 5 })
  expect(after.tokens).toEqual({ [THIS_HOUR]: { input: 100, cacheCreation: 0, cacheRead: 900 } })
})

test('weights the hit rate by tokens across sessions, not by turns', () => {
  // Per-turn averaging would give (99% + 0%) / 2 = 49.5%; weighting gives 990 / 4000.
  const a: SessionLedger = recordTokens(emptyLedger(), usage(10, 0, 990), NOW_MS)
  const b: SessionLedger = recordTokens(emptyLedger(), usage(3000, 0, 0), NOW_MS)
  expect(cacheRateSince([a, b], NOW_MS - WINDOW_MS)).toBe(990 / 4000)
})

test('counts cache writes in the divisor and skips hours before the window', () => {
  const l: SessionLedger = {
    seenUsd: 0,
    hours: {},
    tokens: {
      [THIS_HOUR]: { input: 100, cacheCreation: 300, cacheRead: 600 },
      [String(Number(THIS_HOUR) - 31 * DAY_MS)]: { input: 0, cacheCreation: 0, cacheRead: 1000000 },
    },
  }
  expect(cacheRateSince([l], NOW_MS - WINDOW_MS)).toBe(600 / 1000)
})

test('has no hit rate when the window holds no token data', () => {
  const costOnly: SessionLedger = { seenUsd: 4, hours: { [THIS_HOUR]: 4 } }
  const zeros: SessionLedger = { seenUsd: 0, hours: {}, tokens: { [THIS_HOUR]: { input: 0, cacheCreation: 0, cacheRead: 0 } } }
  expect(cacheRateSince([], NOW_MS - WINDOW_MS)).toBeUndefined()
  expect(cacheRateSince([costOnly, zeros], NOW_MS - WINDOW_MS)).toBeUndefined()
})

test('does not treat a ledger with only recent token hours as stale', () => {
  const l: SessionLedger = { seenUsd: 0, hours: {}, tokens: { [THIS_HOUR]: { input: 1, cacheCreation: 0, cacheRead: 1 } } }
  expect(isStale(l, NOW_MS)).toBe(false)
})

test('skips malformed token buckets in the rate and drops them on write', () => {
  const bad: unknown[] = [
    { input: -1, cacheCreation: 0, cacheRead: 5 },
    { input: 1, cacheCreation: 'x', cacheRead: 5 },
    { input: 1, cacheCreation: 0, cacheRead: Number.NaN },
    { input: 1, cacheCreation: 0 },
    null,
    7,
    [1, 2, 3],
  ]
  const good: string = THIS_HOUR
  for (const counts of bad) {
    const badHour: string = String(Number(THIS_HOUR) - HOUR_MS)
    const l = { seenUsd: 0, hours: {}, tokens: { [badHour]: counts, [good]: { input: 1, cacheCreation: 0, cacheRead: 3 } } } as unknown as SessionLedger
    expect(cacheRateSince([l], NOW_MS - WINDOW_MS)).toBe(3 / 4)
    expect(recordTokens(l, usage(1, 0, 1), NOW_MS).tokens).toEqual({ [good]: { input: 2, cacheCreation: 0, cacheRead: 4 } })
    expect(record(l, 1, NOW_MS).tokens).toEqual({ [good]: { input: 1, cacheCreation: 0, cacheRead: 3 } })
  }
})

test('treats a tokens field that is not a plain object as holding no token data', () => {
  for (const tokens of [null, 5, 'x', [{ input: 1, cacheCreation: 0, cacheRead: 3 }]]) {
    const l = { seenUsd: 1, hours: { [THIS_HOUR]: 1 }, tokens } as unknown as SessionLedger
    expect(cacheRateSince([l], NOW_MS - WINDOW_MS)).toBeUndefined()
    expect(recordTokens(l, usage(1, 0, 1), NOW_MS).tokens).toEqual({ [THIS_HOUR]: { input: 1, cacheCreation: 0, cacheRead: 1 } })
    expect(record(l, 2, NOW_MS).tokens).toEqual({})
    expect(isStale(l, NOW_MS)).toBe(false)
  }
})
