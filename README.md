# Agent Marketplace

One source of truth for specialist agents, reusable skills, and workflow
commands, distributed through **Claude Code plugins**, **Codex plugins**, and
**Pi packages**. Each client installs and updates independently through its own
native tooling. There is no custom machine-sync daemon or installer.

The initial `devtools` collection contains **10 agents, 3 commands, and 3
skills**, migrated from
[cc-plugin-marketplace](https://github.com/scottmcclung/cc-plugin-marketplace).
See [provenance](THIRD_PARTY_NOTICES.md).

## Layout

```text
library/                       # EDIT: shared prompt documents and skill assets
  agents/*.md.hbs
  commands/*.md.hbs
  skills/<name>/SKILL.md.hbs
clients/                       # EDIT: host value maps and output templates
  claude/{config.json,templates/}
  codex/{config.json,templates/}
  pi/{config.json,templates/}
scripts/                       # Node.js build / validation tooling
.claude-plugin/marketplace.json # GENERATED: Claude catalog
.agents/plugins/marketplace.json# GENERATED: Codex catalog
dist/                          # GENERATED and committed for native Git installs
  claude/                      # devtools plugin: native agents + commands + skills
  codex/                       # devtools plugin: delegation/workflow skills
  pi/                          # Pi package: agents + prompt templates + skills
  manifest.json                # version, input fingerprint, file checksums
```

`package.json` is the authoritative library version. All three distributions
carry that version and the same deterministic input fingerprint in
`library-version.json`. A Git-backed Pi install uses the **root** `pi` manifest;
`dist/pi/package.json` is also a standalone package for optional npm publishing.

## Build and verify

Requires **Node.js 22+ and npm**; no model calls, credentials, or Python are
needed for the build or tests.

```bash
npm ci
npm run build
npm run verify
```

The renderer uses **Handlebars**, in strict, non-HTML-escaping mode, with YAML
frontmatter and per-client JSON maps. Missing values, unknown profiles,
invalid names, collisions, and invalid skill descriptions fail the build.
`npm run check` compares generated output without modifying it.

Generated output is committed: consumers must not need your authoring tools or
an install-time build. CI rejects stale outputs. Do not hand-edit `dist/`,
`.claude-plugin/`, or `.agents/plugins/`; the build owns those entire directories.

See [authoring](docs/authoring.md) and [architecture](docs/architecture.md).

## Install locally now

These are **opt-in instructions**; building this repository does not change any
client's settings or install anything into your personal configuration.

From this repository:

### Claude Code

```bash
claude plugin marketplace add "$PWD"
claude plugin install devtools@agent-marketplace
```

Start a new session. Invoke `/devtools:work`, `/devtools:plan`, or
`/devtools:reflection`. Claude receives native plugin agents.

### Pi

Install the assumed subagent implementation explicitly, then this package:

```bash
pi install npm:@tintinweb/pi-subagents
pi install "$PWD"
```

Restart Pi. `/agents` should show package agents such as
`devtools-js-software-engineer`. Invoke `/devtools-work`, `/devtools-plan`, or
`/devtools-reflection`; skills are also available as `/skill:playwright-cli`,
etc. Package agents require a version of `@tintinweb/pi-subagents` supporting
`pi.subagents.agents`; the extension and its package-agent discovery must be
enabled. Installing it as a transitive npm dependency is **not** sufficient.

### Codex CLI

```bash
codex plugin marketplace add "$PWD"
codex plugin add devtools@agent-marketplace
```

Start a new session. Invoke `$devtools-work`, `$devtools-plan`, or
`$devtools-reflection`. Browse installed plugins with `/plugins`.

**Codex compatibility:** native plugins deliver the specialist prompts as
**delegation skills**, not automatically registered custom agent types. Each
specialist skill instructs the parent to send its role prompt to a fresh generic
child. Delegation must be available. Workflow instructions explicitly prohibit
pretending a skill identifier is a registered `agent_type` or silently doing
the work in the parent.

`dist/codex/agents/*.toml` are optional native-agent **exports**. Merely bundling
them in a plugin does not register them; manual placement under a supported
`~/.codex/agents/` is an advanced option and is not updated by plugin management.
The native-install path does not depend on those exports. See
[compatibility and limitations](docs/architecture.md#compatibility-contract).

## Install from GitHub after the first push

The repository's origin is
`git@github.com:scottmcclung/agent-marketplace.git`. The following commands work
once the generated distributions have been committed and pushed there.

```bash
# Claude Code
claude plugin marketplace add https://github.com/scottmcclung/agent-marketplace.git
claude plugin install devtools@agent-marketplace

# Codex
codex plugin marketplace add scottmcclung/agent-marketplace
codex plugin add devtools@agent-marketplace

# Pi (install @tintinweb/pi-subagents separately as above)
pi install git:github.com/scottmcclung/agent-marketplace
```

### Native updates

```bash
# Refresh Claude's marketplace catalog and installed plugin
claude plugin marketplace update agent-marketplace
claude plugin update devtools@agent-marketplace

# Refresh Codex's tracked marketplace and configured plugins
codex plugin marketplace upgrade agent-marketplace

# Update installed Pi packages (not the Pi application itself)
pi update --extensions
```

Restart affected clients after updating. Local-path installs reflect the local
checkout, not upstream changes; use Git-backed sources on consuming machines.
Do not install both local and Git copies of this collection at the same time.
Remove/disable the old `devtools` plugin before switching marketplaces to avoid
duplicate skills or ambiguous specialist routing.

Native clients have different version-selection rules. They can all consume
outputs from the same release, but their update commands are not cross-client
version locks. Git refs/tags can pin a release where supported; pinned Pi
sources do not move to a newer tag during update. See [releasing](docs/releasing.md).

## Included content

Agents (canonical names): `js-software-engineer`, `dev-ops-engineer`,
`uat-specialist`, `deno-javascript-expert`, `diagram-expert`, `laravel-php-expert`,
`salesforce-platform-expert`, `salesforce-apex-test-engineer`,
`crystal-lang-engineer`, and `crystal-code-reviewer`.

Commands: `work`, `plan`, `reflection`.

Skills: `playwright-cli`, `pandoc-converter`, `tailscale-serve-sidecar`.

## Runtime prerequisites and safety

- Work/plan workflows expect the **`bd` CLI** and a configured beads project.
  The Claude beads plugin is not automatically installed in other clients.
- Browser UAT requires `@playwright/cli` and an installed browser.
- Pandoc conversion requires Pandoc; PDF conversion may require a PDF engine.
  The imported Pandoc helper scripts additionally require **Python 3**. These
  are preserved skill assets, not this project's build tooling.
- Container workflows require Docker/Compose; GitHub operations may need `gh`.
- Pi model profiles use `opus`, `sonnet`, and `haiku`; configure available
  providers or change `clients/pi/config.json` before releasing. Codex defaults
  to model inheritance rather than inventing an equivalent OpenAI model.
- Prompts do not enforce a sandbox. Tool lists, shell access, approvals, skill
  permissions, and worktree behavior differ between hosts. Review all prompts
  and use your client's permission controls. Imported workflows include Git
  commits, merges, pushes, and container operations.
- Pi agents disable extra extensions by default and append their role to the
  parent's system prompt. Required skills (for example, Playwright for UAT) are
  explicitly preloaded. Review that choice before enabling more tools.

MIT licensed. See [LICENSE](LICENSE).
