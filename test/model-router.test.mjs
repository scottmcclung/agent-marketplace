import test from 'node:test';
import assert from 'node:assert/strict';

// Public contract: route(profile, request, ctx) resolves to { model, ... },
// where model is the physical registry object. Other result fields are unspecified.
// Credentials use Pi's getApiKeyAndHeaders(model) result union. ok: true is
// sufficient for eligibility, including header-only and ambient authentication.
// No continuation policy or credential-check timeout duration is assumed here.
const moduleUrl = new URL('../clients/pi/extensions/model-router.mjs', import.meta.url);
const physical = (provider, id) => Object.freeze({ provider, id, api: 'test-api' });
const preferred = physical('primary', 'large');
const sibling = physical('primary', 'small');
const fallback = physical('secondary', 'general');
const profiles = {
  deep: ['primary/large', 'secondary/general'],
  fast: ['primary/small', 'secondary/general'],
  balanced: ['secondary/general'],
};
const request = Object.freeze({ messages: Object.freeze([]) });

async function setup(t, options = {}) {
  const { createRouter } = await import(moduleUrl);
  assert.equal(typeof createRouter, 'function');
  let time = 0;
  let available = [preferred, sibling, fallback];
  let credential = async model => ({ ok: true, apiKey: `${model.provider}-test-key` });
  const checks = [];
  const output = [];
  // Credential checks must not issue a completion or write to the context/UI.
  const forbidden = name => () => assert.fail(`Unexpected side effect: ${name}`);
  const ctx = {
    modelRegistry: {
      getAvailable: () => available,
      find: (provider, id) => [preferred, sibling, fallback].find(model => model.provider === provider && model.id === id),
      getApiKeyAndHeaders: async model => { checks.push(model); return credential(model); },
    },
    ui: { notify: forbidden('ui.notify') },
    log: forbidden('ctx.log'),
    complete: forbidden('ctx.complete'),
    stream: forbidden('ctx.stream'),
  };
  for (const name of ['log', 'info', 'warn', 'error', 'debug']) {
    t.mock.method(console, name, (...args) => output.push(args));
  }
  t.after(() => assert.deepEqual(output, [], 'Routing must not log credentials or diagnostics'));
  const router = createRouter({ profiles, now: () => time, ...options });
  assert.equal(typeof router.route, 'function');
  assert.equal(typeof router.reset, 'function');
  return {
    router, ctx, checks,
    advance: milliseconds => { time += milliseconds; },
    available: models => { available = models; },
    credentials: fn => { credential = fn; },
    route: async (profile = 'deep') => {
      const result = await router.route(profile, request, ctx);
      assert.ok(result && typeof result === 'object', 'route must resolve to a routing result');
      return result.model;
    },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function failure(route) {
  await assert.rejects(route, error => {
    assert.ok(error instanceof Error);
    assert.ok(error.message.length > 0 && error.message.length <= 200, 'One concise error is required');
    assert.doesNotMatch(error.message, /[\r\n]/);
    return true;
  });
}

test('router exports the factory and selects the first eligible physical model without a completion probe', async t => {
  const h = await setup(t);
  assert.strictEqual(await h.route(), preferred);
  assert.deepEqual(h.checks, [preferred]);
});

test('candidate order wins over registry order', async t => {
  const h = await setup(t);
  h.available([fallback, sibling, preferred]);
  assert.strictEqual(await h.route(), preferred);
});

test('unregistered and unavailable candidates are skipped without credential checks', async t => {
  const h = await setup(t, { profiles: { deep: ['missing/model', 'primary/large', 'secondary/general'] } });
  h.available([fallback]);
  assert.strictEqual(await h.route(), fallback);
  assert.deepEqual(h.checks, [fallback]);
});

test('candidate IDs preserve slashes inside a provider-qualified model ID', async t => {
  const h = await setup(t, { profiles: { deep: ['secondary/org/model'] } });
  const model = physical('secondary', 'org/model');
  h.ctx.modelRegistry.find = (provider, id) => provider === model.provider && id === model.id ? model : undefined;
  h.available([model]);
  assert.strictEqual(await h.route(), model);
  assert.deepEqual(h.checks, [model]);
});

for (const [name, auth] of [
  ['header-only', { ok: true, headers: { Authorization: 'Bearer test-header-key' } }],
  ['ambient', { ok: true }],
]) {
  test(`${name} credential success is eligible without an API key`, async t => {
    const h = await setup(t);
    h.credentials(async () => auth);
    assert.strictEqual(await h.route(), preferred);
    assert.strictEqual(await h.route('fast'), sibling);
    assert.deepEqual(h.checks, [preferred]);
  });
}

test('unsuccessful credential result falls back quietly and is negatively cached per provider', async t => {
  const h = await setup(t);
  h.credentials(async model => model.provider === 'primary'
    ? { ok: false, error: 'SECRET-provider-auth-failure' }
    : { ok: true, apiKey: 'valid-key' });
  assert.strictEqual(await h.route(), fallback);
  assert.strictEqual(await h.route('fast'), fallback);
  assert.deepEqual(h.checks, [preferred, fallback]);
});

for (const mode of ['failure result', 'unexpected rejection']) {
  test(`${mode} is quiet, provider-scoped, and cannot leak secret details through the final error`, async t => {
    const h = await setup(t);
    const raw = 'Authorization: Bearer SECRET-token-never-emit';
    h.credentials(async () => {
      if (mode === 'unexpected rejection') throw new Error(raw);
      return { ok: false, error: raw };
    });
    for (const profile of ['deep', 'fast']) {
      await assert.rejects(() => h.route(profile), error => {
        assert.ok(error instanceof Error);
        assert.ok(error.message.length > 0 && error.message.length <= 200);
        assert.doesNotMatch(error.message, /[\r\n]/);
        assert.doesNotMatch(String(error), /SECRET|Authorization|Bearer/);
        assert.doesNotMatch(JSON.stringify(error, Object.getOwnPropertyNames(error)), /SECRET|Authorization|Bearer/);
        return true;
      });
    }
    assert.deepEqual(h.checks, [preferred, fallback]);
  });
}

test('default positive cache lasts 30 minutes and expires lazily at the boundary', async t => {
  const h = await setup(t);
  assert.strictEqual(await h.route(), preferred);
  h.advance(1_799_999);
  assert.strictEqual(await h.route('fast'), sibling);
  assert.deepEqual(h.checks, [preferred]);
  h.advance(1);
  assert.deepEqual(h.checks, [preferred], 'Advancing time must not trigger background checks');
  assert.strictEqual(await h.route(), preferred);
  assert.deepEqual(h.checks, [preferred, preferred]);
});

test('preferred provider recovers at 60 seconds even while fallback success remains cached', async t => {
  const h = await setup(t);
  let recovered = false;
  h.credentials(async model => model.provider === 'primary' && !recovered
    ? { ok: false, error: 'temporarily unavailable' }
    : { ok: true, apiKey: 'valid-key' });
  assert.strictEqual(await h.route(), fallback);
  recovered = true;
  h.advance(59_999);
  assert.strictEqual(await h.route(), fallback);
  assert.deepEqual(h.checks, [preferred, fallback]);
  h.advance(1);
  assert.strictEqual(await h.route(), preferred);
  assert.deepEqual(h.checks, [preferred, fallback, preferred]);
});

test('TTL overrides apply independently to successful and failed checks', async t => {
  const h = await setup(t, { successTtlMs: 100, failureTtlMs: 10 });
  h.credentials(async model => model.provider === 'primary'
    ? { ok: false, error: 'temporarily unavailable' }
    : { ok: true, apiKey: 'valid-key' });
  await h.route();
  h.advance(10);
  await h.route();
  assert.deepEqual(h.checks, [preferred, fallback, preferred]);
  h.advance(90);
  await h.route();
  assert.deepEqual(h.checks, [preferred, fallback, preferred, preferred, fallback]);
});

test('timeout rejection uses the negative TTL and can recover', async t => {
  const h = await setup(t);
  const timeout = new Error('credential request timed out');
  timeout.name = 'TimeoutError';
  h.credentials(async model => { if (model.provider === 'primary') throw timeout; return { ok: true, apiKey: 'valid-key' }; });
  assert.strictEqual(await h.route(), fallback);
  h.advance(59_999);
  assert.strictEqual(await h.route(), fallback);
  h.credentials(async () => ({ ok: true, apiKey: 'valid-key' }));
  h.advance(1);
  assert.strictEqual(await h.route(), preferred);
  assert.deepEqual(h.checks, [preferred, fallback, preferred]);
});

test('concurrent profiles share one in-flight provider check but retain their own physical model', async t => {
  const h = await setup(t);
  const gate = deferred();
  const started = deferred();
  h.credentials(model => { started.resolve(); return gate.promise; });
  const deep = h.route();
  const fast = h.route('fast');
  await started.promise;
  gate.resolve({ ok: true, apiKey: 'valid-key' });
  assert.deepEqual(await Promise.all([deep, fast]), [preferred, sibling]);
  assert.equal(h.checks.length, 1);
  assert.equal(h.checks[0].provider, 'primary');
});

test('concurrent negative checks are shared before falling back', async t => {
  const h = await setup(t);
  const gate = deferred();
  const started = deferred();
  h.credentials(model => {
    if (model.provider !== 'primary') return Promise.resolve({ ok: true, apiKey: 'valid-key' });
    started.resolve();
    return gate.promise;
  });
  const deep = h.route();
  const fast = h.route('fast');
  await started.promise;
  gate.resolve({ ok: false, error: 'temporarily unavailable' });
  assert.deepEqual(await Promise.all([deep, fast]), [fallback, fallback]);
  assert.equal(h.checks.filter(model => model.provider === 'primary').length, 1);
  assert.equal(h.checks.filter(model => model.provider === 'secondary').length, 1);
});

test('availability is reconsidered even when a provider credential is cached', async t => {
  const h = await setup(t);
  assert.strictEqual(await h.route(), preferred);
  h.available([fallback]);
  assert.strictEqual(await h.route(), fallback);
  h.available([preferred, fallback]);
  assert.strictEqual(await h.route(), preferred);
  assert.deepEqual(h.checks, [preferred, fallback]);
});

test('unknown, empty, and entirely missing profiles each reject with one concise error', async t => {
  const h = await setup(t, { profiles: { empty: [], missing: ['absent/model'] } });
  for (const profile of ['unknown', 'empty', 'missing']) await failure(() => h.route(profile));
  assert.deepEqual(h.checks, []);
});

test('reset clears both successful and failed provider checks', async t => {
  const h = await setup(t);
  h.credentials(async model => model.provider === 'primary'
    ? { ok: false, error: 'temporarily unavailable' }
    : { ok: true, apiKey: 'valid-key' });
  assert.strictEqual(await h.route(), fallback);
  h.router.reset();
  assert.strictEqual(await h.route(), fallback);
  assert.deepEqual(h.checks, [preferred, fallback, preferred, fallback]);
});

test('reset detaches in-flight checks and their late results cannot overwrite new cache state', async t => {
  const h = await setup(t);
  const oldCheck = deferred();
  const started = deferred();
  h.credentials(() => { started.resolve(); return oldCheck.promise; });
  const oldRoute = h.route();
  await started.promise;
  h.router.reset();
  h.credentials(async () => ({ ok: true, apiKey: 'new-valid-key' }));
  assert.strictEqual(await h.route(), preferred);
  assert.equal(h.checks.length, 2, 'A post-reset route must start a new check');
  oldCheck.resolve({ ok: false, error: 'stale failure' });
  // Whether reset cancels an existing route is unspecified. Only its later
  // effect on the current cache is constrained.
  await oldRoute.catch(() => undefined);
  const before = h.checks.length;
  assert.strictEqual(await h.route(), preferred);
  assert.equal(h.checks.length, before);
});
