#!/usr/bin/env node
/**
 * Builds the public site into site-dist/:
 *
 *   site-dist/          the landing page (site/), with its clips in site-dist/media/
 *   site-dist/play/     the game, built with base /play/
 *
 *   node scripts/build-site.mjs            build
 *   node scripts/build-site.mjs --deploy   build, then deploy to Cloudflare Pages (project voidwing)
 */
import { build } from 'vite';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'site-dist');
fs.rmSync(out, { recursive: true, force: true });

await build({ root, base: '/play/', logLevel: 'warn', build: { outDir: path.join(out, 'play'), emptyOutDir: true } });
fs.cpSync(path.join(root, 'site'), out, { recursive: true });
// The landing page uses the game's own font, straight from the npm package.
const fontDir = path.join(root, 'node_modules/@fontsource/chakra-petch/files');
fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });
for (const w of [400, 500, 700]) {
  fs.copyFileSync(path.join(fontDir, `chakra-petch-latin-${w}-normal.woff2`), path.join(out, 'fonts', `chakra-petch-${w}.woff2`));
}

const bytes = (dir) => fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((d) => d.isFile()).reduce((s, d) => s + fs.statSync(path.join(d.parentPath, d.name)).size, 0);
console.log(`site-dist: ${(bytes(out) / 1e6).toFixed(1)} MB`);
// Cloudflare Pages refuses files over 25 MiB.
for (const d of fs.readdirSync(out, { recursive: true, withFileTypes: true })) {
  const f = path.join(d.parentPath, d.name);
  if (d.isFile() && fs.statSync(f).size > 25 * 1024 * 1024) throw new Error(`${f} is over the 25 MiB Cloudflare Pages limit`);
}

if (process.argv.includes('--deploy')) {
  execSync('npx wrangler pages deploy site-dist --project-name voidwing --branch main --commit-dirty=true', { cwd: root, stdio: 'inherit' });
}
