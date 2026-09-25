import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { clamp, fxRng, leadPoint } from '../core/math';
import { addHullDetail, applyTeamRim } from '../render/materials';
import { ShieldBubble } from '../render/ShieldFX';
import { ARENA, CAPITAL } from './config';
import { Entity } from './Entity';
import type { Ship } from './Ship';
import type { World } from './World';

const CARRIER_RIM = new Color(0xff6a36);

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

  /** Seconds the wrecked pylon top keeps burning. */
  burnLeft = 0;

  protected onDestroyed(world: World): void {
    world.effects.explosion(this.position, 6.5, this.capital.velocityZero, false);
    this.burnLeft = 7;
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
        const spread = 0.034 / world.diff.enemyAim;
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
  private brokenUp = false;
  private readonly sections: { obj: Object3D; center: Vector3; vel: Vector3; axis: Vector3; spin: number; ends: Vector3[] }[] = [];
  private burnTimer = 0;
  private readonly sectionHomes: { obj: Object3D; pos: Vector3; quat: Quaternion }[] = [];
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
    // A faint, tight warm rim keeps the hull's silhouette readable on its shadowed side.
    applyTeamRim(this.hull, CARRIER_RIM, 0.16, 3.2);
    // Panel seams and tint across the hull (the baked texture is far too coarse for 940 m).
    this.hull.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as MeshStandardMaterial[]) {
        if (m.isMeshStandardMaterial && !/Glow/.test(m.name) && m.emissiveIntensity < 0.5) addHullDetail(m);
      }
    });
    this.object.add(this.hull);
    this.homePos = ARENA.capitalPos.clone();
    this.object.position.copy(this.homePos);
    this.object.rotation.y = ARENA.capitalYaw;
    this.object.visible = false;
    world.scene.add(this.object);

    this.shield = new ShieldBubble(0xff8a3a, 1.4, 1, 0.1);
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
    // Put broken sections back and relight the hull.
    for (const h of this.sectionHomes) {
      h.obj.position.copy(h.pos);
      h.obj.quaternion.copy(h.quat);
    }
    this.sectionHomes.length = 0;
    this.sections.length = 0;
    this.brokenUp = false;
    for (const l of this.lightMeshes()) l.visible = true;
    for (const t of this.turrets) t.base.visible = true;
    this.shield.mesh.visible = true;
    this.shieldLevel = 1;
    this.escorts.length = 0;
    this.launchTimer = 6;
    void world;
  }

  warpIn(world: World): void {
    // Arrive ~1 km ahead of the player, broadside on, so the fight comes to them.
    const p = world.player;
    if (p) {
      const fwd = p.forward(new Vector3());
      fwd.y *= 0.3;
      fwd.normalize();
      // Lean the arrival point toward the middle of the belt when the player is far out.
      const distOut = p.position.length();
      const toCenter = p.position.clone().multiplyScalar(-1 / Math.max(1, distOut));
      fwd.addScaledVector(toCenter, clamp((distOut - 900) / 1200, 0, 1.6)).normalize();
      const pos = p.position.clone().addScaledVector(fwd, 1000);
      pos.y = clamp(pos.y, -120, 220);
      if (pos.length() > 2300) pos.setLength(2300);
      // Never much farther than ~1.2 km from the player.
      const d = pos.distanceTo(p.position);
      if (d > 1250) pos.lerp(p.position, 1 - 1150 / d);
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

    // Wrecked generators burn for a while.
    for (const g of this.generators) {
      if (g.alive || g.burnLeft <= 0) continue;
      g.burnLeft -= dt;
      if (fxRng.next() < dt * 10) {
        _v.set(fxRng.range(-6, 6), fxRng.range(-4, 6), fxRng.range(-6, 6)).add(g.position);
        world.effects.burn(_v, fxRng.range(6, 11) * Math.min(1, g.burnLeft / 3 + 0.3));
      }
    }
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
    const duration = 9.6;
    const blastAt = 7.4;
    this.finaleProgress = clamp(this.stateTime / duration, 0, 1);
    // The lights stutter as power fails, then the hull breaks into its three sections.
    if (!this.brokenUp) {
      const flicker = this.stateTime > 1.1 && Math.sin(this.stateTime * 47) * Math.sin(this.stateTime * 13) > 0.2;
      for (const l of this.lightMeshes()) l.visible = !flicker;
      if (this.stateTime > 2.4) this.breakUp(world);
    }
    for (const s of this.sections) {
      s.obj.position.addScaledVector(s.vel, dt);
      _q.setFromAxisAngle(s.axis, s.spin * dt);
      s.obj.quaternion.premultiply(_q);
    }
    // The torn ends of each section burn and smoke until the blast.
    if (this.brokenUp && !this.blasted) {
      this.burnTimer -= dt;
      while (this.burnTimer <= 0) {
        this.burnTimer += 0.035;
        const sec = this.sections[Math.floor(fxRng.next() * this.sections.length)];
        if (!sec || !sec.ends.length) break;
        const end = sec.ends[Math.floor(fxRng.next() * sec.ends.length)];
        _v.set(fxRng.range(-40, 40), fxRng.range(-22, 26), fxRng.range(-6, 6)).multiplyScalar(CAPITAL.scale).add(end);
        _v.applyQuaternion(sec.obj.quaternion).add(sec.obj.position);
        this.object.localToWorld(_v);
        world.effects.burn(_v, fxRng.range(12, 22), 25);
      }
    }
    this.explosionTimer -= dt;
    if (this.explosionTimer <= 0 && this.stateTime < blastAt) {
      // Chain reaction: explosions speed up as the reactor goes.
      this.explosionTimer = Math.max(0.07, 0.45 - this.stateTime * 0.055);
      const sec = this.sections.length ? this.sections[Math.floor(fxRng.next() * this.sections.length)] : null;
      if (sec) {
        // A point on a drifting section.
        _v.set(fxRng.range(-45, 45), fxRng.range(-25, 30), fxRng.range(-90, 90)).multiplyScalar(CAPITAL.scale).add(sec.center);
        _v.applyQuaternion(sec.obj.quaternion).add(sec.obj.position);
      } else {
        const pts = this.layout.hullPoints;
        _v.copy(pts[Math.floor(fxRng.next() * pts.length)]).add(_v2.set(fxRng.range(-15, 15), fxRng.range(-10, 10), fxRng.range(-25, 25)));
      }
      this.object.localToWorld(_v);
      world.effects.explosion(_v, fxRng.range(2.5, 5.5), this.velocityZero, false, 45);
      world.events.emit('capitalExplosion', { position: _v.clone(), big: false });
    }
    if (this.stateTime > blastAt && !this.blasted) {
      this.blasted = true;
      // The core flash, shock rings and hull debris come from the FX 'capitalExplosion' handler.
      world.effects.explosion(this.object.position, 16, this.velocityZero, false, 200);
      for (const s of this.sections) {
        _v.copy(s.center).applyQuaternion(s.obj.quaternion).add(s.obj.position);
        this.object.localToWorld(_v);
        world.effects.explosion(_v, 6.5, this.velocityZero, false, 70);
      }
      world.events.emit('capitalExplosion', { position: this.object.position.clone(), big: true });
      // The blast shatters the rocks drifting around the wreck.
      world.asteroids.vaporize(this.object.position, 760 * CAPITAL.scale, world);
      this.onFinalBlast?.();
      // Bow and stern fly out along the keel, the middle rises; never toward the player (and camera).
      const toPlayer = _v2.set(0, 0, 0);
      if (world.player) this.toLocal(world.player.position, toPlayer).normalize();
      for (const s of this.sections) {
        _v.set(0, 1, 0);
        if (s.center.z < -60) _v.set(0, 0.2, -1);
        else if (s.center.z > 60) _v.set(0, -0.15, 1);
        _v.normalize();
        const toward = _v.dot(toPlayer);
        if (toward > 0) _v.addScaledVector(toPlayer, -toward * 1.2).normalize();
        s.vel.addScaledVector(_v, 100);
        s.spin *= 3;
      }
      // The light strips went dark at the break-up; without sections (greybox) the hull just vanishes.
      if (!this.sections.length) this.hull.visible = false;
      for (const t of this.turrets) t.base.visible = false;
      for (const g of this.generators) g.object.visible = false;
    }
    // Burning wrecks after the blast.
    if (this.blasted && this.stateTime < duration) {
      this.burnTimer -= dt;
      while (this.burnTimer <= 0) {
        this.burnTimer += 0.05;
        const sec = this.sections[Math.floor(fxRng.next() * this.sections.length)];
        if (!sec) break;
        _v.set(fxRng.range(-40, 40), fxRng.range(-20, 20), fxRng.range(-80, 80)).multiplyScalar(CAPITAL.scale).add(sec.center);
        _v.applyQuaternion(sec.obj.quaternion).add(sec.obj.position);
        this.object.localToWorld(_v);
        world.effects.burn(_v, fxRng.range(14, 26), 35);
      }
    }
    if (this.stateTime > duration) {
      this.state = 'dead';
      this.object.visible = false;
    }
  }

  private lightCache: Object3D[] | null = null;
  private lightMeshes(): Object3D[] {
    if (!this.lightCache) {
      this.lightCache = [];
      this.hull.traverse((o) => {
        if (/Leviathan_(Windows|Running|Hangar|Engines)/.test(o.name)) this.lightCache!.push(o);
      });
      for (const g of this.generators) if (g.beam) this.lightCache.push(g.beam);
    }
    return this.lightCache;
  }

  /** Separate the bow, mid and stern sections and send them drifting apart. */
  private breakUp(world: World): void {
    this.brokenUp = true;
    for (const l of this.lightMeshes()) l.visible = false;
    // name, drift (vy, vz), which ends face a neighbour (-1 = min z, +1 = max z).
    const defs: [string, number, number, number[]][] = [
      ['Leviathan_Bow', 9, -48, [1]],
      ['Leviathan_Mid', -2, 1, [-1, 1]],
      ['Leviathan_Stern', -9, 43, [-1]],
    ];
    for (const [name, vy, vz, endSides] of defs) {
      const obj = this.hull.getObjectByName(name);
      if (!obj) continue;
      this.sectionHomes.push({ obj, pos: obj.position.clone(), quat: obj.quaternion.clone() });
      const mesh = obj as Mesh;
      const center = new Vector3();
      const ends: Vector3[] = [];
      if (mesh.isMesh) {
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox!;
        box.getCenter(center);
        for (const side of endSides) ends.push(new Vector3(center.x, center.y, side < 0 ? box.min.z : box.max.z));
      }
      this.sections.push({
        obj,
        center,
        vel: new Vector3(fxRng.range(-4, 4), vy, vz),
        axis: fxRng.unitVector(new Vector3()),
        spin: fxRng.range(0.08, 0.16),
        ends,
      });
    }
    // Fireballs along the two fracture lines.
    for (const z of [-120, 130]) {
      for (let i = 0; i < 4; i++) {
        _v.set(fxRng.range(-45, 45), fxRng.range(-25, 25), z + fxRng.range(-12, 12)).multiplyScalar(CAPITAL.scale);
        this.object.localToWorld(_v);
        world.effects.explosion(_v, fxRng.range(4.5, 7), this.velocityZero, false, 50);
      }
      world.events.emit('capitalExplosion', { position: _v.clone(), big: false });
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
