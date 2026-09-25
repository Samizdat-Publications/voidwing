import { Group, Object3D, Quaternion, Vector3 } from 'three';
import {
  approach,
  clamp,
  dampFactor,
  fxRng,
  integrateAngular,
  lerp,
  damp,
} from '../core/math';
import { Entity } from './Entity';
import { PLAYER, SPECS, type ShipKind, type ShipSpec, type Team } from './config';
import type { World } from './World';

export interface ShipControl {
  /** -1..1 fractions of the max pitch / yaw / roll rates. + is up / right / right. */
  pitch: number;
  yaw: number;
  roll: number;
  /** Desired throttle 0..1. */
  throttle: number;
  boost: boolean;
  fire: boolean;
  fireMissile: boolean;
  /** Point the guns may bend toward (aim assist / AI lead). */
  aimPoint: Vector3 | null;
  missileTarget: Entity | null;
}

export interface ShipController {
  update(ship: Ship, dt: number, world: World): void;
}

const _fwd = new Vector3();
const _origin = new Vector3();
const _dir = new Vector3();
const _conv = new Vector3();
const _tmp = new Vector3();

export class Ship extends Entity {
  readonly object: Group;
  readonly quaternion: Quaternion;
  model: Object3D;
  readonly spec: ShipSpec;
  controller: ShipController | null = null;
  readonly control: ShipControl = {
    pitch: 0, yaw: 0, roll: 0, throttle: PLAYER.startThrottle, boost: false, fire: false,
    fireMissile: false, aimPoint: null, missileTarget: null,
  };
  readonly angVel = new Vector3();
  speed = 0;
  throttle = PLAYER.startThrottle;
  boostEnergy = PLAYER.boostMax;
  boosting = false;
  private boostIdle = 0;
  gunCooldown = 0;
  private gunIndex = 0;
  missileCooldown = 0;
  missiles = 0;
  target: Entity | null = null;
  /** Outgoing damage multiplier (difficulty, wingmen). */
  damageDealt = 1;
  /** Random aim error for AI guns, radians. */
  aimSpread = 0;
  /** Cosmetic bank applied to the model only. */
  private bank = 0;
  kills = 0;
  shotsFired = 0;
  shotsHit = 0;
  missilesFired = 0;
  /** Seconds since the guns last fired (for audio / muzzle effects). */
  lastFireTime = -999;
  aiState = '';

  constructor(kind: ShipKind, team: Team, model: Object3D, name?: string) {
    const obj = new Group();
    const spec = SPECS[kind];
    super(team, kind, name ?? spec.displayName, obj.position);
    this.object = obj;
    this.quaternion = obj.quaternion;
    this.model = model;
    obj.add(model);
    this.spec = spec;
    this.radius = spec.radius;
    this.hull = this.maxHull = spec.hull;
    this.shield = this.maxShield = spec.shield;
    this.missiles = spec.missiles;
  }

  forward(out: Vector3): Vector3 {
    return out.set(0, 0, -1).applyQuaternion(this.quaternion);
  }
  up(out: Vector3): Vector3 {
    return out.set(0, 1, 0).applyQuaternion(this.quaternion);
  }
  right(out: Vector3): Vector3 {
    return out.set(1, 0, 0).applyQuaternion(this.quaternion);
  }

  /** Reset flight state, e.g. after a respawn. */
  resetMotion(speed: number): void {
    this.angVel.set(0, 0, 0);
    this.speed = speed;
    this.forward(this.velocity).multiplyScalar(speed);
  }

  update(dt: number, world: World): void {
    if (!this.alive) return;
    this.controller?.update(this, dt, world);
    this.integrate(dt);
    this.updateWeapons(dt, world);
    if (
      this.maxShield > 0 &&
      this.shield < this.maxShield &&
      world.time - this.lastHitTime > this.spec.shieldDelay
    ) {
      this.shield = Math.min(this.maxShield, this.shield + this.spec.shieldRegen * dt);
    }
  }

