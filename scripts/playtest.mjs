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
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const log = (...a) => console.log(`[playtest ${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const t0 = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let server;
let baseUrl;
if (flag('preview')) {
  // --nobuild reuses dist/ so several scenarios can run in parallel against one build.
  if (!flag('nobuild')) await build({ root, logLevel: 'warn' });
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
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });

const consoleLog = [];
page.on('console', (m) => consoleLog.push({ type: m.type(), text: m.text(), t: (Date.now() - t0) / 1000 }));
page.on('pageerror', (e) => consoleLog.push({ type: 'pageerror', text: String(e && e.stack ? e.stack : e), t: (Date.now() - t0) / 1000 }));

const params = new URLSearchParams({ test: '1', seed: opt('seed', '1337') });
if (flag('god')) params.set('god', '1');
if (opt('diff')) params.set('diff', opt('diff'));
if (opt('phase')) params.set('phase', opt('phase'));
if (opt('quality')) params.set('quality', opt('quality'));
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
// Worst single frame (ms) while flying: the game hands over its worst frame since the last read.
let worstWindow = 0;
let worstOverall = 0;
const state = async () => {
  const st = await page.evaluate(() => window.__VW.state());
  if (st && typeof st.worstFrameMs === 'number') {
    worstWindow = Math.max(worstWindow, st.worstFrameMs);
    worstOverall = Math.max(worstOverall, st.worstFrameMs);
  }
  return st;
};

const perf = [];
const audioSeen = { maxLevel: 0, modes: new Set(), states: new Set() };
function trackAudio(st) {
  if (!st || !st.audio) return;
  audioSeen.maxLevel = Math.max(audioSeen.maxLevel, st.audio.level);
  audioSeen.modes.add(st.audio.music);
  audioSeen.states.add(st.audio.state);
}
const timeline = [];
let lastPhaseKey = '';

// ---------- bot ----------
const cx = width / 2, cy = height / 2;
const bot = { mx: cx, my: cy, firing: false, boosting: false, lastMissile: 0, passive: false, showcased: false };
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
  // The lose run is a pilot who neither shoots nor dodges: it holds its course.
  if (bot.passive) return;
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
  // Let the first bomber come in close for its screenshot before shooting it down.
  const holdForMaul = !once.has('maul_close') && st.target && st.target.kind === 'maul' && a.dist > 240 && a.dist < 800;
  const wantFire = !bot.passive && !holdForMaul && a.noseErr < 0.075 && a.dist < 850;
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
  if (!bot.passive && !holdForMaul && st.locked && Date.now() - bot.lastMissile > 1400) {
    await page.keyboard.press('f');
    bot.lastMissile = Date.now();
  }
}


// Boost and asteroid-splitting showcase, run once during the first wave break.
async function showcase(maxDist = 520, timeoutMs = 9000) {
  await releaseAll();
  await page.keyboard.down('Shift');
  await sleep(1300);
  await shot('boost');
  await page.keyboard.up('Shift');
  // Ease off the throttle so the ship can turn onto a rock instead of orbiting it.
  await page.keyboard.down('KeyS');
  await sleep(450);
  await page.keyboard.up('KeyS');
  const deadline = Date.now() + timeoutMs;
  let fired = false;
  let picked = false;
  let boosting = false;
  let braking = false;
  let lastLog = 0;
  while (Date.now() < deadline) {
    const a = await page.evaluate(([md, keep]) => window.__VW.asteroidAim(md, keep), [maxDist, picked]);
    const st = await state();
    if (st.gameState !== 'playing') break;
    if (!a) {
      // The picked rock is gone: it split. Let the fragments and dust spread, then shoot.
      if (picked && !(await page.evaluate(() => window.__VW.showcaseRockAlive()))) {
        if (fired) await page.mouse.up();
        fired = false;
        await sleep(450);
        await shot('asteroid_split');
      }
      break;
    }
    picked = true;
    if (Date.now() - lastLog > 1000) {
      lastLog = Date.now();
      log(`showcase rock ${a.dist.toFixed(0)} m, nose ${a.noseErr.toFixed(3)}, firing ${fired}`);
    }
    // Boost in until close, so the split happens near the camera.
    const wantBoost = a.dist > 620;
    if (wantBoost !== boosting) {
      if (wantBoost) await page.keyboard.down('Shift');
      else await page.keyboard.up('Shift');
      boosting = wantBoost;
    }
    const dx = clamp((a.dYaw / st.radPerPx) * 0.85, -150, 150);
    const dy = clamp((-a.dPitch / st.radPerPx) * 0.85, -150, 150);
    bot.mx += dx;
    bot.my += dy;
    await page.mouse.move(bot.mx, bot.my);
    // Close and off target: slow down to tighten the turn rather than circling the rock.
    const wantBrake = a.noseErr > 0.35 && a.dist < 280;
    if (wantBrake !== braking) {
      if (wantBrake) await page.keyboard.down('KeyS');
      else await page.keyboard.up('KeyS');
      braking = wantBrake;
    }
    // Fire from outside the collision assist's look-ahead, or the ship steers off the rock. The
    // tolerance follows the rock's size on screen.
    const want = a.noseErr < Math.max(0.05, Math.atan(a.radius / Math.max(a.dist, 1)) * 0.7) && a.dist < 240;
    if (want !== fired) {
      if (want) await page.mouse.down();
      else await page.mouse.up();
      fired = want;
    }
    await sleep(35);
  }
  if (fired) await page.mouse.up();
  if (boosting) await page.keyboard.up('Shift');
  if (braking) await page.keyboard.up('KeyS');
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
  let generatorDownAt = 0;
  let criticalShot = false;
  let lastShield = -1;
  let dyingAt = 0;
  while (Date.now() < deadline) {
    const st = await state();
    track(st);
    trackAudio(st);
    if (st.phase !== lastPhase) {
      lastPhase = st.phase;
      phaseEnteredAt = Date.now();
    }
    const inPhase = (Date.now() - phaseEnteredAt) / 1000;
    if (Date.now() - lastPerf > 3000 && st.gameState === 'playing') {
      lastPerf = Date.now();
      perf.push({ t: (Date.now() - t0) / 1000, fps: st.fps, frameMs: st.frameMs, worstMs: Math.round(worstWindow), heapMB: st.heapMB, calls: st.render.calls, tris: st.render.triangles, phase: st.phase, quality: st.quality });
      worstWindow = 0;
    }
    if (st.gameState === 'playing') {
      await shotOnce('launch', st.phase === 'intro' && inPhase > 1.5);
      await shotOnce('wave1_combat', st.wave === 1 && st.phase === 'wave' && st.aim && st.aim.dist < 350);
      await shotOnce('dogfight_close', st.phase === 'wave' && st.target?.kind === 'razor' && st.aim && st.aim.dist < 220 && st.aim.noseErr < 0.3);
      await shotOnce('missile_lock', st.locked && st.player?.missileReady && st.aim && st.aim.dist < 650);
      await shotOnce('wave2_bombers', st.wave === 2 && st.phase === 'wave' && ((st.target && st.target.kind === 'maul' && st.aim && st.aim.dist < 600) || inPhase > 30));
      // A live, mostly intact bomber close up: hold fire for a moment so impact flashes clear.
      const maulClose = (s) => s.target && s.target.kind === 'maul' && s.target.alive && s.target.hull > 40 && s.aim && s.aim.dist < 260 && s.aim.noseErr < 0.35;
      if (!once.has('maul_close') && maulClose(st)) {
        await releaseAll();
        await sleep(350);
        // Only if it is still a live bomber in view (a missile or wingman may have got it).
        if (maulClose(await state())) await shotOnce('maul_close', true);
      }
      await shotOnce('wave3_swarm', st.wave === 3 && st.phase === 'wave' && inPhase > 10);
      await shotOnce('wave_cleared', st.phase === 'break' && inPhase > 1);
      await shotOnce('capital_arrival', st.phase === 'capital' && inPhase > 3.5);
      if (st.capital && firstGeneratorLeft < 0 && st.phase === 'capital') firstGeneratorLeft = st.capital.generatorsLeft;
      await shotOnce('generator_attack', st.phase === 'capital' && st.capital?.state === 'active' && st.target && st.target.kind === 'generator' && st.aim && st.aim.dist < 650);
      // Wait for the banner to finish fading in.
      if (!generatorDownAt && st.phase === 'capital' && st.capital && st.capital.generatorsLeft < firstGeneratorLeft) generatorDownAt = Date.now();
      await shotOnce('generator_down', generatorDownAt > 0 && Date.now() - generatorDownAt > 700);
      // The player's shield taking a hit (shimmer on the ship).
      if (st.player && lastShield >= 0) await shotOnce('shield_hit', st.player.shield < lastShield - 1 && st.player.shield > 10);
      if (st.player) lastShield = st.player.shield;
      if (!criticalShot && st.player && st.player.hull < 30 && st.player.alive) {
        criticalShot = true;
        await shot('hull_critical');
      }
    }
    if (!bot.showcased && !bot.passive && st.gameState === 'playing' && st.phase === 'break' && st.wave === 1 && inPhase > 0.3) {
      bot.showcased = true;
      await showcase(900, 15000);
      continue;
    }
    if (st.gameState === 'finale') {
      // Blast at 7.4 s of the 9.6 s finale (progress 0.77).
      await shotOnce('finale_chain', (st.capital?.finale ?? 0) > 0.45);
      await shotOnce('finale_blast', (st.capital?.finale ?? 0) > 0.83);
    }
    // Let the death camera pull back and the HUD fade first.
    if (st.gameState === 'dying') {
      if (!dyingAt) dyingAt = Date.now();
      await shotOnce('death_cam', Date.now() - dyingAt > 700);
    } else dyingAt = 0;
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
  // Throttle up the way a player would (the ship starts at 55 %).
  await page.keyboard.down('KeyW');
  await sleep(550);
  await page.keyboard.up('KeyW');
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
  } else if (scenario === 'ui') {
    // Every menu screen: title (above), how to fly, settings, then in-flight pause and its settings.
    await page.mouse.move(cx, cy);
    await page.keyboard.press('Escape');
    await sleep(700);
    await shot('pause_menu');
    await page.click('.screen.show [data-action="howto"]');
    await sleep(500);
    await shot('howto');
    await page.click('.screen.show [data-action="back"]');
    await sleep(300);
    await page.click('.screen.show [data-action="settings"]');
    await sleep(500);
    await shot('settings');
    await page.click('.screen.show [data-action="back"]');
    await sleep(300);
    await page.click('.screen.show [data-action="resume"]');
    await sleep(1200);
    outcome = (await state()).gameState;
  } else if (scenario === 'showcase') {
    await sleep(1500);
    await showcase(900, 20000);
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
    worstFrameMs: Math.round(worstOverall),
  },
  console: { errors, warnings, count: consoleLog.length },
  hitches: finalState?.hitches ?? [],
  prewarmMs: finalState?.prewarmMs ?? null,
  latePrograms: finalState?.latePrograms ?? [],
  audio: { maxLevel: audioSeen.maxLevel, modes: [...audioSeen.modes], states: [...audioSeen.states] },
  finalState,
};
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(outDir, 'console.log'), consoleLog.map((m) => `[${m.t.toFixed(1)}] ${m.type}: ${m.text}`).join('\n'));
log(`outcome=${outcome} errors=${errors.length} warnings=${warnings.length} shots=${shots.length} avgFps=${report.perf.avgFps} minFps=${report.perf.minFps} worstFrame=${report.perf.worstFrameMs}ms prewarm=${report.prewarmMs}ms quality=${finalState?.quality} audioMax=${audioSeen.maxLevel} music=${[...audioSeen.modes].join(',')}`);
if (finalState?.hitches?.length) log('hitches (game time, rAF gap, update ms, render ms):', finalState.hitches.map((h) => `${h.at}s ${h.phase} gap ${h.gap} u${h.update} r${h.render}${h.update > 30 ? ` [${h.slowest}]` : ''}`).join(' | '));
if (finalState?.latePrograms?.length) log('programs compiled after warm-up:', finalState.latePrograms.map((p) => `${p.at}s ${p.name}`).join(' | '));
log('out:', outDir);
await browser.close();
await server.close?.();
if (server.httpServer) server.httpServer.close();
process.exit(0);
