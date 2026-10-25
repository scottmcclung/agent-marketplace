import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import factory, { createRouter } from '../clients/pi/extensions/model-router.mjs';

const primary = Object.freeze({ provider: 'primary', id: 'large', api: 'test-api' });
const secondary = Object.freeze({ provider: 'secondary', id: 'general', api: 'test-api' });
const profiles = { deep: ['primary/large', 'secondary/general'], fast: ['primary/large'] };
function fixture() {
  const checks = [];
  const registry = {
    getAvailable: () => [primary, secondary],
    find: (provider, id) => [primary, secondary].find(model => model.provider === provider && model.id === id),
    getApiKeyAndHeaders: async model => { checks.push(model); return { ok: true }; },
  };
  const ctx = { modelRegistry: registry };
  return { ctx, registry, checks, router: createRouter({ profiles }) };
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function register(t, override) {
  const old = process.env.PI_DEVTOOLS_ROUTER_CONFIG;
  t.after(() => {
    if (old === undefined) delete process.env.PI_DEVTOOLS_ROUTER_CONFIG;
    else process.env.PI_DEVTOOLS_ROUTER_CONFIG = old;
  });
  delete process.env.PI_DEVTOOLS_ROUTER_CONFIG;
  let file;
  if (override !== undefined) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devtools-router-'));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    file = path.join(dir, 'router.json');
    await fs.writeFile(file, typeof override === 'string' ? override : JSON.stringify(override));
    process.env.PI_DEVTOOLS_ROUTER_CONFIG = file;
  }
  const models = new Map();
  const commands = new Map();
  const load = () => factory({
    registerVirtualModel: model => models.set(model.id, model),
    registerCommand: (name, command) => commands.set(name, command),
  });
  return { models, commands, load, file };
}

for (const api of [undefined, '', 'pi-virtual']) {
  test(`candidate with API ${String(api)} is skipped before auth`, async () => {
    const h = fixture();
    h.registry.find = provider => provider === 'primary' ? { ...primary, api } : secondary;
    assert.strictEqual((await h.router.route('deep', {}, h.ctx)).model, secondary);
    assert.deepEqual(h.checks, [secondary]);
  });
}

test('availability uses exact IDs, not registry object identity', async () => {
  const h = fixture();
  h.registry.getAvailable = () => [{ ...primary }];
  assert.strictEqual((await h.router.route('deep', {}, h.ctx)).model, primary);
});

test('thinking and continuation routing use request fields, never parent session fields', async () => {
  const h = fixture();
  Object.defineProperties(h.ctx, {
    signal: { get() { assert.fail('Parent signal was accessed'); } },
    sessionManager: { get() { assert.fail('Parent session was accessed'); } },
    thinkingLevel: { get() { assert.fail('Parent thinking level was accessed'); } },
  });
  const result = await h.router.route('deep', {
    reason: 'continuation', previous: { model: secondary }, thinkingLevel: 'xhigh',
  }, h.ctx);
  assert.deepEqual(result, { model: primary, thinkingLevel: 'xhigh' });
});

test('pre-aborted requests neither check credentials nor leak the abort reason', async () => {
  const h = fixture();
  await assert.rejects(h.router.route('deep', { signal: AbortSignal.abort('SECRET') }, h.ctx), error => {
    assert.equal(error.name, 'AbortError');
    assert.doesNotMatch(String(error), /SECRET/);
    return true;
  });
  assert.deepEqual(h.checks, []);
  assert.strictEqual((await h.router.route('deep', {}, h.ctx)).model, primary);
});

