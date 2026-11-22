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
  for (const key of ['models', 'tools', 'colors', 'agentDefaults', 'skillAttributes', 'plugins', 'values']) {
    if (!config[key] || typeof config[key] !== 'object' || Array.isArray(config[key])) fail(`${id}: ${key} must be a mapping`);
  }
  if (!['native', 'delegation-skills'].includes(config.agentMode)) fail(`${id}: invalid agentMode`);
  if ((id === 'codex') !== (config.agentMode === 'delegation-skills')) fail(`${id}: unsupported agentMode`);
}

/** Reads every SKILL.md.hbs under dir; each must live in a directory named after the skill. */
async function readSkills(root, dir, input) {
  const files = await walk(path.join(root, dir));
  const docs = [];
  for (const file of files.filter(file => file.endsWith('/SKILL.md.hbs'))) {
    const source = `${dir}/${file}`;
    const text = (await input(source)).toString();
    const { meta } = parseDocument(text, source);
    validateMetadata(meta, 'skills', source);
    if (file !== `${meta.name}/SKILL.md.hbs`) fail(`${source}: skill directory must match name`);
    docs.push({ source, text, meta });
  }
  return { files, docs };
}

const DOCUMENT_KINDS = ['agents', 'commands', 'skills'];
const PLUGIN_FIELDS = ['name', 'description', ...DOCUMENT_KINDS];
const PLUGIN_MAP_FIELDS = ['skillName', 'skillReference'];
// Pi merges all plugin resources into one package.
const pluginRoot = (id, name) => id === 'pi' ? 'dist/pi' : `dist/${id}/${name}`;

function uniqueStrings(value, field, label) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) fail(`${label}: ${field} must be an array of strings`);
  const seen = new Set();
  for (const item of value) {
    if (seen.has(item)) fail(`${label}: ${field} lists ${item} more than once`);
    seen.add(item);
  }
  return value;
}

/** Every plugin declares its own local documents; sources never cross plugin boundaries. */
async function readPlugins(root, input) {
  let files;
  try { files = await walk(path.join(root, 'library/plugins')); }
  catch (error) { if (error.code === 'ENOENT') fail('library/plugins/devtools is required'); throw error; }
  const byName = new Map();
  for (const file of files) {
    const [name, ...rest] = file.split('/');
    if (!rest.length) fail(`Expected a plugin folder: library/plugins/${file}`);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(rest.join('/'));
  }
  const plugins = [];
  for (const [name, entries] of byName) {
    const label = `library/plugins/${name}`;
    if (!slug.test(name) || name.length > 64) fail(`${label}: plugin name ${name} must be a lowercase hyphenated identifier`);
    if (!entries.includes('plugin.json')) fail(`${label}: plugin.json is required`);
    for (const entry of entries) {
      if (entry !== 'plugin.json' && !DOCUMENT_KINDS.some(kind => entry.startsWith(`${kind}/`))) fail(`${label}: unexpected plugin file: ${entry}`);
      // Read every file so any byte change under the plugin alters inputsDigest.
      await input(`${label}/${entry}`);
    }
    const manifestLabel = `${label}/plugin.json`;
    let manifest;
    try { manifest = JSON.parse((await input(manifestLabel)).toString()); }
    catch (error) { fail(`${manifestLabel}: ${error.message}`); }
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) fail(`${manifestLabel}: expected an object`);
    for (const key of Object.keys(manifest)) if (!PLUGIN_FIELDS.includes(key)) fail(`${manifestLabel}: unknown field: ${key}`);
    if (typeof manifest.name !== 'string') fail(`${manifestLabel}: name must be a string`);
    if (manifest.name !== name) fail(`${manifestLabel}: name ${manifest.name} must match the folder name ${name}`);
    if (typeof manifest.description !== 'string' || !manifest.description.trim()) fail(`${manifestLabel}: description must be a nonempty string`);
    const docs = {};
    let skillFiles = [];
    for (const kind of DOCUMENT_KINDS) {
      const declared = uniqueStrings(manifest[kind], kind, manifestLabel);
      docs[kind] = [];
      if (kind === 'skills') {
        if (entries.some(entry => entry.startsWith('skills/'))) {
          const skills = await readSkills(root, `${label}/skills`, input);
          docs.skills = skills.docs;
          skillFiles = skills.files;
        }
      } else {
        for (const entry of entries.filter(entry => entry.startsWith(`${kind}/`))) {
          const file = entry.slice(kind.length + 1);
          const source = `${label}/${entry}`;
          if (!file.endsWith('.md.hbs') || file.includes('/')) fail(`${source}: expected a direct .md.hbs document`);
          const text = (await input(source)).toString();
          const { meta } = parseDocument(text, source);
          validateMetadata(meta, kind, source);
          if (file !== `${meta.name}.md.hbs`) fail(`${source}: filename must match name`);
          docs[kind].push({ source, text, meta });
        }
      }
      const local = new Set(docs[kind].map(doc => doc.meta.name));
      for (const item of declared) if (!local.has(item)) fail(`${label}: local ${kind} ${item} requires its ${kind} source`);
      for (const item of local) if (!declared.includes(item)) fail(`${label}: ${kind}/${item} is not listed in plugin.json ${kind}`);
    }
    const skillNames = new Set(docs.skills.map(doc => doc.meta.name));
    for (const file of skillFiles) if (!skillNames.has(file.split('/')[0])) fail(`${label}: orphan skill resource: skills/${file}`);
    for (const agent of docs.agents) {
      if (agent.meta.skills && (!Array.isArray(agent.meta.skills) || agent.meta.skills.some(skill => !skillNames.has(skill)))) fail(`${agent.source}: unknown required skill`);
    }
    plugins.push({ name, description: manifest.description, docs, files: skillFiles });
  }
  if (!plugins.some(plugin => plugin.name === 'devtools')) fail('library/plugins/devtools is required');
  return plugins;
}

