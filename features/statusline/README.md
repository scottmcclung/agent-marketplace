# statusline

A Claude Code status line shown under the prompt. It shows the repository and
branch, whether the working tree is clean, today's commit count, the model,
context window usage, the 30-day cost, the current block cost, and the time
until the rate limit resets.

## What it runs

It runs `git` in the session's working directory, with a 5 second timeout per
call:

- `git branch --show-current`
- `git status --porcelain`
- `git log --since=midnight --oneline`

## What it reads and writes

- It writes one `<session-id>.json` file per session into
  `~/.claude/mods-data/statusline/ledger/` once the session reports a cost.
  It reads every ledger file there modified in the last 30 days to total cost
  across sessions. It never deletes them, so the folder grows over time.
- It reads `HOME` and the session's id, working directory, model, usage,
  cost, and rate limits from Claude Code.

## Types

`claude/tsconfig.json` extends `./.claude-plugin/types/tsconfig.json`. Claude
Code generates that file when it loads the plugin, and Git ignores it. Type
checking needs the plugin to have been loaded at least once.

## Tests

The tests live next to the hooks in `claude/hooks/*.test.ts`. They stub every
side effect. Run them from the repository root:

```sh
claude plugin test features/statusline/claude
```

The tests are not shipped in `dist/`.
