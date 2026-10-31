import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Segment } from '../types'

// 2026-10-27 09:07 UTC; the five-hour window resets 1h 53m later.
const NOW_MS: number = Date.UTC(2026, 9, 27, 9, 7)
const RESETS_AT: string = new Date(NOW_MS + 113 * 60000).toISOString()

test('sums every session\'s ledger and adds each turn\'s new spend once', async ($, on) => {
  let sessionUsd: number = 1

  on('clock.now', () => ({ value: NOW_MS }) as never)
  on('session.id', () => ({ value: 'abc' }) as never)
  on('session.cwd', () => ({ value: '/Users/me/projects/app' }) as never)
  on('env.get', () => ({ value: '/Users/me' }) as never)
  on('session.model', () => ({ value: 'claude-opus-5-5' }) as never)
  on('session.usage', () => ({ value: {
    startedAt: NOW_MS,
    context: { window: 200000, tokens: 84000, percent: 42 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 40, resetsAt: RESETS_AT }],
    cost: { usd: sessionUsd },
  } }) as never)
  const state: { value: Segment[][] | undefined; version: number } = { value: undefined, version: 0 }
  on('state.get', () => ({ value: { ...state } }) as never)
  on('state.set', (_$, e) => {
    state.value = e.value as Segment[][]
    state.version += 1
    return { value: { isSet: true, version: state.version } } as never
  })
  // Another session on this machine already spent $4.00 this hour.
  const files: Map<string, string> = new Map([
    ['/Users/me/.claude/mods-data/statusline/ledger/other.json', JSON.stringify({ seenUsd: 4, hours: { [String(NOW_MS - (NOW_MS % 3600000))]: 4 } })],
  ])
  on('fs.read', (_$, e) => {
    const text: string | undefined = files.get(e.path)
    return (text === undefined ? { deny: 'ENOENT' } : { value: text }) as never
  })
  on('fs.write', (_$, e) => { files.set(e.path, e.text); return { value: undefined } as never })
  on('fs.list', (_$, e) => ({
    value: [...files.keys()]
      .filter((p: string) => p.startsWith(`${e.path}/`))
      .map((p: string) => ({ name: p.slice(e.path.length + 1), kind: 'file', size: 1, mtimeMs: NOW_MS, isLink: false })),
  }) as never)
  on('process.run', (_$, e) => {
    const out: Record<string, string> = { branch: 'main', status: '', log: 'a1 one\nb2 two' }
    return { value: { exitCode: 0, stdout: out[e.argv[1] ?? ''] ?? '', stderr: '' } } as never
  })
  on('turn.complete', () => ({ text: '' }) as never)

  const turn = { answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as never
  await $.turn.complete(turn)
  sessionUsd = 2.5
  await $.turn.complete(turn)

  const rows: Segment[][] = state.value ?? []
  const [line1, line2]: string[] = rows.map((row: Segment[]) => row.map((s: Segment) => s.text).join(''))
  expect(line1).toBe('~/projects/app (main) ✅ │ Commits:2 │ 🧠 Opus 5.5 │ Ctx 42% (84k/200k)')
  expect(rows[0]?.at(-1)?.color).toBe('#a6e3a1')
  expect(line2).toContain('🔥 Live $6.50 │ 🚒 30D $6.50 │ Resets at ')
  expect(line2).toContain('(1h 53m left)')
  expect(rows[0]?.[0]).toEqual({ text: '~/projects/app', color: '#89b4fa' })
  expect(rows[1]?.at(-1)?.italic).toBe(true)
})

const LEDGER_DIR: string = '/Users/me/.claude/mods-data/statusline/ledger'
const THIS_HOUR: string = String(NOW_MS - (NOW_MS % 3600000))

type Session = { files: Map<string, string>; state: { value: Segment[][] | undefined; version: number } }

