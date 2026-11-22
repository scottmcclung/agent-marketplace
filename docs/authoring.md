# Authoring

## Plugin-owned documents

The source contract puts all prompts under `library/plugins/<plugin>/`.
Each plugin owns its source files and declares them in its local `plugin.json`.
Edit those sources, not generated outputs. Documents use YAML frontmatter plus a
Handlebars body; the whole document is rendered for each client before parsing.
Use a YAML block scalar (`description: |`) or quote descriptions containing
`: ` to avoid invalid YAML.

### Agent

`library/plugins/devtools/agents/my-specialist.md.hbs`:

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

The filename must match `name`. Declare `my-specialist` in the owning plugin's
`agents` list. Rendering adds the declared agent to all three targets and to
the `agents` template value map. Pi/Codex prefix its name; Claude uses its
plugin namespace for references.

Optional `skills: [playwright-cli]` declares skills the role requires. These
must exist in the owning plugin's local skill library. The adapters preserve them in native
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
virtual models. Author the router under `features/model-router/pi/`. A Pi
extension lives in `features/<name>/pi/` with an `index.mjs` entry, beside a
`features/<name>/feature.json`. The build copies these assets to
`dist/pi/extensions/<name>/` byte-for-byte and includes them in its input fingerprint.
Do not place provider-specific routing logic in the shared agent prompts.
See [Pi model routing](pi-model-router.md) for runtime configuration.

### Command

`library/plugins/devtools/commands/my-command.md.hbs`:

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

Declare `my-command` in the owning plugin's `commands` list. Claude emits a
command, Pi a prompt template, and Codex a skill. `manualOnly`
controls Codex's `allow_implicit_invocation` policy; Claude legacy commands and
Pi prompt templates already require explicit invocation.

Use the `commands` map when documenting invocation:
`{{commands.plan}}` becomes `/devtools:plan`, `$devtools-plan`, or
`/devtools-plan`. Do not use global string replacements: `/plan` can also occur
inside an ordinary file path such as `.tmp/plan-draft.md`.

### Skill

```text
library/plugins/devtools/skills/my-skill/
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

Declare `my-skill` in the owning plugin's `skills` list. Skill names must
match their containing directory, use lowercase letters,
numbers, and single hyphens, and be no longer than 64 characters. Descriptions
must be at most 1024 characters. References/scripts/assets remain together in
every output. A skill's `evals/` folder is the exception. It holds the skill's
test suite and fixture code for authors, stays in the library, and is left out
of every output. When a skill has independent copies in different plugins,
each copy owns its evals too. Its eval scripts must target that owning plugin's
source, not the other copy. Source symlinks are rejected so packages cannot accidentally
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

### Plugin

Every plugin uses the same manifest contract, including `devtools`. A plugin
can own agents, commands, and skills. Keep every declared source physically
inside that plugin. The layout is:

```text
library/plugins/
  devtools/
    plugin.json
    agents/*.md.hbs
    commands/*.md.hbs
    skills/<skill>/SKILL.md.hbs
  sfdc/
    plugin.json
    skills/plan/SKILL.md.hbs
    skills/work/SKILL.md.hbs
    skills/principle-make-the-change-easy/SKILL.md.hbs
```

The sfdc manifest is:

```json
{
  "name": "sfdc",
  "description": "Salesforce planning and delivery workflows.",
  "agents": [],
  "commands": [],
  "skills": ["plan", "work", "principle-make-the-change-easy"]
}
```

- `name` must match the folder and be a lowercase hyphenated identifier.
  Names must be unique and must not collide with published feature names.
  `devtools` names the existing plugin.
- `description` is required. It becomes the plugin manifest and catalog
  description.
- `agents`, `commands`, and `skills` are required arrays of local canonical
  names, not paths or client-prefixed names. Use `[]` for an absent kind.
- An agent entry declares `agents/<name>.md.hbs`; a command entry declares
  `commands/<name>.md.hbs`; a skill entry declares
  `skills/<name>/SKILL.md.hbs` and its local resources. Every source document
  must be declared, and every declaration must have its local source.
- No other manifest fields are accepted. There is no shared-source option,
  source alias, or cross-plugin source reuse.

Both plugins own a physical copy of `principle-make-the-change-easy`. Edit each
copy independently. Do not replace either with a symlink, import, or build-time
copy from the other plugin. Plugin skills follow the same rules described
above for metadata, resources, `.hbs` rendering, shebang modes, and `evals/`
exclusion. Keep host-specific attributes in client configuration rather than
adding them to the plugin manifest.

Claude plugins emit at `dist/claude/<plugin>/`; Codex plugins emit at
`dist/codex/<plugin>/`. Catalog entries point to these nested roots. Host
stamps stay at `dist/<client>/library-version.json`. Sfdc installs separately
from devtools on Claude and Codex and merges into the existing Pi package at
`dist/pi/`. Native names and invocation syntax are unchanged. Keep
harness-specific features under `features/`, separate from library plugins.

Preserve existing core client fields and sfdc maps when moving sources. An
explicit `plugins.devtools` mapping may use the existing `config.skillName`
pattern for both `skillName` and `skillReference`. Devtools skill context
historically contains names, not slash references; preserve those prompt
bodies rather than changing their invocation syntax. Sfdc's existing
`skillName` and `skillReference` patterns receive the local canonical `name`:

| Client | `skillName` | `skillReference` |
| --- | --- | --- |
| Claude | `{{name}}` | `/sfdc:{{name}}` |
| Codex | `sfdc-{{name}}` | `$sfdc-{{name}}` |
| Pi | `sfdc-{{name}}` | `/skill:sfdc-{{name}}` |

The Pi prefix matters. Pi plugin skills share the package's flat skill
namespace, and a collision with a devtools skill fails the build. A mapping
for an unknown plugin also fails.

Inside sfdc skills, `skills.<name>` is the plugin-local map. It contains only
the skills declared by sfdc, rendered through `skillReference`. Referencing a
skill absent from that local list fails the build. Write `{{skills.work}}` to
emit `/sfdc:work`, `$sfdc-work`, or `/skill:sfdc-work`.

Source ownership does not remove runtime dependencies. Sfdc has no agents or
commands of its own. Its existing `agents` and `commands` references still
resolve to devtools, so `{{agents.salesforce-platform-expert}}` points at the
existing devtools specialist. `client` and `library` retain their existing
values. Document the devtools dependency in the sfdc workflows. Claude and
Codex require devtools installed alongside sfdc; Pi supplies both in one
package. Workflows must stop and identify any missing specialist rather than
doing specialist work in the parent.

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
| `skills.<canonical-name>` | Skill name in this host; plugin-local references inside plugin skills |
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
# edit library/plugins/, clients/, and/or harness-specific features/
npm run build
npm run verify
git diff -- library clients dist .claude-plugin .agents/plugins
```

Review the generated diff before committing. CI checks deterministic output,
native metadata, model/tool mappings, literal syntax preservation, resource
copying, template failures, stale output, version alignment, and manifest paths.
Do not add timestamps to generated files.
