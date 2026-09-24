import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { clamp, fxRng, leadPoint } from '../core/math';
import { ShieldBubble } from '../render/ShieldFX';
import { ARENA, CAPITAL } from './config';
import { Entity } from './Entity';
import type { Ship } from './Ship';
import type { World } from './World';

export interface CapitalLayout {
  /** Local positions of the shield generator orbs. */
  generators: Vector3[];
  /** Turret mounts: local position and the mount's outward normal. */
  turrets: { position: Vector3; normal: Vector3 }[];
  hangar: { position: Vector3; direction: Vector3 };
  shieldCenter: Vector3;
  shieldRadii: Vector3;
  /** Points on the hull used for the destruction sequence. */
  hullPoints: Vector3[];
}

const _v = new Vector3();
const _v2 = new Vector3();
const _local0 = new Vector3();
const _local1 = new Vector3();
const _q = new Quaternion();
const _m = new Matrix4();

const GEN_NAMES = ['Generator A', 'Generator B', 'Generator C', 'Generator D', 'Generator E', 'Generator F'];

export class Generator extends Entity {
  /** Power beam from the orb into the hull; cut when the generator dies. */
  beam: Mesh | null = null;

  constructor(
    readonly capital: CapitalShip,
    readonly local: Vector3,
    readonly object: Object3D,
    index: number,
  ) {
    super('enemy', 'generator', GEN_NAMES[index] ?? `Generator ${index + 1}`, new Vector3());
    this.hull = this.maxHull = CAPITAL.generatorHull;
    this.radius = CAPITAL.generatorRadius;
    this.objective = true;
  }

  protected onDestroyed(world: World): void {
    world.effects.explosion(this.position, 3.2, this.capital.velocityZero);
    this.object.visible = false;
    if (this.beam) this.beam.visible = false;
    this.capital.onGeneratorDestroyed(this, world);
  }
}

const _beamUp = new Vector3(0, 1, 0);
function makeBeam(from: Vector3, to: Vector3, mat: MeshBasicMaterial): Mesh {
  const len = from.distanceTo(to);
  const beam = new Mesh(new CylinderGeometry(1.6, 1.6, len, 8, 1, true), mat);
  beam.position.copy(from).add(to).multiplyScalar(0.5);
  beam.quaternion.setFromUnitVectors(_beamUp, to.clone().sub(from).normalize());
  beam.renderOrder = 4;
  return beam;
}

export class Turret extends Entity {
  readonly head: Object3D;
  private cooldown = fxRng.range(0.5, 2.5);
  private burstLeft = 0;
  private burstTimer = 0;
  private readonly aim = new Vector3(0, 1, 0);
  target: Entity | null = null;

  constructor(
    readonly capital: CapitalShip,
    readonly local: Vector3,
    readonly normalLocal: Vector3,
    readonly base: Object3D,
  ) {
    super('enemy', 'turret', 'Turret', new Vector3());
    this.hull = this.maxHull = 150;
    this.radius = 6;
    this.targetable = false;
    this.head = base.getObjectByName('head') ?? base;
  }

