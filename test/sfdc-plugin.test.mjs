import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { generate, parseDocument, check, write } from '../scripts/lib/build.mjs';

// Contract for portable library plugins. Every plugin lives at library/plugins/<name>/ with
// a uniform plugin.json listing its local agents, commands, and skills. Skill sources are
// independent even when plugins start with identical copies. Each client maps skill names through
// clients/<id>/config.json "plugins". Claude and Codex get a separate plugin and catalog entry.
// Pi merges prefixed plugin skills into the existing package so discovery stays unchanged.

const root = fileURLToPath(new URL('../', import.meta.url));
const built = await generate(root);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const digestOf = outputs => JSON.parse(outputs.get('dist/manifest.json').bytes).inputsDigest;
const textOf = (outputs, file) => { assert.ok(outputs.has(file), `Missing ${file}`); return outputs.get(file).bytes.toString(); };
const jsonOf = (outputs, file) => JSON.parse(textOf(outputs, file));
const docOf = (outputs, file) => parseDocument(textOf(outputs, file), file);

const SHARED = 'principle-make-the-change-easy';
const LOCAL = ['plan', 'work'];
const PLUGIN_MAPS = {
  claude: { skillName: '{{name}}', skillReference: '/sfdc:{{name}}' },
  codex: { skillName: 'sfdc-{{name}}', skillReference: '$sfdc-{{name}}' },
  pi: { skillName: 'sfdc-{{name}}', skillReference: '/skill:sfdc-{{name}}' }
};
// Where each client places a plugin skill, keyed by canonical skill name.
const skillPath = {
  claude: name => `dist/claude/sfdc/skills/${name}/SKILL.md`,
  codex: name => `dist/codex/sfdc/skills/sfdc-${name}/SKILL.md`,
  pi: name => `dist/pi/skills/sfdc-${name}/SKILL.md`
};
const skillName = { claude: name => name, codex: name => `sfdc-${name}`, pi: name => `sfdc-${name}` };
const skillRef = { claude: name => `/sfdc:${name}`, codex: name => `$sfdc-${name}`, pi: name => `/skill:sfdc-${name}` };
const agentRef = { claude: name => `devtools:${name}`, codex: name => `devtools-${name}`, pi: name => `devtools-${name}` };
const pluginOwned = file => file.startsWith('dist/claude/sfdc/') || file.startsWith('dist/codex/sfdc/') || file.startsWith('dist/pi/skills/sfdc-');
const devtoolsRoot = id => id === 'pi' ? 'dist/pi' : `dist/${id}/devtools`;

async function fixture(t) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-marketplace-sfdc-test-'));
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
  await fs.writeFile(path.join(temp, file), JSON.stringify(value, null, 2) + '\n');
}
async function writeFile(temp, file, contents) {
  await fs.mkdir(path.dirname(path.join(temp, file)), { recursive: true });
  await fs.writeFile(path.join(temp, file), contents);
}
const localSkill = (name, body) => `---\nname: ${name}\ndescription: ${name} a Salesforce change in {{client.name}}.\n---\n\n${body}\n`;
const FIXTURE_SKILLS = {
  plan: localSkill('plan', '# Plan\n\nHand off with {{skills.work}}. Apply {{skills.principle-make-the-change-easy}} first.\nDelegate to {{agents.salesforce-platform-expert}}.'),
  work: localSkill('work', '# Work\n\nStart from {{skills.plan}}. Delegate tests to {{agents.salesforce-apex-test-engineer}}.')
};

