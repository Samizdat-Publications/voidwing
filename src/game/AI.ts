import { Vector3 } from 'three';
import { Rng, clamp, leadPoint, signedAngleAbout } from '../core/math';
import type { Entity } from './Entity';
import type { Ship, ShipController } from './Ship';
import type { World } from './World';

const _fwd = new Vector3();
const _up = new Vector3();
const _to = new Vector3();
const _lead = new Vector3();
const _avoid = new Vector3();
const _rel = new Vector3();
const _tmp = new Vector3();
const _upProj = new Vector3();
const WORLD_UP = new Vector3(0, 1, 0);
const _angles = { yaw: 0, pitch: 0 };

/** Turn the ship toward a world direction with aircraft-style banking. */
export function steerToward(ship: Ship, desired: Vector3, gain = 2.6, bankAmount = 0.9): void {
  const c = ship.control;
  const inv = ship.quaternion.clone().invert();
  _tmp.copy(desired).applyQuaternion(inv);
  _angles.yaw = Math.atan2(_tmp.x, -_tmp.z);
  _angles.pitch = Math.atan2(_tmp.y, Math.hypot(_tmp.x, _tmp.z));
  c.yaw = clamp(_angles.yaw * gain, -1, 1);
  c.pitch = clamp(_angles.pitch * gain, -1, 1);
  c.roll = bankRoll(ship, c.yaw * bankAmount);
}

/**
 * Roll command that keeps the ship's up near the belt plane's up, tilted by `bank` radians
 * (positive banks right).
 */
export function bankRoll(ship: Ship, bank: number): number {
  ship.forward(_fwd);
  ship.up(_up);
  _upProj.copy(WORLD_UP).addScaledVector(_fwd, -WORLD_UP.dot(_fwd));
  if (_upProj.lengthSq() < 0.04) return 0; // nose straight up or down: leave roll alone
  _upProj.normalize();
  if (bank !== 0) _upProj.applyAxisAngle(_fwd, bank);
  const err = signedAngleAbout(_up, _upProj, _fwd);
  return clamp(err * 1.6, -1, 1);
}

/** Blend in a push away from rocks and the carrier shield ahead of the ship. */
/** Bend `desired` around rocks and the carrier shield ahead. lookTime (s) and margin (m) set how early. */
export function avoidObstacles(ship: Ship, desired: Vector3, world: World, lookTime = 2.2, margin = 30): Vector3 {
  const speed = Math.max(ship.speed, 40);
  const look = Math.max(lookTime * 64, speed * lookTime);
  _fwd.copy(ship.velocity).normalize();
  if (_fwd.lengthSq() < 0.5) ship.forward(_fwd);
  _avoid.set(0, 0, 0);
  _tmp.copy(ship.position).addScaledVector(_fwd, look * 0.5);
  world.asteroids.queryRadius(_tmp, look * 0.5 + 30, (a) => {
    _rel.subVectors(a.position, ship.position);
    const along = _rel.dot(_fwd);
    if (along < -a.radius || along > look + a.radius) return;
    _rel.addScaledVector(_fwd, -along); // perpendicular offset from our path to the rock
    const dist = _rel.length();
    const clearance = a.radius + ship.radius + margin;
    if (dist > clearance) return;
    const urgency = (1 - dist / clearance) * (1 - Math.max(0, along) / (look + a.radius));
    if (dist < 1e-3) ship.up(_rel).negate();
    _avoid.addScaledVector(_rel.normalize(), -urgency * 3.5);
  });
  const cap = world.capital;
  if (cap.state === 'active' || cap.state === 'warping' || cap.state === 'dying') {
    _tmp.copy(ship.position).addScaledVector(_fwd, look * 0.6);
    const d = cap.shieldDistance(_tmp);
    if (d < 60) {
      _rel.subVectors(ship.position, cap.position).normalize();
      _avoid.addScaledVector(_rel, clamp((60 - d) / 60, 0, 1) * 3);
    }
  }
  if (_avoid.lengthSq() > 0) desired.add(_avoid).normalize();
  return desired;
}