test('cancelling one child does not poison shared in-flight eligibility', async () => {
  const h = fixture();
  const started = deferred();
  const gate = deferred();
  h.registry.getApiKeyAndHeaders = async model => { h.checks.push(model); started.resolve(); return gate.promise; };
  const controller = new AbortController();
  const cancelled = h.router.route('deep', { signal: controller.signal }, h.ctx);
  const survivor = h.router.route('fast', {}, h.ctx);
  await started.promise;
  controller.abort('SECRET');
  await assert.rejects(cancelled, { name: 'AbortError' });
  gate.resolve({ ok: true, headers: { Authorization: 'SECRET' } });
  assert.strictEqual((await survivor).model, primary);
  assert.strictEqual((await h.router.route('deep', {}, h.ctx)).model, primary);
  assert.equal(h.checks.length, 1);
});

test('credential AbortError is not negatively cached', async () => {
  const h = fixture();
  h.registry.getApiKeyAndHeaders = async () => { throw Object.assign(new Error('SECRET'), { name: 'AbortError' }); };
  await assert.rejects(h.router.route('fast', {}, h.ctx), /no eligible/);
  h.registry.getApiKeyAndHeaders = async () => ({ ok: true });
  assert.strictEqual((await h.router.route('fast', {}, h.ctx)).model, primary);
});

test('registry exceptions become one sanitized error without a cause', async () => {
  const h = fixture();
  h.registry.getAvailable = () => { throw new Error('SECRET\nAuthorization'); };
  await assert.rejects(h.router.route('deep', {}, h.ctx), error => {
    assert.equal(error.cause, undefined);
    assert.ok(error.message.length <= 200);
    assert.doesNotMatch(JSON.stringify(error, Object.getOwnPropertyNames(error)), /SECRET|Authorization|\n/);
    return true;
  });
});

for (const errorMessage of ['HTTP 401 Unauthorized', 'HTTP 403 Forbidden', 'authentication_error', 'invalid_api_key']) {
  test(`actual retry auth rejection ${errorMessage} invalidates cached provider success`, async () => {
    const h = fixture();
    assert.strictEqual((await h.router.route('deep', {}, h.ctx)).model, primary);
    const result = await h.router.route('deep', {
      reason: 'retry', failed: { model: primary, message: { stopReason: 'error', errorMessage } },
    }, h.ctx);
    assert.strictEqual(result.model, secondary);
    assert.deepEqual(h.checks, [primary, secondary]);
    await assert.rejects(h.router.route('fast', {}, h.ctx), /no eligible/);
  });
}

test('transient errors and failed data outside an actual retry do not disable credentials', async () => {
  const h = fixture();
  for (const [reason, errorMessage] of [
    ['retry', 'HTTP 503 overloaded'], ['retry', 'Context limit is 401 tokens'],
    ['retry', '403 tokens exceed the limit'], ['user', 'HTTP 401 Unauthorized'],
  ]) {
    assert.strictEqual((await h.router.route('deep', {
      reason, failed: { model: primary, message: { stopReason: 'error', errorMessage } },
    }, h.ctx)).model, primary);
  }
  assert.deepEqual(h.checks, [primary]);
});

test('late positive check after reset cannot replace a new negative result', async () => {
  const h = fixture();
  const started = deferred();
  const old = deferred();
  h.registry.getApiKeyAndHeaders = async () => { started.resolve(); return old.promise; };
  const pending = h.router.route('fast', {}, h.ctx);
  await started.promise;
  h.router.reset();
  h.registry.getApiKeyAndHeaders = async () => ({ ok: false, error: 'SECRET' });
  await assert.rejects(h.router.route('fast', {}, h.ctx), /no eligible/);
  old.resolve({ ok: true });
  await pending;
  h.registry.getApiKeyAndHeaders = async () => assert.fail('New negative cache was overwritten');
  await assert.rejects(h.router.route('fast', {}, h.ctx), /no eligible/);
});

test('malformed profiles, virtual targets, and invalid TTLs reject without reflecting input', () => {
  for (const value of [null, [], { deep: 'primary/large' }, { deep: [3] },
    { deep: ['devtools-router/fast'] }, { deep: ['primary/model\nSECRET'] },
    { deep: ['primary/$(SECRET)'] }, { deep: ['primary/../SECRET'] }]) {
    assert.throws(() => createRouter({ profiles: value }), /^Error: Devtools router configuration is invalid\.$/);
  }
  for (const ttl of [-1, NaN, Infinity, '60000', null]) {
    for (const key of ['successTtlMs', 'failureTtlMs']) {
      assert.throws(() => createRouter({ profiles, [key]: ttl }), /configuration is invalid/);
    }
  }
});

