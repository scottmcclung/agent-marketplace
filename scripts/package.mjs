#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { generate, check } from './lib/build.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  const differences = await check(root, await generate(root));
  if (differences.length) throw new Error('Generated output is stale; run npm run build first.');
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${pkg.version}`) {
    throw new Error(`Tag ${process.env.GITHUB_REF_NAME} does not match v${pkg.version}`);
  }
  const artifacts = path.join(root, 'artifacts');
  await fs.rm(artifacts, { recursive: true, force: true });
  await fs.mkdir(artifacts);
  for (const client of ['claude', 'codex']) {
    execFileSync('tar', ['-czf', path.join(artifacts, `${pkg.name}-${client}-${pkg.version}.tar.gz`), '-C', path.join(root, 'dist', client), '.'], { stdio: 'inherit' });
  }
  // Generated Pi package has no lifecycle scripts or build dependencies.
  execFileSync('npm', ['pack', './dist/pi', '--pack-destination', artifacts], { cwd: root, stdio: 'inherit' });
  const checksums = [];
  for (const file of (await fs.readdir(artifacts)).sort()) {
    const digest = crypto.createHash('sha256').update(await fs.readFile(path.join(artifacts, file))).digest('hex');
    checksums.push(`${digest}  ${file}`);
  }
  await fs.writeFile(path.join(artifacts, 'SHA256SUMS'), checksums.join('\n') + '\n');
  console.log(`Release ${pkg.version} artifacts: ${artifacts}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