/** Keep away from same-team ships to stop clumping. */
function separate(ship: Ship, desired: Vector3, world: World): void {
  for (const o of world.ships) {
    if (o === ship || !o.alive || o.team !== ship.team) continue;
    _rel.subVectors(ship.position, o.position);
    const d = _rel.length();
    if (d < 45 && d > 1e-3) desired.addScaledVector(_rel, (45 - d) / 45 / d * 1.2);
  }
  desired.normalize();
}

function pickTarget(ship: Ship, world: World, rng: Rng, preferPlayer: number): Entity | null {
  const hostiles = world.targetsFor(ship.team);
  let best: Entity | null = null;
  let bestScore = Infinity;
  for (const h of hostiles) {
    if (!h.alive || h.kind === 'generator') continue;
    let score = h.position.distanceTo(ship.position) * rng.range(0.8, 1.2);
    if (h.kind === 'player') score *= preferPlayer;
    if (score < bestScore) {
      bestScore = score;
      best = h;
    }
  }
  return best;
}

type DogState = 'engage' | 'break' | 'evade';

/** Chases a target, fires on a lead solution, breaks off for passes and jinks when hit. */
export class DogfighterAI implements ShipController {
  state: DogState = 'engage';
  stateTime = 0;
  private retargetTimer = 0;
  private burst = 0;
  private burstCooldown = 0;
  private readonly breakDir = new Vector3();
  /** Sideways offset for this fighter's run in, so a group spreads out instead of queueing up. */
  private readonly flank = new Vector3();
  private flankSet = false;
  private jinkTimer = 0;
  private lastHull = -1;
  private readonly engageLimit: number;
  protected preferPlayer = 0.55;

  constructor(protected readonly rng: Rng) {
    this.engageLimit = rng.range(7, 11);
  }

  protected chooseTarget(ship: Ship, world: World): Entity | null {
    return pickTarget(ship, world, this.rng, this.preferPlayer);
  }

  update(ship: Ship, dt: number, world: World): void {
    const c = ship.control;
    this.stateTime += dt;
    this.retargetTimer -= dt;
    if (!ship.target || !ship.target.alive || this.retargetTimer <= 0) {
      ship.target = this.chooseTarget(ship, world);
      this.retargetTimer = this.rng.range(4, 7);
    }
    const target = ship.target;
    c.fire = false;
    c.aimPoint = null;
    if (!target) {
      this.idle(ship, world);
      return;
    }

    // React to damage.
    const hp = ship.hull + ship.shield;
    if (this.lastHull >= 0 && hp < this.lastHull - 0.01 && this.state === 'engage' && this.rng.chance(0.18)) {
      this.enter('evade');
    }
    this.lastHull = hp;

    _to.subVectors(target.position, ship.position);
    const dist = _to.length();
    ship.forward(_fwd);
    const desired = new Vector3();

    switch (this.state) {
      case 'engage': {
        leadPoint(ship.position, target.position, target.velocity, ship.spec.boltSpeed + Math.max(0, ship.speed), _lead);
        desired.subVectors(_lead, ship.position).normalize();
        // Far out, swing in from this fighter's own angle so a group spreads out.
        if (!this.flankSet) {
          this.flankSet = true;
          this.flank.crossVectors(_to, this.rng.unitVector(_tmp)).normalize();
        }
        // Only on the long approach: inside firing range they point their guns straight at you.
        const spread = clamp((dist - 450) / 500, 0, 1) * 0.6;
        if (spread > 0) desired.addScaledVector(this.flank, spread).normalize();
        c.throttle = dist > 700 ? 1 : dist < 220 ? 0.45 : 0.85;
        c.boost = dist > 1300 && ship.boostEnergy > 40;
        const angle = _fwd.angleTo(desired);
        this.burstCooldown -= dt;
        if (angle < 0.1 && dist < 720 && this.burstCooldown <= 0) {
          if (this.burst <= 0) this.burst = this.rng.int(3, 6);
        }
        if (this.burst > 0 && angle < 0.14) {
          c.fire = true;
          c.aimPoint = _lead;
          if (ship.gunCooldown <= 0) {
            this.burst--;
            if (this.burst <= 0) this.burstCooldown = this.rng.range(0.35, 0.8);
          }
        }
        if (dist < 70 || (dist < 160 && _to.dot(target.velocity) < -dist * 60)) this.enter('break');
        else if (this.stateTime > this.engageLimit) this.enter('break');
        break;
      }
      case 'break': {
        if (this.stateTime < dt * 1.5) {
          // Pick a direction roughly perpendicular to the target line.
          this.breakDir.crossVectors(_to, this.rng.unitVector(_tmp)).normalize();
          this.breakDir.addScaledVector(_to.clone().normalize(), -0.3).normalize();
        }
        desired.copy(this.breakDir);
        c.throttle = 1;
        c.boost = ship.boostEnergy > 30;
        if (this.stateTime > this.rng.range(1.6, 2.6)) this.enter('engage');
        break;
      }
      case 'evade': {
        this.jinkTimer -= dt;
        if (this.jinkTimer <= 0 || this.stateTime < dt * 1.5) {
          this.jinkTimer = this.rng.range(0.35, 0.7);
          this.breakDir.copy(_fwd).addScaledVector(this.rng.unitVector(_tmp), 1.1).normalize();
        }
        desired.copy(this.breakDir);
        c.throttle = 1;
        c.boost = ship.boostEnergy > 20;
        if (this.stateTime > 2.2) this.enter('engage');
        break;
      }
    }
    separate(ship, desired, world);
    avoidObstacles(ship, desired, world);
    steerToward(ship, desired);
    ship.aiState = this.state;
  }

