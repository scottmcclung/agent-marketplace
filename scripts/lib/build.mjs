import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import Handlebars from 'handlebars';
import YAML from 'yaml';
import TOML from '@iarna/toml';

export const CLIENTS = ['claude', 'codex', 'pi'];
export const OUTPUT_ROOTS = ['dist', '.claude-plugin', '.agents/plugins'];
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const fail = message => { throw new Error(message); };
const own = (object, key, label) => Object.hasOwn(object, key) ? object[key] : fail(`Unknown ${label}: ${key}`);

export function render(template, values, label = 'template') {
  try {
    return Handlebars.compile(template, { strict: true, noEscape: true })(values);
  } catch (error) {
    throw new Error(`${label}: ${error.message}`, { cause: error });
  }
}

export function parseDocument(text, label = 'document') {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) fail(`${label}: YAML frontmatter is required`);
  let meta;
  try { meta = YAML.parse(match[1]); } catch (error) { fail(`${label}: ${error.message}`); }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) fail(`${label}: expected a metadata mapping`);
  if (typeof meta.name !== 'string' || !slug.test(meta.name) || meta.name.length > 64) fail(`${label}: invalid name`);
  if (typeof meta.description !== 'string' || !meta.description.trim()) fail(`${label}: description is required`);
  const body = text.slice(match[0].length).trim();
  if (!body) fail(`${label}: prompt body is required`);
  return { meta, body };
}

