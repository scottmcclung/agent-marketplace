import { expect, test } from 'claude-code/testing'
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