  protected idle(ship: Ship, world: World): void {
    const c = ship.control;
    ship.forward(_fwd);
    const desired = _fwd.clone();
    // Drift back toward the middle of the field.
    if (ship.position.length() > 2200) desired.addScaledVector(ship.position.clone().normalize(), -1).normalize();
    avoidObstacles(ship, desired, world);
    steerToward(ship, desired);
    c.throttle = 0.6;
    c.boost = false;
    c.fire = false;
  }

  protected enter(s: DogState): void {
    this.state = s;
    this.stateTime = 0;
    if (s === 'engage') this.flankSet = false;
  }
}

type BomberState = 'approach' | 'run' | 'pass' | 'extend' | 'turn';

/** Makes long strafing runs: line up, unload heavy plasma, fly through, extend, come about. */
export class BomberAI implements ShipController {
  state: BomberState = 'approach';
  stateTime = 0;
  private retargetTimer = 0;
  private readonly runDir = new Vector3();
  private missileUsed = false;
  private extendTime = 3;
  /** Sideways offset on the approach so bomber pairs split up before their runs. */
  private readonly flank = new Vector3();
  private flankSet = false;

  constructor(private readonly rng: Rng) {}

  update(ship: Ship, dt: number, world: World): void {
    const c = ship.control;
    this.stateTime += dt;
    this.retargetTimer -= dt;
    if (!ship.target || !ship.target.alive || (this.retargetTimer <= 0 && this.state === 'extend')) {
      ship.target = pickTarget(ship, world, this.rng, 0.5);
      this.retargetTimer = this.rng.range(8, 14);
    }
    const target = ship.target;
    c.fire = false;
    c.aimPoint = null;
    c.fireMissile = false;
    ship.forward(_fwd);
    const desired = new Vector3();
    if (!target) {
      desired.copy(_fwd);
      c.throttle = 0.6;
      avoidObstacles(ship, desired, world);
      steerToward(ship, desired, 2.2, 0.6);
      return;
    }
    _to.subVectors(target.position, ship.position);
    const dist = _to.length();

    switch (this.state) {
      case 'approach': {
        leadPoint(ship.position, target.position, target.velocity, ship.spec.boltSpeed + Math.max(0, ship.speed), _lead);
        desired.subVectors(_lead, ship.position).normalize();
        if (!this.flankSet) {
          this.flankSet = true;
          this.flank.crossVectors(_to, this.rng.unitVector(_tmp)).normalize();
        }
        desired.addScaledVector(this.flank, clamp((dist - 1000) / 600, 0, 1) * 0.6).normalize();
        c.throttle = 1;
        c.boost = dist > 1400 && ship.boostEnergy > 50;
        if (dist < 1000 && _fwd.angleTo(desired) < 0.35) {
          this.enter('run');
          this.missileUsed = false;
        }
        break;
      }
      case 'run': {
        leadPoint(ship.position, target.position, target.velocity, ship.spec.boltSpeed + Math.max(0, ship.speed), _lead);
        desired.subVectors(_lead, ship.position).normalize();
        c.throttle = 0.8;
        const angle = _fwd.angleTo(desired);
        if (angle < 0.16 && dist < 880) {
          c.fire = true;
          c.aimPoint = _lead;
        }
        if (!this.missileUsed && dist < 900 && dist > 350 && angle < 0.5 && ship.missiles > 0 && target.kind === 'player') {
          this.missileUsed = true;
          if (this.rng.chance(0.55)) {
            c.fireMissile = true;
            c.missileTarget = target;
          }
        }
        if (dist < 200) {
          this.enter('pass');
          this.runDir.copy(_fwd);
        }
        break;
      }
      case 'pass': {
        desired.copy(this.runDir);
        c.throttle = 1;
        c.fire = false;
        if (dist > 380 && _to.dot(_fwd) < 0) {
          this.enter('extend');
          this.extendTime = this.rng.range(2.5, 3.8);
          this.runDir.addScaledVector(this.rng.unitVector(_tmp), 0.45).normalize();
        }
        break;
      }
      case 'extend': {
        desired.copy(this.runDir);
        c.throttle = 1;
        c.boost = ship.boostEnergy > 35;
        if (this.stateTime > this.extendTime || dist > 1200) this.enter('turn');
        break;
      }
      case 'turn': {
        desired.copy(_to).normalize();
        c.throttle = 0.7;
        c.boost = false;
        if (_fwd.angleTo(desired) < 0.4) this.enter('approach');
        break;
      }
    }
    separate(ship, desired, world);
    avoidObstacles(ship, desired, world);
    steerToward(ship, desired, 2.2, 0.7);
    ship.aiState = this.state;
  }

