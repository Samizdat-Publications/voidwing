#!/usr/bin/env node
/**
 * VOID WING headless self-test.
 *
 *   node scripts/playtest.mjs --scenario win|lose|smoke [--god] [--headed] [--preview]
 *                             [--out dir] [--width 1280 --height 720] [--diff easy|normal|hard]
 *
 * Starts a Vite server, opens the game in Chromium (GPU accelerated when available), plays it
 * with real mouse and keyboard input steered by a simple bot, captures screenshots from the
 * player camera at key moments and records console output. Writes report.json to the out dir.
 */
import { chromium } from 'playwright';
import { createServer, preview, build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};

const scenario = opt('scenario', 'smoke');
const width = Number(opt('width', 1280));
const height = Number(opt('height', 720));
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.resolve(root, opt('out', `test-output/${scenario}-${stamp}`));
const maxMinutes = Number(opt('max-minutes', scenario === 'win' ? 16 : 6));
fs.mkdirSync(outDir, { recursive: true });

const log = (...a) => console.log(`[playtest ${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const t0 = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let server;
let baseUrl;
if (flag('preview')) {
  await build({ root, logLevel: 'warn' });
  server = await preview({ root, preview: { port: 4199, strictPort: false }, logLevel: 'warn' });
  baseUrl = server.resolvedUrls.local[0];
} else {
  server = await createServer({ root, server: { port: 5199, strictPort: false }, logLevel: 'warn' });
  await server.listen();
  baseUrl = server.resolvedUrls.local[0];
}
log('server', baseUrl);

const browser = await chromium.launch({
  headless: !flag('headed'),
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });

const consoleLog = [];
page.on('console', (m) => consoleLog.push({ type: m.type(), text: m.text(), t: (Date.now() - t0) / 1000 }));
page.on('pageerror', (e) => consoleLog.push({ type: 'pageerror', text: String(e && e.stack ? e.stack : e), t: (Date.now() - t0) / 1000 }));

const params = new URLSearchParams({ test: '1', seed: opt('seed', '1337') });
if (flag('god')) params.set('god', '1');
if (opt('diff')) params.set('diff', opt('diff'));
if (opt('phase')) params.set('phase', opt('phase'));
await page.goto(`${baseUrl}?${params}`);
await page.waitForFunction(() => window.__VW && window.__VW.state().gameState === 'title', null, { timeout: 60000 });
log('title screen reached');

const shots = [];
let shotN = 0;
async function shot(label) {
  shotN++;
  const file = `${String(shotN).padStart(2, '0')}_${label}.png`;
  await page.screenshot({ path: path.join(outDir, file) });
  const st = await state();
  shots.push({ file, label, t: (Date.now() - t0) / 1000, phase: st.phase, gameState: st.gameState });
  log('shot', file);
}
const state = () => page.evaluate(() => window.__VW.state());

const perf = [];
const timeline = [];
let lastPhaseKey = '';

// ---------- bot ----------
const cx = width / 2, cy = height / 2;
const bot = { mx: cx, my: cy, firing: false, boosting: false, lastMissile: 0, passive: false };
async function releaseAll() {
  if (bot.firing) await page.mouse.up();
  if (bot.boosting) await page.keyboard.up('Shift');
  bot.firing = bot.boosting = false;
}

async function botStep(st) {
  const a = st.aim;
  if (!a || st.gameState !== 'playing') {
    await releaseAll();
    return;
  }
  // Mouse: steer the aim ring onto the lead point.
  let dx = (a.dYaw / st.radPerPx) * 0.85;
  let dy = (-a.dPitch / st.radPerPx) * 0.85;
  dx = clamp(dx, -150, 150);
  dy = clamp(dy, -150, 150);
  if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
    bot.mx += dx;
    bot.my += dy;
    await page.mouse.move(bot.mx, bot.my);
  }
  // Re-center the virtual cursor with a jump the game ignores as a spurious spike.
  if (Math.abs(bot.mx - cx) > 4000 || Math.abs(bot.my - cy) > 4000) {
    bot.mx = cx;
    bot.my = cy;
    await page.mouse.move(cx, cy);
  }
  const wantFire = !bot.passive && a.noseErr < 0.075 && a.dist < 850;
  if (wantFire !== bot.firing) {
    if (wantFire) await page.mouse.down();
    else await page.mouse.up();
    bot.firing = wantFire;
  }
  const wantBoost = a.dist > 1300 && st.player && st.player.boost > 25;
  if (wantBoost !== bot.boosting) {
    if (wantBoost) await page.keyboard.down('Shift');
    else await page.keyboard.up('Shift');
    bot.boosting = wantBoost;
  }
  if (!bot.passive && st.locked && Date.now() - bot.lastMissile > 1400) {
    await page.keyboard.press('f');
    bot.lastMissile = Date.now();
  }
}

function track(st) {
  const key = `${st.gameState}|${st.phase}|${st.wave}`;
  if (key !== lastPhaseKey) {
    lastPhaseKey = key;
    timeline.push({ t: (Date.now() - t0) / 1000, gameState: st.gameState, phase: st.phase, wave: st.wave, objective: st.objective, player: st.player });
    log('phase', key, st.objective);
  }
}

const once = new Set();
async function shotOnce(label, cond) {
  if (!once.has(label) && cond) {
    once.add(label);
    await shot(label);
  }
}

async function runMission({ passive = false } = {}) {
  bot.passive = passive;
  const deadline = Date.now() + maxMinutes * 60000;
  let phaseEnteredAt = Date.now();
  let lastPhase = '';
  let lastPerf = 0;
  let firstGeneratorLeft = -1;
  let criticalShot = false;
  while (Date.now() < deadline) {
    const st = await state();
    track(st);
    if (st.phase !== lastPhase) {
      lastPhase = st.phase;
      phaseEnteredAt = Date.now();
    }
    const inPhase = (Date.now() - phaseEnteredAt) / 1000;
    if (Date.now() - lastPerf > 3000 && st.gameState === 'playing') {
      lastPerf = Date.now();
      perf.push({ t: (Date.now() - t0) / 1000, fps: st.fps, frameMs: st.frameMs, calls: st.render.calls, tris: st.render.triangles, phase: st.phase });
    }
    if (st.gameState === 'playing') {
      await shotOnce('launch', st.phase === 'intro' && inPhase > 1.5);
      await shotOnce('wave1_combat', st.wave === 1 && st.phase === 'wave' && st.aim && st.aim.dist < 450);
      await shotOnce('dogfight_close', st.phase === 'wave' && st.aim && st.aim.dist < 220 && st.aim.noseErr < 0.3);
      await shotOnce('missile_lock', st.locked);
      await shotOnce('wave2_bombers', st.wave === 2 && st.phase === 'wave' && ((st.target && st.target.kind === 'maul' && st.aim && st.aim.dist < 600) || inPhase > 30));
      await shotOnce('wave3_swarm', st.wave === 3 && st.phase === 'wave' && inPhase > 10);
      await shotOnce('wave_cleared', st.phase === 'break' && inPhase > 1);
      await shotOnce('capital_arrival', st.phase === 'capital' && inPhase > 3.5);
      if (st.capital && firstGeneratorLeft < 0 && st.phase === 'capital') firstGeneratorLeft = st.capital.generatorsLeft;
      await shotOnce('generator_attack', st.phase === 'capital' && st.target && st.target.kind === 'generator' && st.aim && st.aim.dist < 650);
      await shotOnce('generator_down', st.phase === 'capital' && st.capital && st.capital.generatorsLeft < firstGeneratorLeft);
      if (!criticalShot && st.player && st.player.hull < 30 && st.player.alive) {
        criticalShot = true;
        await shot('hull_critical');
      }
    }
    if (st.gameState === 'finale') {
      await shotOnce('finale_chain', inPhase > 2.5);
      await shotOnce('finale_blast', inPhase > 7.2);
    }
    if (st.gameState === 'dying') await shotOnce('death_cam', true);
    if (st.gameState === 'victory') {
      await releaseAll();
      await sleep(1200);
      await shot('victory_screen');
      return 'victory';
    }
    if (st.gameState === 'gameover') {
      await releaseAll();
      await sleep(900);
      await shot('gameover_screen');
      return 'gameover';
    }
    await botStep(st);
    await sleep(35);
  }
  await releaseAll();
  return 'timeout';
}

let outcome = 'none';
try {
  await sleep(1500);
  await shot('title');
  await page.click('.screen.show [data-action="launch"]');
  await page.mouse.move(cx, cy);
  await sleep(300);
  const locked = await page.evaluate(() => document.pointerLockElement !== null);
  log('pointer lock after launch:', locked);

  if (scenario === 'smoke') {
    await sleep(3000);
    await shot('smoke_flight');
    await page.keyboard.press('Escape');
    await sleep(600);
    await shot('pause_menu');
    await page.click('.screen.show [data-action="resume"]');
    await sleep(1500);
    outcome = (await state()).gameState;
  } else if (scenario === 'win') {
    outcome = await runMission();
  } else if (scenario === 'lose') {
    outcome = await runMission({ passive: true });
    if (outcome === 'gameover') {
      await page.click('.screen.show [data-action="retry"]');
      await sleep(2500);
      const st = await state();
      log('after retry:', st.gameState, st.phase);
      await shot('after_retry');
      timeline.push({ t: (Date.now() - t0) / 1000, event: 'retry', gameState: st.gameState, phase: st.phase });
    }
  }
} catch (e) {
  log('ERROR', e);
  outcome = `error: ${e.message}`;
  try {
    await shot('error_state');
  } catch {}
}

const finalState = await state().catch(() => null);
const errors = consoleLog.filter((m) => m.type === 'error' || m.type === 'pageerror');
const warnings = consoleLog.filter((m) => m.type === 'warning');
const fpsVals = perf.map((p) => p.fps);
const report = {
  scenario,
  outcome,
  seconds: (Date.now() - t0) / 1000,
  url: baseUrl,
  viewport: { width, height },
  shots,
  timeline,
  perf: {
    samples: perf,
    minFps: fpsVals.length ? Math.min(...fpsVals) : null,
    avgFps: fpsVals.length ? Math.round(fpsVals.reduce((a, b) => a + b, 0) / fpsVals.length) : null,
    maxCalls: perf.length ? Math.max(...perf.map((p) => p.calls)) : null,
    maxTris: perf.length ? Math.max(...perf.map((p) => p.tris)) : null,
  },
  console: { errors, warnings, count: consoleLog.length },
  finalState,
};
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(outDir, 'console.log'), consoleLog.map((m) => `[${m.t.toFixed(1)}] ${m.type}: ${m.text}`).join('\n'));
log(`outcome=${outcome} errors=${errors.length} warnings=${warnings.length} shots=${shots.length} avgFps=${report.perf.avgFps} minFps=${report.perf.minFps}`);
log('out:', outDir);
await browser.close();
await server.close?.();
if (server.httpServer) server.httpServer.close();
process.exit(0);
