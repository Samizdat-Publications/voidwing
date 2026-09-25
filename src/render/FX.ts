import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Scene,
  Vector3,
  type Material,
} from 'three';
import { fxRng } from '../core/math';
import { BOLTS, type BoltKind } from '../game/config';
import type { Missile } from '../game/Missiles';
import type { Ship } from '../game/Ship';
import type { World } from '../game/World';
import type { Assets } from './Assets';
import type { EffectsApi } from './Effects';
import { Particles } from './Particles';
import { setRimBoost } from './materials';
import { ShieldBubble } from './ShieldFX';
import { Trails, type TrailHandle } from './Trails';

interface ShipFx {
  exhausts: Object3D[];
  trails: TrailHandle[];
  glowMats: { mat: MeshStandardMaterial; base: number }[];
  hullMats: MeshStandardMaterial[];
  flash: number;
  shield: ShieldBubble | null;
  shieldUntil: number;
  smokeTimer: number;
  /** Ship-local point where damage smoke and fire come out. */
  wound: Vector3;
}

interface Look {
  flare: Color;
  trail: Color;
  width: number;
  flareSize: number;
  shield: number;
}

const LOOKS: Record<string, Look> = {
  player: { flare: new Color(0.35, 0.7, 1).multiplyScalar(0.9), trail: new Color(0.25, 0.65, 1).multiplyScalar(0.8), width: 0.9, flareSize: 2.2, shield: 0x55ccff },
  wingman: { flare: new Color(0.45, 0.6, 1).multiplyScalar(2.8), trail: new Color(0.3, 0.45, 1).multiplyScalar(1.2), width: 1.3, flareSize: 4.5, shield: 0x6f8cff },
  razor: { flare: new Color(1, 0.45, 0.2).multiplyScalar(4), trail: new Color(1, 0.33, 0.12).multiplyScalar(2.1), width: 2.2, flareSize: 8, shield: 0xff5a3a },
  maul: { flare: new Color(1, 0.5, 0.2).multiplyScalar(4), trail: new Color(1, 0.4, 0.1).multiplyScalar(2), width: 4.3, flareSize: 14, shield: 0xff7a2a },
};

const FALLBACK_EXHAUST: Record<string, Vector3[]> = {
  player: [new Vector3(-1.3, 0, 6.2), new Vector3(1.3, 0, 6.2)],
  wingman: [new Vector3(-1.3, 0, 6.2), new Vector3(1.3, 0, 6.2)],
  razor: [new Vector3(0, 0, 8.2)],
  maul: [new Vector3(-9.2, -1.4, 13.8), new Vector3(9.2, -1.4, 13.8)],
};

const _p = new Vector3();
const _v = new Vector3();
const _d = new Vector3();
const _c = new Color();
const MISSILE_GLOW = new Color(1, 0.8, 0.5).multiplyScalar(3.5);
const ENEMY_MISSILE_GLOW = new Color(1, 0.35, 0.2).multiplyScalar(3.5);

/** Speed streaks drifting past the camera: the main cue for how fast you are going. */
class SpaceDust {
  readonly lines: LineSegments;
  private readonly pts: Float32Array;
  private readonly aPos: BufferAttribute;
  private readonly aCol: BufferAttribute;
  private readonly lastCam = new Vector3();
  private readonly vel = new Vector3();
  private readonly n = 700;
  private readonly box = 260;

