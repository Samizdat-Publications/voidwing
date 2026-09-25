import {
  BufferGeometry,
  Camera,
  Color,
  DynamicDrawUsage,
  Frustum,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Material,
  Matrix4,
  Quaternion,
  Sphere,
  Vector3,
} from 'three';
import { Rng, fxRng, segmentSphere } from '../core/math';
import { ARENA } from './config';
import type { World } from './World';

export interface AsteroidVariant {
  geometry: BufferGeometry;
  material: Material | Material[];
  /** Bounding radius of the geometry at scale 1. */
  radius: number;
}

/** Size tier: 0 = landmark (indestructible), 1 large, 2 medium, 3 small. */
export type Tier = 0 | 1 | 2 | 3;

export interface Asteroid {
  alive: boolean;
  variant: number;
  tier: Tier;
  position: Vector3;
  velocity: Vector3;
  quaternion: Quaternion;
  spinAxis: Vector3;
  spinRate: number;
  /** Collision radius in metres. */
  radius: number;
  /** Visual scale applied to the variant geometry. */
  scale: number;
  hp: number;
  maxHp: number;
  flash: number;
  stamp: number;
}

const TIER_HP = [Infinity, 190, 70, 24];
const CELL = 260;
const MAX_INSTANCES = 700;

const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _sphere = new Sphere();
const _frustum = new Frustum();
const _pv = new Matrix4();
const _white = new Color(1, 1, 1);
const _flash = new Color();

export class AsteroidField {
  readonly group = new Group();
  readonly list: Asteroid[] = [];
  private readonly meshes: InstancedMesh[] = [];
  private readonly grid = new Map<number, Asteroid[]>();
  private stampCounter = 1;
  /** Largest radius among grid-stored (non-landmark) rocks, for query padding. */
  private maxGridRadius = 80;
  private readonly landmarks: Asteroid[] = [];
  readonly segResult: { asteroid: Asteroid | null; t: number } = { asteroid: null, t: 2 };
  destroyedCount = 0;