// The engine around one session 'abc' that has spent $2.50 unless told otherwise,
// beside the given ledger files. A null cost is a session yet to report one.
// `own` names the events the caller answers itself.
function stubSession(on: On, files: Map<string, string>, cost: { usd: number } | null = { usd: 2.5 }, own: readonly string[] = []): Session {
  on('clock.now', () => ({ value: NOW_MS }) as never)
  on('session.id', () => ({ value: 'abc' }) as never)
  on('session.cwd', () => ({ value: '/Users/me/projects/app' }) as never)
  on('env.get', () => ({ value: '/Users/me' }) as never)
  on('session.model', () => ({ value: 'claude-opus-5-5' }) as never)
  if (!own.includes('session.usage')) on('session.usage', () => ({ value: {
    startedAt: NOW_MS,
    context: { window: 200000, tokens: 84000, percent: 42 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 40, resetsAt: RESETS_AT }],
    cost: cost ?? undefined,
  } }) as never)
  const state: { value: Segment[][] | undefined; version: number } = { value: undefined, version: 0 }
  on('state.get', () => ({ value: { ...state } }) as never)
  on('state.set', (_$, e) => {
    state.value = e.value as Segment[][]
    state.version += 1
    return { value: { isSet: true, version: state.version } } as never
  })
  if (!own.includes('fs.read')) on('fs.read', (_$, e) => {
    const text: string | undefined = files.get(e.path)
    return (text === undefined ? { deny: 'ENOENT' } : { value: text }) as never
  })
  on('fs.write', (_$, e) => { files.set(e.path, e.text); return { value: undefined } as never })
  on('fs.list', (_$, e) => ({
    value: [...files.keys()]
      .filter((p: string) => p.startsWith(`${e.path}/`))
      .map((p: string) => ({ name: p.slice(e.path.length + 1), kind: 'file', size: 1, mtimeMs: NOW_MS, isLink: false })),
  }) as never)
  on('process.run', (_$, e) => {
    const out: Record<string, string> = { branch: 'main', status: '', log: 'a1 one\nb2 two' }
    return { value: { exitCode: 0, stdout: out[e.argv[1] ?? ''] ?? '', stderr: '' } } as never
  })
  on('turn.complete', () => ({ text: '' }) as never)
  return { files, state }
}