  constructor(scene: Scene) {
    this.pts = new Float32Array(this.n * 3);
    for (let i = 0; i < this.n * 3; i++) this.pts[i] = (fxRng.next() - 0.5) * this.box;
    this.aPos = new BufferAttribute(new Float32Array(this.n * 6), 3).setUsage(DynamicDrawUsage);
    this.aCol = new BufferAttribute(new Float32Array(this.n * 6), 3).setUsage(DynamicDrawUsage);
    const geo = new BufferGeometry();
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('color', this.aCol);
    this.lines = new LineSegments(geo, new LineBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.lines.frustumCulled = false;
    scene.add(this.lines);
  }

  update(dt: number, cam: Vector3): void {
    if (dt > 0) {
      _v.subVectors(cam, this.lastCam).multiplyScalar(1 / dt);
      if (_v.length() > 2000) _v.set(0, 0, 0); // camera cut
      this.vel.lerp(_v, 0.25);
    }
    this.lastCam.copy(cam);
    const half = this.box / 2;
    const pos = this.aPos.array as Float32Array;
    const col = this.aCol.array as Float32Array;
    const speed = this.vel.length();
    const bright = Math.min(1, speed / 180) * 0.55;
    for (let i = 0; i < this.n; i++) {
      for (let a = 0; a < 3; a++) {
        const c = a === 0 ? cam.x : a === 1 ? cam.y : cam.z;
        let rel = this.pts[i * 3 + a] - c;
        rel = ((((rel + half) % this.box) + this.box) % this.box) - half;
        this.pts[i * 3 + a] = c + rel;
      }
      const x = this.pts[i * 3], y = this.pts[i * 3 + 1], z = this.pts[i * 3 + 2];
      const dist = Math.hypot(x - cam.x, y - cam.y, z - cam.z);
      const fade = Math.max(0, 1 - dist / half) * bright;
      pos[i * 6] = x;
      pos[i * 6 + 1] = y;
      pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x - this.vel.x * 0.035;
      pos[i * 6 + 4] = y - this.vel.y * 0.035;
      pos[i * 6 + 5] = z - this.vel.z * 0.035;
      col[i * 6] = col[i * 6 + 1] = col[i * 6 + 2] = fade;
      col[i * 6 + 3] = col[i * 6 + 4] = col[i * 6 + 5] = 0;
    }
    this.aPos.needsUpdate = this.aCol.needsUpdate = true;
  }
}

/** Game-facing effects: particles, trails, flares, shimmer, damage and ambient motion. */
export class FX implements EffectsApi {
  readonly particles: Particles;
  readonly trails: Trails;
  private readonly speedDust: SpaceDust;
  private readonly ships = new Map<Ship, ShipFx>();
  private readonly missiles = new WeakMap<Missile, number>();
  private time = 0;
  private world: World | null = null;
  private readonly camPos = new Vector3();

  constructor(scene: Scene, assets: Assets) {
    this.particles = new Particles(scene);
    this.trails = new Trails(scene);
    this.speedDust = new SpaceDust(scene);
    const debris = assets.part('debris', 'Debris_Metal_0') ? this.debrisPieces(assets) : [];
    this.particles.setDebris(debris);
  }

  private debrisPieces(assets: Assets) {
    const out: { geometry: BufferGeometry; material: MeshStandardMaterial; rock: boolean }[] = [];
    for (const name of ['Debris_Metal_0', 'Debris_Metal_1', 'Debris_Metal_2', 'Debris_Rock_0', 'Debris_Rock_1', 'Debris_Rock_2']) {
      const o = assets.part('debris', name) as Mesh | null;
      if (o && o.isMesh) out.push({ geometry: o.geometry, material: o.material as MeshStandardMaterial, rock: name.includes('Rock') });
    }
    return out;
  }

  /** Subscribe to the world's gameplay events. */
  attach(world: World): void {
    this.world = world;
    const ev = world.events;
    ev.on('boltImpact', ({ point, dir, kind, shield }) => {
      _c.set(BOLTS[kind as BoltKind]?.color ?? 0xffffff).multiplyScalar(3);
      this.particles.hit(point, dir, shield, _c);
    });
    ev.on('fired', ({ ship, origin }) => {
      _c.set(BOLTS[ship.spec.bolt].color).multiplyScalar(3.5);
      this.particles.glow(origin, ship.kind === 'maul' ? 6 : 3.2, _c, 0.05);
    });
    ev.on('turretFired', ({ position }) => this.particles.glow(position, 13, _c.setRGB(3.5, 1.8, 0.6), 0.09));
    ev.on('asteroidDestroyed', ({ position, radius }) => this.particles.rockBurst(position, radius));
    ev.on('asteroidVaporized', ({ position, radius }) => this.particles.rockBurst(position, radius * 0.6));
    ev.on('shieldHit', ({ entity, point }) => {
      const fx = this.ships.get(entity as Ship);
      if (!fx) return;
      const ship = entity as Ship;
      if (!fx.shield) {
        const look = LOOKS[ship.kind] ?? LOOKS.razor;
        fx.shield = new ShieldBubble(look.shield, 2.4, 0);
        const r = ship.radius;
        fx.shield.mesh.scale.set(r * 1.2, r * 0.85, r * 1.5);
        ship.object.add(fx.shield.mesh);
      }
      fx.shield.hit(point, this.time);
      fx.shieldUntil = this.time + 1.4;
    });
    ev.on('hullHit', ({ entity, point }) => {
      const fx = this.ships.get(entity as Ship);
      const own = entity.kind === 'player';
      if (fx) fx.flash = own ? 0.45 : 1;
      _d.subVectors(point, entity.position).normalize();
      this.particles.hit(point, _d.negate(), false, own ? _c.setRGB(1.4, 0.8, 0.35) : _c.setRGB(3, 1.6, 0.6));
    });
    ev.on('capitalShieldHit', ({ point }) => {
      _d.subVectors(point, world.capital.position).normalize().negate();
      this.particles.hit(point, _d, true, _c.setRGB(3, 1.4, 0.5));
    });
    ev.on('generatorDestroyed', ({ generator }) => this.particles.shockwave(generator.position, 150, 0.8));
    ev.on('capitalExplosion', ({ position, big }) => {
      if (!big) return;
      // The shock rings lie in the carrier's deck plane, tipped toward the camera so they read as ellipses.
      const up = _d.set(0, 1, 0).applyQuaternion(world.capital.object.quaternion);
      const toCam = _v.subVectors(this.camPos, position);
      toCam.addScaledVector(up, -toCam.dot(up));
      if (toCam.lengthSq() < 1) toCam.set(1, 0, 0);
      this.particles.nova(position, up, toCam.normalize());
    });
    ev.on('destroyed', ({ entity }) => {
      const fx = this.ships.get(entity as Ship);
      if (fx) this.releaseShip(entity as Ship, fx);
    });
  }