  update(dt: number, world: World): void {
    this.invulnerable = this.capital.shieldActive;
    // Pick the nearest hostile fighter in range that is on this turret's side of the hull.
    const normalW = _v2.copy(this.normalLocal).applyQuaternion(this.capital.object.quaternion);
    let best: Entity | null = null;
    let bestD = CAPITAL.turretRange;
    for (const s of world.ships) {
      if (!s.alive || s.team !== 'player') continue;
      _v.subVectors(s.position, this.position);
      const d = _v.length();
      if (d > bestD) continue;
      if (_v.dot(normalW) < -0.15 * d) continue;
      // Prefer the player a little.
      const score = s.kind === 'player' ? d * 0.8 : d;
      if (score < bestD) {
        bestD = score;
        best = s;
      }
    }
    this.target = best;
    if (!best) return;

    leadPoint(this.position, best.position, best.velocity, CAPITAL.turretBoltSpeed, _v);
    _v.sub(this.position).normalize();
    // Track with limited slew.
    const angle = this.aim.angleTo(_v);
    const maxStep = 1.6 * dt;
    if (angle > maxStep) {
      _v2.crossVectors(this.aim, _v).normalize();
      if (_v2.lengthSq() > 0.5) this.aim.applyAxisAngle(_v2, maxStep).normalize();
    } else this.aim.copy(_v);
    // Point the head (head's -Z is the barrel) in world space.
    _m.lookAt(this.position, _v2.copy(this.position).add(this.aim), this.capital.upWorld);
    _q.setFromRotationMatrix(_m);
    const parentQ = this.head.parent ? this.head.parent.getWorldQuaternion(new Quaternion()) : new Quaternion();
    this.head.quaternion.copy(parentQ.invert().multiply(_q));

    this.cooldown -= dt;
    if (this.burstLeft > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        this.burstTimer = CAPITAL.turretFireInterval;
        this.burstLeft--;
        const spread = 0.022 / world.diff.enemyAim;
        _v.copy(this.aim);
        fxRng.unitVector(_v2).multiplyScalar(spread * fxRng.next());
        _v.add(_v2).normalize();
        _v2.copy(this.position).addScaledVector(_v, 7);
        world.projectiles.spawn('flak', _v2, _v, CAPITAL.turretBoltSpeed, CAPITAL.turretDamage * world.diff.enemyDamage, 3, 'enemy', this.id);
        world.events.emit('turretFired', { position: _v2 });
      }
    } else if (this.cooldown <= 0 && angle < 0.12 && bestD < CAPITAL.turretRange) {
      this.burstLeft = CAPITAL.turretBurst;
      this.burstTimer = 0;
      this.cooldown = CAPITAL.turretCooldown * fxRng.range(0.8, 1.3);
    }
  }
}

export type CapitalState = 'hidden' | 'warping' | 'active' | 'dying' | 'dead';

export class CapitalShip {
  readonly object = new Group();
  readonly hull: Object3D;
  readonly layout: CapitalLayout;
  readonly generators: Generator[] = [];
  readonly turrets: Turret[] = [];
  readonly velocityZero = new Vector3();
  readonly upWorld = new Vector3(0, 1, 0);
  state: CapitalState = 'hidden';
  stateTime = 0;
  private launchTimer = 6;
  private readonly escorts: Ship[] = [];
  private readonly invQ = new Quaternion();
  private readonly homePos: Vector3;
  private explosionTimer = 0;
  /** 0..1 of the finale, for camera and effects. */
  finaleProgress = 0;
  /** Set by the mission when the final blast happens. */
  onFinalBlast: (() => void) | null = null;
  private blasted = false;
  readonly shield: ShieldBubble;
  private shieldLevel = 1;
  private readonly beamMat = new MeshBasicMaterial({
    color: new Color(0xffa040).multiplyScalar(2.2),
    transparent: true,
    opacity: 0.55,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });

  constructor(world: World) {
    this.layout = world.assets.capitalLayout();
    this.hull = world.assets.model('leviathan');
    this.object.add(this.hull);
    this.homePos = ARENA.capitalPos.clone();
    this.object.position.copy(this.homePos);
    this.object.rotation.y = ARENA.capitalYaw;
    this.object.visible = false;
    world.scene.add(this.object);

    this.shield = new ShieldBubble(0xff8a3a, 1.4);
    this.shield.mesh.position.copy(this.layout.shieldCenter);
    this.shield.mesh.scale.copy(this.layout.shieldRadii);
    this.object.add(this.shield.mesh);

    this.layout.generators.forEach((p, i) => {
      const obj = world.assets.model('generator');
      obj.position.copy(p);
      this.object.add(obj);
      const gen = new Generator(this, p.clone(), obj, i);
      // Beam from the orb down its pylon into the hull.
      const anchor = p.clone().multiplyScalar(0.28);
      gen.beam = makeBeam(p, anchor, this.beamMat);
      this.object.add(gen.beam);
      this.generators.push(gen);
    });
    for (const t of this.layout.turrets) {
      const obj = world.assets.model('turret');
      obj.position.copy(t.position);
      _q.setFromUnitVectors(_v.set(0, 1, 0), t.normal);
      obj.quaternion.copy(_q);
      this.object.add(obj);
      this.turrets.push(new Turret(this, t.position.clone(), t.normal.clone(), obj));
    }
    this.syncTransforms();
  }