  private integrate(dt: number): void {
    const s = this.spec;
    const c = this.control;

    // Boost meter.
    this.boosting = c.boost && this.boostEnergy > 0.5;
    if (this.boosting) {
      this.boostEnergy = Math.max(0, this.boostEnergy - PLAYER.boostDrain * dt);
      this.boostIdle = 0;
    } else {
      this.boostIdle += dt;
      if (this.boostIdle > PLAYER.boostRegenDelay) {
        this.boostEnergy = Math.min(PLAYER.boostMax, this.boostEnergy + PLAYER.boostRegen * dt);
      }
    }

    // Angular velocity chases the commanded rates.
    const turnScale = this.boosting ? 0.72 : 1;
    const tx = clamp(c.pitch, -1, 1) * s.pitchRate * turnScale;
    const ty = -clamp(c.yaw, -1, 1) * s.yawRate * turnScale;
    const tz = -clamp(c.roll, -1, 1) * s.rollRate;
    const k = dampFactor(s.angResponse, dt);
    this.angVel.x += (tx - this.angVel.x) * k;
    this.angVel.y += (ty - this.angVel.y) * k;
    this.angVel.z += (tz - this.angVel.z) * k;
    integrateAngular(this.quaternion, this.angVel, dt);

    // Throttle and speed.
    this.throttle = approach(this.throttle, clamp(c.throttle, 0, 1), dt * 1.6);
    const targetSpeed = this.boosting ? s.boostSpeed : lerp(s.minSpeed, s.cruiseSpeed, this.throttle);
    const accel = targetSpeed > this.speed ? s.accel * (this.boosting ? 2.4 : 1) : s.accel * 1.5;
    this.speed = approach(this.speed, targetSpeed, accel * dt);

    // Velocity swings toward the nose; low grip gives a little drift in hard turns.
    this.forward(_fwd);
    _tmp.copy(_fwd).multiplyScalar(this.speed);
    this.velocity.lerp(_tmp, dampFactor(s.grip, dt));
    this.position.addScaledVector(this.velocity, dt);

    // Cosmetic bank into yaw.
    this.bank = damp(this.bank, clamp(this.angVel.y * 0.38, -0.55, 0.55), 6, dt);
    this.model.rotation.z = this.bank;
  }

  private updateWeapons(dt: number, world: World): void {
    this.gunCooldown -= dt;
    this.missileCooldown -= dt;
    const c = this.control;
    if (c.fire && this.gunCooldown <= 0) this.fireGun(world);
    if (this.gunCooldown < -0.05) this.gunCooldown = 0;
    if (
      c.fireMissile &&
      this.missileCooldown <= 0 &&
      this.missiles > 0 &&
      c.missileTarget &&
      c.missileTarget.alive
    ) {
      world.missiles.launch(this, c.missileTarget, world);
      this.missiles--;
      this.missilesFired++;
      this.missileCooldown = this.team === 'player' ? PLAYER.missileCooldown : 8;
    }
    c.fireMissile = false;
  }

  private fireGun(world: World): void {
    const s = this.spec;
    const mount = s.guns[this.gunIndex % s.guns.length];
    this.gunIndex++;
    _origin.copy(mount).applyQuaternion(this.quaternion).add(this.position);
    this.forward(_fwd);
    // Both guns converge on a point ahead of the nose.
    _conv.copy(_fwd).multiplyScalar(PLAYER.convergence).add(this.position);
    _dir.subVectors(_conv, _origin).normalize();
    const aim = this.control.aimPoint;
    if (aim) {
      _tmp.subVectors(aim, _origin).normalize();
      if (_tmp.angleTo(_fwd) < PLAYER.aimAssistCone) _dir.copy(_tmp);
    }
    if (this.aimSpread > 0) {
      fxRng.unitVector(_tmp).multiplyScalar(Math.tan(this.aimSpread) * fxRng.next());
      _dir.add(_tmp).normalize();
    }
    const speed = s.boltSpeed + Math.max(0, this.velocity.dot(_dir));
    world.projectiles.spawn(s.bolt, _origin, _dir, speed, s.boltDamage * this.damageDealt, s.boltLife, this.team, this.id);
    this.gunCooldown += s.fireInterval;
    this.shotsFired++;
    this.lastFireTime = world.time;
    world.events.emit('fired', { ship: this, origin: _origin, dir: _dir });
  }

  protected onDestroyed(world: World): void {
    world.effects.explosion(this.position, this.kind === 'maul' ? 2.2 : this.kind === 'player' ? 2.8 : 1.4, this.velocity);
  }
}
