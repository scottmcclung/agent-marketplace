# Pi model routing

The Pi package bundles a virtual-model extension alongside its agents, prompt
templates, and skills. Install the package normally; there is no separate
router dependency to install. `@tintinweb/pi-subagents` is still required for
specialist delegation.

## Model profiles

Shared agent sources declare `deep`, `balanced`, `fast`, or `inherit`.
`clients/pi/config.json` translates the first three into:

| Profile | Virtual model |
| --- | --- |
| `deep` | `devtools-router/deep` |
| `balanced` | `devtools-router/balanced` |
| `fast` | `devtools-router/fast` |

`devtools-router/smallest` is an additional selectable virtual model for local
experiments. Its default candidate list contains only `ollama/gemma4:e4b`.
It has no cloud fallback. Register that exact physical model in Pi's `models.json`
and pull it with Ollama before use. It does not change any agent's default profile.
An explicit per-call model selection can use it without changing the agent source.
As with the other routes, an override file can replace its candidate list.

`inherit` omits the model field and keeps the parent session's selection.
Claude and Codex retain their own profile mappings.

Each virtual model selects the first physical model in its ordered preference
list that is registered, available in Pi, and has resolvable credentials. Use
exact `provider/modelId` values from Pi's model picker. Fuzzy model aliases and
virtual-to-virtual routing are not supported.

## Preferences

Packaged defaults live in `clients/pi/extensions/model-router.json` and are
copied into `dist/pi/extensions/`. Fast requests prefer Haiku, then Luna through
OpenAI or OpenAI Codex, then the configured Ollama `qwen3.8` model. Deep and
balanced profiles have their own ordered lists in the same file.

To override preferences without editing an installed package, set
`PI_DEVTOOLS_ROUTER_CONFIG` to the path of a JSON file before starting Pi:

```json
{
  "profiles": {
    "fast": [
      "anthropic/claude-haiku-5-5",
      "openai/gpt-6-luna",
      "openai-codex/gpt-6-luna",
      "ollama/qwen3.8"
    ]
  }
}
```

An override replaces the listed profile's candidates; other profiles keep their
defaults. Reload the extension after editing preferences. The file contains model
identifiers, not API keys or tokens. Invalid configuration stops router setup
rather than silently using a different policy.

Ollama names depend on your local setup. `ollama/qwen3.8` is a preference for
that exact configured model ID, not a claim that Pi ships it or that it is
installed. Replace it with the exact Ollama ID registered in your Pi configuration.
Unregistered candidates are skipped. The router never downloads models.

## Credential checks and caching

Checks run lazily on the first routing request, inside extension code. They do
not invoke a model or add authentication tools, diagnostic messages, or credential
values to the conversation. Pi owns credential storage and OAuth refresh.

Provider eligibility is cached in memory for the running extension:

- Successful credential resolution: 30 minutes.
- Missing credentials, rejected refresh, or temporary failure: 1 minute.
- Concurrent requests share an in-flight provider check.
- Profiles share provider checks, so selecting a second profile does not repeat
  a fresh authentication check for the same provider.
- Cache expiry is checked on the next routing request. There is no background
  polling or persisted credential cache.

Run `/devtools-router-reset` to clear cached checks after logging into a provider.
This resets eligibility only; it does not change credentials or preference lists.

The router scans preferences in order on each request. A preferred provider can
be selected again after its short failure cache expires, even if a fallback
provider still has a successful cached result.

## Authentication limits

A configured API key is not proof that a provider will accept it. OAuth
resolution can detect an expired token whose refresh is rejected, but an
unexpired token can still be revoked. Credential resolution also cannot prove
model access, quota, local-server reachability, or network availability without
making a request. Local providers such as Ollama must be configured in Pi so
its registry considers them available.

Credential-resolution exceptions are caught and never included in model context.
If no candidate is eligible, the router raises one concise error without
including individual provider exceptions or credential values. It does not send
test completions to validate candidates.

If Pi retries a physical request and supplies an authentication failure to the
router, that provider can be excluded for the short failure TTL before routing
again. Ordinary authentication failures are not automatically retried by Pi.
A terminal failure from an actual provider request can therefore still be visible.
The extension does not promise silent recovery for requests that Pi does not retry.

## Packaging and compatibility

Edit source assets under `clients/pi/extensions/`, not `dist/`. The build copies
them byte-for-byte, fingerprints their contents, and declares the router in both
the repository-root and standalone Pi package manifests.

The extension requires Pi's `registerVirtualModel` API. Subagents need to share
the parent's model runtime so the registered routes remain usable when child
agents disable extra extensions. Enabling arbitrary child extensions is not
necessary for that integration.

Tests use mocked registries and credential resolution. They must not use your
personal credentials, send real model requests, or install into your personal
Pi configuration.