  constructor(private readonly variants: AsteroidVariant[]) {
    for (const v of variants) {
      const mesh = new InstancedMesh(v.geometry, v.material, MAX_INSTANCES);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX_INSTANCES * 3), 3);
      mesh.instanceColor.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
  }

  /** Scatter the field. Keeps clear bubbles around the player start and the carrier. */
  generate(rng: Rng): void {
    this.list.length = 0;
    this.landmarks.length = 0;
    const clear = [{ c: ARENA.playerStart, r: 260 }];
    const place = (tier: Tier, rMin: number, rMax: number, count: number, spread: number) => {
      let placed = 0;
      let guard = 0;
      while (placed < count && guard++ < count * 40) {
        const radius = rng.range(rMin, rMax);
        const ang = rng.range(0, Math.PI * 2);
        // Denser toward a ring at ~60% of the field radius.
        const rr = ARENA.fieldRadius * Math.min(1, Math.max(0.05, 0.62 + rng.gauss() * 0.28 * spread));
        const pos = new Vector3(Math.cos(ang) * rr, rng.gauss() * ARENA.fieldHalfThickness * 0.5, Math.sin(ang) * rr);
        if (clear.some((z) => pos.distanceTo(z.c) < z.r + radius)) continue;
        if (this.list.some((a) => a.position.distanceTo(pos) < a.radius + radius + 20)) continue;
        this.add(tier, pos, radius, new Vector3(rng.range(-3, 3), rng.range(-1, 1), rng.range(-3, 3)), rng);
        placed++;
      }
    };
    place(0, 130, 230, 6, 1.4);
    place(1, 34, 62, 46, 1.0);
    place(2, 15, 28, 90, 1.1);
    place(3, 6, 12, 90, 1.2);
    this.rebuildGrid();
  }

  add(tier: Tier, position: Vector3, radius: number, velocity: Vector3, rng: Rng = fxRng): Asteroid {
    const variant = rng.int(0, this.variants.length - 1);
    const vr = this.variants[variant].radius;
    const a: Asteroid = {
      alive: true,
      variant,
      tier,
      position: position.clone(),
      velocity: velocity.clone(),
      quaternion: new Quaternion().setFromAxisAngle(rng.unitVector(new Vector3()), rng.range(0, Math.PI * 2)),
      spinAxis: rng.unitVector(new Vector3()),
      spinRate: rng.range(0.02, 0.25) * (tier === 0 ? 0.15 : tier === 3 ? 2.2 : 1),
      radius,
      scale: radius / (vr * 0.9),
      hp: TIER_HP[tier],
      maxHp: TIER_HP[tier],
      flash: 0,
      stamp: 0,
    };
    this.list.push(a);
    if (tier === 0) this.landmarks.push(a);
    return a;
  }

  update(dt: number, camera: Camera): void {
    for (const a of this.list) {
      if (!a.alive) continue;
      a.position.addScaledVector(a.velocity, dt);
      _q.setFromAxisAngle(a.spinAxis, a.spinRate * dt);
      a.quaternion.premultiply(_q);
      if (a.flash > 0) a.flash = Math.max(0, a.flash - dt * 6);
    }
    if (this.list.length > 400 && this.destroyedCount > 60) {
      // Compact the list now and then.
      for (let i = this.list.length - 1; i >= 0; i--) if (!this.list[i].alive) this.list.splice(i, 1);
      this.destroyedCount = 0;
    }
    this.rebuildGrid();
    this.writeInstances(camera);
  }

  private cellKey(ix: number, iy: number, iz: number): number {
    return ((ix + 512) * 1024 + (iy + 512)) * 1024 + (iz + 512);
  }

  private rebuildGrid(): void {
    for (const arr of this.grid.values()) arr.length = 0;
    let maxR = 0;
    for (const a of this.list) {
      if (!a.alive || a.tier === 0) continue;
      if (a.radius > maxR) maxR = a.radius;
      const ix = Math.floor(a.position.x / CELL), iy = Math.floor(a.position.y / CELL), iz = Math.floor(a.position.z / CELL);
      const key = this.cellKey(ix, iy, iz);
      let arr = this.grid.get(key);
      if (!arr) {
        arr = [];
        this.grid.set(key, arr);
      }
      arr.push(a);
    }
    this.maxGridRadius = Math.max(20, maxR);
  }

  /** Visit every live rock whose sphere may overlap the given sphere. */
  queryRadius(center: Vector3, r: number, cb: (a: Asteroid) => void): void {
    const stamp = ++this.stampCounter;
    const pad = r + this.maxGridRadius;
    const x0 = Math.floor((center.x - pad) / CELL), x1 = Math.floor((center.x + pad) / CELL);
    const y0 = Math.floor((center.y - pad) / CELL), y1 = Math.floor((center.y + pad) / CELL);
    const z0 = Math.floor((center.z - pad) / CELL), z1 = Math.floor((center.z + pad) / CELL);
    for (let ix = x0; ix <= x1; ix++)
      for (let iy = y0; iy <= y1; iy++)
        for (let iz = z0; iz <= z1; iz++) {
          const arr = this.grid.get(this.cellKey(ix, iy, iz));
          if (!arr) continue;
          for (const a of arr) {
            if (a.stamp === stamp || !a.alive) continue;
            a.stamp = stamp;
            const rr = r + a.radius;
            if (a.position.distanceToSquared(center) <= rr * rr) cb(a);
          }
        }
    for (const a of this.landmarks) {
      const rr = r + a.radius;
      if (a.position.distanceToSquared(center) <= rr * rr) cb(a);
    }
  }

  /** Nearest rock struck by segment p0 -> p1 (with extra radius pad). Result is reused. */
  segmentHit(p0: Vector3, p1: Vector3, pad: number): { asteroid: Asteroid | null; t: number } {
    const res = this.segResult;
    res.asteroid = null;
    res.t = 2;
    const stamp = ++this.stampCounter;
    const r = this.maxGridRadius + pad;
    const x0 = Math.floor((Math.min(p0.x, p1.x) - r) / CELL), x1 = Math.floor((Math.max(p0.x, p1.x) + r) / CELL);
    const y0 = Math.floor((Math.min(p0.y, p1.y) - r) / CELL), y1 = Math.floor((Math.max(p0.y, p1.y) + r) / CELL);
    const z0 = Math.floor((Math.min(p0.z, p1.z) - r) / CELL), z1 = Math.floor((Math.max(p0.z, p1.z) + r) / CELL);
    let best: Asteroid | null = null;
    for (let ix = x0; ix <= x1; ix++)
      for (let iy = y0; iy <= y1; iy++)
        for (let iz = z0; iz <= z1; iz++) {
          const arr = this.grid.get(this.cellKey(ix, iy, iz));
          if (!arr) continue;
          for (const a of arr) {
            if (a.stamp === stamp || !a.alive) continue;
            a.stamp = stamp;
            const t = segmentSphere(p0, p1, a.position, a.radius + pad);
            if (t >= 0 && t < res.t) {
              res.t = t;
              best = a;
            }
          }
        }
    for (const a of this.landmarks) {
      const t = segmentSphere(p0, p1, a.position, a.radius + pad);
      if (t >= 0 && t < res.t) {
        res.t = t;
        best = a;
      }
    }
    res.asteroid = best;
    return res;
  }

  damage(a: Asteroid, amount: number, point: Vector3, world: World): void {
    if (!a.alive) return;
    a.flash = 1;
    world.events.emit('asteroidHit', { position: point, radius: a.radius });
    if (a.tier === 0) return;
    a.hp -= amount;
    if (a.hp <= 0) this.destroy(a, world);
  }

  private destroy(a: Asteroid, world: World): void {
    a.alive = false;
    this.destroyedCount++;
    world.events.emit('asteroidDestroyed', { position: a.position.clone(), radius: a.radius, tier: a.tier });
    if (a.tier >= 3) return;
    const childTier = (a.tier + 1) as Tier;
    const n = a.tier === 1 ? fxRng.int(3, 4) : fxRng.int(2, 3);
    for (let i = 0; i < n; i++) {
      const dir = fxRng.unitVector(new Vector3());
      const r = a.radius * fxRng.range(0.36, 0.5);
      const pos = a.position.clone().addScaledVector(dir, a.radius * 0.5);
      // Fragments drift apart slowly so the break-up reads on screen.
      const vel = a.velocity.clone().addScaledVector(dir, fxRng.range(9, 20) * (childTier === 3 ? 1.3 : 1));
      const child = this.add(childTier, pos, r, vel);
      child.spinRate *= 2.5;
    }
  }

  private writeInstances(camera: Camera): void {
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pv);
    const counts = [0, 0, 0, 0, 0, 0, 0, 0];
    for (const a of this.list) {
      if (!a.alive) continue;
      _sphere.center.copy(a.position);
      _sphere.radius = a.radius * 1.35;
      if (!_frustum.intersectsSphere(_sphere)) continue;
      const mesh = this.meshes[a.variant];
      const n = counts[a.variant]++;
      if (n >= MAX_INSTANCES) continue;
      _s.setScalar(a.scale);
      _m.compose(a.position, a.quaternion, _s);
      mesh.setMatrixAt(n, _m);
      if (a.flash > 0) _flash.setRGB(1 + a.flash * 2.5, 1 + a.flash * 1.6, 1 + a.flash * 1.0);
      else _flash.copy(_white);
      mesh.setColorAt(n, _flash);
    }
    for (let k = 0; k < this.meshes.length; k++) {
      const mesh = this.meshes[k];
      mesh.count = Math.min(counts[k], MAX_INSTANCES);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /** Move a point (the camera) out of any rock it is inside, plus a margin. */
  pushOut(p: Vector3, margin: number): void {
    this.queryRadius(p, margin, (a) => {
      const d = a.position.distanceTo(p);
      const min = a.radius + margin;
      if (d < min && d > 1e-3) p.sub(a.position).multiplyScalar(min / d).add(a.position);
    });
  }

  /** Remove every rock overlapping a sphere (a capital ship jumping in). */
  vaporize(center: Vector3, radius: number, world: World): void {
    for (const a of this.list) {
      if (!a.alive) continue;
      if (a.position.distanceTo(center) > radius + a.radius * 0.5) continue;
      a.alive = false;
      this.destroyedCount++;
      world.events.emit('asteroidVaporized', { position: a.position.clone(), radius: a.radius });
    }
    for (let i = this.landmarks.length - 1; i >= 0; i--) if (!this.landmarks[i].alive) this.landmarks.splice(i, 1);
    this.rebuildGrid();
  }

  /** Nearest live rock distance-to-surface from a point (for AI and spawning). */
  clearance(p: Vector3, r: number): boolean {
    let ok = true;
    this.queryRadius(p, r, () => {
      ok = false;
    });
    return ok;
  }

  get aliveCount(): number {
    let n = 0;
    for (const a of this.list) if (a.alive) n++;
    return n;
  }
}

