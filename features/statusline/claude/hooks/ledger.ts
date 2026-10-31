// Cost ledger: one per session, so two sessions never overwrite each other's figures.

const HOUR_MS: number = 60 * 60 * 1000
const DAY_MS: number = 24 * HOUR_MS
export const WINDOW_MS: number = 30 * DAY_MS

export type SessionLedger = {
  // The session's cost total (USD) as last seen, so each turn adds only the change.
  seenUsd: number
  // USD spent, keyed by the start of the hour it was spent in (epoch ms).
  hours: Record<string, number>
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
    if (Number(hour) > nowMs - WINDOW_MS) hours[hour] = spent
  }
  if (delta > 0) {
    const key: string = String(hourStart(nowMs))
    hours[key] = (hours[key] ?? 0) + delta
  }
  return { seenUsd: usd, hours }
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
  return Object.keys(ledger.hours).every((hour: string) => Number(hour) <= nowMs - WINDOW_MS)
}

export function isLedger(value: unknown): value is SessionLedger {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<SessionLedger>
  return typeof v.seenUsd === 'number' && typeof v.hours === 'object' && v.hours !== null
}
