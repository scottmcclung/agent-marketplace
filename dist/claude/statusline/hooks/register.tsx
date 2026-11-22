import { atom, read, update } from 'claude-code'
import type { EngineInterface, FsEntry, Register, SessionContextUsage, SessionRateLimit } from 'claude-code'
import { cacheRateSince, emptyLedger, isLedger, isStale, record, recordTokens, spentSince, WINDOW_MS } from './ledger'
import type { SessionLedger, TurnUsage } from './ledger'
import type { Segment, StatusRows } from '../types'

const SEPARATOR: Segment = { text: ' │ ' }
const BLOCK_MS: number = 5 * 60 * 60 * 1000

// Catppuccin Mocha, the palette the bash status line drew with.
const BLUE: string = '#89b4fa'
const SKY: string = '#89dceb'
const PINK: string = '#f5c2e7'
const GREEN: string = '#a6e3a1'
const YELLOW: string = '#f9e2af'
const SUBTEXT: string = '#a6adc8'
const RED: string = '#f38ba8'

const lines = atom({ plugin: 'statusline', key: 'lines' } as const, [] as StatusRows)

async function git(engine: EngineInterface, args: string[]): Promise<string | undefined> {
  try {
    const { exitCode, stdout } = await engine.process.run(['git', ...args], { timeoutMs: 5000 })
    return exitCode === 0 ? stdout.trim() : undefined
  } catch {
    return undefined
  }
}

async function repoInfo(engine: EngineInterface): Promise<Segment[]> {
  const cwd: string = await engine.session.cwd()
  const home: string | undefined = await engine.env.get('HOME')
  const dir: string = home !== undefined && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd
  const branch: string | undefined = await git(engine, ['branch', '--show-current'])
  if (branch === undefined || branch === '') return [{ text: dir, color: BLUE }]
  const isClean: boolean = (await git(engine, ['status', '--porcelain'])) === ''
  return [
    { text: dir, color: BLUE },
    { text: ' ' },
    { text: `(${branch})`, color: isClean ? GREEN : YELLOW },
    { text: isClean ? ' ✅' : ' 📁' },
  ]
}

async function commitsToday(engine: EngineInterface): Promise<Segment[]> {
  const log: string | undefined = await git(engine, ['log', '--since=midnight', '--oneline'])
  const count: number = log === undefined || log === '' ? 0 : log.split('\n').length
  return [{ text: `Commits:${count}` }]
}

// `$.session.model()` answers an id such as `claude-opus-5-5`; the old status
// line showed the family and version, `Opus 5.5`.
async function modelInfo(engine: EngineInterface): Promise<Segment[]> {
  const model: string = await engine.session.model()
  const match: RegExpMatchArray | null = model.match(/(opus|sonnet|haiku|fable)-(\d+)(?:-(\d+))?/i)
  const family: string = match?.[1]?.toLowerCase() ?? ''
  const emoji: string = { opus: '🧠', sonnet: '🎵', haiku: '⚡' }[family] ?? '🤖'
  const name: string = match === null
    ? model
    : `${family[0].toUpperCase()}${family.slice(1)} ${match[2]}${match[3] === undefined ? '' : `.${match[3]}`}`
  return [{ text: `${emoji} ` }, { text: name, color: SKY }]
}

function tokenCount(tokens: number): string {
  return tokens >= 1_000_000 ? `${+(tokens / 1_000_000).toFixed(1)}M` : `${Math.round(tokens / 1000)}k`
}

// Absent until the session's first response reports its input size.
function contextInfo(context: SessionContextUsage): Segment[] | undefined {
  if (context.percent === undefined) return undefined
  const percent: number = Math.round(context.percent)
  const color: string = percent > 80 ? RED : percent >= 50 ? YELLOW : GREEN
  const counts: string = context.tokens === undefined ? '' : ` (${tokenCount(context.tokens)}/${tokenCount(context.window)})`
  return [{ text: `Ctx ${percent}%${counts}`, color }]
}

function usd(amount: number): string {
  return `$${amount.toFixed(2)}`
}

function resetTimer(limit: SessionRateLimit | undefined, nowMs: number): Segment[] | undefined {
  if (limit?.resetsAt === undefined) return undefined
  const resetsMs: number = Date.parse(limit.resetsAt)
  const leftMin: number = Math.max(0, Math.round((resetsMs - nowMs) / 60000))
  const at: Date = new Date(resetsMs)
  const clock: string = `${String(at.getHours()).padStart(2, '0')}.${String(at.getMinutes()).padStart(2, '0')}`
  const text: string = `Resets at ${clock} (${Math.floor(leftMin / 60)}h ${leftMin % 60}m left)`
  return [{ text, color: SUBTEXT, italic: true }]
}

function joinParts(parts: (Segment[] | undefined)[]): Segment[] {
  const row: Segment[] = []
  for (const part of parts) {
    if (part === undefined) continue
    if (row.length > 0) row.push(SEPARATOR)
    row.push(...part)
  }
  return row
}

async function ledgerDir(engine: EngineInterface): Promise<string> {
  return `${(await engine.env.get("HOME")) ?? ""}/.claude/mods-data/statusline/ledger`
}

