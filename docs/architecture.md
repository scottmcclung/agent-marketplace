# Architecture

## Single authoring source, native delivery

The library is independent of the clients' packaging formats. A deterministic
Node.js compiler renders shared documents with a client value map, then emits
host metadata through YAML/TOML serializers and client wrapper templates.

```text
library/ + clients/ + package.json
               |
       npm run build
               |
   +-----------+-----------+
   |           |           |
 Claude      Codex         Pi
 plugin      plugin       package
   |           |           |
 native      native       native
 marketplace marketplace  Git/npm source
```

There is deliberately no install hook, machine-sync agent, global filesystem
mutation, model call, external network request, or runtime Node dependency in
the generated prompt packages. Build dependencies are devDependencies.
Imported skill scripts may have their own prerequisites.

## Generated ownership

The compiler owns `dist/`, `.claude-plugin/`, and `.agents/plugins/` in this
repository. It reads/validates all sources and constructs the output map before
writing anything. It then replaces those owned directories, removing stale
resources when prompts are deleted. Generation errors leave previous output
untouched; filesystem failures during writing are not an atomic transaction.

`--check` only compares bytes, executable modes, missing files, and stale files.
Generated files are committed so native Git consumers do not need to execute
a build. CI checks them before a release.

Each target includes `library-version.json`: library version, client, agent
mode, and an input SHA-256 fingerprint. The fingerprint includes shared sources,
client configurations/templates, compiler code, package metadata, and the license.
It intentionally excludes timestamps and the current commit SHA to avoid
self-referential or non-reproducible builds. `dist/manifest.json` records output
checksums and executable modes (excluding itself).

## Compatibility contract

### Claude Code

- Catalog: `.claude-plugin/marketplace.json`.
- Plugin: `dist/claude/.claude-plugin/plugin.json`.
- Agents: native Markdown files under `agents/`.
- Commands: Markdown files under `commands/`.
- Skills: directories under `skills/`.
- Specialist references use the plugin namespace (`devtools:...`).

Keep `devtools` as the plugin name for continuity while using
`agent-marketplace` as the catalog/library name. Install the old and new
marketplace versions separately only for deliberate testing, not normal use.

### Pi with @tintinweb/pi-subagents

- Git install: repository-root `package.json` points Pi to `dist/pi` resources.
- Optional standalone npm package: `dist/pi/package.json` uses relative paths
  within that package.
- Both explicitly declare `pi.subagents.agents`, which the subagents extension
  discovers from Pi-installed packages.
- Agents are prefixed `devtools-` to avoid collisions in Pi's flat namespace.
- Commands become prompt templates; skills remain skills.
- The consumer installs `@tintinweb/pi-subagents` as its own Pi package. It is
  not bundled or assumed to load just because npm resolves it transitively.
- Agent defaults append to the parent's system prompt, disable extra
  extensions, and use foreground execution unless explicitly requested
  otherwise. Required skills remain explicitly preloaded.
- Pi UAT maps WebFetch to shell/browser workflows, not an invented Pi tool.
- Local agent definitions can shadow package agents. Inspect `/agents` if an
  updated library appears not to change behavior.

### Codex

- Catalog: `.agents/plugins/marketplace.json`.
- Plugin: portable root manifest `dist/codex/plugin.json`.
- Commands become explicitly invoked workflow skills.
- Specialists become delegation skills, each with a local
  `references/prompt.md` containing the shared role instructions.
- A parent loads the role skill, reads the role prompt, starts a generic child
  with those instructions, and collects the result. A skill name is **not**
  passed as `agent_type`.
- The skill wrapper is not sent to the child, avoiding recursive delegation.
- Optional `agents/*.toml` exports are generated for clients supporting native
  custom agents, but the plugin does not claim to register them. A user who
  manually copies these files assumes responsibility for updating those copies.
- Model profiles default to `null`/inheritance and tool profiles to `null`:
  prompts do not pretend to enforce Claude/Pi tool allowlists in Codex.
- If generic subagent support is unavailable, workflows stop with a capability
  explanation rather than silently doing specialist work in the parent.

This is a conscious compatibility fallback, not exact behavioral equivalence.
If Codex gains a documented plugin-agent registration facility, change its
adapter and integration tests while keeping the shared prompt bodies.

The current CLI plugin workflow was verified against Codex CLI 0.164.0's
command interface. Packaging formats evolve; recheck the references below when
upgrading clients. Automated tests validate generated structures, not model
compliance, upstream services, real credential flows, or the behavior of every
client version. Native install smoke tests should use isolated configuration
homes and make no model requests.

## Orchestration semantics

The shared work workflow preserves two independent requirements:

1. Fresh specialist context for tests, implementation, review, and fixes.
2. The same existing task worktree/branch across those steps.

Using fresh automatic worktree isolation for every step would break this
contract. Reviewers need the task's actual current diff; fresh worktrees may
lack uncommitted changes. Independent tasks still need separate worktrees.

Project lifecycle rules belong in `AGENTS.md`. Claude-specific `CLAUDE.md` can
import shared instructions; this package does not create or overwrite a
consumer project's instruction files. Shell access and prompt-level read-only
requests are not sandboxes. Runtime approvals remain controlled by each host.

## References

- [Claude plugins](https://code.claude.com/docs/en/plugins)
- [Claude plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [Codex plugins](https://developers.openai.com/codex/plugins)
- [Codex plugin packaging](https://developers.openai.com/plugins/build/plugins)
- [Codex custom agents](https://developers.openai.com/codex/subagents)
- [Pi packages](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md)
- [Pi package agents](https://github.com/tintinweb/pi-subagents/blob/master/docs/packages.md)
- [Agent Skills specification](https://agentskills.io/specification)
