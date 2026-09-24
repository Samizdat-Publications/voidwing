import { Vector3 } from 'three';
import type { Input } from '../core/Input';
import { clamp, leadPoint, localAngles } from '../core/math';
import { bankRoll } from './AI';
import { ARENA, PLAYER } from './config';
import type { Entity } from './Entity';
import type { Ship, ShipController } from './Ship';
import type { World } from './World';

export interface PlayerSettings {
  sensitivity: number;
  invertY: boolean;
  autoLevel: boolean;
}

const _fwd = new Vector3();
const _up = new Vector3();
const _right = new Vector3();
const _axis = new Vector3();
const _to = new Vector3();
const _ang = { yaw: 0, pitch: 0 };

/** Turns mouse and keys into ship controls, and owns targeting and missile lock. */
export class PlayerController implements ShipController {
  readonly aimDir = new Vector3(0, 0, -1);
  readonly lead = new Vector3();
  hasLead = false;
  lockProgress = 0;
  locked = false;
  inLockCone = false;
  private lockTargetId = -1;
  private manualTarget = false;
  /** False during cinematics and the death cam: the ship keeps flying but ignores input. */
  enabled = true;
  private lastRollInput = -10;
  outOfBounds = false;
  /** Set true for one frame when a missile was requested without a lock. */
  missileDenied = false;

  constructor(
    private readonly input: Input,
    private readonly settings: PlayerSettings,
  ) {}

  resetAim(ship: Ship): void {
    ship.forward(this.aimDir);
    this.lockProgress = 0;
    this.locked = false;
    this.manualTarget = false;
  }

  update(ship: Ship, dt: number, world: World): void {
    const c = ship.control;
    const input = this.input;
    ship.forward(_fwd);
    ship.up(_up);
    ship.right(_right);

    if (this.enabled) {
      const k = PLAYER.mouseRadPerPx * this.settings.sensitivity;
      const dx = input.mouseDX;
      const dy = input.mouseDY * (this.settings.invertY ? -1 : 1);
      if (dx !== 0) this.aimDir.applyAxisAngle(_up, -dx * k);
      if (dy !== 0) this.aimDir.applyAxisAngle(_right, -dy * k);
      this.aimDir.normalize();
    }

    // Past the arena edge the ship is steered home.
    const distFromCenter = ship.position.length();
    this.outOfBounds = distFromCenter > ARENA.warnRadius;
    if (distFromCenter > ARENA.radius) {
      _to.copy(ship.position).multiplyScalar(-1 / distFromCenter);
      this.aimDir.lerp(_to, clamp(dt * 1.5, 0, 1)).normalize();
    }

    // The aim may lead the nose by a limited angle.
    const leadAngle = this.aimDir.angleTo(_fwd);
    if (leadAngle > PLAYER.maxAimLead) {
      _axis.crossVectors(_fwd, this.aimDir);
      if (_axis.lengthSq() > 1e-10) {
        _axis.normalize();
        this.aimDir.copy(_fwd).applyAxisAngle(_axis, PLAYER.maxAimLead);
      }
    }

    localAngles(ship.quaternion, this.aimDir, _ang);
    c.yaw = clamp(_ang.yaw * PLAYER.steerGain, -1, 1);
    c.pitch = clamp(_ang.pitch * PLAYER.steerGain, -1, 1);

    let roll = 0;
    if (this.enabled) roll = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    if (roll !== 0) this.lastRollInput = world.time;
    else if (this.settings.autoLevel && world.time - this.lastRollInput > 0.8) roll = bankRoll(ship, 0) * 0.28;
    c.roll = roll;

    if (this.enabled) {
      if (input.down('KeyW')) c.throttle = Math.min(1, c.throttle + PLAYER.throttleRate * dt);
      if (input.down('KeyS')) c.throttle = Math.max(0, c.throttle - PLAYER.throttleRate * dt);
      c.boost = input.down('ShiftLeft') || input.down('ShiftRight') || input.down('Space');
      c.fire = input.lmb;
    } else {
      c.boost = false;
      c.fire = false;
    }

    this.updateTargeting(ship, dt, world);
    c.aimPoint = this.hasLead ? this.lead : null;

    this.missileDenied = false;
    const wantsMissile = this.enabled && (input.rmbPressed || input.wasPressed('KeyF'));
    c.missileTarget = ship.target;
    c.fireMissile = wantsMissile && this.locked && ship.missileCooldown <= 0 && ship.missiles > 0;
    if (wantsMissile && !c.fireMissile) this.missileDenied = true;
  }

  private score(ship: Ship, e: Entity, world: World): number {
    _to.subVectors(e.position, ship.position);
    const d = _to.length();
    const angle = d > 1e-3 ? _fwd.angleTo(_to.multiplyScalar(1 / d)) : 0;
    let s = angle + d / 5000 + (e.objective ? -0.05 : 0);
    // Generators hidden behind the carrier's shield from here are poor picks.
    if (e.kind === 'generator' && world.capital.shieldActive && world.capital.segmentShieldT(ship.position, e.position) >= 0) s += 0.8;
    return s;
  }

  private updateTargeting(ship: Ship, dt: number, world: World): void {
    const hostiles = world.targetsFor('player');
    if (ship.target && !ship.target.alive) {
      ship.target = null;
      this.manualTarget = false;
    }
    if (this.enabled && this.input.wasPressed('Tab')) {
      const sorted = hostiles
        .filter((h) => h.alive && h.position.distanceTo(ship.position) < 6000)
        .sort((a, b) => this.score(ship, a, world) - this.score(ship, b, world));
      if (sorted.length > 0) {
        const i = ship.target ? sorted.indexOf(ship.target) : -1;
        ship.target = sorted[(i + 1) % sorted.length];
        this.manualTarget = true;
      }
    }
    if (!this.manualTarget) {
      let best: Entity | null = null;
      let bestScore = Infinity;
      for (const h of hostiles) {
        if (!h.alive) continue;
        const s = this.score(ship, h, world);
        if (s < bestScore) {
          bestScore = s;
          best = h;
        }
      }
      // Hysteresis: only switch for a clearly better candidate, and never while locked.
      if (!ship.target || (best && best !== ship.target && !this.locked && bestScore < this.score(ship, ship.target, world) - 0.2)) {
        ship.target = best;
      }
    }

    const t = ship.target;
    if (!t) {
      this.hasLead = false;
      this.lockProgress = 0;
      this.locked = false;
      this.inLockCone = false;
      this.lockTargetId = -1;
      return;
    }
    if (t.id !== this.lockTargetId) {
      this.lockTargetId = t.id;
      this.lockProgress = 0;
      this.locked = false;
    }
    const boltSpeed = ship.spec.boltSpeed + Math.max(0, ship.speed);
    leadPoint(ship.position, t.position, t.velocity, boltSpeed, this.lead);
    this.hasLead = true;

    _to.subVectors(t.position, ship.position);
    const dist = _to.length();
    const angle = _fwd.angleTo(_to);
    this.inLockCone = angle < PLAYER.lockCone && dist < PLAYER.lockRange && ship.missiles > 0;
    if (this.inLockCone) this.lockProgress = Math.min(1, this.lockProgress + dt / PLAYER.lockTime);
    else this.lockProgress = Math.max(0, this.lockProgress - (dt * 1.5) / PLAYER.lockTime);
    this.locked = this.lockProgress >= 1;
  }
}