export async function walk(root, relative = '') {
  const entries = [];
  for (const item of (await fs.readdir(path.join(root, relative), { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    if (item.name === '.DS_Store') continue;
    const name = path.posix.join(relative, item.name);
    if (item.isSymbolicLink()) fail(`Symlinks are not supported: ${path.join(root, name)}`);
    if (item.isDirectory()) entries.push(...await walk(root, name));
    else if (item.isFile()) entries.push(name);
    else fail(`Unsupported file: ${name}`);
  }
  return entries;
}

function validateMetadata(meta, kind, label) {
  const fields = {
    agents: ['name', 'description', 'modelProfile', 'toolProfile', 'color', 'skills'],
    commands: ['name', 'description', 'argumentHint', 'manualOnly'],
    skills: ['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools', 'disable-model-invocation']
  };
  for (const key of Object.keys(meta)) if (!fields[kind].includes(key)) fail(`${label}: unknown ${kind} metadata field: ${key}`);
  for (const key of ['modelProfile', 'toolProfile', 'color', 'argumentHint']) {
    if (meta[key] !== undefined && (typeof meta[key] !== 'string' || !meta[key])) fail(`${label}: ${key} must be a nonempty string`);
  }
  if (meta.manualOnly !== undefined && typeof meta.manualOnly !== 'boolean') fail(`${label}: manualOnly must be a boolean`);
}

function frontmatter(meta) {
  return `---\n${YAML.stringify(meta, { lineWidth: 0 }).trimEnd()}\n---`;
}

function validateConfig(config, id) {
  if (config.id !== id) fail(`Client id mismatch: ${id}`);
  for (const key of ['agentName', 'agentReference', 'commandName', 'commandReference', 'skillName']) {
    if (typeof config[key] !== 'string' || !config[key]) fail(`${id}: ${key} is required`);
  }
  for (const key of ['models', 'tools', 'colors', 'agentDefaults', 'skillAttributes', 'values']) {
    if (!config[key] || typeof config[key] !== 'object' || Array.isArray(config[key])) fail(`${id}: ${key} must be a mapping`);
  }
  if (!['native', 'delegation-skills'].includes(config.agentMode)) fail(`${id}: invalid agentMode`);
  if ((id === 'codex') !== (config.agentMode === 'delegation-skills')) fail(`${id}: unsupported agentMode`);
}

const FEATURE_HARNESSES = ['claude', 'pi'];

/** Features live at features/<name>/ with a feature.json and one folder per harness. */
async function readFeatures(root, input) {
  let files;
  try { files = await walk(path.join(root, 'features')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const byName = new Map();
  for (const file of files) {
    const [name, ...rest] = file.split('/');
    if (!rest.length) fail(`Expected a feature folder: features/${file}`);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(rest.join('/'));
  }
  const features = [];
  for (const [name, entries] of byName) {
    const label = `features/${name}`;
    if (!entries.includes('feature.json')) fail(`${label}: feature.json is required`);
    // Read every file so any byte change under features/ alters inputsDigest.
    for (const entry of entries) await input(`${label}/${entry}`);
    let manifest;
    try { manifest = JSON.parse((await input(`${label}/feature.json`)).toString()); }
    catch (error) { fail(`${label}/feature.json: ${error.message}`); }
    if (typeof manifest?.name !== 'string') fail(`${label}: feature.json name field is missing or invalid`);
    if (manifest.name !== name) fail(`${label}: feature.json name must match the folder name`);
    if (!slug.test(name)) fail(`${label}: feature name ${name} must be a lowercase hyphenated identifier`);
    // The core plugin is published as devtools; a feature with that name would shadow it in catalogs.
    if (name === 'devtools') fail(`${label}: feature name devtools is reserved`);
    const harnesses = new Set(entries.filter(entry => entry.includes('/')).map(entry => entry.split('/')[0]));
    for (const harness of harnesses) {
      if (harness === 'codex') fail(`${label}: codex features are not supported yet`);
      if (!FEATURE_HARNESSES.includes(harness)) fail(`${label}: unknown harness folder: ${harness}`);
    }
    if (!harnesses.size) fail(`${label}: at least one harness folder is required (${FEATURE_HARNESSES.join(', ')})`);
    if (harnesses.has('pi') && !entries.includes('pi/index.mjs')) fail(`${label}: Pi features require pi/index.mjs`);
    features.push({ name, manifest, entries, harnesses: [...harnesses].sort() });
  }
  return features;
}

/** Generate entirely in memory: bad input never deletes a working distribution. */
export async function generate(root) {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version)) fail('package.json: expected a semantic version');
  const outputs = new Map();
  const inputs = new Map();
  async function input(file) {
    if (!inputs.has(file)) inputs.set(file, await fs.readFile(path.join(root, file)));
    return inputs.get(file);
  }
  function emit(file, data, mode = 0o644) {
    if (!OUTPUT_ROOTS.some(dir => file.startsWith(`${dir}/`)) || file.split('/').includes('..')) fail(`Unsafe output path: ${file}`);
    if (outputs.has(file)) fail(`Output collision: ${file}`);
    outputs.set(file, { bytes: Buffer.isBuffer(data) ? data : Buffer.from(data), mode });
  }
  const sourceDocs = {};
  for (const kind of ['agents', 'commands']) {
    sourceDocs[kind] = [];
    const names = new Set();
    for (const file of await walk(path.join(root, 'library', kind))) {
      if (!file.endsWith('.md.hbs') || file.includes('/')) fail(`Expected a direct .md.hbs document: library/${kind}/${file}`);
      const source = `library/${kind}/${file}`;
      const text = (await input(source)).toString();
      const { meta } = parseDocument(text, source);
      validateMetadata(meta, kind, source);
      if (names.has(meta.name)) fail(`Duplicate ${kind} name: ${meta.name}`);
      if (file !== `${meta.name}.md.hbs`) fail(`${source}: filename must match name`);
      names.add(meta.name);
      sourceDocs[kind].push({ source, text, meta });
    }
  }
  const skillFiles = await walk(path.join(root, 'library/skills'));
  const skillDocs = [];
  for (const file of skillFiles.filter(file => file.endsWith('/SKILL.md.hbs'))) {
    const source = `library/skills/${file}`;
    const text = (await input(source)).toString();
    const { meta } = parseDocument(text, source);
    validateMetadata(meta, 'skills', source);
    if (file !== `${meta.name}/SKILL.md.hbs`) fail(`${source}: skill directory must match name`);
    skillDocs.push({ source, text, meta });
  }
  const skillNames = new Set(skillDocs.map(doc => doc.meta.name));
  for (const agent of sourceDocs.agents) {
    if (agent.meta.skills && (!Array.isArray(agent.meta.skills) || agent.meta.skills.some(name => !skillNames.has(name)))) fail(`${agent.source}: unknown required skill`);
  }
  for (const file of skillFiles) {
    if (!skillNames.has(file.split('/')[0])) fail(`Orphan skill resource: ${file}`);
  }

  const features = await readFeatures(root, input);

  for (const id of CLIENTS) {
    const config = JSON.parse((await input(`clients/${id}/config.json`)).toString());
    validateConfig(config, id);
    for (const skill of Object.keys(config.skillAttributes)) if (!skillNames.has(skill)) fail(`${id}: attributes for unknown skill: ${skill}`);
    if (id === 'codex' && Object.values(config.tools).some(value => value !== null)) fail('codex: plugin delegation cannot enforce native tool allowlists; use null tool profiles');
    const templates = {};
    for (const kind of ['agent', 'command', 'skill']) templates[kind] = (await input(`clients/${id}/templates/${kind}.md.hbs`)).toString();
    const mapped = (pattern, name) => render(pattern, { name }, `${id} name map`);
    const context = {
      client: config.values,
      library: { name: pkg.name, version: pkg.version },
      agents: Object.fromEntries(sourceDocs.agents.map(doc => [doc.meta.name, mapped(config.agentReference, doc.meta.name)])),
      commands: Object.fromEntries(sourceDocs.commands.map(doc => [doc.meta.name, mapped(config.commandReference, doc.meta.name)])),
      skills: Object.fromEntries(skillDocs.map(doc => [doc.meta.name, mapped(config.skillName, doc.meta.name)]))
    };
    const base = `dist/${id}`;
    const generatedSkills = new Set();
    const claimSkill = name => {
      if (!slug.test(name) || name.length > 64) fail(`${id}: invalid generated skill name: ${name}`);
      if (generatedSkills.has(name)) fail(`${id}: duplicate generated skill: ${name}`);
      generatedSkills.add(name);
    };
    const docTemplate = (kind, source, meta, body, extra = {}) => render(templates[kind], {
      frontmatter: frontmatter(meta), source, body, ...extra
    }, `${id}/${kind}: ${source}`);
    const readDoc = doc => parseDocument(render(doc.text, context, doc.source), doc.source);

    for (const doc of sourceDocs.agents) {
      const { meta, body: originalBody } = readDoc(doc);
      const model = own(config.models, meta.modelProfile ?? 'inherit', `${id} model profile`);
      const tools = own(config.tools, meta.toolProfile ?? 'development', `${id} tool profile`);
      if (model !== null && (typeof model !== 'string' || !model)) fail(`${id}: model must be a string or null`);
      if (tools !== null && (!Array.isArray(tools) || tools.some(tool => typeof tool !== 'string'))) fail(`${id}: tools must be an array or null`);
      const name = mapped(config.agentName, meta.name);
      if (!slug.test(name) || name.length > 64) fail(`${id}: invalid generated agent name: ${name}`);
      const skills = (meta.skills ?? []).map(name => context.skills[name]);
      const body = originalBody + (skills.length ? `\n\n## Required skills\n\nLoad these skills and resolve their resources relative to their skill directories: ${skills.join(', ')}.` : '');
      if (config.agentMode === 'delegation-skills') {
        claimSkill(name);
        emit(`${base}/skills/${name}/SKILL.md`, docTemplate('agent', doc.source, { name, description: meta.description }, '', {
          name, model: model ?? '', delegation: config.values.delegation, requiredSkills: skills.join(', ')
        }));
        emit(`${base}/skills/${name}/references/prompt.md`, `<!-- Generated from ${doc.source}. -->\n\n${body}\n`);
        // Export only; Codex does not discover these merely because they are in a plugin.
        emit(`${base}/agents/${name}.toml`, TOML.stringify({ name, description: meta.description, ...(model ? { model } : {}), developer_instructions: body }));
      } else {
        const native = { ...config.agentDefaults, name, description: meta.description };
        if (model) native.model = model;
        if (tools) native.tools = tools.join(', ');
        if (meta.color) {
          const color = own(config.colors, meta.color, `${id} color`);
          if (color) native.color = color;
        }
        if (skills.length) native.skills = skills;
        emit(`${base}/agents/${name}.md`, docTemplate('agent', doc.source, native, body));
      }
    }
    for (const doc of sourceDocs.commands) {
      const { meta, body } = readDoc(doc);
      const name = mapped(config.commandName, meta.name);
      if (!slug.test(name) || name.length > 64) fail(`${id}: invalid generated command name: ${name}`);
      const native = { description: meta.description };
      if (meta.argumentHint) native['argument-hint'] = meta.argumentHint;
      if (id === 'codex') {
        claimSkill(name);
        emit(`${base}/skills/${name}/SKILL.md`, docTemplate('command', doc.source, { name, ...native }, body));
        emit(`${base}/skills/${name}/agents/openai.yaml`, YAML.stringify({ policy: { allow_implicit_invocation: !meta.manualOnly } }));
      } else {
        emit(`${base}/${id === 'pi' ? 'prompts' : 'commands'}/${name}.md`, docTemplate('command', doc.source, native, body));
      }
    }
    for (const doc of skillDocs) {
      const { meta, body } = readDoc(doc);
      const name = context.skills[meta.name];
      claimSkill(name);
      const native = { ...meta, name, ...(config.skillAttributes[meta.name] ?? {}) };
      emit(`${base}/skills/${name}/SKILL.md`, docTemplate('skill', doc.source, native, body));
    }
    for (const file of skillFiles.filter(file => !file.endsWith('/SKILL.md.hbs'))) {
      const source = `library/skills/${file}`;
      const bytes = await input(source);
      const [skill, ...parts] = file.split('/');
      const destination = `${base}/skills/${context.skills[skill]}/${parts.join('/')}`;
      // Git checkouts on Windows do not expose POSIX executable bits. Derive
      // executable scripts from their shebang so every host emits the same manifest.
      const mode = bytes.subarray(0, 2).toString() === '#!' ? 0o755 : 0o644;
      emit(destination.replace(/\.hbs$/, ''), file.endsWith('.hbs') ? render(bytes.toString(), context, source) : bytes, mode);
    }
    for (const [file, output] of outputs) {
      if (!file.startsWith(`${base}/skills/`) || !file.endsWith('/SKILL.md')) continue;
      const { meta } = parseDocument(output.bytes.toString(), file);
      if (meta.description.length > 1024) fail(`${file}: skill description exceeds 1024 characters`);
    }
  }

  // Pi feature folders are opaque: each ships byte for byte as one extension directory.
  for (const feature of features) {
    for (const entry of feature.entries.filter(entry => entry.startsWith('pi/'))) {
      const bytes = await input(`features/${feature.name}/${entry}`);
      const mode = bytes.subarray(0, 2).toString() === '#!' ? 0o755 : 0o644;
      emit(`dist/pi/extensions/${feature.name}/${entry.slice('pi/'.length)}`, bytes, mode);
    }
  }

  const identity = { name: 'devtools', version: pkg.version, description: pkg.description, author: typeof pkg.author === 'string' ? { name: pkg.author } : pkg.author, license: pkg.license, repository: pkg.repository };
  emit('dist/claude/.claude-plugin/plugin.json', json(identity));
  emit('.claude-plugin/marketplace.json', json({ name: pkg.name, owner: identity.author, plugins: [{ name: identity.name, source: './dist/claude', description: identity.description }] }));
  emit('dist/codex/plugin.json', json({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', ...identity }));
  emit('.agents/plugins/marketplace.json', json({
    name: pkg.name, interface: { displayName: 'Agent Marketplace' },
    plugins: [{ name: identity.name, source: { source: 'local', path: './dist/codex' }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' }]
  }));
  emit('dist/pi/package.json', json({ name: pkg.name, version: pkg.version, description: pkg.description, license: pkg.license, repository: pkg.repository, keywords: ['pi-package'], files: ['agents', 'prompts', 'skills', 'extensions', 'library-version.json', 'LICENSE'], pi: { extensions: ['./extensions/*/index.mjs'], skills: ['./skills'], prompts: ['./prompts'], themes: [], subagents: { agents: ['./agents'] } } }));
  for (const file of ['LICENSE']) {
    const bytes = await input(file);
    for (const id of CLIENTS) emit(`dist/${id}/${file}`, bytes);
  }
  // No commit SHA/timestamps: identical source inputs always produce identical output.
  for (const file of ['package.json', 'scripts/lib/build.mjs']) await input(file);
  const inputsDigest = hash([...inputs].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([file, bytes]) => `${file}\0${hash(bytes)}\n`).join(''));
  for (const id of CLIENTS) emit(`dist/${id}/library-version.json`, json({ library: pkg.name, version: pkg.version, client: id, inputsDigest, agentMode: id === 'codex' ? 'delegation-skills' : 'native' }));
  emit('dist/manifest.json', json({ library: pkg.name, version: pkg.version, inputsDigest, counts: { agents: sourceDocs.agents.length, commands: sourceDocs.commands.length, skills: skillDocs.length }, files: Object.fromEntries([...outputs].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([file, output]) => [file, { sha256: hash(output.bytes), mode: output.mode }])) }));
  return outputs;
}

export async function check(root, outputs) {
  const differences = [];
  for (const [file, output] of outputs) {
    try {
      if (!(await fs.readFile(path.join(root, file))).equals(output.bytes)) differences.push(`changed: ${file}`);
      if (process.platform !== 'win32' && ((await fs.stat(path.join(root, file))).mode & 0o111) !== (output.mode & 0o111)) differences.push(`mode: ${file}`);
    } catch (error) { if (error.code === 'ENOENT') differences.push(`missing: ${file}`); else throw error; }
  }
  for (const dir of OUTPUT_ROOTS) {
    try { for (const file of await walk(path.join(root, dir))) if (!outputs.has(`${dir}/${file}`)) differences.push(`stale: ${dir}/${file}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return differences;
}

export async function write(root, outputs) {
  for (const dir of OUTPUT_ROOTS) await fs.rm(path.join(root, dir), { recursive: true, force: true });
  for (const [file, output] of outputs) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), output.bytes, { mode: output.mode });
  }
}
