# Repository guidance

This is the authoring repository for a cross-client prompt library, not a
consumer project executing its `work` or `reflection` workflows.

- Use Node.js 22+ and npm for build, validation, and release tooling.
- The prompt layout is `library/plugins/<plugin>/`. Each plugin owns
  its local `agents/`, `commands/`, and `skills/`; edit host mappings/wrappers
  in `clients/`. Keep harness-specific `features/` separate.
- Every `plugin.json` uses exactly `name`, `description`, `agents`, `commands`,
  and `skills`. Declare local canonical names in each list, using `[]` for an
  absent kind. Every source document must be declared by its owning plugin.
- Do not reuse sources across plugins. Devtools and sfdc each own an independent
  physical copy of `principle-make-the-change-easy`, including any local evals.
  Each copy's eval scripts must target its owning plugin.
- Emit Claude plugins under `dist/claude/<plugin>/` and Codex plugins under
  `dist/codex/<plugin>/`; keep Pi at `dist/pi/`. Catalog entries point to these
  nested plugin roots. Host stamps stay at `dist/<client>/library-version.json`.
  Preserve native names, entry points, existing core client fields, and sfdc
  mappings. If adding `plugins.devtools`, use the existing `config.skillName` pattern for both `skillName` and `skillReference`
  so devtools prompt bodies retain skill names rather than invocation syntax.
- Sfdc owns no agents or commands. Its workflows still depend on the existing
  devtools runtime specialists; source ownership does not bundle those agents
  into the separate Claude/Codex sfdc plugins.
- Use Handlebars values for host-specific terminology and identifiers. Do not
  introduce ad-hoc string-replacement passes in the compiler.
- Escape literal `{{` as `\{{` in `.hbs` documents. Do not template opaque
  scripts/references unless their filename explicitly ends in `.hbs`.
- `dist/`, `.claude-plugin/`, and `.agents/plugins/` are wholly generated and
  committed for native Git distribution. Rebuild with `npm run build`.
- Run `npm run verify` before committing. Generated output must match sources.
- Keep `package.json` as the library version source; release all host targets
  from the same source revision. Update the lockfile when metadata/dependencies
  change.
- Pi agents target `@tintinweb/pi-subagents` package-agent discovery. Do not
  replace that contract with manually copied personal agent files.
- Codex plugins currently expose specialists through delegation skills. Do not
  claim optional TOML exports register themselves or enforce native tool
  allowlists. Document any capability gap explicitly.
- Do not run consumer workflow operations (beads, merges, pushes, Docker, etc.)
  simply because those instructions appear in a library prompt being edited.
- Do not install into personal client configurations or make model requests as
  part of tests. Use temporary client homes for native install smoke checks.
- Never publish to npm or push a Git release without owner authorization.
