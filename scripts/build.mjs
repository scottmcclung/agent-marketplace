#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { generate, check, write } from './lib/build.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--check') || args.length > 1) throw new Error('Usage: npm run build | npm run check');
  const outputs = await generate(root);
  if (args.includes('--check')) {
    const differences = await check(root, outputs);
    if (differences.length) throw new Error(`Generated files are out of date. Run npm run build:\n${differences.join('\n')}`);
    console.log(`Verified ${outputs.size} generated files.`);
  } else {
    await write(root, outputs);
    console.log(`Built ${outputs.size} files for Claude Code, Codex, and Pi.`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
