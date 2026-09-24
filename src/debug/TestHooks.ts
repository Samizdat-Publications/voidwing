import { Vector3 } from 'three';
import { localAngles } from '../core/math';
import { PLAYER } from '../game/config';
import type { Game } from '../game/Game';

const _dir = new Vector3();
const _a = { yaw: 0, pitch: 0 };
const _b = { yaw: 0, pitch: 0 };

/**
 * window.__VW: read-only game state plus a few switches for the Playwright self-test.
 * The bot still flies with real mouse and keyboard events.
 */
export function installTestHooks(game: Game): void {
  const api = {
    state() {
      const w = game.world;
      const p = w?.player;
      const ctrl = game.controller;
      const t = p?.target ?? null;
      let aim = null as null | { dYaw: number; dPitch: number; dist: number; noseErr: number };
      if (p && t && ctrl) {
        // Angle from the current aim direction to the lead point, in the ship's frame.
        _dir.copy(ctrl.hasLead ? ctrl.lead : t.position).sub(p.position).normalize();
        localAngles(p.quaternion, _dir, _a);
        localAngles(p.quaternion, ctrl.aimDir, _b);
        const fwd = p.forward(new Vector3());
        aim = {
          dYaw: _a.yaw - _b.yaw,
          dPitch: _a.pitch - _b.pitch,
          dist: t.position.distanceTo(p.position),
          noseErr: fwd.angleTo(_dir),
        };
      }
      return {
        gameState: game.state,
        phase: game.mission?.phase.kind ?? null,
        phaseIndex: game.mission?.phaseIndex ?? -1,
        wave: game.mission?.waveNumber ?? 0,
        objective: game.mission ? `${game.mission.objective} | ${game.mission.objectiveDetail}` : '',
        player: p
          ? {
              alive: p.alive,
              hull: Math.round(p.hull),
              shield: Math.round(p.shield),
              boost: Math.round(p.boostEnergy),
              missiles: p.missiles,
              speed: Math.round(p.velocity.length()),
              pos: [Math.round(p.position.x), Math.round(p.position.y), Math.round(p.position.z)],
              distFromCenter: Math.round(p.position.length()),
            }
          : null,
        target: t ? { name: t.name, kind: t.kind, hull: Math.round(t.hull), alive: t.alive } : null,
        aim,
        locked: ctrl?.locked ?? false,
        lockProgress: ctrl?.lockProgress ?? 0,
        enemies: w ? w.enemyShipsAlive() : 0,
        capital: w ? { state: w.capital.state, generatorsLeft: w.capital.generatorsAlive } : null,
        stats: game.mission ? { ...game.mission.stats } : null,
        fps: Math.round(game.fps),
        frameMs: Math.round(game.frameMs * 100) / 100,
        render: game.renderStats(),
        radPerPx: PLAYER.mouseRadPerPx * game.settings.sensitivity,
      };
    },
    /** Aim data for the nearest breakable rock in front of the player (bot showcase). */
    asteroidAim(maxDist = 520) {
      const w = game.world;
      const p = w?.player;
      const ctrl = game.controller;
      if (!w || !p || !ctrl) return null;
      const fwd = p.forward(new Vector3());
      let best = null as null | { pos: Vector3; dist: number; score: number };
      for (const a of w.asteroids.list) {
        if (!a.alive || a.tier === 0 || a.radius > 32 || a.radius < 12) continue;
        const d = a.position.distanceTo(p.position);
        if (d > maxDist || d < 70) continue;
        const ang = fwd.angleTo(_dir.copy(a.position).sub(p.position).normalize());
        const score = ang + d / 1500;
        if (!best || score < best.score) best = { pos: a.position.clone(), dist: d, score };
      }
      if (!best) return null;
      _dir.copy(best.pos).sub(p.position).normalize();
      localAngles(p.quaternion, _dir, _a);
      localAngles(p.quaternion, ctrl.aimDir, _b);
      return { dYaw: _a.yaw - _b.yaw, dPitch: _a.pitch - _b.pitch, dist: best.dist, noseErr: fwd.angleTo(_dir) };
    },
    setGod(on: boolean) {
      game.setGod(on);
    },
    jumpToPhase(i: number) {
      game.mission?.jumpTo(i);
    },
    /** Direct access for ad-hoc debugging from Playwright. */
    get game() {
      return game;
    },
    damagePlayer(amount: number) {
      const p = game.world?.player;
      if (p && game.world) p.takeDamage(amount, p.position, null, game.world);
    },
  };
  (window as unknown as { __VW: typeof api }).__VW = api;
}
