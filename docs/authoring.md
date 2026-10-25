# Authoring

## Shared documents

Edit `library/`, not generated outputs. Documents use YAML frontmatter plus a
Handlebars body; the whole document is rendered for each client before parsing.
Use a YAML block scalar (`description: |`) or quote descriptions containing
`: ` to avoid invalid YAML.

### Agent

`library/agents/my-specialist.md.hbs`:

```markdown
---
name: my-specialist
description: Investigate narrowly scoped failures and return a concise report.
modelProfile: balanced
toolProfile: operations
color: blue
---

You are a failure investigator. Read the project's
{{client.projectInstructions}} before acting.
Return evidence, affected file paths, and recommended next steps.
```

The filename must match `name`. The build automatically adds this agent to
all three targets and to the `agents` template value map. Pi/Codex prefix its
name; Claude uses its plugin namespace for references.

Optional `skills: [playwright-cli]` declares skills the role requires. These
must exist in the shared skill library. The adapters preserve them in native
agent metadata where supported and include instructions for Codex delegation.

Client-specific native fields such as `model`, `tools`, and `prompt_mode`
belong in client configuration, not shared frontmatter:

- `models` maps `deep`, `balanced`, `fast`, and `inherit` to model identifiers
  or `null` (omit the model and inherit the host default).
- `tools` maps each `toolProfile` to native tool names, or `null` for a client
  whose plugin format cannot express that tool restriction.
- `colors` maps display colors or explicitly omits them using `null`.
- `agentDefaults` sets host-specific defaults shared by native agents.
- `agentName` and `agentReference` map an identity to native registration and
  in-prompt references. They are small Handlebars templates with `name`.

`null` is an explicit capability decision, **not** proof that the host enforces
an equivalent restriction. Unknown profile names fail the build.

For Pi, `deep`, `balanced`, and `fast` map to the bundled `devtools-router`
virtual models. Author the router under `clients/pi/extensions/`; the build
copies these assets byte-for-byte and includes them in its input fingerprint.
Do not place provider-specific routing logic in the shared agent prompts.
See [Pi model routing](pi-model-router.md) for runtime configuration.

### Command

`library/commands/my-command.md.hbs`:

```markdown
---
name: my-command
description: Run a narrowly scoped workflow.
argumentHint: <target>
manualOnly: true
---

Inputs: {{client.arguments}}
Use {{agents.js-software-engineer}} for implementation.
{{client.delegation}}
```

Claude emits a command, Pi a prompt template, and Codex a skill. `manualOnly`
controls Codex's `allow_implicit_invocation` policy; Claude legacy commands and
Pi prompt templates already require explicit invocation.

Use the `commands` map when documenting invocation:
`{{commands.plan}}` becomes `/devtools:plan`, `$devtools-plan`, or
`/devtools-plan`. Do not use global string replacements: `/plan` can also occur
inside an ordinary file path such as `.tmp/plan-draft.md`.

### Skill

```text
library/skills/my-skill/
  SKILL.md.hbs
  references/guide.md
  scripts/helper.mjs
```

```markdown
---
name: my-skill
description: Explain exactly when this capability applies.
---

Read [the guide](references/guide.md) relative to this skill directory.
```

Skill names must match their containing directory, use lowercase letters,
numbers, and single hyphens, and be no longer than 64 characters. Descriptions
must be at most 1024 characters. References/scripts/assets remain together in
every output. Source symlinks are rejected so packages cannot accidentally
include files from outside the library.

Only files ending in `.hbs` are rendered, and the suffix is removed in the
output. All other skill resources are copied **byte-for-byte**. Resources beginning
with a shebang (`#!`) receive executable mode `0755`; other resources receive
`0644`. This rule is deterministic even on Windows checkouts, which do not
expose POSIX executable bits. Do not rename an existing script to `.hbs` unless you actually
want its contents interpreted as a template.

Host-specific skill fields go in `skillAttributes` under the source skill
name, for example Claude's `allowed-tools` for Playwright. Avoid presenting
that field as a portable permission boundary.

## Template context

| Value | Purpose |
| --- | --- |
| `client.name` | Display name, e.g. Pi or Codex |
| `client.projectInstructions` | Host-appropriate instruction files |
| `client.instructionFiles` | Paths to inspect during reflection |
| `client.arguments` | Native command argument handling |
| `client.shellTool`, `client.delegateTool` | Host tool terminology |
| `client.delegation` | Host-specific orchestration/capability contract |
| `agents.<canonical-name>` | A native agent reference or delegation skill identity |
| `commands.<canonical-name>` | Native invocation syntax |
| `skills.<canonical-name>` | Skill name in this host |
| `library.name`, `library.version` | Package identity |

Client `values` can add more keys. Name mapping patterns receive only `name`.
Output wrappers under `clients/<client>/templates/` receive serialized
`frontmatter`, `body`, and `source`; the Codex agent wrapper also receives
`name`, `delegation`, and `requiredSkills`.

Handlebars is configured with **strict lookup** and **no HTML escaping**:
missing properties fail rather than silently disappearing, and prompts keep
Markdown, XML, quotes, and code intact. YAML and TOML serializers handle native
metadata escaping rather than interpolating it manually.

Literal Handlebars-like syntax must be escaped in `.hbs` files. For example,
write `\{{ }}` in a Laravel prompt to emit Blade's literal `{{ }}`. Ordinary
non-template resource files require no escaping. Shell `$ARGUMENTS` is not a
Handlebars expression; the Claude/Pi value maps deliberately preserve it for
the host to substitute later.

## Workflow

```bash
npm ci
# edit library/ and/or clients/
npm run build
npm run verify
git diff -- library clients dist .claude-plugin .agents/plugins
```

Review the generated diff before committing. CI checks deterministic output,
native metadata, model/tool mappings, literal syntax preservation, resource
copying, template failures, stale output, version alignment, and manifest paths.
Do not add timestamps to generated files.
