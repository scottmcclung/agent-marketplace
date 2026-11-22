import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { generate, check, write } from '../scripts/lib/build.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const built = await generate(root);
const json = file => {
  assert.ok(built.has(file), `Missing ${file}`);
  return JSON.parse(built.get(file).bytes);
};
const hosts = {
  claude: { catalog: '.claude-plugin/marketplace.json', plugins: ['devtools', 'sfdc', 'statusline'], manifest: '.claude-plugin/plugin.json', source: plugin => plugin.source },
  codex: { catalog: '.agents/plugins/marketplace.json', plugins: ['devtools', 'sfdc'], manifest: 'plugin.json', source: plugin => plugin.source.path }
};

async function fixture(t) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-marketplace-layout-test-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  for (const entry of ['library', 'clients', 'features', 'scripts', 'package.json', 'LICENSE']) {
    await fs.cp(path.join(root, entry), path.join(temp, entry), { recursive: true });
  }
  return temp;
}

for (const [host, config] of Object.entries(hosts)) {
  test(`${host} contains only plugin roots and the host version stamp`, async () => {
    const prefix = `dist/${host}/`;
    const children = [...new Set([...built.keys()].filter(file => file.startsWith(prefix)).map(file => file.slice(prefix.length).split('/')[0]))].sort();
    assert.deepEqual(children, ['library-version.json', ...config.plugins].sort());
    const stamp = json(`${prefix}library-version.json`);
    assert.equal(stamp.client, host);
    assert.equal(stamp.inputsDigest, json('dist/manifest.json').inputsDigest);
    for (const name of config.plugins) assert.ok(!built.has(`${prefix}${name}/library-version.json`), 'version stamps belong to hosts, not individual plugins');
  });

  test(`${host} catalog sources resolve to matching plugin manifests and local licenses`, async () => {
    const catalog = json(config.catalog);
    assert.deepEqual(catalog.plugins.map(plugin => plugin.name).sort(), config.plugins);
    const license = await fs.readFile(path.join(root, 'LICENSE'));
    for (const plugin of catalog.plugins) {
      const expected = `dist/${host}/${plugin.name}`;
      assert.equal(config.source(plugin), `./${expected}`, `${plugin.name} catalog source`);
      const manifest = json(`${expected}/${config.manifest}`);
      assert.equal(manifest.name, plugin.name);
      assert.equal(manifest.version, json(`dist/${host}/library-version.json`).version);
      assert.ok(built.has(`${expected}/LICENSE`), `${plugin.name} needs a plugin-local LICENSE`);
      assert.deepEqual(built.get(`${expected}/LICENSE`), { bytes: license, mode: 0o644 });
      if (host === 'codex') {
        assert.equal(plugin.source.source, 'local');
        assert.equal(manifest.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
      }
    }
  });
}

test('no retired plugin containers or flat Claude/Codex payloads are generated', () => {
  const retired = [...built.keys()].filter(file => /^dist\/(claude-plugins|codex-plugins)\//.test(file)
    || /^dist\/(claude|codex)\/(agents|commands|skills|prompts|\.claude-plugin)\//.test(file)
    || /^dist\/(claude|codex)\/plugin\.json$/.test(file));
  assert.deepEqual(retired, []);
  assert.deepEqual([...built.keys()].filter(file => /^dist\/pi\/(devtools|sfdc)\//.test(file) || file.startsWith('dist/pi-plugins/')), [], 'Pi keeps its merged package layout');
});

test('check reports retired layouts as stale without changing them and write removes them', async t => {
  const temp = await fixture(t);
  await write(temp, built);
  const retired = [
    'dist/claude-plugins/sfdc/retired.txt',
    'dist/claude-plugins/statusline/retired.txt',
    'dist/codex-plugins/sfdc/retired.txt',
    'dist/claude/agents/retired.md',
    'dist/claude/commands/retired.md',
    'dist/claude/skills/retired/SKILL.md',
    'dist/claude/.claude-plugin/plugin.json',
    'dist/codex/agents/retired.toml',
    'dist/codex/skills/retired/SKILL.md',
    'dist/codex/plugin.json'
  ];
  for (const file of retired) {
    await fs.mkdir(path.dirname(path.join(temp, file)), { recursive: true });
    await fs.writeFile(path.join(temp, file), 'retired layout\n');
  }
  const differences = await check(temp, built);
  for (const file of retired) {
    assert.ok(differences.includes(`stale: ${file}`), file);
    assert.equal(await fs.readFile(path.join(temp, file), 'utf8'), 'retired layout\n', 'check must not write');
  }
  await write(temp, built);
  assert.deepEqual(await check(temp, built), []);
  for (const file of retired) await assert.rejects(fs.access(path.join(temp, file)), { code: 'ENOENT' });
  for (const dir of ['dist/claude-plugins', 'dist/codex-plugins']) await assert.rejects(fs.access(path.join(temp, dir)), { code: 'ENOENT' });
});

test('release archives keep their names and package catalog plugin roots, not host containers', async t => {
  const temp = await fixture(t);
  // Reuse installed build dependencies. Packaging runs only inside this temporary repository.
  await fs.symlink(path.join(root, 'node_modules'), path.join(temp, 'node_modules'), 'dir');
  await write(temp, built);
  execFileSync(process.execPath, ['scripts/package.mjs'], {
    cwd: temp,
    env: { ...process.env, GITHUB_REF_TYPE: '', GITHUB_REF_NAME: '', npm_config_cache: path.join(temp, 'npm-cache'), npm_config_offline: 'true' },
    stdio: 'pipe'
  });
  const pkg = JSON.parse(await fs.readFile(path.join(temp, 'package.json'), 'utf8'));
  const archiveName = (host, name) => `${pkg.name}${name === 'devtools' ? '' : `-${name}`}-${host}-${pkg.version}.tar.gz`;
  const expected = ['SHA256SUMS', `${pkg.name}-${pkg.version}.tgz`];
  for (const [host, config] of Object.entries(hosts)) {
    for (const name of config.plugins) expected.push(archiveName(host, name));
  }
  const artifacts = path.join(temp, 'artifacts');
  assert.deepEqual((await fs.readdir(artifacts)).sort(), expected.sort(), 'there is no extra host-container archive');
  for (const [host, config] of Object.entries(hosts)) {
    for (const plugin of json(config.catalog).plugins) {
      await t.test(`${host}/${plugin.name} archive starts at its catalog source`, () => {
        const archive = path.join(artifacts, archiveName(host, plugin.name));
        const files = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).split('\n')
          .filter(file => file && !file.endsWith('/')).map(file => file.replace(/^\.\//, '')).sort();
        const prefix = `${config.source(plugin).replace(/^\.\//, '')}/`;
        const fromCatalog = [...built.keys()].filter(file => file.startsWith(prefix)).map(file => file.slice(prefix.length)).sort();
        assert.deepEqual(files, fromCatalog, 'archive payload comes from the catalog plugin root');
        assert.ok(files.includes(config.manifest), 'plugin manifest is at the archive root');
        assert.ok(files.includes('LICENSE'), 'archive carries its own license');
        assert.ok(!files.includes('library-version.json'), 'the host version stamp is not a plugin payload');
        assert.deepEqual(files.filter(file => /^(devtools|sfdc|statusline)\//.test(file)), [], 'archives do not wrap sibling plugins');
        assert.deepEqual(JSON.parse(execFileSync('tar', ['-xOzf', archive, `./${config.manifest}`], { encoding: 'utf8' })), json(`${prefix}${config.manifest}`));
      });
    }
  }
});
