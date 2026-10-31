import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import TOML from '@iarna/toml';
import { generate, render, parseDocument, walk, check, write } from '../scripts/lib/build.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const built = await generate(root);
const text = file => { assert.ok(built.has(file), `Missing ${file}`); return built.get(file).bytes.toString(); };
const json = file => JSON.parse(text(file));
const doc = file => parseDocument(text(file), file);
async function fixture(t) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-marketplace-test-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  for (const entry of ['library', 'clients', 'features', 'scripts', 'package.json', 'LICENSE']) {
    try { await fs.cp(path.join(root, entry), path.join(temp, entry), { recursive: true }); }
    catch (error) { if (entry !== 'features' || error.code !== 'ENOENT') throw error; }
  }
  return temp;
}
async function changeJson(temp, file, change) {
  const value = JSON.parse(await fs.readFile(path.join(temp, file), 'utf8'));
  change(value);
  await fs.writeFile(path.join(temp, file), JSON.stringify(value));
}

test('imports all ten agents, three commands, three skills, and one Pi feature', () => {
  assert.deepEqual(json('dist/manifest.json').counts, { agents: 10, commands: 3, skills: 3, features: { claude: 0, pi: 1 } });
});

test('all native distributions share the same version and input fingerprint', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  for (const client of ['claude', 'codex', 'pi']) {
    const stamp = json(`dist/${client}/library-version.json`);
    assert.equal(stamp.version, pkg.version);
    assert.equal(stamp.inputsDigest, json('dist/manifest.json').inputsDigest);
  }
  assert.equal(json('dist/claude/.claude-plugin/plugin.json').version, pkg.version);
  assert.equal(json('dist/codex/plugin.json').version, pkg.version);
  assert.equal(json('dist/pi/package.json').version, pkg.version);
});

test('Claude receives native tools, model profiles, and plugin-qualified references', () => {
  const agent = doc('dist/claude/agents/js-software-engineer.md');
  assert.equal(agent.meta.model, 'opus');
  assert.equal(agent.meta.tools, 'Read, Write, Edit, Bash, Grep, Glob');
  assert.match(text('dist/claude/commands/work.md'), /devtools:js-software-engineer/);
  assert.match(text('dist/claude/commands/plan.md'), /\$ARGUMENTS/);
  assert.match(text('dist/claude/commands/plan.md'), /\/devtools:plan/);
});

test('Pi uses explicit package-agent discovery and mapped specialist names', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.pi.subagents.agents, ['./dist/pi/agents']);
  assert.deepEqual(json('dist/pi/package.json').pi.subagents.agents, ['./agents']);
  const agent = doc('dist/pi/agents/devtools-js-software-engineer.md');
  assert.equal(agent.meta.name, 'devtools-js-software-engineer');
  assert.equal(agent.meta.prompt_mode, 'append');
  assert.equal(agent.meta.extensions, false);
  assert.equal(agent.meta.run_in_background, false);
  assert.equal(agent.meta.tools, 'read, write, edit, bash, grep, find, ls');
  assert.match(text('dist/pi/prompts/devtools-work.md'), /devtools-js-software-engineer/);
});

test('root Pi package declares every Pi feature extension by glob and includes its distribution', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.pi.extensions, ['./dist/pi/extensions/*/index.mjs']);
  assert.ok(pkg.files.includes('dist/pi') || pkg.files.includes('dist/pi/extensions'), 'Root package files must include the extensions directory');
});

test('standalone Pi package declares every Pi feature extension by relative glob and includes extensions', () => {
  const pkg = json('dist/pi/package.json');
  assert.deepEqual(pkg.pi.extensions, ['./extensions/*/index.mjs']);
  assert.ok(pkg.files.includes('extensions'), 'Standalone package files must include extensions');
});

test('the model router ships as a Pi feature', async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'features/model-router/feature.json'), 'utf8'));
  assert.equal(manifest.name, 'model-router');
  for (const file of ['index.mjs', 'model-router.json']) {
    const source = await fs.readFile(path.join(root, 'features/model-router/pi', file));
    assert.ok(built.has(`dist/pi/extensions/model-router/${file}`), `Missing dist/pi/extensions/model-router/${file}`);
    assert.deepEqual(built.get(`dist/pi/extensions/model-router/${file}`).bytes, source);
  }
  assert.ok(!built.has('dist/pi/extensions/model-router.mjs'), 'The old flat router path must not be emitted');
});