/** Keeps the required devtools plugin and replaces optional plugins with one known plugin. */
async function withPlugin(temp, { name = 'sfdc', manifest, skills = FIXTURE_SKILLS, maps = PLUGIN_MAPS } = {}) {
  await withoutPlugins(temp);
  const value = manifest ?? { name, description: 'Salesforce delivery workflows.', agents: [], commands: [], skills: [...Object.keys(skills), SHARED] };
  await writeFile(temp, `library/plugins/${name}/plugin.json`, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
  for (const [skill, text] of Object.entries(skills)) await writeFile(temp, `library/plugins/${name}/skills/${skill}/SKILL.md.hbs`, text);
  if (!Object.hasOwn(skills, SHARED)) {
    await fs.cp(path.join(temp, 'library/plugins/devtools/skills', SHARED), path.join(temp, `library/plugins/${name}/skills`, SHARED), { recursive: true });
  }
  for (const id of ['claude', 'codex', 'pi']) {
    await changeJson(temp, `clients/${id}/config.json`, config => {
      config.plugins = { devtools: config.plugins.devtools, ...(maps[id] === undefined ? {} : { [name]: { ...maps[id] } }) };
    });
  }
  return path.join(temp, 'library/plugins', name);
}
async function withoutPlugins(temp) {
  for (const name of await fs.readdir(path.join(temp, 'library/plugins'))) {
    if (name !== 'devtools') await fs.rm(path.join(temp, 'library/plugins', name), { recursive: true, force: true });
  }
  for (const id of ['claude', 'codex', 'pi']) await changeJson(temp, `clients/${id}/config.json`, config => { config.plugins = { devtools: config.plugins.devtools }; });
}

// ---------------------------------------------------------------------------
// Repository source and generated output

test('library/plugins/sfdc/plugin.json declares only local skills with the uniform manifest shape', async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'library/plugins/sfdc/plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'sfdc');
  assert.equal(typeof manifest.description, 'string');
  assert.ok(manifest.description.trim(), 'description must be nonempty');
  assert.deepEqual(Object.keys(manifest).sort(), ['agents', 'commands', 'description', 'name', 'skills']);
  assert.deepEqual(manifest.agents, []);
  assert.deepEqual(manifest.commands, []);
  assert.deepEqual(manifest.skills, [...LOCAL, SHARED]);
  for (const skill of [...LOCAL, SHARED]) {
    const source = `library/plugins/sfdc/skills/${skill}/SKILL.md.hbs`;
    const { meta } = parseDocument(await fs.readFile(path.join(root, source), 'utf8'), source);
    assert.equal(meta.name, skill, source);
  }
  const devtools = path.join(root, 'library/plugins/devtools/skills', SHARED);
  const sfdc = path.join(root, 'library/plugins/sfdc/skills', SHARED);
  assert.ok((await fs.lstat(sfdc)).isDirectory(), 'sfdc owns a physical skill directory');
  const files = await fs.readdir(devtools, { recursive: true });
  assert.deepEqual((await fs.readdir(sfdc, { recursive: true })).sort(), [...files].sort());
  for (const file of files) {
    const source = path.join(devtools, file);
    const copy = path.join(sfdc, file);
    assert.ok(!(await fs.lstat(copy)).isSymbolicLink(), copy);
    if ((await fs.stat(source)).isFile()) {
      assert.deepEqual(await fs.readFile(copy), await fs.readFile(source), file);
      assert.notEqual((await fs.realpath(copy)), await fs.realpath(source), file);
      const [left, right] = await Promise.all([fs.stat(source), fs.stat(copy)]);
      assert.ok(left.dev !== right.dev || left.ino !== right.ino, `${file} must not be a hard link`);
    }
  }
});

test('devtools declares every local agent, command, and skill without legacy source directories', async () => {
  const dir = path.join(root, 'library/plugins/devtools');
  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'plugin.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest).sort(), ['agents', 'commands', 'description', 'name', 'skills']);
  assert.equal(manifest.name, 'devtools');
  assert.ok(typeof manifest.description === 'string' && manifest.description.trim());
  for (const [kind, count] of [['agents', 10], ['commands', 3], ['skills', 4]]) {
    const entries = await fs.readdir(path.join(dir, kind));
    const names = entries.map(file => kind === 'skills' ? file : file.replace(/\.md\.hbs$/, '')).sort();
    assert.equal(manifest[kind].length, count, kind);
    assert.deepEqual([...manifest[kind]].sort(), names, kind);
    await assert.rejects(fs.access(path.join(root, 'library', kind)), `${kind} live only under plugins/devtools`);
    for (const name of names) {
      const file = path.join(dir, kind, kind === 'skills' ? `${name}/SKILL.md.hbs` : `${name}.md.hbs`);
      assert.equal(parseDocument(await fs.readFile(file, 'utf8'), file).meta.name, name, file);
    }
  }
});

test('principle eval entry points still resolve paths from both relocated plugin sources', async () => {
  for (const plugin of ['devtools', 'sfdc']) {
    const evals = path.join(root, `library/plugins/${plugin}/skills/${SHARED}/evals`);
    for (const [file, variable] of [['run-trigger-evals.sh', 'REPO'], ['run-session-tests.sh', 'PLUGIN']]) {
      const script = await fs.readFile(path.join(evals, file), 'utf8');
      const assignment = script.split('\n').find(line => line.startsWith(`${variable}=`));
      assert.ok(assignment, `${plugin} ${file} declares ${variable}`);
      // Evaluate only the path assignment. Never run the evaluation workflow or a model request.
      const resolved = execFileSync('bash', ['-c', `EVALS="$1"\n${assignment}\nprintf '%s' "$${variable}"`, 'path-test', evals], { encoding: 'utf8' });
      if (variable === 'REPO') assert.equal(resolved, root.replace(/\/$/, ''), `${plugin} ${file}`);
      else {
        const relative = path.relative(root, resolved).split(path.sep).join('/');
        assert.equal(relative, `dist/claude/${plugin}`, `${plugin} ${file} targets its owning plugin`);
        assert.ok(built.has(`${relative}/skills/${SHARED}/SKILL.md`), `${plugin} ${file} points at a built plugin`);
      }
    }
  }
});

test('every client config maps the sfdc plugin skill names and references', async () => {
  for (const id of ['claude', 'codex', 'pi']) {
    const config = JSON.parse(await fs.readFile(path.join(root, `clients/${id}/config.json`), 'utf8'));
    assert.deepEqual(config.plugins, { devtools: { skillName: config.skillName, skillReference: config.skillName }, sfdc: PLUGIN_MAPS[id] }, id);
  }
});