  get shieldActive(): boolean {
    return (this.state === 'active' || this.state === 'warping') && this.generatorsAlive > 0;
  }

  get generatorsAlive(): number {
    let n = 0;
    for (const g of this.generators) if (g.alive) n++;
    return n;
  }

  get position(): Vector3 {
    return this.object.position;
  }

  /** Entities the player can shoot at on the carrier. */
  get liveGenerators(): Generator[] {
    return this.generators.filter((g) => g.alive);
  }

  reset(world: World): void {
    this.state = 'hidden';
    this.stateTime = 0;
    this.object.visible = false;
    this.object.position.copy(this.homePos);
    this.object.scale.set(1, 1, 1);
    this.finaleProgress = 0;
    this.blasted = false;
    for (const g of this.generators) {
      g.alive = true;
      g.hull = g.maxHull;
      g.object.visible = true;
      if (g.beam) g.beam.visible = true;
    }
    this.hull.visible = true;
    for (const t of this.turrets) t.base.visible = true;
    this.shield.mesh.visible = true;
    this.shieldLevel = 1;
    this.escorts.length = 0;
    this.launchTimer = 6;
    void world;
  }

  warpIn(world: World): void {
    // Arrive ~1.3 km ahead of the player, broadside on, so the fight comes to them.
    const p = world.player;
    if (p) {
      const fwd = p.forward(new Vector3());
      fwd.y *= 0.3;
      fwd.normalize();
      // Lean the arrival point toward the middle of the belt when the player is far out.
      const distOut = p.position.length();
      const toCenter = p.position.clone().multiplyScalar(-1 / Math.max(1, distOut));
      fwd.addScaledVector(toCenter, clamp((distOut - 900) / 1200, 0, 1.6)).normalize();
      const pos = p.position.clone().addScaledVector(fwd, 1300);
      pos.y = clamp(pos.y, -120, 220);
      if (pos.length() > 2300) pos.setLength(2300);
      // Never much farther than ~1.5 km from the player.
      const d = pos.distanceTo(p.position);
      if (d > 1550) pos.lerp(p.position, 1 - 1450 / d);
      this.homePos.copy(pos);
      const toPlayer = p.position.clone().sub(pos);
      toPlayer.y = 0;
      toPlayer.normalize();
      this.object.rotation.set(0, Math.atan2(toPlayer.x, toPlayer.z) + Math.PI / 2, 0);
    }
    this.object.position.copy(this.homePos);
    world.asteroids.vaporize(this.homePos, Math.max(this.layout.shieldRadii.z, 300) + 120, world);
    this.state = 'warping';
    this.stateTime = 0;
    this.object.visible = true;
    this.syncTransforms();
    world.effects.warpFlash(this.object.position, 60);
    world.events.emit('capitalArrived', { position: this.object.position.clone() });
  }

  private syncTransforms(): void {
    this.object.updateMatrixWorld(true);
    this.invQ.copy(this.object.quaternion).invert();
    this.upWorld.set(0, 1, 0).applyQuaternion(this.object.quaternion);
    for (const g of this.generators) this.object.localToWorld(g.position.copy(g.local));
    for (const t of this.turrets) {
      this.object.localToWorld(t.position.copy(t.local).addScaledVector(t.normalLocal, 3));
    }
  }

