# Releasing

## Initial publication

The owner-provided origin is already configured as
`git@github.com:scottmcclung/agent-marketplace.git`. Initial creation does not
push automatically. When ready to publish:

```bash
git remote -v
git push -u origin main
```

Package manifests use repository-relative resource paths, so their resource
resolution does not depend on the remote URL. No npm account or registry publication is required
for native Git installs in any of the three clients.

## One version, three distributions

`package.json` is the version source. To prepare a release:

```bash
npm ci
npm version 0.2.0 --no-git-tag-version
npm run build
npm run verify
# Review the source, lockfile, generated distributions, and catalog diffs.
git add package.json package-lock.json library clients scripts test docs README.md \
  dist .claude-plugin .agents/plugins
git commit -m "Release 0.2.0"
git tag v0.2.0
git push origin main
git push origin v0.2.0
```

Use a new version whenever prompt content or mappings change. Tags should be
immutable. Avoid force-moving release tags or introducing multiple different
outputs with the same library version.

The tag workflow validates that the tag equals `v` plus the package version,
runs verification, creates Claude/Codex archives and a standalone Pi npm
tarball, and publishes a GitHub release with checksums. It does **not** publish
to npm, call client installers, or change anyone's machine configuration.
GitHub's repository token needs permission to create releases.

Git-backed native installs use the committed outputs in the selected Git
snapshot, not these release archives. Commit generated output **before**
creating the tag. The archives are useful for inspection and optional registry
publishing, not required for the normal Git workflow.

## Update policies

- **Track latest:** use an unpinned Git source/default branch and each client's
  native marketplace/package update command. Releases still carry matching
  library version stamps, but updates at different times may select different
  commits. Keep the default branch release-ready if consumers track it.
- **Pin a release:** use a tag/ref where the native client supports it. For
  example, Pi accepts `git:github.com/OWNER/agent-marketplace@v0.2.0`; Codex's
  marketplace add accepts `--ref v0.2.0`. A pinned source does not automatically
  migrate to the next tag. Follow the installed Claude version's Git ref
  selection syntax rather than assuming Codex/Pi syntax applies there.
- **Match exactly:** select sources referring to the same release and compare
  each target's `library-version.json`. The version and `inputsDigest` should
  both match. An update command is not an inter-client lockfile.

Do not confuse updating the library with updating the clients themselves:
`pi update --extensions` updates packages; `pi update` updates Pi;
`codex plugin marketplace upgrade` refreshes marketplaces/configured plugins;
`codex update` updates the Codex application.

## Optional npm distribution for Pi

The root project is intentionally `private: true`; its build dependencies are
not runtime package dependencies. The generated standalone Pi package can be
packed without those authoring dependencies:

```bash
npm run verify
mkdir -p artifacts
npm pack ./dist/pi --pack-destination artifacts
```

To publish it, first choose an available package name (the generated package
currently uses `agent-marketplace`), update the generator if necessary, and
configure npm credentials in your publishing environment. Do not check tokens
into this repository. Automatic npm publication is intentionally not enabled.

The consumer must still install `@tintinweb/pi-subagents` through Pi's own
package mechanism. Registry dependencies alone do not register Pi extensions.

## Smoke testing without modifying personal settings

Build/test/check are safe to run without client credentials. For native package
smoke tests, use temporary homes:

```bash
# Example only; these commands install into the temporary homes.
REPO="$PWD"
TEMP_CODEX_HOME="$(mktemp -d)"
CODEX_HOME="$TEMP_CODEX_HOME" codex --no-daemon plugin marketplace add "$REPO"
CODEX_HOME="$TEMP_CODEX_HOME" codex --no-daemon plugin add devtools@agent-marketplace

TEMP_PI_HOME="$(mktemp -d)"
PI_CODING_AGENT_DIR="$TEMP_PI_HOME" pi install "$REPO"
```

Remove those temporary directories when finished. No model requests are needed
for discovery/install checks. Live agent execution, approval behavior, and
model routing should be tested separately with explicit user authorization.