test('the repository build emits sfdc skills for every client under the mapped names', () => {
  for (const id of ['claude', 'codex', 'pi']) {
    for (const skill of [...LOCAL, SHARED]) {
      const { meta, body } = docOf(built, skillPath[id](skill));
      assert.equal(meta.name, skillName[id](skill), `${id} ${skill}`);
      assert.ok(meta.description.trim() && meta.description.length <= 1024, `${id} ${skill} description`);
      assert.ok(body.trim(), `${id} ${skill} body`);
    }
  }
});

test('the repository build ships separate Claude and Codex sfdc plugins with catalog entries', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'library/plugins/sfdc/plugin.json'), 'utf8'));
  const claude = jsonOf(built, 'dist/claude/sfdc/.claude-plugin/plugin.json');
  assert.equal(claude.name, 'sfdc');
  assert.equal(claude.version, pkg.version);
  assert.equal(claude.description, manifest.description);
  const codex = jsonOf(built, 'dist/codex/sfdc/plugin.json');
  assert.equal(codex.name, 'sfdc');
  assert.equal(codex.version, pkg.version);
  assert.equal(codex.description, manifest.description);
  const claudeCatalog = jsonOf(built, '.claude-plugin/marketplace.json').plugins;
  assert.equal(claudeCatalog[0].name, 'devtools');
  assert.deepEqual(claudeCatalog.filter(plugin => plugin.name === 'sfdc'), [{ name: 'sfdc', source: './dist/claude/sfdc', description: manifest.description }]);
  const codexCatalog = jsonOf(built, '.agents/plugins/marketplace.json').plugins;
  assert.equal(codexCatalog[0].name, 'devtools');
  const entry = codexCatalog.filter(plugin => plugin.name === 'sfdc');
  assert.equal(entry.length, 1);
  assert.deepEqual(entry[0].source, { source: 'local', path: './dist/codex/sfdc' });
});

test('the repository manifest counts both plugins and keeps Pi skill discovery unchanged', async () => {
  assert.deepEqual(jsonOf(built, 'dist/manifest.json').counts, { agents: 10, commands: 3, skills: 7, features: { claude: 1, pi: 1 }, plugins: 2 });
  assert.deepEqual(jsonOf(built, 'dist/pi/package.json').pi.skills, ['./skills']);
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.pi.skills, ['./dist/pi/skills']);
  assert.ok(built.has(`dist/pi/skills/${SHARED}/SKILL.md`), 'the core Pi principle skill keeps its name');
});

// ---------------------------------------------------------------------------
// Rendered workflow safety invariants. These check behavior the prompts must keep, by
// section and key terms, so wording can change without breaking the tests.

/** Returns the text from the first line matching start up to the next line matching end. */
function section(body, start, end) {
  const lines = body.split('\n');
  const from = lines.findIndex(line => start.test(line));
  assert.ok(from >= 0, `Missing section ${start}`);
  const to = lines.findIndex((line, index) => index > from && end.test(line));
  return lines.slice(from, to < 0 ? undefined : to).join('\n');
}