  update(dt: number, world: World): void {
    if (this.state === 'hidden' || this.state === 'dead') return;
    this.stateTime += dt;
    // Shield strength follows the live generators; a weakened shield flickers.
    const total = this.generators.length;
    const alive = this.generatorsAlive;
    const target = this.shieldActive ? 0.45 + 0.55 * (alive / total) : 0;
    this.shieldLevel += (target - this.shieldLevel) * Math.min(1, dt * 2.5);
    const flicker = this.shieldActive && alive < total ? 0.8 + 0.2 * Math.sin(world.time * 23) * Math.sin(world.time * 7.3) : 1;
    this.shield.update(world.time, this.shieldLevel * flicker);
    this.shield.mesh.visible = this.shieldLevel > 0.01;
    this.beamMat.opacity = 0.42 + 0.18 * Math.sin(world.time * 6);
    if (this.state === 'warping') {
      // Stretch in along the bow axis, then settle.
      const t = clamp(this.stateTime / 2.2, 0, 1);
      const e = 1 - Math.pow(1 - t, 3);
      this.object.scale.set(1, 1, 1 + (1 - e) * 5);
      _v.set(0, 0, 1).applyQuaternion(this.object.quaternion);
      this.object.position.copy(this.homePos).addScaledVector(_v, (1 - e) * 1400);
      if (t >= 1) {
        this.state = 'active';
        this.stateTime = 0;
        this.object.scale.set(1, 1, 1);
        this.object.position.copy(this.homePos);
      }
    }
    // Slow drift along its bow.
    if (this.state === 'active' || this.state === 'dying') {
      _v.set(0, 0, -1).applyQuaternion(this.object.quaternion);
      this.object.position.copy(this.homePos).addScaledVector(_v, Math.sin(world.time * 0.03) * 25);
    }
    this.syncTransforms();

    if (this.state === 'active') {
      for (const t of this.turrets) t.update(dt, world);
      this.launchTimer -= dt;
      for (let i = this.escorts.length - 1; i >= 0; i--) if (!this.escorts[i].alive) this.escorts.splice(i, 1);
      if (this.launchTimer <= 0) {
        this.launchTimer = CAPITAL.launchInterval;
        if (this.escorts.length < CAPITAL.maxEscorts) this.launchEscort(world);
      }
    } else if (this.state === 'dying') {
      this.updateFinale(dt, world);
    }
  }

  launchEscort(world: World): void {
    const pos = this.object.localToWorld(this.layout.hangar.position.clone());
    const dir = this.layout.hangar.direction.clone().applyQuaternion(this.object.quaternion).normalize();
    const ship = world.spawnEnemy('razor', pos, dir, true);
    ship.resetMotion(90);
    this.escorts.push(ship);
    world.events.emit('escortLaunched', { ship });
  }

  onGeneratorDestroyed(g: Generator, world: World): void {
    world.events.emit('generatorDestroyed', { generator: g, remaining: this.generatorsAlive });
    if (this.generatorsAlive === 0) {
      // The bubble flares once and collapses.
      this.shieldLevel = 2.5;
      this.state = 'dying';
      this.stateTime = 0;
      this.explosionTimer = 0.2;
      world.events.emit('shieldCollapsed', { position: this.object.position.clone() });
    }
  }

  private updateFinale(dt: number, world: World): void {
    const duration = 8.5;
    this.finaleProgress = clamp(this.stateTime / duration, 0, 1);
    this.explosionTimer -= dt;
    if (this.explosionTimer <= 0 && this.stateTime < 6.6) {
      // Chain reaction: explosions speed up as the reactor goes.
      this.explosionTimer = Math.max(0.08, 0.5 - this.stateTime * 0.07);
      const pts = this.layout.hullPoints;
      const p = pts[Math.floor(fxRng.next() * pts.length)];
      _v.copy(p).add(_v2.set(fxRng.range(-15, 15), fxRng.range(-10, 10), fxRng.range(-25, 25)));
      this.object.localToWorld(_v);
      world.effects.explosion(_v, fxRng.range(2.5, 5.5), this.velocityZero);
      world.events.emit('capitalExplosion', { position: _v.clone(), big: false });
    }
    if (this.stateTime > 6.6 && !this.blasted) {
      this.blasted = true;
      world.effects.explosion(this.object.position, 30, this.velocityZero);
      world.effects.warpFlash(this.object.position, 400);
      world.events.emit('capitalExplosion', { position: this.object.position.clone(), big: true });
      this.onFinalBlast?.();
      this.hull.visible = false;
      for (const t of this.turrets) t.base.visible = false;
      for (const g of this.generators) g.object.visible = false;
    }
    if (this.stateTime > duration) {
      this.state = 'dead';
      this.object.visible = false;
    }
  }