const FEATURE_HARNESSES = ['claude', 'pi'];

// Claude Code writes SDK types into a plugin's .claude-plugin/types/ when it loads the plugin.
// They are not source, so a local load must not change inputsDigest or the emitted plugin.
const harnessGenerated = entry => entry.startsWith('claude/.claude-plugin/types/');

/** Features live at features/<name>/ with a feature.json and one folder per harness. */
async function readFeatures(root, input) {
  let files;
  try { files = await walk(path.join(root, 'features')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const byName = new Map();
  for (const file of files) {
    const [name, ...rest] = file.split('/');
    if (!rest.length) fail(`Expected a feature folder: features/${file}`);
    if (harnessGenerated(rest.join('/'))) continue;
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
  const features = await readFeatures(root, input);
  const plugins = await readPlugins(root, input);
  const devtools = plugins.find(plugin => plugin.name === 'devtools');
  const skillNames = new Set(plugins.flatMap(plugin => plugin.docs.skills.map(doc => doc.meta.name)));
  for (const plugin of plugins) {
    // Claude features and library plugins share dist/claude/ and the Claude catalog.
    if (features.some(feature => feature.name === plugin.name && feature.harnesses.includes('claude'))) fail(`library/plugins/${plugin.name}: plugin name ${plugin.name} collides with the Claude feature features/${plugin.name}`);
  }

  for (const id of CLIENTS) {
    const config = JSON.parse((await input(`clients/${id}/config.json`)).toString());
    validateConfig(config, id);
    for (const skill of Object.keys(config.skillAttributes)) if (!skillNames.has(skill)) fail(`${id}: attributes for unknown skill: ${skill}`);
    for (const name of Object.keys(config.plugins)) if (!plugins.some(plugin => plugin.name === name)) fail(`${id}: plugin mapping for unknown plugin: ${name}`);
    for (const plugin of plugins) {
      const map = config.plugins[plugin.name];
      if (!map || typeof map !== 'object' || Array.isArray(map)) fail(`${id}: plugins.${plugin.name} mapping is required`);
      for (const key of Object.keys(map)) if (!PLUGIN_MAP_FIELDS.includes(key)) fail(`${id}: plugins.${plugin.name}: unknown field: ${key}`);
      for (const key of PLUGIN_MAP_FIELDS) if (typeof map[key] !== 'string' || !map[key]) fail(`${id}: plugins.${plugin.name}.${key} is required`);
    }
    if (id === 'codex' && Object.values(config.tools).some(value => value !== null)) fail('codex: plugin delegation cannot enforce native tool allowlists; use null tool profiles');
    const templates = {};
    for (const kind of ['agent', 'command', 'skill']) templates[kind] = (await input(`clients/${id}/templates/${kind}.md.hbs`)).toString();
    const mapped = (pattern, name) => render(pattern, { name }, `${id} name map`);
    const context = {
      client: config.values,
      library: { name: pkg.name, version: pkg.version },
      agents: Object.fromEntries(devtools.docs.agents.map(doc => [doc.meta.name, mapped(config.agentReference, doc.meta.name)])),
      commands: Object.fromEntries(devtools.docs.commands.map(doc => [doc.meta.name, mapped(config.commandReference, doc.meta.name)]))
    };
    // Each installable package has its own flat skill namespace.
    const skillClaimer = () => {
      const generatedSkills = new Set();
      return name => {
        if (!slug.test(name) || name.length > 64) fail(`${id}: invalid generated skill name: ${name}`);
        if (generatedSkills.has(name)) fail(`${id}: duplicate generated skill: ${name}`);
        generatedSkills.add(name);
      };
    };
    const claimSkill = skillClaimer();
    const docTemplate = (kind, source, meta, body, extra = {}) => render(templates[kind], {
      frontmatter: frontmatter(meta), source, body, ...extra
    }, `${id}/${kind}: ${source}`);
    const readDoc = (doc, values = context) => parseDocument(render(doc.text, values, doc.source), doc.source);
    /**
     * Emits each skill document and its resources under skillsDir/<generated name>/.
     * files are paths relative to sourceDir; only those belonging to docs are emitted.
     */
    const emitSkills = async ({ sourceDir, docs, files, names, skillsDir, values, attributes, claim }) => {
      for (const doc of docs) {
        const { meta, body } = readDoc(doc, values);
        const name = names[meta.name];
        claim(name);
        const native = { ...meta, name, ...(attributes[meta.name] ?? {}) };
        emit(`${skillsDir}/${name}/SKILL.md`, docTemplate('skill', doc.source, native, body));
      }
      const included = new Set(docs.map(doc => doc.meta.name));
      // A skill's evals/ folder holds its test suite and fixture code for authors.
      // Clients never use it, so it stays in the library and out of every package.
      for (const file of files.filter(file => included.has(file.split('/')[0]) && !file.endsWith('/SKILL.md.hbs') && file.split('/')[1] !== 'evals')) {
        const source = `${sourceDir}/${file}`;
        const bytes = await input(source);
        const [skill, ...parts] = file.split('/');
        const destination = `${skillsDir}/${names[skill]}/${parts.join('/')}`;
        // Git checkouts on Windows do not expose POSIX executable bits. Derive
        // executable scripts from their shebang so every host emits the same manifest.
        const mode = bytes.subarray(0, 2).toString() === '#!' ? 0o755 : 0o644;
        emit(destination.replace(/\.hbs$/, ''), file.endsWith('.hbs') ? render(bytes.toString(), values, source) : bytes, mode);
      }
    };

    const skillRoots = [];
    for (const plugin of plugins) {
      const pluginBase = pluginRoot(id, plugin.name);
      const claim = id === 'pi' ? claimSkill : skillClaimer();
      const map = config.plugins[plugin.name];
      const names = Object.fromEntries(plugin.docs.skills.map(doc => [doc.meta.name, mapped(map.skillName, doc.meta.name)]));
      const values = {
        ...context,
        agents: { ...context.agents, ...Object.fromEntries(plugin.docs.agents.map(doc => [doc.meta.name, mapped(config.agentReference, doc.meta.name)])) },
        commands: { ...context.commands, ...Object.fromEntries(plugin.docs.commands.map(doc => [doc.meta.name, mapped(config.commandReference, doc.meta.name)])) },
        skills: Object.fromEntries(plugin.docs.skills.map(doc => [doc.meta.name, mapped(map.skillReference, doc.meta.name)]))
      };
      skillRoots.push(`${pluginBase}/skills/`);
      for (const doc of plugin.docs.agents) {
        const { meta, body: originalBody } = readDoc(doc, values);
        const model = own(config.models, meta.modelProfile ?? 'inherit', `${id} model profile`);
        const tools = own(config.tools, meta.toolProfile ?? 'development', `${id} tool profile`);
        if (model !== null && (typeof model !== 'string' || !model)) fail(`${id}: model must be a string or null`);
        if (tools !== null && (!Array.isArray(tools) || tools.some(tool => typeof tool !== 'string'))) fail(`${id}: tools must be an array or null`);
        const name = mapped(config.agentName, meta.name);
        if (!slug.test(name) || name.length > 64) fail(`${id}: invalid generated agent name: ${name}`);
        const skills = (meta.skills ?? []).map(name => names[name]);
        const body = originalBody + (skills.length ? `\n\n## Required skills\n\nLoad these skills and resolve their resources relative to their skill directories: ${skills.join(', ')}.` : '');
        if (config.agentMode === 'delegation-skills') {
          claim(name);
          emit(`${pluginBase}/skills/${name}/SKILL.md`, docTemplate('agent', doc.source, { name, description: meta.description }, '', {
            name, model: model ?? '', delegation: config.values.delegation, requiredSkills: skills.join(', ')
          }));
          emit(`${pluginBase}/skills/${name}/references/prompt.md`, `<!-- Generated from ${doc.source}. -->\n\n${body}\n`);
          // Export only; Codex does not discover these merely because they are in a plugin.
          emit(`${pluginBase}/agents/${name}.toml`, TOML.stringify({ name, description: meta.description, ...(model ? { model } : {}), developer_instructions: body }));
        } else {
          const native = { ...config.agentDefaults, name, description: meta.description };
          if (model) native.model = model;
          if (tools) native.tools = tools.join(', ');
          if (meta.color) {
            const color = own(config.colors, meta.color, `${id} color`);
            if (color) native.color = color;
          }
          if (skills.length) native.skills = skills;
          emit(`${pluginBase}/agents/${name}.md`, docTemplate('agent', doc.source, native, body));
        }
      }
      for (const doc of plugin.docs.commands) {
        const { meta, body } = readDoc(doc, values);
        const name = mapped(config.commandName, meta.name);
        if (!slug.test(name) || name.length > 64) fail(`${id}: invalid generated command name: ${name}`);
        const native = { description: meta.description };
        if (meta.argumentHint) native['argument-hint'] = meta.argumentHint;
        if (id === 'codex') {
          claim(name);
          emit(`${pluginBase}/skills/${name}/SKILL.md`, docTemplate('command', doc.source, { name, ...native }, body));
          emit(`${pluginBase}/skills/${name}/agents/openai.yaml`, YAML.stringify({ policy: { allow_implicit_invocation: !meta.manualOnly } }));
        } else {
          emit(`${pluginBase}/${id === 'pi' ? 'prompts' : 'commands'}/${name}.md`, docTemplate('command', doc.source, native, body));
        }
      }
      await emitSkills({ sourceDir: `library/plugins/${plugin.name}/skills`, docs: plugin.docs.skills, files: plugin.files, names, skillsDir: `${pluginBase}/skills`, values, attributes: config.skillAttributes, claim });
    }
    for (const [file, output] of outputs) {
      if (!skillRoots.some(dir => file.startsWith(dir)) || !file.endsWith('/SKILL.md')) continue;
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

  // Claude feature folders are opaque and untemplated. Only plugin.json is rewritten, to stamp the release version.
  // Test files are development-only.
  const claudeExcluded = entry => /\.test\.tsx?$/.test(entry);
  const claudeFeatures = features.filter(feature => feature.harnesses.includes('claude')).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const feature of claudeFeatures) {
    const label = `features/${feature.name}/claude/.claude-plugin/plugin.json`;
    if (!feature.entries.includes('claude/.claude-plugin/plugin.json')) fail(`${label} is required`);
    // feature.json supplies the catalog entry's description.
    if (typeof feature.manifest.description !== 'string' || !feature.manifest.description.trim()) fail(`features/${feature.name}: feature.json description must be a non-empty string for Claude features`);
    for (const entry of feature.entries.filter(entry => entry.startsWith('claude/') && !claudeExcluded(entry))) {
      const bytes = await input(`features/${feature.name}/${entry}`);
      const destination = `${pluginRoot('claude', feature.name)}/${entry.slice('claude/'.length)}`;
      if (entry === 'claude/.claude-plugin/plugin.json') {
        let plugin;
        try { plugin = JSON.parse(bytes.toString()); }
        catch (error) { fail(`${label}: ${error.message}`); }
        if (plugin?.name !== feature.name) fail(`${label}: name ${JSON.stringify(plugin?.name)} must match the feature name ${JSON.stringify(feature.name)}`);
        emit(destination, json({ ...plugin, version: pkg.version }));
        continue;
      }
      const mode = bytes.subarray(0, 2).toString() === '#!' ? 0o755 : 0o644;
      emit(destination, bytes, mode);
    }
  }

  const identity = { name: 'devtools', version: pkg.version, description: pkg.description, author: typeof pkg.author === 'string' ? { name: pkg.author } : pkg.author, license: pkg.license, repository: pkg.repository };
  const codexSchema = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
  const codexEntry = (name, source) => ({ name, source: { source: 'local', path: source }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' });
  for (const plugin of plugins) {
    const pluginIdentity = { ...identity, name: plugin.name, description: plugin.description };
    emit(`${pluginRoot('claude', plugin.name)}/.claude-plugin/plugin.json`, json(pluginIdentity));
    emit(`${pluginRoot('codex', plugin.name)}/plugin.json`, json({ $schema: codexSchema, ...pluginIdentity }));
  }
  emit('.claude-plugin/marketplace.json', json({ name: pkg.name, owner: identity.author, plugins: [
    { name: devtools.name, source: `./${pluginRoot('claude', devtools.name)}`, description: devtools.description },
    ...claudeFeatures.map(feature => ({ name: feature.name, source: `./${pluginRoot('claude', feature.name)}`, description: feature.manifest.description })),
    ...plugins.filter(plugin => plugin.name !== 'devtools').map(plugin => ({ name: plugin.name, source: `./${pluginRoot('claude', plugin.name)}`, description: plugin.description }))
  ] }));
  emit('.agents/plugins/marketplace.json', json({
    name: pkg.name, interface: { displayName: 'Agent Marketplace' },
    plugins: plugins.map(plugin => codexEntry(plugin.name, `./${pluginRoot('codex', plugin.name)}`))
  }));
  emit('dist/pi/package.json', json({ name: pkg.name, version: pkg.version, description: pkg.description, license: pkg.license, repository: pkg.repository, keywords: ['pi-package'], files: ['agents', 'prompts', 'skills', 'extensions', 'library-version.json', 'LICENSE'], pi: { extensions: ['./extensions/*/index.mjs'], skills: ['./skills'], prompts: ['./prompts'], themes: [], subagents: { agents: ['./agents'] } } }));
  for (const file of ['LICENSE']) {
    const bytes = await input(file);
    emit(`dist/pi/${file}`, bytes);
    for (const plugin of plugins) for (const id of ['claude', 'codex']) emit(`${pluginRoot(id, plugin.name)}/${file}`, bytes);
    for (const feature of claudeFeatures) {
      const destination = `${pluginRoot('claude', feature.name)}/${file}`;
      if (!outputs.has(destination)) emit(destination, bytes);
    }
  }
  // No commit SHA/timestamps: identical source inputs always produce identical output.
  for (const file of ['package.json', 'scripts/lib/build.mjs']) await input(file);
  const inputsDigest = hash([...inputs].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([file, bytes]) => `${file}\0${hash(bytes)}\n`).join(''));
  for (const id of CLIENTS) emit(`dist/${id}/library-version.json`, json({ library: pkg.name, version: pkg.version, client: id, inputsDigest, agentMode: id === 'codex' ? 'delegation-skills' : 'native' }));
  emit('dist/manifest.json', json({ library: pkg.name, version: pkg.version, inputsDigest, counts: { ...Object.fromEntries(DOCUMENT_KINDS.map(kind => [kind, plugins.reduce((count, plugin) => count + plugin.docs[kind].length, 0)])), features: Object.fromEntries(FEATURE_HARNESSES.map(harness => [harness, features.filter(feature => feature.harnesses.includes(harness)).length])), plugins: plugins.length }, files: Object.fromEntries([...outputs].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([file, output]) => [file, { sha256: hash(output.bytes), mode: output.mode }])) }));
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
