# Initial validation

The initial 0.1.0 implementation was checked locally with Node.js 26.12.0 and
npm 11.20.0. CI additionally targets Node.js 22/24 on Linux and Windows.

Completed checks:

- `npm run verify`: 26 Node test-runner tests and an exact generated-output check.
- `npm run pack:release`: Claude/Codex archives, a standalone Pi npm tarball,
  and SHA-256 checksums produced successfully.
- Claude Code 2.1.288: added the local marketplace, installed
  `devtools@agent-marketplace`, and checked plugin update successfully.
- Codex CLI 0.164.0: added the local marketplace and installed
  `devtools@agent-marketplace`; its plugin cache contains all 16 generated
  skills (10 specialist delegation skills, 3 workflow skills, 3 shared skills).
- Pi 1.4.0: installed the root local package and confirmed it appears in
  `pi list`.

Native smoke checks used separate temporary `CLAUDE_CONFIG_DIR`, `CODEX_HOME`,
and `PI_CODING_AGENT_DIR` directories. They did not change personal client
configuration or make model requests. See [releasing](releasing.md) for commands
that reproduce isolated install checks.

Not claimed by these checks:

- Live specialist execution or model compliance with the workflow.
- Pi subagent-extension package discovery during an actual agent session.
- Automatic registration of Codex's optional TOML agent exports.
- Remote GitHub installation/update before the first push.
- Windows CI execution before the GitHub workflow has run.
- npm registry publication or an existing public npm package name.