  private releaseShip(ship: Ship, fx: ShipFx): void {
    for (const t of fx.trails) this.trails.release(t);
    if (fx.shield) ship.object.remove(fx.shield.mesh);
    this.ships.delete(ship);
  }

  private makeShipFx(ship: Ship): ShipFx {
    const exhausts: Object3D[] = [];
    const glowMats: ShipFx['glowMats'] = [];
    const hullMats: MeshStandardMaterial[] = [];
    ship.model.traverse((o) => {
      if (o.name.startsWith('Exhaust')) exhausts.push(o);
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const mats: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const sm = m as MeshStandardMaterial;
        if (!sm.isMeshStandardMaterial) continue;
        if (mesh.userData.engineGlow) glowMats.push({ mat: sm, base: sm.emissiveIntensity });
        else if (/Hull/.test(mesh.name)) hullMats.push(sm);
      }
    });
    if (!exhausts.length) {
      for (const p of FALLBACK_EXHAUST[ship.kind] ?? []) {
        const o = new Object3D();
        o.position.copy(p);
        ship.object.add(o);
        exhausts.push(o);
      }
    }
    const look = LOOKS[ship.kind] ?? LOOKS.razor;
    const trails = exhausts.map(() => this.trails.create(look.trail, look.width, ship.kind === 'maul' ? 0.8 : 0.55));
    const r = ship.radius;
    const wound = new Vector3(fxRng.range(0.25, 0.5) * r * (fxRng.chance(0.5) ? 1 : -1), fxRng.range(0, 0.12) * r, fxRng.range(-0.1, 0.35) * r);
    const fx: ShipFx = { exhausts, trails, glowMats, hullMats, flash: 0, shield: null, shieldUntil: 0, smokeTimer: 0, wound };
    this.ships.set(ship, fx);
    return fx;
  }

  // ---- EffectsApi (used by game code) ----
  explosion(pos: Vector3, size: number, vel: Vector3, shell = true): void {
    this.particles.explosion(pos, size, vel, shell);
  }
  warpFlash(pos: Vector3, size: number): void {
    this.particles.warp(pos, size);
  }
  burn(pos: Vector3, size: number): void {
    this.particles.burn(pos, size);
  }
  spark(pos: Vector3, color = 0xffd080, size = 1.2): void {
    this.particles.glow(pos, size * 3, _c.set(color).multiplyScalar(3), 0.15);
  }
  dust(pos: Vector3, radius: number): void {
    this.particles.rockBurst(pos, radius);
  }
  clear(): void {
    for (const [ship, fx] of this.ships) this.releaseShip(ship, fx);
    this.particles.clear();
    this.trails.clear();
  }

  update(dt: number): void {
    this.time += dt;
    const w = this.world;
    if (w) {
      for (const ship of w.ships) {
        if (!ship.alive) continue;
        const fx = this.ships.get(ship) ?? this.makeShipFx(ship);
        this.updateShip(ship, fx, dt);
      }
      // Ships removed without a destroyed event (retry / restart).
      for (const [ship, fx] of this.ships) if (!w.ships.includes(ship)) this.releaseShip(ship, fx);
      for (const m of w.missiles.list) this.updateMissile(m);
      for (const g of w.capital.generators) {
        const ring = g.object.getObjectByName('Gen_Ring');
        if (ring && g.alive) ring.rotation.z += dt * 0.9;
      }
    }
    this.particles.update(dt);
  }

