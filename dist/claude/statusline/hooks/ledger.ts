import type { ModelUsage } from 'claude-code'

// Cost and token ledger: one per session, so two sessions never overwrite each other's figures.

const HOUR_MS: number = 60 * 60 * 1000
const DAY_MS: number = 24 * HOUR_MS
export const WINDOW_MS: number = 30 * DAY_MS

export type SessionLedger = {
  // The session's cost total (USD) as last seen, so each turn adds only the change.
  seenUsd: number
  // USD spent, keyed by the start of the hour it was spent in (epoch ms).
  hours: Record<string, number>
  // Input-side token counts, keyed like `hours`. Optional: a ledger may hold
  // cost only; the rate counts only hours with token data.
  tokens?: Record<string, TokenCounts>
}

export type TokenCounts = { input: number; cacheCreation: number; cacheRead: number }

// The per-turn usage Claude Code reports on turn.complete. Output tokens are
// not read, because caching does not affect them.
export type TurnUsage = Pick<ModelUsage, 'input_tokens' | 'cache_read_input_tokens' | 'cache_creation_input_tokens'>

function isCount(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isTokenCounts(value: unknown): value is TokenCounts {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<TokenCounts>
  return isCount(v.input) && isCount(v.cacheCreation) && isCount(v.cacheRead)
}

// The ledger's well-formed token buckets. The file is read from disk, so a
// bucket or the whole field may hold anything; those are left out, and so are
// never written back.
function tokenBuckets(ledger: SessionLedger): [string, TokenCounts][] {
  const tokens: unknown = ledger.tokens
  if (typeof tokens !== 'object' || tokens === null || Array.isArray(tokens)) return []
  return Object.entries(tokens).filter((entry: [string, unknown]): entry is [string, TokenCounts] => isTokenCounts(entry[1]))
}

function inWindow(hour: string, nowMs: number): boolean {
  return Number(hour) > nowMs - WINDOW_MS
}

function prunedTokens(ledger: SessionLedger, nowMs: number): Record<string, TokenCounts> {
  const tokens: Record<string, TokenCounts> = {}
  for (const [hour, counts] of tokenBuckets(ledger)) {
    if (inWindow(hour, nowMs)) tokens[hour] = counts
  }
  return tokens
}

export function emptyLedger(): SessionLedger {
  return { seenUsd: 0, hours: {} }
}

export function hourStart(nowMs: number): number {
  return nowMs - (nowMs % HOUR_MS)
}

// Adds the cost spent since the last reading to the current hour. A total lower
// than the last reading means the engine started the count over (a /clear), so
// the whole new total is new spend.
export function record(ledger: SessionLedger, usd: number, nowMs: number): SessionLedger {
  const delta: number = usd >= ledger.seenUsd ? usd - ledger.seenUsd : usd
  const hours: Record<string, number> = {}
  for (const [hour, spent] of Object.entries(ledger.hours)) {
    if (inWindow(hour, nowMs)) hours[hour] = spent
  }
  if (delta > 0) {
    const key: string = String(hourStart(nowMs))
    hours[key] = (hours[key] ?? 0) + delta
  }
  const tokens: Record<string, TokenCounts> = prunedTokens(ledger, nowMs)
  return ledger.tokens === undefined ? { seenUsd: usd, hours } : { seenUsd: usd, hours, tokens }
}

// Adds one turn's input-side tokens to the current hour.
export function recordTokens(ledger: SessionLedger, usage: TurnUsage, nowMs: number): SessionLedger {
  const tokens: Record<string, TokenCounts> = prunedTokens(ledger, nowMs)
  const key: string = String(hourStart(nowMs))
  const prior: TokenCounts = tokens[key] ?? { input: 0, cacheCreation: 0, cacheRead: 0 }
  tokens[key] = {
    input: prior.input + usage.input_tokens,
    cacheCreation: prior.cacheCreation + usage.cache_creation_input_tokens,
    cacheRead: prior.cacheRead + usage.cache_read_input_tokens,
  }
  return { ...ledger, tokens }
}

// The share of input tokens served from the cache, summed over every hour so
// it is weighted by tokens, not by turns. Undefined when there is nothing to divide.
export function cacheRateSince(ledgers: readonly SessionLedger[], sinceMs: number): number | undefined {
  let read: number = 0
  let total: number = 0
  for (const ledger of ledgers) {
    for (const [hour, counts] of tokenBuckets(ledger)) {
      if (Number(hour) < hourStart(sinceMs)) continue
      read += counts.cacheRead
      total += counts.input + counts.cacheCreation + counts.cacheRead
    }
  }
  return total > 0 ? read / total : undefined
}

// Sums spend in hours that start at or after `sinceMs`. Hour granularity means
// a block that starts mid-hour counts that whole hour.
export function spentSince(ledgers: readonly SessionLedger[], sinceMs: number): number {
  let total: number = 0
  for (const ledger of ledgers) {
    for (const [hour, spent] of Object.entries(ledger.hours)) {
      if (Number(hour) >= hourStart(sinceMs)) total += spent
    }
  }
  return total
}

export function isStale(ledger: SessionLedger, nowMs: number): boolean {
  return [...Object.keys(ledger.hours), ...tokenBuckets(ledger).map(([hour]: [string, TokenCounts]) => hour)].every((hour: string) => Number(hour) <= nowMs - WINDOW_MS)
}

export function isLedger(value: unknown): value is SessionLedger {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<SessionLedger>
  return typeof v.seenUsd === 'number' && typeof v.hours === 'object' && v.hours !== null
}
