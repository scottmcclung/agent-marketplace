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
  for (const entry of ['library', 'clients', 'scripts', 'package.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) await fs.cp(path.join(root, entry), path.join(temp, entry), { recursive: true });
  return temp;
}
async function changeJson(temp, file, change) {
  const value = JSON.parse(await fs.readFile(path.join(temp, file), 'utf8'));
  change(value);
  await fs.writeFile(path.join(temp, file), JSON.stringify(value));
}

test('imports all ten agents, three commands, and three skills', () => {
  assert.deepEqual(json('dist/manifest.json').counts, { agents: 10, commands: 3, skills: 3 });
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