test('every file of every Pi feature is bundled byte-for-byte', async () => {
  const expected = new Set();
  for (const name of await fs.readdir(path.join(root, 'features'))) {
    const dir = path.join(root, 'features', name, 'pi');
    let files;
    try { files = await walk(dir); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    for (const file of files) {
      const output = `dist/pi/extensions/${name}/${file}`;
      expected.add(output);
      assert.ok(built.has(output), `Missing ${output}`);
      assert.deepEqual(built.get(output).bytes, await fs.readFile(path.join(dir, file)));
    }
  }
  assert.ok(expected.size > 0, 'Expected at least one Pi feature file');
  const emitted = [...built.keys()].filter(file => file.startsWith('dist/pi/extensions/'));
  assert.deepEqual(emitted.sort(), [...expected].sort(), 'Pi extensions must come only from features/<name>/pi/');
});

test('the build no longer reads clients/pi/extensions', async t => {
  const temp = await fixture(t);
  await fs.rm(path.join(temp, 'clients/pi/extensions'), { recursive: true, force: true });
  const before = await generate(temp);
  await fs.mkdir(path.join(temp, 'clients/pi/extensions'), { recursive: true });
  await fs.writeFile(path.join(temp, 'clients/pi/extensions/stray.mjs'), 'export default function () {}\n');
  const outputs = await generate(temp);
  assert.ok(!outputs.has('dist/pi/extensions/stray.mjs'), 'clients/pi/extensions must not be copied');
  assert.deepEqual(outputs, before, 'clients/pi/extensions must not affect the input fingerprint');
});

test('Pi features without pi/index.mjs fail and name the feature', async t => {
  const temp = await fixture(t);
  const dir = await addFeature(temp, 'statusline', { harnesses: ['pi'] });
  await fs.rename(path.join(dir, 'pi/index.mjs'), path.join(dir, 'pi/main.mjs'));
  await assert.rejects(generate(temp), error => /statusline/.test(error.message) && /index\.mjs/.test(error.message));
});

test('opaque Pi feature JavaScript is copied without evaluating template syntax', async t => {
  const temp = await fixture(t);
  const source = Buffer.from('export const literal = "{{client.missing}} \\u2603";\r\n');
  const dir = await addFeature(temp, 'statusline', { harnesses: ['pi'] });
  await fs.writeFile(path.join(dir, 'pi/index.mjs'), source);
  const outputs = await generate(temp);
  assert.ok(outputs.has('dist/pi/extensions/statusline/index.mjs'), 'Missing bundled feature extension');
  assert.deepEqual(outputs.get('dist/pi/extensions/statusline/index.mjs').bytes, source);
  assert.equal(outputs.get('dist/pi/extensions/statusline/index.mjs').mode, 0o644);
});

test('every Pi feature resource is an opaque input included in the global fingerprint', async t => {
  const temp = await fixture(t);
  const dir = await addFeature(temp, 'statusline', { harnesses: ['pi'] });
  const opaque = Buffer.from([0, 255, 13, 10, 123, 123]);
  await fs.mkdir(path.join(dir, 'pi/nested'), { recursive: true });
  await fs.writeFile(path.join(dir, 'pi/nested/resource.bin'), opaque);
  await fs.writeFile(path.join(dir, 'pi/nested/tool.sh'), '#!/bin/sh\necho {{x}}\n');
  const outputs = await generate(temp);
  assert.deepEqual(outputs.get('dist/pi/extensions/statusline/nested/resource.bin').bytes, opaque);
  assert.equal(outputs.get('dist/pi/extensions/statusline/nested/resource.bin').mode, 0o644);
  assert.equal(outputs.get('dist/pi/extensions/statusline/nested/tool.sh').mode, 0o755, 'shebang files must be executable');
  let digest = JSON.parse(outputs.get('dist/manifest.json').bytes).inputsDigest;
  const files = [
    ...['index.mjs', 'nested/resource.bin', 'nested/tool.sh'].map(file => ['statusline', file]),
    ...['index.mjs', 'model-router.json'].map(file => ['model-router', file])
  ];
  for (const [name, file] of files) {
    const source = path.join(temp, 'features', name, 'pi', file);
    const original = await fs.readFile(source);
    assert.deepEqual(outputs.get(`dist/pi/extensions/${name}/${file}`).bytes, original);
    const changed = Buffer.concat([original, Buffer.from('\n')]);
    await fs.writeFile(source, changed);
    const next = await generate(temp);
    assert.deepEqual(next.get(`dist/pi/extensions/${name}/${file}`).bytes, changed);
    const nextDigest = JSON.parse(next.get('dist/manifest.json').bytes).inputsDigest;
    assert.notEqual(nextDigest, digest, `features/${name}/pi/${file} must affect the input fingerprint`);
    digest = nextDigest;
  }
});

test('Pi profile mappings and every generated specialist use devtools-router virtual models', async () => {
  const config = JSON.parse(await fs.readFile(path.join(root, 'clients/pi/config.json'), 'utf8'));
  for (const profile of ['fast', 'balanced', 'deep']) {
    assert.equal(config.models[profile], `devtools-router/${profile}`);
  }
  assert.equal(config.models.inherit, null);
  for (const file of await walk(path.join(root, 'library/agents'))) {
    const source = parseDocument(await fs.readFile(path.join(root, 'library/agents', file), 'utf8'));
    const profile = source.meta.modelProfile ?? 'inherit';
    const agent = doc(`dist/pi/agents/devtools-${source.meta.name}.md`);
    assert.equal(agent.meta.model, profile === 'inherit' ? undefined : `devtools-router/${profile}`, source.meta.name);
  }
});

test('Pi workflows do not leak Claude plugin identifiers or WebFetch declarations', () => {
  assert.doesNotMatch(text('dist/pi/prompts/devtools-work.md'), /devtools:/);
  assert.doesNotMatch(doc('dist/pi/agents/devtools-uat-specialist.md').meta.tools, /WebFetch/);
});

test('required skills survive the agent adapters', () => {
  assert.deepEqual(doc('dist/pi/agents/devtools-uat-specialist.md').meta.skills, ['playwright-cli']);
  assert.deepEqual(doc('dist/claude/agents/uat-specialist.md').meta.skills, ['playwright-cli']);
  assert.match(text('dist/codex/skills/devtools-uat-specialist/SKILL.md'), /playwright-cli/);
  assert.match(text('dist/codex/skills/devtools-uat-specialist/references/prompt.md'), /playwright-cli/);
});

test('Codex delegates using bundled skills without inventing registered agent types', () => {
  const role = text('dist/codex/skills/devtools-js-software-engineer/SKILL.md');
  assert.match(role, /not a registered custom agent type/);
  assert.match(role, /references\/prompt.md/);
  assert.match(role, /do not pass a skill name as agent_type/i);
  const agent = TOML.parse(text('dist/codex/agents/devtools-js-software-engineer.toml'));
  assert.equal(agent.name, 'devtools-js-software-engineer');
  assert.equal(agent.model, undefined);
  assert.match(agent.developer_instructions, /senior full-stack/);
  assert.match(text('dist/codex/skills/devtools-plan/SKILL.md'), /\$devtools-plan/);
  assert.doesNotMatch(text('dist/codex/skills/devtools-plan/SKILL.md'), /\$ARGUMENTS/);
  assert.equal(YAML.parse(text('dist/codex/skills/devtools-work/agents/openai.yaml')).policy.allow_implicit_invocation, false);
});

test('marketplace sources resolve to committed distribution directories', () => {
  assert.equal(json('.claude-plugin/marketplace.json').plugins[0].source, './dist/claude');
  assert.equal(json('.agents/plugins/marketplace.json').plugins[0].source.path, './dist/codex');
  assert.equal(json('dist/codex/plugin.json').$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
});

test('client-specific skill permissions do not leak between adapters', () => {
  assert.equal(doc('dist/claude/skills/playwright-cli/SKILL.md').meta['allowed-tools'], 'Bash(playwright-cli:*)');
  for (const client of ['pi', 'codex']) assert.equal(doc(`dist/${client}/skills/playwright-cli/SKILL.md`).meta['allowed-tools'], undefined);
});

test('template rendering is strict and does not HTML-escape Markdown', () => {
  assert.equal(render('{{value}}', { value: '<a> & "b"' }), '<a> & "b"');
  assert.throws(() => render('{{client.missing}}', { client: {} }, 'example'), /example/);
  assert.equal(render('Blade: \\{{ }}', {}), 'Blade: {{ }}');
});

test('imported literal templates and command argument placeholders are preserved', () => {
  assert.match(text('dist/pi/agents/devtools-laravel-php-expert.md'), /Blade's `\{\{ \}\}` escaping/);
  for (const client of ['claude', 'pi']) {
    const file = client === 'pi' ? 'dist/pi/prompts/devtools-plan.md' : 'dist/claude/commands/plan.md';
    assert.match(text(file), /\.tmp\/plan-draft\.md/);
  }
});

test('skill scripts and references are copied byte-for-byte, not evaluated', async () => {
  const resource = 'pandoc-converter/scripts/batch_convert.py';
  const original = await fs.readFile(path.join(root, 'library/skills', resource));
  for (const client of ['claude', 'pi', 'codex']) {
    assert.deepEqual(built.get(`dist/${client}/skills/${resource}`).bytes, original);
    assert.equal(built.get(`dist/${client}/skills/${resource}`).mode, 0o755);
    assert.equal(built.get(`dist/${client}/skills/playwright-cli/references/tracing.md`).mode, 0o644);
  }
  for (const file of await walk(path.join(root, 'library/skills'))) {
    if (file.endsWith('.hbs')) continue;
    for (const client of ['claude', 'pi', 'codex']) assert.ok(built.has(`dist/${client}/skills/${file}`), file);
  }
});

test('builds are deterministic and checked-in generated files are current', async () => {
  assert.deepEqual(await generate(root), built);
  assert.deepEqual(await check(root, built), []);
});

test('client model and tool maps can change without editing shared prompts', async t => {
  const temp = await fixture(t);
  await changeJson(temp, 'clients/pi/config.json', c => { c.models.deep = 'my-provider/my-model'; c.tools.development = ['read']; });
  const outputs = await generate(temp);
  const agent = parseDocument(outputs.get('dist/pi/agents/devtools-js-software-engineer.md').bytes.toString());
  assert.equal(agent.meta.model, 'my-provider/my-model');
  assert.equal(agent.meta.tools, 'read');
  assert.equal(parseDocument(outputs.get('dist/claude/agents/js-software-engineer.md').bytes.toString()).meta.model, 'opus');
});

test('unknown profile mappings fail rather than silently dropping restrictions', async t => {
  const temp = await fixture(t);
  await changeJson(temp, 'clients/pi/config.json', c => { delete c.tools.uat; });
  await assert.rejects(generate(temp), /Unknown pi tool profile: uat/);
});

test('missing document values fail with their source path', async t => {
  const temp = await fixture(t);
  await fs.appendFile(path.join(temp, 'library/commands/work.md.hbs'), '\n{{agents.not-a-real-agent}}\n');
  await assert.rejects(generate(temp), /library\/commands\/work.md.hbs/);
});

test('duplicate resource names and unsafe mapped names fail', async t => {
  const temp = await fixture(t);
  await changeJson(temp, 'clients/pi/config.json', c => { c.agentName = '../{{name}}'; });
  await assert.rejects(generate(temp), /invalid generated agent name/);
  await changeJson(temp, 'clients/pi/config.json', c => { c.agentName = 'devtools-{{name}}'; });
  await fs.copyFile(path.join(temp, 'library/agents/js-software-engineer.md.hbs'), path.join(temp, 'library/agents/duplicate.md.hbs'));
  await assert.rejects(generate(temp), /Duplicate agents name|filename must match/);
});

test('oversized skill descriptions fail instead of shipping invalid skills', async t => {
  const temp = await fixture(t);
  const file = path.join(temp, 'library/skills/playwright-cli/SKILL.md.hbs');
  const { meta, body } = parseDocument(await fs.readFile(file, 'utf8'));
  meta.description = 'a'.repeat(1025);
  await fs.writeFile(file, `---\n${YAML.stringify(meta)}---\n\n${body}\n`);
  await assert.rejects(generate(temp), /description exceeds 1024/);
});

test('check detects edits, missing and stale files without modifying them', async t => {
  const temp = await fixture(t);
  await write(temp, built);
  await fs.writeFile(path.join(temp, 'dist/stale.txt'), 'stale');
  await fs.writeFile(path.join(temp, 'dist/pi/package.json'), '{}');
  await fs.unlink(path.join(temp, 'dist/codex/plugin.json'));
  const differences = await check(temp, built);
  assert.ok(differences.includes('stale: dist/stale.txt'));
  assert.ok(differences.includes('changed: dist/pi/package.json'));
  assert.ok(differences.includes('missing: dist/codex/plugin.json'));
  assert.equal(await fs.readFile(path.join(temp, 'dist/stale.txt'), 'utf8'), 'stale');
  await write(temp, built);
  assert.deepEqual(await check(temp, built), []);
});

test('source symlinks are rejected', { skip: process.platform === 'win32' ? 'Windows symlink creation requires host privileges' : false }, async t => {
  const temp = await fixture(t);
  await fs.symlink(path.join(temp, 'package.json'), path.join(temp, 'library/skills/playwright-cli/external'));
  await assert.rejects(generate(temp), /Symlinks are not supported/);
});

test('cross-specialist references are mapped in descriptions and bodies', () => {
  const pi = doc('dist/pi/agents/devtools-crystal-code-reviewer.md');
  assert.match(pi.meta.description, /devtools-crystal-lang-engineer/);
  assert.match(pi.body, /devtools-crystal-lang-engineer/);
  assert.match(doc('dist/claude/agents/crystal-code-reviewer.md').meta.description, /devtools:crystal-lang-engineer/);
});

test('shared metadata typos fail rather than falling back to host defaults', async t => {
  const temp = await fixture(t);
  const file = path.join(temp, 'library/agents/js-software-engineer.md.hbs');
  await fs.writeFile(file, (await fs.readFile(file, 'utf8')).replace('modelProfile:', 'modleProfile:'));
  await assert.rejects(generate(temp), /unknown agents metadata field: modleProfile/);
});

test('Codex cannot claim to enforce native tool allowlists through a plugin skill', async t => {
  const temp = await fixture(t);
  await changeJson(temp, 'clients/codex/config.json', c => { c.tools.operations = ['read']; });
  await assert.rejects(generate(temp), /cannot enforce native tool allowlists/);
});

test('Codex explicit model maps are reflected in both delegation and TOML exports', async t => {
  const temp = await fixture(t);
  await changeJson(temp, 'clients/codex/config.json', c => { c.models.deep = 'configured-model'; });
  const outputs = await generate(temp);
  assert.match(outputs.get('dist/codex/skills/devtools-js-software-engineer/SKILL.md').bytes.toString(), /Request model `configured-model`/);
  assert.equal(TOML.parse(outputs.get('dist/codex/agents/devtools-js-software-engineer.toml').bytes.toString()).model, 'configured-model');
});

test('attributes for nonexistent skills fail early', async t => {
  const temp = await fixture(t);
  await changeJson(temp, 'clients/pi/config.json', c => { c.skillAttributes.typo = {}; });
  await assert.rejects(generate(temp), /attributes for unknown skill: typo/);
});

test('documents require valid names, descriptions, and bodies', () => {
  assert.throws(() => parseDocument('no frontmatter'), /frontmatter/);
  assert.throws(() => parseDocument('---\nname: ../bad\ndescription: hi\n---\nbody'), /invalid name/);
  assert.throws(() => parseDocument('---\nname: valid\n---\nbody'), /description/);
  assert.throws(() => parseDocument('---\nname: valid\ndescription: hi\n---\n'), /body/);
});

async function addFeature(temp, name, { manifest = { name, description: `${name} feature` }, harnesses = ['claude'] } = {}) {
  const dir = path.join(temp, 'features', name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'feature.json'), JSON.stringify(manifest, null, 2) + '\n');
  for (const harness of harnesses) {
    if (harness === 'claude') {
      await fs.mkdir(path.join(dir, 'claude/.claude-plugin'), { recursive: true });
      await fs.writeFile(path.join(dir, 'claude/.claude-plugin/plugin.json'), JSON.stringify({ name, description: `${name} feature` }, null, 2) + '\n');
    } else if (harness === 'pi') {
      await fs.mkdir(path.join(dir, 'pi'), { recursive: true });
      await fs.writeFile(path.join(dir, 'pi/index.mjs'), 'export default function () {}\n');
    } else {
      await fs.mkdir(path.join(dir, harness), { recursive: true });
      await fs.writeFile(path.join(dir, harness, 'README.md'), `${harness}\n`);
    }
  }
  return dir;
}
const digestOf = outputs => JSON.parse(outputs.get('dist/manifest.json').bytes).inputsDigest;

test('feature names must match their folder', async t => {
  const temp = await fixture(t);
  await addFeature(temp, 'statusline', { manifest: { name: 'status-line', description: 'x' } });
  await assert.rejects(generate(temp), error => /statusline/.test(error.message) && /folder/.test(error.message));
});

test('feature names must be lowercase hyphenated identifiers', async t => {
  const temp = await fixture(t);
  await addFeature(temp, 'Status_Line');
  await assert.rejects(generate(temp), error => /Status_Line/.test(error.message) && /lowercase hyphenated/.test(error.message));
});

test('feature names must not collide with devtools', async t => {
  const temp = await fixture(t);
  await addFeature(temp, 'devtools');
  await assert.rejects(generate(temp), error => /devtools/.test(error.message) && /reserved|collide/.test(error.message));
});

test('features without a harness folder fail', async t => {
  const temp = await fixture(t);
  await addFeature(temp, 'statusline', { harnesses: [] });
  await assert.rejects(generate(temp), error => /statusline/.test(error.message) && /harness/.test(error.message));
});

test('unknown feature harness folders fail', async t => {
  const temp = await fixture(t);
  await addFeature(temp, 'statusline', { harnesses: ['claude', 'claud'] });
  await assert.rejects(generate(temp), error => /statusline/.test(error.message) && /claud\b/.test(error.message) && /unknown harness/i.test(error.message));
});

test('codex feature folders fail as unsupported', async t => {
  const temp = await fixture(t);
  await addFeature(temp, 'statusline', { harnesses: ['claude', 'codex'] });
  await assert.rejects(generate(temp), error => /statusline/.test(error.message) && /codex features are not supported yet/.test(error.message));
});

test('every feature file byte is part of the input fingerprint', async t => {
  const temp = await fixture(t);
  const dir = await addFeature(temp, 'statusline', { harnesses: ['claude', 'pi'] });
  let digest = digestOf(await generate(temp));
  assert.notEqual(digest, digestOf(built), 'adding a feature must change the input fingerprint');
  for (const file of ['feature.json', 'claude/.claude-plugin/plugin.json', 'pi/index.mjs']) {
    const original = await fs.readFile(path.join(dir, file));
    // Append a space: flipping a bit of the trailing newline would make feature.json invalid JSON.
    const changed = Buffer.concat([original, Buffer.from(' ')]);
    await fs.writeFile(path.join(dir, file), changed);
    const next = digestOf(await generate(temp));
    assert.notEqual(next, digest, `features/statusline/${file} must affect the input fingerprint`);
    digest = next;
  }
});

test('adding or removing a feature changes the fingerprint and fails check', async t => {
  const temp = await fixture(t);
  await addFeature(temp, 'statusline');
  const before = await generate(temp);
  await write(temp, before);
  assert.deepEqual(await check(temp, before), []);
  await addFeature(temp, 'second-feature', { harnesses: ['pi'] });
  const added = await generate(temp);
  assert.notEqual(digestOf(added), digestOf(before), 'adding a feature folder must change the input fingerprint');
  assert.notDeepEqual(await check(temp, added), [], 'check must fail after a feature is added');
  await write(temp, added);
  await fs.rm(path.join(temp, 'features/second-feature'), { recursive: true });
  const removed = await generate(temp);
  assert.notEqual(digestOf(removed), digestOf(added), 'removing a feature folder must change the input fingerprint');
  assert.notDeepEqual(await check(temp, removed), [], 'check must fail after a feature is removed');
});

test('output without a features folder only drops feature output', async t => {
  const temp = await fixture(t);
  await fs.rm(path.join(temp, 'features'), { recursive: true, force: true });
  const outputs = await generate(temp);
  // The manifest and library-version files carry inputsDigest and checksums over all inputs, so they differ for reasons outside this comparison.
  const owned = file => file.startsWith('dist/pi/extensions/') || file === 'dist/manifest.json' || /^dist\/[^/]+\/library-version\.json$/.test(file);
  assert.deepEqual([...outputs.keys()].filter(file => file.startsWith('dist/pi/extensions/')), []);
  for (const [file, output] of built) if (!owned(file)) assert.deepEqual(outputs.get(file), output, file);
  assert.deepEqual([...outputs.keys()].filter(file => !owned(file)).sort(), [...built.keys()].filter(file => !owned(file)).sort());
});

test('feature folders without feature.json fail', async t => {
  const temp = await fixture(t);
  const dir = await addFeature(temp, 'statusline');
  await fs.rm(path.join(dir, 'feature.json'));
  await assert.rejects(generate(temp), error => /statusline/.test(error.message) && /feature\.json is required/.test(error.message));
});

test('loose files directly under features fail', async t => {
  const temp = await fixture(t);
  await fs.mkdir(path.join(temp, 'features'), { recursive: true });
  await fs.writeFile(path.join(temp, 'features/README.md'), 'features\n');
  await assert.rejects(generate(temp), error => /Expected a feature folder/.test(error.message) && /README\.md/.test(error.message));
});

test('feature.json without a string name field fails', async t => {
  for (const manifest of [{ description: 'x' }, ['statusline'], 'statusline', null]) {
    const temp = await fixture(t);
    await addFeature(temp, 'statusline', { manifest });
    await assert.rejects(generate(temp), error => /statusline/.test(error.message) && /name field is missing or invalid/.test(error.message));
  }
});

async function addClaudeFile(dir, file, contents) {
  await fs.mkdir(path.dirname(path.join(dir, 'claude', file)), { recursive: true });
  await fs.writeFile(path.join(dir, 'claude', file), contents);
}
const claudePluginFiles = outputs => [...outputs.keys()].filter(file => file.startsWith('dist/claude-plugins/')).sort();

test('each Claude feature is copied to its own plugin directory', async t => {
  const temp = await fixture(t);
  const dir = await addFeature(temp, 'statusline');
  const script = Buffer.from('#!/bin/sh\necho "{{client.missing}}"\r\n');
  await addClaudeFile(dir, 'scripts/status.sh', script);
  const outputs = await generate(temp);
  assert.deepEqual(claudePluginFiles(outputs), [
    'dist/claude-plugins/statusline/.claude-plugin/plugin.json',
    'dist/claude-plugins/statusline/scripts/status.sh',
  ]);
  assert.deepEqual(outputs.get('dist/claude-plugins/statusline/scripts/status.sh').bytes, script);
});

test('Claude feature plugin.json carries the root package version', async t => {
  const temp = await fixture(t);
  const dir = await addFeature(temp, 'statusline');
  await addClaudeFile(dir, '.claude-plugin/plugin.json', JSON.stringify({ name: 'statusline', version: '9.9.9', description: 'Status line' }) + '\n');
  const pkg = JSON.parse(await fs.readFile(path.join(temp, 'package.json'), 'utf8'));
  const outputs = await generate(temp);
  assert.ok(outputs.has('dist/claude-plugins/statusline/.claude-plugin/plugin.json'), 'Missing emitted plugin.json');
  const plugin = JSON.parse(outputs.get('dist/claude-plugins/statusline/.claude-plugin/plugin.json').bytes);
  assert.deepEqual(plugin, { name: 'statusline', version: pkg.version, description: 'Status line' });
});

test('Claude feature plugin.json names must match the feature', async t => {
  const temp = await fixture(t);
  const dir = await addFeature(temp, 'statusline');
  await addClaudeFile(dir, '.claude-plugin/plugin.json', JSON.stringify({ name: 'status-line', description: 'x' }) + '\n');
  await assert.rejects(generate(temp), error => /statusline/.test(error.message) && /plugin\.json/.test(error.message) && /"status-line"/.test(error.message) && /"statusline"/.test(error.message));
});

test('Claude feature test files and generated .claude-plugin/types are not copied', async t => {
  const temp = await fixture(t);
  const dir = await addFeature(temp, 'statusline');
  await addClaudeFile(dir, 'index.ts', 'export {};\n');
  await addClaudeFile(dir, 'index.test.ts', 'export {};\n');
  await addClaudeFile(dir, 'view/panel.tsx', 'export {};\n');
  await addClaudeFile(dir, 'view/panel.test.tsx', 'export {};\n');
  await addClaudeFile(dir, '.claude-plugin/types/claude.d.ts', 'export {};\n');
  const outputs = await generate(temp);
  assert.deepEqual(claudePluginFiles(outputs), [
    'dist/claude-plugins/statusline/.claude-plugin/plugin.json',
    'dist/claude-plugins/statusline/index.ts',
    'dist/claude-plugins/statusline/view/panel.tsx',
  ]);
});

test('a top-level types folder named by plugin.json is copied', async t => {
  const temp = await fixture(t);
  const dir = await addFeature(temp, 'statusline');
  await addClaudeFile(dir, '.claude-plugin/plugin.json', JSON.stringify({ name: 'statusline', description: 'x', types: './types' }) + '\n');
  await addClaudeFile(dir, 'types/status.d.ts', 'export {};\n');
  const outputs = await generate(temp);
  assert.ok(outputs.has('dist/claude-plugins/statusline/types/status.d.ts'), 'Top-level types/ must be copied');
});

test('the Claude catalog lists each Claude feature after an unchanged devtools entry', async t => {
  const temp = await fixture(t);
  await addFeature(temp, 'statusline', { manifest: { name: 'statusline', description: 'Shows session status' } });
  await addFeature(temp, 'alpha', { manifest: { name: 'alpha', description: 'Alpha feature' } });
  await addFeature(temp, 'pi-only', { harnesses: ['pi'] });
  const outputs = await generate(temp);
  const catalog = JSON.parse(outputs.get('.claude-plugin/marketplace.json').bytes);
  assert.deepEqual(catalog.plugins[0], json('.claude-plugin/marketplace.json').plugins[0], 'devtools entry must not change');
  assert.equal(catalog.plugins[0].name, 'devtools');
  assert.deepEqual(catalog.plugins.slice(1), [
    { name: 'alpha', source: './dist/claude-plugins/alpha', description: 'Alpha feature' },
    { name: 'statusline', source: './dist/claude-plugins/statusline', description: 'Shows session status' },
  ]);
});

test('the distribution manifest counts features per harness', async t => {
  const temp = await fixture(t);
  await fs.rm(path.join(temp, 'features'), { recursive: true, force: true });
  await addFeature(temp, 'statusline', { harnesses: ['claude', 'pi'] });
  await addFeature(temp, 'alpha');
  await addFeature(temp, 'pi-only', { harnesses: ['pi'] });
  const manifest = JSON.parse((await generate(temp)).get('dist/manifest.json').bytes);
  assert.deepEqual(manifest.counts.features, { claude: 2, pi: 2 });
});

test('runtime-generated claude/.claude-plugin/types does not affect the input fingerprint', async t => {
  const temp = await fixture(t);
  const dir = await addFeature(temp, 'statusline');
  const before = await generate(temp);
  await addClaudeFile(dir, '.claude-plugin/types/x.d.ts', 'export {};\n');
  const after = await generate(temp);
  assert.equal(digestOf(after), digestOf(before));
  assert.deepEqual(claudePluginFiles(after), claudePluginFiles(before));
});

test('Claude features require a non-empty feature.json description', async t => {
  for (const description of [undefined, '', '   ', 42, null]) {
    const temp = await fixture(t);
    await addFeature(temp, 'statusline', { manifest: { name: 'statusline', description } });
    await assert.rejects(generate(temp), error => /features\/statusline/.test(error.message) && /description/.test(error.message), `description ${JSON.stringify(description)}`);
  }
});

test('Claude features without plugin.json fail', async t => {
  const temp = await fixture(t);
  const dir = await addFeature(temp, 'statusline');
  await fs.rm(path.join(dir, 'claude/.claude-plugin/plugin.json'));
  await addClaudeFile(dir, 'index.ts', 'export {};\n');
  await assert.rejects(generate(temp), error => /statusline/.test(error.message) && /plugin\.json is required/.test(error.message));
});

test('Claude feature plugin.json must be valid JSON', async t => {
  const temp = await fixture(t);
  const dir = await addFeature(temp, 'statusline');
  await addClaudeFile(dir, '.claude-plugin/plugin.json', '{ "name": ');
  await assert.rejects(generate(temp), error => /features\/statusline\/claude\/\.claude-plugin\/plugin\.json/.test(error.message));
});

test('Claude feature shebang scripts are executable and other files are not', async t => {
  const temp = await fixture(t);
  const dir = await addFeature(temp, 'statusline');
  await addClaudeFile(dir, 'scripts/status.sh', '#!/bin/sh\necho ok\n');
  await addClaudeFile(dir, 'README.md', 'readme\n');
  const outputs = await generate(temp);
  assert.equal(outputs.get('dist/claude-plugins/statusline/scripts/status.sh').mode, 0o755);
  assert.equal(outputs.get('dist/claude-plugins/statusline/README.md').mode, 0o644);
});

test('a top-level types folder not named by plugin.json is copied', async t => {
  const temp = await fixture(t);
  const dir = await addFeature(temp, 'statusline');
  await addClaudeFile(dir, 'types/status.d.ts', 'export {};\n');
  const outputs = await generate(temp);
  assert.ok(outputs.has('dist/claude-plugins/statusline/types/status.d.ts'), 'Top-level types/ must be copied');
});

test('a nested .claude-plugin/types folder is copied', async t => {
  const temp = await fixture(t);
  const dir = await addFeature(temp, 'statusline');
  await addClaudeFile(dir, 'sub/.claude-plugin/types/x.d.ts', 'export {};\n');
  const outputs = await generate(temp);
  assert.ok(outputs.has('dist/claude-plugins/statusline/sub/.claude-plugin/types/x.d.ts'), 'Only the top-level .claude-plugin/types is excluded');
});