  /** Needs the camera, so the game calls it separately after the camera moves. */
  updateView(dt: number, cameraPos: Vector3, viewportHeight: number, fov: number): void {
    this.camPos.copy(cameraPos);
    // Readability at dogfight range: other ships are drawn up to 2.8x larger with distance
    // (visual only; hit spheres keep their real size), and their team rim glows brighter so a far
    // fighter reads as a lit silhouette. The player's current target pulses on top of that.
    if (this.world) {
      const target = this.world.player?.target ?? null;
      const pulse = 0.5 * Math.sin(performance.now() / 160);
      for (const s of this.world.ships) {
        if (s.kind === 'player' || !s.alive) continue;
        const d = s.position.distanceTo(cameraPos);
        s.model.scale.setScalar(Math.min(2.8, Math.max(1, 1 + (d - 240) / 400)));
        const far = Math.min(1.8, Math.max(0, (d - 220) / 330));
        setRimBoost(s.model, (s === target ? 1.9 + pulse : 1) + far);
      }
    }
    this.trails.update(dt, cameraPos);
    this.speedDust.update(dt, cameraPos);
    this.particles.setViewport(viewportHeight, fov);
  }

  private updateShip(ship: Ship, fx: ShipFx, dt: number): void {
    const look = LOOKS[ship.kind] ?? LOOKS.razor;
    const thrust = 0.55 + ship.throttle * 0.45 + (ship.boosting ? 0.7 : 0);
    const flicker = 0.9 + fxRng.next() * 0.2;
    for (let i = 0; i < fx.exhausts.length; i++) {
      fx.exhausts[i].getWorldPosition(_p);
      this.trails.push(fx.trails[i], _p);
      this.particles.glow(_p, look.flareSize * thrust * flicker, look.flare);
      if (ship.boosting) this.particles.glow(_p, look.flareSize * 2.2, _c.copy(look.flare).multiplyScalar(0.35));
    }
    // The player's nozzles sit in the middle of the view: keep them from blooming into white discs.
    const glowGain = ship.kind === 'player' ? 0.3 : 0.6;
    for (const g of fx.glowMats) g.mat.emissiveIntensity = g.base * (0.5 + thrust * glowGain);
    if (fx.flash > 0) {
      fx.flash = Math.max(0, fx.flash - dt * 7);
      for (const m of fx.hullMats) m.emissive.setRGB(1, 0.55, 0.35).multiplyScalar(fx.flash * 0.9);
    }
    if (fx.shield) {
      const left = fx.shieldUntil - this.time;
      fx.shield.mesh.visible = left > 0;
      if (left > 0) {
        // The whole bubble flashes on a hit and fades, on top of the local impact ripple.
        fx.shield.material.uniforms.uIdle.value = Math.min(1, left / 1.4) ** 3 * 0.8;
        fx.shield.update(this.time, ship.kind === 'player' ? 1.35 : 1.3);
      }
    }
    // Damaged ships burn from a wound on the hull: flames (visible against black space) and
    // smoke, heavier and sparking once the hull is critical.
    const hp = ship.hullFraction;
    if (hp < 0.5) {
      fx.smokeTimer -= dt;
      if (fx.smokeTimer <= 0) {
        const critical = hp < 0.25;
        fx.smokeTimer = critical ? 0.025 : 0.05;
        _p.copy(fx.wound).applyQuaternion(ship.quaternion).add(ship.position);
        _v.copy(ship.velocity).multiplyScalar(0.3).addScaledVector(fxRng.unitVector(_d), 2.5);
        this.particles.puff(_p, _v);
        const flameSize = (critical ? 2.4 : 1.5) * Math.max(1, ship.radius / 6);
        this.particles.flame(_p, _v, flameSize);
        if (critical && fxRng.chance(0.3)) {
          _v.addScaledVector(fxRng.unitVector(_d), 40);
          this.particles.sparks.spawn(_p, _v, 0.3, _c.setRGB(1.5, 0.8, 0.3));
        }
      }
    }
  }

  private updateMissile(m: Missile): void {
    if (!m.alive) return;
    _p.copy(m.position).addScaledVector(m.dir, -1.5);
    this.particles.glow(_p, 3.2, m.team === 'player' ? MISSILE_GLOW : ENEMY_MISSILE_GLOW);
    const last = this.missiles.get(m) ?? -1;
    if (this.time - last > 0.022) {
      this.missiles.set(m, this.time);
      _v.copy(m.velocity).multiplyScalar(0.05);
      this.particles.puff(_p, _v);
    }
  }
}
