import { readFile } from 'node:fs/promises';

const provider = 'devtools-router';
const profileNames = ['smallest', 'fast', 'balanced', 'deep'];
const configurationError = () => new Error('Devtools router configuration is invalid.');
const routeError = () => new Error('Devtools router has no eligible physical model for this request.');
const abortError = () => Object.assign(new Error('Devtools router request cancelled.'), { name: 'AbortError' });
const isMapping = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function parseProfiles(profiles) {
  if (!isMapping(profiles)) throw configurationError();
  return new Map(Object.entries(profiles).map(([name, candidates]) => {
    if (!/^[a-z][a-z0-9-]*$/.test(name) || !Array.isArray(candidates)) throw configurationError();
    const parsed = candidates.map(candidate => {
      if (typeof candidate !== 'string') throw configurationError();
      const slash = candidate.indexOf('/');
      const targetProvider = candidate.slice(0, slash);
      const id = candidate.slice(slash + 1);
      if (slash < 1 || !/^[a-z0-9][a-z0-9-]*$/.test(targetProvider) || targetProvider === provider ||
          !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(id) ||
          id.split('/').some(part => !part || part === '.' || part === '..')) throw configurationError();
      return { provider: targetProvider, id };
    });
    return [name, parsed];
  }));
}

// Each waiter owns its cancellation. Credential resolution is shared and has no
// request signal, so cancelling a child cannot cancel another child's auth check.
function waitForCheck(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(abortError()); };
    signal.addEventListener('abort', abort, { once: true });
    promise.then(value => {
      signal.removeEventListener('abort', abort);
      resolve(value);
    }, () => {
      signal.removeEventListener('abort', abort);
      reject(routeError());
    });
  });
}

export function createRouter({ profiles, successTtlMs = 1_800_000, failureTtlMs = 60_000, now = Date.now } = {}) {
  const preferences = parseProfiles(profiles);
  if ([successTtlMs, failureTtlMs].some(ttl => typeof ttl !== 'number' || !Number.isFinite(ttl) || ttl < 0) ||
      typeof now !== 'function') throw configurationError();
  const cache = new Map();
  const inFlight = new Map();
  let generation = 0;

  function reset() {
    generation++;
    cache.clear();
    inFlight.clear();
  }

  function eligible(model, registry) {
    const cached = cache.get(model.provider);
    if (cached && cached.expires > now()) return Promise.resolve(cached.ok);
    const pending = inFlight.get(model.provider);
    if (pending) return pending;
    const startedGeneration = generation;
    const check = Promise.resolve().then(async () => {
      let ok;
      try {
        ok = (await registry.getApiKeyAndHeaders(model))?.ok === true;
      } catch (error) {
        // Cancellation is not evidence that a provider lacks credentials.
        if (error?.name === 'AbortError') return false;
        ok = false;
      }
      if (generation === startedGeneration && inFlight.get(model.provider) === check) {
        cache.set(model.provider, { ok, expires: now() + (ok ? successTtlMs : failureTtlMs) });
      }
      return ok;
    }).finally(() => {
      // A reset or retry may already have replaced this provider's check.
      if (inFlight.get(model.provider) === check) inFlight.delete(model.provider);
    });
    inFlight.set(model.provider, check);
    return check;
  }

  async function route(profile, request, ctx) {
    const signal = request?.signal;
    if (signal?.aborted) throw abortError();
    try {
      const candidates = preferences.get(profile);
      if (!candidates) throw routeError();
      const registry = ctx.modelRegistry;
      const available = registry.getAvailable();
      const failed = request?.failed;
      // This only applies when Pi actually retries. Ordinary 401/403 responses
      // do not themselves cause Pi to retry or invoke this router again.
      if (request?.reason === 'retry' && failed?.message?.stopReason === 'error' &&
          /\b(?:(?:http(?: error)?|status(?: code)?)\s*[:=]?\s*(?:401|403)|401\s*[-:]?\s*unauthorized|403\s*[-:]?\s*forbidden|authentication_error|invalid_api_key)\b/i.test(failed.message.errorMessage ?? '')) {
        inFlight.delete(failed.model.provider);
        cache.set(failed.model.provider, { ok: false, expires: now() + failureTtlMs });
      }
      for (const candidate of candidates) {
        if (signal?.aborted) throw abortError();
        if (!available.some(model => model.provider === candidate.provider && model.id === candidate.id)) continue;
        const model = registry.find(candidate.provider, candidate.id);
        if (!model || model.provider !== candidate.provider || model.id !== candidate.id ||
            typeof model.api !== 'string' || !model.api || model.api === 'pi-virtual') continue;
        if (await waitForCheck(eligible(model, registry), signal)) {
          if (signal?.aborted) throw abortError();
          return { model, thinkingLevel: request?.thinkingLevel };
        }
      }
    } catch {
      if (signal?.aborted) throw abortError();
      throw routeError();
    }
    throw routeError();
  }

  return { route, reset };
}

export default async function modelRouter(pi) {
  let profiles;
  try {
    const defaults = JSON.parse(await readFile(new URL('./model-router.json', import.meta.url), 'utf8'));
    profiles = defaults.profiles;
    const overridePath = process.env.PI_DEVTOOLS_ROUTER_CONFIG;
    if (overridePath !== undefined) {
      const override = JSON.parse(await readFile(overridePath, 'utf8'));
      if (!isMapping(override) || Object.keys(override).some(key => key !== 'profiles') ||
          !isMapping(override.profiles) || Object.keys(override.profiles).some(key => !profileNames.includes(key))) {
        throw configurationError();
      }
      profiles = { ...profiles, ...override.profiles };
    }
    if (!isMapping(profiles) || Object.keys(profiles).length !== profileNames.length ||
        profileNames.some(name => !Object.hasOwn(profiles, name))) throw configurationError();
    parseProfiles(profiles);
  } catch {
    throw configurationError();
  }
  const router = createRouter({ profiles });
  for (const profile of profileNames) {
    pi.registerVirtualModel({
      provider,
      id: profile,
      name: `Devtools ${profile}`,
      thinkingLevels: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'],
      // The callback context belongs to the registering parent. Only request
      // fields describe the child when subagents share that parent's runtime.
      route: (request, ctx) => router.route(profile, request, ctx),
    });
  }
  pi.registerCommand('devtools-router-reset', {
    description: 'Clear cached provider eligibility for Devtools model routing',
    handler: async (_args, ctx) => {
      router.reset();
      if (ctx.hasUI) ctx.ui.notify('Devtools router cache cleared.', 'info');
    },
  });
}
