# Prompt provenance

The initial library was migrated from Scott McClung's
[cc-plugin-marketplace](https://github.com/scottmcclung/cc-plugin-marketplace),
commit `685c42094995f1374718e752e66bcc3703b26995` (the source `devtools`
plugin declares an MIT license).

The ten specialist agents, three commands, three skills, and skill resources
were imported. Host-specific metadata was moved to client maps. Commands were
templated for client instruction paths, delegation, specialist identifiers,
and argument handling. The work workflow now explicitly preserves a task's
worktree while creating fresh specialist contexts between lifecycle steps.
Long routing examples were moved out of agent descriptions where necessary.

The Laravel and Deno/Salesforce agent names follow their original `name`
frontmatter, which did not always match their old filenames. Source filenames
now match those names. Descriptions containing unquoted YAML colons were
normalized to valid YAML during import.

Existing Pandoc skill Python scripts are preserved as opaque skill resources,
not used by the JavaScript build, tests, release, or package installation.
Running that particular skill still requires Python 3. Node.js/npm is the only
tooling needed to build and validate this repository.

Imported domain-specific recommendations have not been independently audited
for current framework/tool versions. Review them before relying on them.