  /** Ellipsoid value: < 1 inside the shield. */
  private ellipsoidValue(local: Vector3): number {
    const r = this.layout.shieldRadii;
    const c = this.layout.shieldCenter;
    const x = (local.x - c.x) / r.x, y = (local.y - c.y) / r.y, z = (local.z - c.z) / r.z;
    return x * x + y * y + z * z;
  }

  private toLocal(world: Vector3, out: Vector3): Vector3 {
    return out.copy(world).sub(this.object.position).applyQuaternion(this.invQ);
  }

  /** Segment vs shield ellipsoid from outside. Returns t in [0,1] or -1. */
  segmentShieldT(p0: Vector3, p1: Vector3): number {
    const r = this.layout.shieldRadii;
    const c = this.layout.shieldCenter;
    this.toLocal(p0, _local0).sub(c);
    this.toLocal(p1, _local1).sub(c);
    _local0.set(_local0.x / r.x, _local0.y / r.y, _local0.z / r.z);
    _local1.set(_local1.x / r.x, _local1.y / r.y, _local1.z / r.z);
    const fx = _local0.x, fy = _local0.y, fz = _local0.z;
    const cc = fx * fx + fy * fy + fz * fz - 1;
    if (cc <= 0) return -1; // started inside: shots from within pass out
    const dx = _local1.x - fx, dy = _local1.y - fy, dz = _local1.z - fz;
    const a = dx * dx + dy * dy + dz * dz;
    const b = 2 * (fx * dx + fy * dy + fz * dz);
    if (b >= 0 || a < 1e-12) return -1;
    const disc = b * b - 4 * a * cc;
    if (disc < 0) return -1;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t >= 0 && t <= 1 ? t : -1;
  }

  /** Approximate distance from a world point to the shield surface (negative inside). */
  shieldDistance(p: Vector3): number {
    const v = this.ellipsoidValue(this.toLocal(p, _local0));
    const rMin = Math.min(this.layout.shieldRadii.x, this.layout.shieldRadii.y);
    return (Math.sqrt(v) - 1) * rMin;
  }

  onShieldStruck(point: Vector3, world: World): void {
    this.shield.hit(point, world.time);
    world.events.emit('capitalShieldHit', { point: point.clone() });
  }

  /** Keep ships outside the shield (and away from the hull after it falls). */
  collideShip(ship: Ship, world: World): void {
    if (this.state === 'hidden' || this.state === 'dead') return;
    const r = this.layout.shieldRadii;
    const c = this.layout.shieldCenter;
    this.toLocal(ship.position, _local0);
    const lx = (_local0.x - c.x) / (r.x + ship.radius);
    const ly = (_local0.y - c.y) / (r.y + ship.radius);
    const lz = (_local0.z - c.z) / (r.z + ship.radius);
    const val = lx * lx + ly * ly + lz * lz;
    if (val >= 1) return;
    // Push out along the ellipsoid gradient.
    const len = Math.sqrt(val) || 1e-3;
    _local1.set(lx / len, ly / len, lz / len);
    _local0.set(_local1.x * (r.x + ship.radius) + c.x, _local1.y * (r.y + ship.radius) + c.y, _local1.z * (r.z + ship.radius) + c.z);
    this.object.localToWorld(ship.position.copy(_local0));
    _v.set(lx / (r.x + ship.radius), ly / (r.y + ship.radius), lz / (r.z + ship.radius)).normalize().applyQuaternion(this.object.quaternion);
    const vn = ship.velocity.dot(_v);
    if (vn < 0) {
      ship.velocity.addScaledVector(_v, -vn * 1.7);
      ship.speed *= 0.6;
      if (this.shieldActive) {
        this.onShieldStruck(ship.position, world);
        ship.takeDamage(Math.min(30, -vn * 0.2), ship.position, null, world);
      } else {
        ship.takeDamage(Math.min(60, -vn * 0.4), ship.position, null, world);
      }
    }
  }

  /** World-space shield radii axis for effects. */
  shieldWorldMatrix(out: Matrix4): Matrix4 {
    const r = this.layout.shieldRadii;
    _v.copy(this.layout.shieldCenter);
    this.object.localToWorld(_v);
    return out.compose(_v, this.object.quaternion, _v2.copy(r));
  }
}