function turnWith(fields: Record<string, unknown>): never {
  return { answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer', ...fields } as never
}

function usageOf(input: number, cacheCreation: number, cacheRead: number): Record<string, unknown> {
  return { input_tokens: input, output_tokens: 500, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheCreation, model: 'claude-opus-5-5' }
}

function line2(session: Session): string {
  return (session.state.value?.[1] ?? []).map((s: Segment) => s.text).join('')
}

// Whole percent, rounded down, so 100% shows only when every input token came
// from the cache: 92.6% and 92.4% both show 92%, and 99.6% shows 99%.
for (const [input, cacheCreation, cacheRead, shown] of [[24, 50, 926, '92%'], [26, 50, 924, '92%'], [4, 0, 996, '99%'], [0, 0, 1000, '100%']] as const) {
  test(`shows the 30-day cache hit rate as ${shown} beside the 30-day cost (${cacheRead} of 1000 cached)`, async ($, on) => {
    const session: Session = stubSession(on, new Map([
      [`${LEDGER_DIR}/other.json`, JSON.stringify({ seenUsd: 4, hours: { [THIS_HOUR]: 4 } })],
    ]))
    await $.turn.complete(turnWith({ usage: usageOf(input, cacheCreation, cacheRead) }))
    expect(line2(session)).toContain(`🔥 Live $6.50 │ 🚒 30D $6.50 · ♻️ ${shown} cached │ Resets at `)
  })
}

test('records each turn\'s input, cache-write and cache-read tokens in this hour\'s bucket', async ($, on) => {
  const session: Session = stubSession(on, new Map())
  await $.turn.complete(turnWith({ usage: usageOf(10, 20, 30) }))
  await $.turn.complete(turnWith({ usage: usageOf(1, 2, 3) }))
  const stored = JSON.parse(session.files.get(`${LEDGER_DIR}/abc.json`) ?? '{}')
  expect(stored.tokens).toEqual({ [THIS_HOUR]: { input: 11, cacheCreation: 22, cacheRead: 33 } })
  expect(stored.hours).toEqual({ [THIS_HOUR]: 2.5 })
})

test('weights the rate by tokens across every session\'s ledger', async ($, on) => {
  // Per-turn averaging would show (99% + 0%) / 2 = 49.5%; weighting shows 990 / 4000 = 24.75%, shown as 24%.
  const session: Session = stubSession(on, new Map([
    [`${LEDGER_DIR}/other.json`, JSON.stringify({ seenUsd: 0, hours: {}, tokens: { [THIS_HOUR]: { input: 3000, cacheCreation: 0, cacheRead: 0 } } })],
  ]))
  await $.turn.complete(turnWith({ usage: usageOf(10, 0, 990) }))
  expect(line2(session)).toContain('🚒 30D $2.50 · ♻️ 24% cached │ ')
})

test('reads an old ledger without token fields and writes it back with its cost intact', async ($, on) => {
  const session: Session = stubSession(on, new Map([
    [`${LEDGER_DIR}/abc.json`, JSON.stringify({ seenUsd: 1, hours: { [THIS_HOUR]: 1 } })],
  ]))
  await $.turn.complete(turnWith({ usage: usageOf(100, 0, 900) }))
  const stored = JSON.parse(session.files.get(`${LEDGER_DIR}/abc.json`) ?? '{}')
  expect(stored.seenUsd).toBe(2.5)
  expect(stored.hours).toEqual({ [THIS_HOUR]: 2.5 })
  expect(stored.tokens).toEqual({ [THIS_HOUR]: { input: 100, cacheCreation: 0, cacheRead: 900 } })
  expect(line2(session)).toContain('🚒 30D $2.50 · ♻️ 90% cached │ ')
})

test('records no tokens and omits the cache rate when a turn reports no usage', async ($, on) => {
  const session: Session = stubSession(on, new Map())
  await $.turn.complete(turnWith({ reason: 'aborted', isAborted: true }))
  const stored = JSON.parse(session.files.get(`${LEDGER_DIR}/abc.json`) ?? '{}')
  expect(stored.hours).toEqual({ [THIS_HOUR]: 2.5 })
  expect(Object.keys(stored.tokens ?? {})).toEqual([])
  expect(line2(session)).toContain('🚒 30D $2.50 │ Resets at ')
  expect(line2(session)).not.toContain('cached')
})

test('omits the cache rate when no ledger in the window holds token data', async ($, on) => {
  const session: Session = stubSession(on, new Map([
    [`${LEDGER_DIR}/other.json`, JSON.stringify({ seenUsd: 4, hours: { [THIS_HOUR]: 4 } })],
    [`${LEDGER_DIR}/older.json`, JSON.stringify({ seenUsd: 0, hours: {}, tokens: { [String(Number(THIS_HOUR) - 31 * 24 * 3600000)]: { input: 1, cacheCreation: 0, cacheRead: 9 } } })],
  ]))
  await $.turn.complete(turnWith({}))
  expect(line2(session)).toContain('🔥 Live $6.50 │ 🚒 30D $6.50 │ Resets at ')
})

test('records a subagent turn\'s tokens without redrawing, and counts them on the next main turn', async ($, on) => {
  const session: Session = stubSession(on, new Map())
  await $.turn.complete(turnWith({ agentId: 'sub-1', usage: usageOf(0, 0, 800) }))
  expect(session.state.version).toBe(0)
  const stored = JSON.parse(session.files.get(`${LEDGER_DIR}/abc.json`) ?? '{}')
  expect(stored.tokens).toEqual({ [THIS_HOUR]: { input: 0, cacheCreation: 0, cacheRead: 800 } })
  await $.turn.complete(turnWith({ usage: usageOf(200, 0, 0) }))
  expect(session.state.version).toBe(1)
  expect(line2(session)).toContain('🚒 30D $2.50 · ♻️ 80% cached │ ')
})

test('writes a subagent turn\'s tokens even before the session reports a cost', async ($, on) => {
  const session: Session = stubSession(on, new Map(), null)
  await $.turn.complete(turnWith({ agentId: 'sub-1', usage: usageOf(5, 0, 95) }))
  const stored = JSON.parse(session.files.get(`${LEDGER_DIR}/abc.json`) ?? '{}')
  expect(stored.seenUsd).toBe(0)
  expect(stored.hours).toEqual({})
  expect(stored.tokens).toEqual({ [THIS_HOUR]: { input: 5, cacheCreation: 0, cacheRead: 95 } })
})

test('counts the cost once and keeps both turns\' tokens when two subagent turns end together', async ($, on) => {
  const session: Session = stubSession(on, new Map(), { usd: 2.5 }, ['session.usage', 'fs.read'])
  // The first subagent sees the session at $2.50 and the second at $3.00, but
  // the first one's ledger read comes back only after the second has started.
  let usageReads: number = 0
  on('session.usage', () => {
    usageReads += 1
    return { value: {
      startedAt: NOW_MS,
      context: { window: 200000, tokens: 84000, percent: 42 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 40, resetsAt: RESETS_AT }],
      cost: { usd: usageReads === 1 ? 2.5 : 3 },
    } } as never
  })
  let ledgerReads: number = 0
  on('fs.read', async (_$, e) => {
    ledgerReads += 1
    if (ledgerReads === 1) {
      // Long enough for an unserialized second persist to read and write.
      for (let i: number = 0; i < 50; i += 1) await new Promise<void>((resolve: () => void) => setTimeout(resolve, 1))
    }
    const text: string | undefined = session.files.get(e.path)
    return (text === undefined ? { deny: 'ENOENT' } : { value: text }) as never
  })
  await Promise.all([
    $.turn.complete(turnWith({ agentId: 'sub-1', usage: usageOf(10, 0, 0) })),
    $.turn.complete(turnWith({ agentId: 'sub-2', usage: usageOf(0, 0, 90) })),
  ])
  const stored = JSON.parse(session.files.get(`${LEDGER_DIR}/abc.json`) ?? '{}')
  expect(stored.seenUsd).toBe(3)
  expect(stored.hours).toEqual({ [THIS_HOUR]: 3 })
  expect(stored.tokens).toEqual({ [THIS_HOUR]: { input: 10, cacheCreation: 0, cacheRead: 90 } })
})
