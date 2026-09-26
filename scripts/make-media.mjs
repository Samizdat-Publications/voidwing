#!/usr/bin/env node
/**
 * Cuts the filmed runs into the landing page clips and the README GIFs.
 *
 *   npm run playtest -- --scenario win --god --preview --film --quality high --width 1920 --height 1080 --out test-output/film-win
 *   npm run playtest -- --scenario showcase --preview --nobuild --film --quality high --width 1920 --height 1080 --out test-output/film-showcase
 *   node scripts/make-media.mjs
 *
 *   (optional) the win run again with --nohud --out test-output/film-clean, for a HUD-free hero reel
 *
 * Writes site/media/ (MP4 clips, posters, the full run, chapters.json) and docs/media/ (GIFs).
 * Every clip is placed by a screenshot label from the run's film.json, so a new recording
 * re-cuts itself.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from 'ffmpeg-static';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteMedia = path.join(root, 'site/media');
const docsMedia = path.join(root, 'docs/media');
fs.mkdirSync(siteMedia, { recursive: true });
fs.mkdirSync(docsMedia, { recursive: true });

const runs = {};
// film-clean is the same mission recorded with --nohud, used for the hero reel when present.
for (const name of ['win', 'showcase', 'clean']) {
  const dir = path.join(root, `test-output/film-${name}`);
  if (name === 'clean' && !fs.existsSync(path.join(dir, 'film.json'))) continue;
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'film.json'), 'utf8'));
  runs[name] = { file: path.join(dir, 'film.mp4'), meta, at: (label) => {
    const m = meta.marks.find((x) => x.label === label);
    if (!m) throw new Error(`no mark "${label}" in film-${name}`);
    return m.t;
  } };
}
const win = runs.win;
const ff = (args) => execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

// name: clip file; run; label and offset (s) of the start; duration (s); poster offset from start.
const CLIPS = [
  { name: 'launch', run: 'win', label: 'launch', from: -1.5, dur: 6, poster: 2.5 },
  { name: 'dogfight', run: 'win', label: 'dogfight_close', from: -3.5, dur: 7, poster: 3.5 },
  { name: 'lock', run: 'win', label: 'missile_lock', from: -2, dur: 6.5, poster: 2 },
  { name: 'bombers', run: 'win', label: 'maul_close', from: -3, dur: 7, poster: 3 },
  { name: 'asteroid', run: 'showcase', label: 'asteroid_split', from: -3.2, dur: 6, poster: 3.4 },
  { name: 'carrier', run: 'win', label: 'capital_warp', from: -0.8, dur: 8, poster: 5 },
  { name: 'generators', run: 'win', label: 'generator_down', from: -4.5, dur: 7, poster: 4.3 },
  { name: 'breakup', run: 'win', label: 'finale_chain', from: -3, dur: 11, poster: 8 },
];
// The hero reel: the most readable moments, cut together.
const HERO = ['dogfight', 'bombers', 'carrier', 'breakup'];
// README GIFs: small, short, a lower frame rate.
const GIFS = ['dogfight', 'lock', 'asteroid', 'generators', 'breakup'];
const only = process.argv.slice(2);
const want = (k) => !only.length || only.includes(k);

const x264 = (crf) => ['-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an'];

for (const c of CLIPS) {
  const r = runs[c.run];
  c.start = Math.max(0, r.at(c.label) + c.from);
  c.src = r.file;
  if (!want('clips')) continue;
  const out = path.join(siteMedia, `${c.name}.mp4`);
  ff(['-ss', c.start.toFixed(3), '-t', String(c.dur), '-i', c.src, '-vf', 'scale=1280:-2:flags=lanczos', ...x264(23), out]);
  ff(['-ss', (c.start + c.poster).toFixed(3), '-i', c.src, '-frames:v', '1', '-vf', 'scale=1280:-2:flags=lanczos', '-q:v', '3', path.join(siteMedia, `${c.name}.jpg`)]);
  console.log(`clip ${c.name}: ${c.start.toFixed(1)} s +${c.dur}, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
}

// Hero reel, trimmed parts of the clips with short fades between them.
if (want('hero')) {
  // Each part trimmed to its best 6.5 s (8 s for the finale), centred on its poster frame.
  const parts = HERO.map((n) => {
    let c = CLIPS.find((x) => x.name === n);
    if (runs.clean) c = { ...c, src: runs.clean.file, start: Math.max(0, runs.clean.at(c.label) + c.from) };
    const dur = Math.min(c.dur, n === 'breakup' ? 8 : 6.5);
    const start = c.start + Math.max(0, Math.min(c.poster - dur / 2, c.dur - dur));
    return { ...c, start, dur, poster: c.start + c.poster - start };
  });
  const inputs = parts.flatMap((c) => ['-ss', c.start.toFixed(3), '-t', String(c.dur), '-i', c.src]);
  const fade = 0.4;
  let filter = '';
  let prev = '[0:v]';
  let offset = parts[0].dur - fade;
  for (let i = 1; i < parts.length; i++) {
    const outLabel = i === parts.length - 1 ? '[v]' : `[x${i}]`;
    filter += `${prev}[${i}:v]xfade=transition=fade:duration=${fade}:offset=${offset.toFixed(3)}${outLabel};`;
    prev = outLabel;
    offset += parts[i].dur - fade;
  }
  filter = filter.replace(/;$/, '');
  ff([...inputs, '-filter_complex', `${filter};[v]scale=1600:-2:flags=lanczos[s]`, '-map', '[s]', ...x264(26), '-maxrate', '2600k', '-bufsize', '5200k', path.join(siteMedia, 'hero.mp4')]);
  const d = parts[0];
  ff(['-ss', (d.start + d.poster).toFixed(3), '-i', d.src, '-frames:v', '1', '-q:v', '3', path.join(siteMedia, 'hero.jpg')]);
  // Share card image.
  ff(['-ss', (d.start + d.poster).toFixed(3), '-i', d.src, '-frames:v', '1', '-vf', 'scale=1200:-2', '-q:v', '4', path.join(siteMedia, 'og.jpg')]);
  console.log(`hero reel: ${(fs.statSync(path.join(siteMedia, 'hero.mp4')).size / 1e6).toFixed(1)} MB`);
}

// The full run, uncut, at 720p (Cloudflare Pages caps a file at 25 MiB).
if (want('run')) {
  const out = path.join(siteMedia, 'mission.mp4');
  ff(['-i', win.file, '-vf', 'scale=1280:-2:flags=lanczos', ...x264(27), '-maxrate', '850k', '-bufsize', '1700k', out]);
  ff(['-ss', String(win.at('dogfight_close')), '-i', win.file, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '3', path.join(siteMedia, 'mission.jpg')]);
  console.log(`full run: ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
}

// README GIFs: 560 px wide, 12 fps, 4 s, one palette per clip (GitHub shows them inline; keep each
// to a few MB).
for (const n of want('gifs') ? GIFS : []) {
  const c = CLIPS.find((x) => x.name === n);
  const out = path.join(docsMedia, `${n}.gif`);
  const dur = Math.min(c.dur, 4);
  const start = c.start + Math.max(0, Math.min(c.poster - 2, c.dur - dur));
  ff(['-ss', start.toFixed(3), '-t', String(dur), '-i', c.src, '-vf',
    'fps=12,scale=560:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle', out]);
  console.log(`gif ${n}: ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
}

// Chapter data for the page: stop times and the flight recorder's marks.
const kinds = {
  launch: ['Launch', 'friend', 'Void One and two wingmen leave the carrier group.'],
  missile_lock: ['Wave 1 and the first lock', 'good', 'Two Razors, then two more. The lock builds while the target stays centred.'],
  asteroid_split: ['Wave 1 cleared, a rock splits', 'warn', 'Shot rocks break into smaller ones.'],
  dogfight_close: ['Wave 2: Razors and Mauls', 'foe', 'A Razor at close range; the bombers come in pincer pairs.'],
  maul_close: ['A Maul up close', 'foe', 'Heavy plasma on long strafing runs.'],
  wave3_swarm: ['Wave 3', 'foe', 'Razors and Mauls together.'],
  capital_warp: ['The Leviathan jumps in', 'objective', 'The carrier arrives behind its shield.'],
  generator_down: ['First generator down', 'objective', 'One of four, on pylons outside the shield bubble.'],
  finale_chain: ['Chain reaction', 'objective', 'The last generator goes and the carrier comes apart.'],
  victory_screen: ['Mission report', 'friend', 'Time, kills, accuracy and a rank.'],
};
const marks = {};
for (const m of win.meta.marks) if (!m.label.startsWith('phase:') && !(m.label in marks)) marks[m.label] = Math.round(m.t * 10) / 10;
marks.asteroid_split_showcase = Math.round(runs.showcase.at('asteroid_split') * 10) / 10;
const recorder = Object.entries(kinds).filter(([k]) => k in marks).map(([k, [label, kind, note]]) => ({ t: marks[k], label, kind, note })).sort((a, b) => a.t - b.t);
const chapters = { duration: Math.round((win.meta.frames / win.meta.fps) * 10) / 10, marks, recorder };
fs.writeFileSync(path.join(siteMedia, 'chapters.json'), JSON.stringify(chapters, null, 2));
console.log('chapters.json:', recorder.length, 'marks');

// Build history stills for the "How it was made" strip.
const progress = {
  m1: 'docs/progress/m1-greybox/03-dogfight.png',
  m2: 'docs/progress/m2-assets/02-dogfight.png',
  m3: 'docs/progress/m3-feel/02-dogfight-lasers.png',
  m4: 'docs/progress/m4-ui/05-combat-target-view.png',
  m5: 'docs/progress/m5-polish/02-carrier-arrival.png',
};
for (const [k, src] of Object.entries(progress)) {
  ff(['-i', path.join(root, src), '-vf', 'scale=640:-2:flags=lanczos', '-q:v', '4', path.join(siteMedia, `progress-${k}.jpg`)]);
}
console.log('done');