// Every session on this machine keeps its own ledger file here. $.store is not
// shared between running processes, so one process never sees another's keys.
async function readLedgers(engine: EngineInterface, dir: string, nowMs: number): Promise<SessionLedger[]> {
  const ledgers: SessionLedger[] = []
  let entries: FsEntry[] = []
  try {
    entries = await engine.fs.list(dir)
  } catch {
    return ledgers
  }
  for (const entry of entries) {
    // The fs API has no delete, so ledgers past the window are skipped unread.
    if (entry.kind !== "file" || !entry.name.endsWith(".json") || entry.mtimeMs <= nowMs - WINDOW_MS) continue
    try {
      const value: unknown = JSON.parse(await engine.fs.read(`${dir}/${entry.name}`))
      if (isLedger(value) && !isStale(value, nowMs)) ledgers.push(value)
    } catch {
      continue
    }
  }
  return ledgers
}

// The tail of this session's ledger updates. The hooks module keeps one
// environment for the process, so this lasts from event to event. Subagents
// can finish together, and their read-modify-write passes must not interleave:
// one would overwrite the other's tokens, and a cost read before the other's
// write would look lower than the stored total, so record would take it for a
// /clear and count the whole session again.
let persisting: Promise<void> = Promise.resolve()

// Runs persistOnce after every earlier call has finished, failed or not.
function persist(engine: EngineInterface, turnUsage: TurnUsage | undefined): Promise<void> {
  const run: Promise<void> = persisting.then(() => persistOnce(engine, turnUsage))
  persisting = run.catch(() => undefined)
  return run
}

// Updates this session's ledger with the turn's tokens and the session's cost.
// The file is written once there is a cost, and also when a turn brings tokens,
// so a subagent turn that ends before the session reports a cost is not lost.
// The cost is read here, inside the queue, so each pass sees a total no older
// than the one the pass before it stored.
async function persistOnce(engine: EngineInterface, turnUsage: TurnUsage | undefined): Promise<void> {
  const nowMs: number = await engine.clock.now()
  const usage = await engine.session.usage()
  if (usage.cost === undefined && turnUsage === undefined) return
  const path: string = `${await ledgerDir(engine)}/${await engine.session.id()}.json`
  let stored: unknown = undefined
  try {
    stored = JSON.parse(await engine.fs.read(path))
  } catch {
    stored = undefined
  }
  let ledger: SessionLedger = isLedger(stored) ? stored : emptyLedger()
  if (turnUsage !== undefined) ledger = recordTokens(ledger, turnUsage, nowMs)
  if (usage.cost !== undefined) ledger = record(ledger, usage.cost.usd, nowMs)
  await engine.fs.write(path, JSON.stringify(ledger))
}

function thirtyDays(ledgers: readonly SessionLedger[], nowMs: number): Segment[] {
  const cost: string = `🚒 30D ${usd(spentSince(ledgers, nowMs - WINDOW_MS))}`
  const rate: number | undefined = cacheRateSince(ledgers, nowMs - WINDOW_MS)
  const text: string = rate === undefined ? cost : `${cost} · ♻️ ${Math.floor(rate * 100)}% cached`
  return [{ text, color: PINK }]
}

async function redraw(engine: EngineInterface): Promise<void> {
  const nowMs: number = await engine.clock.now()
  const usage = await engine.session.usage()
  const dir: string = await ledgerDir(engine)
  const ledgers: SessionLedger[] = await readLedgers(engine, dir, nowMs)
  const block: SessionRateLimit | undefined = usage.rateLimits.find((l: SessionRateLimit) => l.kind === 'five_hour')
  // Off a subscription there is no five-hour window, so the session's own cost stands in.
  const blockStartMs: number | undefined = block?.resetsAt === undefined ? undefined : Date.parse(block.resetsAt) - BLOCK_MS
  const live: number = blockStartMs === undefined ? usage.cost?.usd ?? 0 : spentSince(ledgers, blockStartMs)

  const [repo, commits, model]: Segment[][] = await Promise.all([repoInfo(engine), commitsToday(engine), modelInfo(engine)])
  const rows: StatusRows = [
    joinParts([repo, commits, model, contextInfo(usage.context)]),
    joinParts([
      [{ text: `🔥 Live ${usd(live)}`, color: GREEN }],
      thirtyDays(ledgers, nowMs),
      resetTimer(block, nowMs),
    ]),
  ]

  await update(engine, lines, () => rows)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await persist($, undefined)
    await redraw($)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    // Subagent turns count toward the totals, but only the main turn redraws.
    await persist($, e.usage)
    if (e.agentId === undefined) await redraw($)
    return result
  })

  // The engine prefixes a plugin's $.ui.status entry with its name and keeps
  // it to one line, so the rows go under the engine's own hint line instead.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const hint = await next(e)
    const rows: StatusRows = await read($, lines)
    if (rows.length === 0) return hint
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {hint}
        {rows.map((row: Segment[], i: number) => (
          <Text key={String(i)}>
            {row.map((s: Segment, j: number) => (
              <Text key={String(j)} color={s.color} italic={s.italic}>{s.text}</Text>
            ))}
          </Text>
        ))}
      </Box>
    )
  })
}