test('work uses the Apex test specialist only after a compatibility check, with a constrained fallback', () => {
  for (const id of ['claude', 'codex', 'pi']) {
    const { body } = docOf(built, skillPath[id]('work'));
    const specialist = agentRef[id]('salesforce-apex-test-engineer');
    const expert = agentRef[id]('salesforce-platform-expert');
    const naming = body.split('\n').filter(line => line.includes(specialist));
    assert.ok(naming.length > 0, `${id} work names the Apex test specialist`);
    for (const line of naming) assert.match(line, /compatib/i, `${id} names the specialist without the compatibility condition: ${line}`);

    const check = section(body, /^#+ .*Apex test author check/i, /^#+ /);
    for (const term of [/fflib/i, /naming/i, /coverage/i, /read-only/i]) assert.match(check, term, `${id} check covers ${term}`);
    assert.ok(check.includes(expert), `${id} check falls back to the platform expert`);
    assert.match(check, /do not install/i, `${id} fallback forbids installing frameworks`);
    assert.match(check, /do not set a higher threshold/i, `${id} fallback forbids a higher coverage threshold`);

    const fixes = section(body, /^#### 5\./, /^#### /);
    assert.match(fixes, /test author check/i, `${id} test-only review fixes use the check`);
  }
});

test('work validates the task revision with its tests and never reports tests run against old metadata', () => {
  for (const id of ['claude', 'codex', 'pi']) {
    const validate = section(docOf(built, skillPath[id]('work')).body, /^#### 6\./, /^#### /);
    assert.match(validate, /RunSpecifiedTests/, `${id} names the task and regression classes in the validation`);
    assert.match(validate, /RunLocalTests/, `${id} keeps RunLocalTests for required or shared changes`);
    assert.match(validate, /validation itself must run the task's Apex tests and the impacted regression suite/i, id);
    assert.match(validate, /coverage from the validation report/i, `${id} takes coverage from the validation report`);
    assert.match(validate, /standalone Apex tests only after the user has explicitly authorized an actual deployment of the task revision/i, id);
    assert.match(validate, /never run tests against metadata that lacks the task's changes/i, id);
    assert.match(validate, /Jest tests locally/i, `${id} runs LWC Jest locally and separately`);
  }
});

test('plan writes only a uniquely created, invocation-owned draft and carries its exact path to cleanup', () => {
  for (const id of ['claude', 'codex', 'pi']) {
    const { body } = docOf(built, skillPath[id]('plan'));
    assert.doesNotMatch(body, /\.tmp\/plan-draft\.md/, `${id} has no fixed draft path`);

    const safety = section(body, /^## Safety boundaries/, /^## /);
    assert.match(safety, /temporary draft/i, `${id} safety permits the temporary draft`);
    assert.match(safety, /never overwrites, reuses, or deletes any other file/i, id);

    const draft = section(body, /^6\. \*\*Write the draft/, /^\s*- The epic/);
    assert.match(draft, /fails if the path already exists/i, `${id} uses exclusive creation`);
    assert.match(draft, /`\.tmp\//, `${id} creates the draft under .tmp`);
    assert.match(draft, /never reuse/i, id);
    assert.ok(draft.includes('<draft-path>'), `${id} records the exact draft path`);

    for (const [label, start, end] of [
      ['reviewer', /^7\. /, /^8\. /],
      ['revision', /^8\. /, /^### /],
      ['devops', /^### Phase 4/, /^9\. /],
      ['cleanup', /^15\. /, /^16\. /]
    ]) assert.ok(section(body, start, end).includes('<draft-path>'), `${id} ${label} step uses the exact draft path`);
    assert.match(section(body, /^15\. /, /^16\. /), /nothing else/i, `${id} deletes only the owned draft`);
  }
});

// ---------------------------------------------------------------------------
// Fixture-driven positive behavior

test('plugin skills render plugin-local skill references and core devtools agent references on every client', async t => {
  const temp = await fixture(t);
  await withPlugin(temp);
  const outputs = await generate(temp);
  for (const id of ['claude', 'codex', 'pi']) {
    const plan = docOf(outputs, skillPath[id]('plan'));
    assert.equal(plan.meta.name, skillName[id]('plan'));
    assert.ok(plan.body.includes(skillRef[id]('work')), `${id} plan references work`);
    assert.ok(plan.body.includes(skillRef[id](SHARED)), `${id} plan references its local principle`);
    assert.ok(plan.body.includes(agentRef[id]('salesforce-platform-expert')), `${id} plan keeps the devtools agent reference`);
    const work = docOf(outputs, skillPath[id]('work'));
    assert.equal(work.meta.name, skillName[id]('work'));
    assert.ok(work.body.includes(skillRef[id]('plan')), `${id} work references plan`);
    assert.ok(work.body.includes(agentRef[id]('salesforce-apex-test-engineer')), `${id} work keeps the devtools agent reference`);
  }
});

test('plugin skill references do not leak between hosts', async t => {
  const temp = await fixture(t);
  await withPlugin(temp);
  const outputs = await generate(temp);
  for (const id of ['claude', 'codex', 'pi']) {
    for (const skill of LOCAL) {
      const text = textOf(outputs, skillPath[id](skill));
      assert.doesNotMatch(text, /\{\{/, `${id} ${skill} has no unrendered template syntax`);
      if (id !== 'claude') assert.doesNotMatch(text, /\/sfdc:|devtools:/, `${id} ${skill}`);
      if (id !== 'codex') assert.doesNotMatch(text, /\$sfdc-/, `${id} ${skill}`);
      if (id !== 'pi') assert.doesNotMatch(text, /\/skill:/, `${id} ${skill}`);
      assert.match(text, /library\/plugins\/sfdc\/skills\//, `${id} ${skill} names its source`);
    }
  }
});

test('independent local principle sources initially render the same body on every client', async t => {
  const temp = await fixture(t);
  await withPlugin(temp);
  const outputs = await generate(temp);
  for (const id of ['claude', 'codex', 'pi']) {
    const core = docOf(outputs, `${devtoolsRoot(id)}/skills/${SHARED}/SKILL.md`);
    const copy = docOf(outputs, skillPath[id](SHARED));
    assert.equal(copy.meta.name, skillName[id](SHARED), id);
    assert.equal(copy.meta.description, core.meta.description, id);
    const withoutSourceComment = body => body.replace(/<!-- Generated from [^\n]* -->\s*/g, '').trim();
    assert.equal(withoutSourceComment(copy.body), withoutSourceComment(core.body), id);
    const dir = path.posix.dirname(skillPath[id](SHARED));
    assert.deepEqual([...outputs.keys()].filter(file => file.startsWith(`${dir}/evals/`)), [], `${id} plugin copy excludes evals`);
  }
});

test('Pi merges prefixed plugin skills into its existing skills directory', async t => {
  const temp = await fixture(t);
  await withPlugin(temp);
  const outputs = await generate(temp);
  const piSkills = [...outputs.keys()].filter(file => /^dist\/pi\/skills\/sfdc-[^/]+\/SKILL\.md$/.test(file)).sort();
  assert.deepEqual(piSkills, [...LOCAL, SHARED].map(skill => skillPath.pi(skill)).sort());
  assert.ok(outputs.has(`dist/pi/skills/${SHARED}/SKILL.md`), 'core Pi skill remains');
  assert.equal(docOf(outputs, `dist/pi/skills/${SHARED}/SKILL.md`).meta.name, SHARED);
  assert.deepEqual(jsonOf(outputs, 'dist/pi/package.json').pi.skills, ['./skills']);
  assert.deepEqual([...outputs.keys()].filter(file => file.startsWith('dist/pi-plugins/')), [], 'Pi has no separate plugin package');
});

test('Claude and Codex sfdc plugin directories contain only skills, a manifest, and LICENSE', async t => {
  const temp = await fixture(t);
  await withPlugin(temp);
  const outputs = await generate(temp);
  const pkg = JSON.parse(await fs.readFile(path.join(temp, 'package.json'), 'utf8'));
  for (const [dir, manifest] of [['dist/claude/sfdc/', 'dist/claude/sfdc/.claude-plugin/plugin.json'], ['dist/codex/sfdc/', 'dist/codex/sfdc/plugin.json']]) {
    const files = [...outputs.keys()].filter(file => file.startsWith(dir));
    assert.ok(files.includes(manifest), `Missing ${manifest}`);
    const unexpected = files.filter(file => file !== manifest && !file.startsWith(`${dir}skills/`) && file !== `${dir}LICENSE`);
    assert.deepEqual(unexpected, [], `${dir} has no commands, agents, or prompts`);
    const plugin = jsonOf(outputs, manifest);
    assert.equal(plugin.name, 'sfdc');
    assert.equal(plugin.version, pkg.version);
    assert.equal(plugin.description, 'Salesforce delivery workflows.');
  }
});

test('the sfdc plugin emits no commands, prompts, or agents on any client', async t => {
  const temp = await fixture(t);
  await withPlugin(temp);
  const outputs = await generate(temp);
  const files = [...outputs.keys()];
  assert.deepEqual(files.filter(file => /^dist\/(claude|codex)\/sfdc\/(commands|agents|prompts)\//.test(file)), []);
  assert.deepEqual(files.filter(file => /^dist\/pi\/(prompts|agents)\/sfdc-/.test(file)), []);
});

test('catalogs list sfdc separately and keep the devtools entries unchanged', async t => {
  const temp = await fixture(t);
  await withoutPlugins(temp);
  const baseline = await generate(temp);
  await withPlugin(temp);
  const outputs = await generate(temp);
  const before = jsonOf(baseline, '.claude-plugin/marketplace.json');
  const after = jsonOf(outputs, '.claude-plugin/marketplace.json');
  assert.deepEqual(after.plugins[0], before.plugins[0]);
  assert.deepEqual(after.plugins.filter(plugin => plugin.name !== 'sfdc'), before.plugins, 'feature entries are unchanged');
  assert.deepEqual(after.plugins.filter(plugin => plugin.name === 'sfdc'), [{ name: 'sfdc', source: './dist/claude/sfdc', description: 'Salesforce delivery workflows.' }]);
  const codexBefore = jsonOf(baseline, '.agents/plugins/marketplace.json');
  const codexAfter = jsonOf(outputs, '.agents/plugins/marketplace.json');
  assert.deepEqual(codexAfter.plugins[0], codexBefore.plugins[0]);
  assert.equal(codexAfter.name, codexBefore.name);
  const sfdc = codexAfter.plugins.filter(plugin => plugin.name === 'sfdc');
  assert.equal(sfdc.length, 1);
  assert.deepEqual(sfdc[0].source, { source: 'local', path: './dist/codex/sfdc' });
  assert.deepEqual(sfdc[0].policy, codexBefore.plugins[0].policy);
});

test('adding the plugin leaves every devtools output byte identical', async t => {
  const temp = await fixture(t);
  await withoutPlugins(temp);
  const baseline = await generate(temp);
  await withPlugin(temp);
  const outputs = await generate(temp);
  const shared = file => file === '.claude-plugin/marketplace.json' || file === '.agents/plugins/marketplace.json' || file === 'dist/manifest.json' || /^dist\/[^/]+\/library-version\.json$/.test(file);
  const core = outputs => [...outputs.keys()].filter(file => !pluginOwned(file) && !shared(file)).sort();
  assert.deepEqual(core(outputs), core(baseline));
  for (const file of core(baseline)) assert.deepEqual(outputs.get(file), baseline.get(file), file);
  assert.ok([...outputs.keys()].some(pluginOwned), 'plugin output is emitted');
});

test('plugin outputs are deterministic and recorded in the distribution manifest', async t => {
  const temp = await fixture(t);
  await withPlugin(temp);
  const outputs = await generate(temp);
  assert.deepEqual(await generate(temp), outputs);
  const manifest = jsonOf(outputs, 'dist/manifest.json');
  assert.equal(manifest.counts.plugins, 2);
  const owned = [...outputs.keys()].filter(pluginOwned);
  assert.ok(owned.length >= 8, 'three skills per client plus Claude and Codex manifests');
  for (const file of owned) {
    assert.deepEqual(manifest.files[file], { sha256: sha(outputs.get(file).bytes), mode: outputs.get(file).mode }, file);
  }
  for (const id of ['claude', 'codex', 'pi']) assert.equal(jsonOf(outputs, `dist/${id}/library-version.json`).inputsDigest, manifest.inputsDigest);
});

test('the manifest counts only devtools when optional plugins are absent', async t => {
  const temp = await fixture(t);
  await withoutPlugins(temp);
  assert.equal(jsonOf(await generate(temp), 'dist/manifest.json').counts.plugins, 1);
});

test('the devtools source plugin is required', async t => {
  const temp = await fixture(t);
  await fs.rm(path.join(temp, 'library/plugins/devtools'), { recursive: true, force: true });
  await assert.rejects(generate(temp), error => /devtools/.test(error.message) && /required|missing|ENOENT/i.test(error.message));
});

test('an absent library/plugins tree fails instead of compiling legacy top-level sources', async t => {
  const temp = await fixture(t);
  await fs.rm(path.join(temp, 'library/plugins'), { recursive: true, force: true });
  for (const id of ['claude', 'codex', 'pi']) await changeJson(temp, `clients/${id}/config.json`, config => { config.plugins = {}; });
  await assert.rejects(generate(temp), /devtools|library\/plugins/);
});

test('check reports stale plugin output after the plugin is removed', async t => {
  const temp = await fixture(t);
  await withPlugin(temp);
  await write(temp, await generate(temp));
  await withoutPlugins(temp);
  const differences = await check(temp, await generate(temp));
  assert.ok(differences.includes(`stale: ${skillPath.pi('plan')}`), 'stale Pi plugin skill is reported');
  assert.ok(differences.some(line => line.startsWith('stale: dist/codex/sfdc/')), 'stale Codex plugin is reported');
  assert.ok(differences.some(line => line.startsWith('stale: dist/claude/sfdc/')), 'stale Claude plugin is reported');
});

// ---------------------------------------------------------------------------
// Fingerprint sensitivity

test('every local plugin source byte and client plugin map affects the fingerprint', async t => {
  const temp = await fixture(t);
  await withoutPlugins(temp);
  const baseline = digestOf(await generate(temp));
  const dir = await withPlugin(temp);
  let digest = digestOf(await generate(temp));
  assert.notEqual(digest, baseline, 'adding the plugin changes the fingerprint');
  for (const file of ['plugin.json', 'skills/plan/SKILL.md.hbs', 'skills/work/SKILL.md.hbs', `skills/${SHARED}/SKILL.md.hbs`]) {
    await fs.appendFile(path.join(dir, file), ' ');
    const next = digestOf(await generate(temp));
    assert.notEqual(next, digest, `library/plugins/sfdc/${file} must affect the fingerprint`);
    digest = next;
  }
  const builtWithPlugin = await generate(temp);
  await fs.appendFile(path.join(temp, `library/plugins/devtools/skills/${SHARED}/SKILL.md.hbs`), '\nDevtools-only line.\n');
  const coreOutputs = await generate(temp);
  assert.notEqual(digestOf(coreOutputs), digest);
  for (const id of ['claude', 'codex', 'pi']) {
    assert.match(textOf(coreOutputs, `${devtoolsRoot(id)}/skills/${SHARED}/SKILL.md`), /Devtools-only line\./, id);
    assert.deepEqual(coreOutputs.get(skillPath[id](SHARED)), builtWithPlugin.get(skillPath[id](SHARED)), `${id} sfdc copy is independent`);
  }
  digest = digestOf(coreOutputs);
  await changeJson(temp, 'clients/pi/config.json', config => { config.plugins.sfdc.skillReference = '/skill:sfdc-x-{{name}}'; });
  const remapped = await generate(temp);
  assert.notEqual(digestOf(remapped), digest);
  assert.match(textOf(remapped, skillPath.pi('plan')), /\/skill:sfdc-x-work/);
});

// ---------------------------------------------------------------------------
// Invalid plugin manifests and sources

test('an unparseable plugin.json fails with its path', async t => {
  const temp = await fixture(t);
  await withPlugin(temp, { manifest: '{ "name": ' });
  await assert.rejects(generate(temp), /library\/plugins\/sfdc\/plugin\.json/);
});

test('plugin.json with invalid fields fails and names the plugin', async t => {
  const valid = { name: 'sfdc', description: 'Salesforce delivery workflows.', agents: [], commands: [], skills: [...LOCAL, SHARED] };
  const cases = [
    ['missing name', { ...valid, name: undefined }],
    ['non-string name', { ...valid, name: 42 }],
    ['missing description', { ...valid, description: undefined }],
    ['blank description', { ...valid, description: '   ' }],
    ['skills not an array', { ...valid, skills: 'plan' }],
    ['non-string skill', { ...valid, skills: ['plan', 7] }],
    ['missing agents', { ...valid, agents: undefined }],
    ['missing commands', { ...valid, commands: undefined }],
    ['missing skills', { ...valid, skills: undefined }],
    ['agents not an array', { ...valid, agents: 'expert' }],
    ['commands not an array', { ...valid, commands: 'plan' }],
    ['non-string agent', { ...valid, agents: [7] }],
    ['non-string command', { ...valid, commands: [7] }],
    ['duplicate agent', { ...valid, agents: ['expert', 'expert'] }],
    ['duplicate command', { ...valid, commands: ['deploy', 'deploy'] }],
    ['sharedSkills is removed', { ...valid, sharedSkills: [] }],
    ['duplicate local skill', { ...valid, skills: ['plan', 'work', 'plan'] }],
    ['array manifest', [valid]]
  ];
  for (const [label, manifest] of cases) {
    const temp = await fixture(t);
    await withPlugin(temp, { manifest: JSON.parse(JSON.stringify(manifest)) });
    await assert.rejects(generate(temp), error => /library\/plugins\/sfdc/.test(error.message), label);
  }
});

test('plugin.json name must match its folder', async t => {
  const temp = await fixture(t);
  await withPlugin(temp, { manifest: { name: 'salesforce', description: 'x', agents: [], commands: [], skills: [...LOCAL, SHARED] } });
  await assert.rejects(generate(temp), error => /sfdc/.test(error.message) && /salesforce/.test(error.message) && /folder|match/i.test(error.message));
});

test('plugin names must be lowercase hyphenated identifiers', async t => {
  const temp = await fixture(t);
  await withPlugin(temp, { name: 'Sfdc_Tools' });
  await assert.rejects(generate(temp), error => /Sfdc_Tools/.test(error.message));
});

test('sharedSkills is rejected even when it names an existing devtools skill', async t => {
  const temp = await fixture(t);
  await withPlugin(temp);
  await changeJson(temp, 'library/plugins/sfdc/plugin.json', manifest => { manifest.sharedSkills = [SHARED]; });
  await assert.rejects(generate(temp), error => /sfdc/.test(error.message) && /sharedSkills/.test(error.message));
});

test('devtools also rejects the removed sharedSkills field', async t => {
  const temp = await fixture(t);
  await changeJson(temp, 'library/plugins/devtools/plugin.json', manifest => { manifest.sharedSkills = []; });
  await assert.rejects(generate(temp), error => /devtools/.test(error.message) && /sharedSkills/.test(error.message));
});

test('a listed local skill without a source directory fails', async t => {
  const temp = await fixture(t);
  await withPlugin(temp, { manifest: { name: 'sfdc', description: 'x', agents: [], commands: [], skills: [...LOCAL, SHARED, 'deploy'] } });
  await assert.rejects(generate(temp), error => /sfdc/.test(error.message) && /deploy/.test(error.message));
});

test('a local skill whose name differs from its directory fails', async t => {
  const temp = await fixture(t);
  await withPlugin(temp, { skills: { ...FIXTURE_SKILLS, plan: localSkill('planning', 'Plan body.') }, manifest: { name: 'sfdc', description: 'x', agents: [], commands: [], skills: [...LOCAL, SHARED] } });
  await assert.rejects(generate(temp), error => /library\/plugins\/sfdc\/skills\/plan\/SKILL\.md\.hbs/.test(error.message) && /directory must match|match/.test(error.message));
});

test('a local skill directory not listed in plugin.json fails', async t => {
  const temp = await fixture(t);
  await withPlugin(temp, { skills: { ...FIXTURE_SKILLS, extra: localSkill('extra', 'Extra body.') }, manifest: { name: 'sfdc', description: 'x', agents: [], commands: [], skills: [...LOCAL, SHARED] } });
  await assert.rejects(generate(temp), error => /sfdc/.test(error.message) && /extra/.test(error.message));
});

for (const plugin of ['devtools', 'sfdc']) {
  for (const kind of ['agents', 'commands']) {
    test(`${plugin} rejects a declared local ${kind} name without a source`, async t => {
      const temp = await fixture(t);
      await withPlugin(temp);
      await changeJson(temp, `library/plugins/${plugin}/plugin.json`, manifest => { manifest[kind].push('missing-local'); });
      await assert.rejects(generate(temp), error => error.message.includes(`library/plugins/${plugin}`) && /missing-local/.test(error.message));
    });

    test(`${plugin} rejects an undeclared local ${kind} source`, async t => {
      const temp = await fixture(t);
      await withPlugin(temp);
      await writeFile(temp, `library/plugins/${plugin}/${kind}/unlisted.md.hbs`, '---\nname: unlisted\ndescription: Unlisted document.\n---\n\nBody.\n');
      await assert.rejects(generate(temp), error => error.message.includes(`library/plugins/${plugin}`) && /unlisted/.test(error.message));
    });

    test(`${plugin} rejects local ${kind} filename and metadata name disagreement`, async t => {
      const temp = await fixture(t);
      await withPlugin(temp);
      await changeJson(temp, `library/plugins/${plugin}/plugin.json`, manifest => { manifest[kind].push('declared'); });
      await writeFile(temp, `library/plugins/${plugin}/${kind}/declared.md.hbs`, '---\nname: different\ndescription: Mismatched document.\n---\n\nBody.\n');
      await assert.rejects(generate(temp), error => error.message.includes(`library/plugins/${plugin}/${kind}/declared.md.hbs`) && /match|name/i.test(error.message));
    });
  }
}

test('local skill metadata typos fail', async t => {
  const temp = await fixture(t);
  await withPlugin(temp, { skills: { ...FIXTURE_SKILLS, plan: '---\nname: plan\ndescription: Plan.\nmodelProfile: deep\n---\n\nPlan body.\n' } });
  await assert.rejects(generate(temp), /unknown skills metadata field: modelProfile/);
});

test('local skills referencing unknown plugin skills fail with their source path', async t => {
  const temp = await fixture(t);
  await withPlugin(temp, { skills: { ...FIXTURE_SKILLS, plan: localSkill('plan', 'Use {{skills.playwright-cli}}.') } });
  await assert.rejects(generate(temp), /library\/plugins\/sfdc\/skills\/plan\/SKILL\.md\.hbs/);
});

// ---------------------------------------------------------------------------
// Client plugin mappings

test('a client mapping for an unknown plugin fails', async t => {
  const temp = await fixture(t);
  await withPlugin(temp);
  await changeJson(temp, 'clients/codex/config.json', config => { config.plugins.other = { ...PLUGIN_MAPS.codex }; });
  await assert.rejects(generate(temp), error => /codex/.test(error.message) && /other/.test(error.message));
});

test('a client without a mapping for the plugin fails', async t => {
  const temp = await fixture(t);
  await withPlugin(temp);
  await changeJson(temp, 'clients/pi/config.json', config => { delete config.plugins.sfdc; });
  await assert.rejects(generate(temp), error => /pi/.test(error.message) && /sfdc/.test(error.message));
});

test('client plugin mappings require both skillName and skillReference', async t => {
  for (const key of ['skillName', 'skillReference']) {
    const temp = await fixture(t);
    await withPlugin(temp);
    await changeJson(temp, 'clients/claude/config.json', config => { delete config.plugins.sfdc[key]; });
    await assert.rejects(generate(temp), error => /claude/.test(error.message) && new RegExp(key).test(error.message), key);
  }
});

test('unsafe mapped plugin skill names fail', async t => {
  const temp = await fixture(t);
  await withPlugin(temp, { maps: { ...PLUGIN_MAPS, codex: { skillName: '../{{name}}', skillReference: '$sfdc-{{name}}' } } });
  await assert.rejects(generate(temp), /invalid generated skill name/);
});

// ---------------------------------------------------------------------------
// Namespace collisions

test('a Pi plugin skill name that collides with a core Pi skill fails', async t => {
  const temp = await fixture(t);
  await withPlugin(temp, { maps: { ...PLUGIN_MAPS, pi: { skillName: '{{name}}', skillReference: '/skill:{{name}}' } } });
  await assert.rejects(generate(temp), error => new RegExp(SHARED).test(error.message) && /duplicate|collision/i.test(error.message));
});

test('changing sfdc principle leaves the devtools principle unchanged', async t => {
  const temp = await fixture(t);
  await withPlugin(temp);
  const before = await generate(temp);
  await fs.appendFile(path.join(temp, `library/plugins/sfdc/skills/${SHARED}/SKILL.md.hbs`), '\nSfdc-only line.\n');
  const after = await generate(temp);
  assert.notEqual(digestOf(after), digestOf(before));
  for (const id of ['claude', 'codex', 'pi']) {
    assert.match(textOf(after, skillPath[id](SHARED)), /Sfdc-only line\./, id);
    const core = `${devtoolsRoot(id)}/skills/${SHARED}/SKILL.md`;
    assert.deepEqual(after.get(core), before.get(core), `${id} devtools copy is independent`);
  }
});

test('a plugin that shares a name with a Claude feature fails', async t => {
  const temp = await fixture(t);
  await fs.mkdir(path.join(temp, 'features/sample/claude/.claude-plugin'), { recursive: true });
  await fs.writeFile(path.join(temp, 'features/sample/feature.json'), JSON.stringify({ name: 'sample', description: 'Sample feature' }));
  await fs.writeFile(path.join(temp, 'features/sample/claude/.claude-plugin/plugin.json'), JSON.stringify({ name: 'sample' }));
  await withPlugin(temp, { name: 'sample' });
  await assert.rejects(generate(temp), error => /sample/.test(error.message) && /collide|collision|reserved|duplicate/i.test(error.message));
});