  private enter(s: BomberState): void {
    this.state = s;
    this.stateTime = 0;
    if (s === 'approach') this.flankSet = false;
  }
}

/** Friendly fighter: dogfights the enemies nearest the player, otherwise holds formation. */
export class WingmanAI extends DogfighterAI {
  constructor(private readonly slot: Vector3) {
    super(new Rng(Math.floor(Math.random() * 1e9)));
    this.preferPlayer = 1;
  }

  protected chooseTarget(ship: Ship, world: World): Entity | null {
    const player = world.player;
    const hostiles = world.targetsFor(ship.team);
    let best: Entity | null = null;
    let bestScore = Infinity;
    for (const h of hostiles) {
      if (!h.alive || h.kind === 'generator') continue;
      // Protect the player: prefer enemies near the player, then near us.
      const dp = player ? h.position.distanceTo(player.position) : 0;
      const ds = h.position.distanceTo(ship.position);
      const score = dp * 0.7 + ds * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = h;
      }
    }
    return best;
  }

  protected idle(ship: Ship, world: World): void {
    const player = world.player;
    const c = ship.control;
    if (!player || !player.alive) {
      super.idle(ship, world);
      return;
    }
    // Hold a formation slot off the player's wing.
    const slotWorld = _tmp.copy(this.slot).applyQuaternion(player.quaternion).add(player.position);
    _to.subVectors(slotWorld, ship.position);
    const dist = _to.length();
    const desired = new Vector3();
    if (dist > 40) desired.copy(_to).normalize();
    else player.forward(desired);
    avoidObstacles(ship, desired, world);
    steerToward(ship, desired, 2.4, 0.5);
    const playerSpeed = player.speed;
    const want = dist > 250 ? player.spec.boostSpeed : playerSpeed + clamp(dist - 20, -30, 60) * 0.8;
    c.boost = dist > 350 && ship.boostEnergy > 30;
    c.throttle = clamp((want - ship.spec.minSpeed) / (ship.spec.cruiseSpeed - ship.spec.minSpeed), 0, 1);
    c.fire = false;
    ship.aiState = 'form';
  }
}