test('fast defaults prefer current Haiku, then Luna, then the configured Ollama model', async () => {
  const defaults = JSON.parse(await fs.readFile(new URL('../clients/pi/extensions/model-router.json', import.meta.url), 'utf8'));
  assert.deepEqual(defaults.profiles.fast, [
    'anthropic/claude-haiku-5-5',
    'openai/gpt-6-luna',
    'openai-codex/gpt-6-luna',
    'ollama/qwen3.8',
  ]);
});

test('factory registers default ordered profiles, thinking levels, and a UI-only manual reset', async t => {
  const h = await register(t);
  await h.load();
  assert.deepEqual([...h.models.keys()], ['fast', 'balanced', 'deep']);
  const defaults = JSON.parse(await fs.readFile(new URL('../clients/pi/extensions/model-router.json', import.meta.url), 'utf8'));
  const checks = [];
  let eligible = false;
  const ctx = { modelRegistry: {
    getAvailable: () => Object.values(defaults.profiles).flat().map(candidate => {
      const [provider, id] = candidate.split('/');
      return { provider, id, api: 'test-api' };
    }),
    find: (provider, id) => ({ provider, id, api: 'test-api' }),
    getApiKeyAndHeaders: async model => { checks.push(`${model.provider}/${model.id}`); return { ok: eligible }; },
  } };
  for (const [profile, model] of h.models) {
    assert.equal(model.provider, 'devtools-router');
    assert.deepEqual(model.thinkingLevels, ['off', 'minimal', 'low', 'medium', 'high', 'xhigh']);
    await assert.rejects(model.route({}, ctx), /no eligible/);
    assert.deepEqual(checks, defaults.profiles[profile]);
    checks.length = 0;
    await h.commands.get('devtools-router-reset').handler('', ctx);
  }
  eligible = true;
  const notices = [];
  await h.commands.get('devtools-router-reset').handler('', {
    hasUI: true, ui: { notify: (...args) => notices.push(args) },
  });
  assert.deepEqual(notices, [['Devtools router cache cleared.', 'info']]);
  assert.equal((await h.models.get('deep').route({ thinkingLevel: 'high' }, ctx)).thinkingLevel, 'high');
});

test('partial override merges defaults and edits take effect only on extension reload', async t => {
  const h = await register(t, { profiles: { deep: ['primary/large'] } });
  await h.load();
  const ctx = fixture().ctx;
  assert.strictEqual((await h.models.get('deep').route({}, ctx)).model, primary);
  await fs.writeFile(h.file, JSON.stringify({ profiles: { deep: ['secondary/general'] } }));
  assert.strictEqual((await h.models.get('deep').route({}, ctx)).model, primary);
  await h.load();
  assert.strictEqual((await h.models.get('deep').route({}, ctx)).model, secondary);
  assert.equal(h.models.size, 3);
});

for (const override of ['{SECRET', {}, { profiles: [] }, { profiles: { unknown: [] } },
  { profiles: { fast: ['devtools-router/deep'] } }, { profiles: { deep: [null] } },
  { profiles: {}, execute: 'SECRET' }]) {
  test(`factory rejects invalid override ${JSON.stringify(override)} without partial registration`, async t => {
    const h = await register(t, override);
    await assert.rejects(h.load(), /^Error: Devtools router configuration is invalid\.$/);
    assert.equal(h.models.size, 0);
    assert.equal(h.commands.size, 0);
  });
}

test('missing override file fails with a sanitized config error', async t => {
  const h = await register(t, '{}');
  await fs.unlink(h.file);
  await assert.rejects(h.load(), /^Error: Devtools router configuration is invalid\.$/);
});
