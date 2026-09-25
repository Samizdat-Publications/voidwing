#!/usr/bin/env node
/**
 * Rebuild every GLB in public/assets from blender_scripts/ with Blender in background mode.
 *
 *   npm run assets                      # all families
 *   npm run assets -- capital_ship      # just one (asteroids, player_ship, enemy_ships, capital_ship, ordnance)
 *
 * Blender is found from BLENDER_PATH, then the default Windows / macOS / Linux install locations.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidates = [
  process.env.BLENDER_PATH,
  'C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe',
  '/Applications/Blender.app/Contents/MacOS/Blender',
  '/usr/bin/blender',
  '/snap/bin/blender',
].filter(Boolean);

const blender = candidates.find((p) => fs.existsSync(p));
if (!blender) {
  console.error('Blender not found. Set BLENDER_PATH to the Blender executable (5.1 recommended).');
  process.exit(1);
}
const families = process.argv.slice(2);
const args = ['-b', '--factory-startup', '-noaudio', '--python-exit-code', '1', '--python', path.join(root, 'blender_scripts', 'build_all.py')];
if (families.length) args.push('--', ...families);
console.log(`Using ${blender}`);
const res = spawnSync(blender, args, { cwd: root, stdio: 'inherit' });
process.exit(res.status ?? 1);
