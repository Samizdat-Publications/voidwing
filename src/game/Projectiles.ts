import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Scene,
  ShaderMaterial,
  Vector3,
} from 'three';
import { segmentSphere } from '../core/math';
import { BOLTS, type BoltKind, type Team } from './config';
import type { Asteroid } from './Asteroids';
import type { Entity } from './Entity';
import type { Ship } from './Ship';
import type { World } from './World';

const KINDS: BoltKind[] = ['player', 'wing', 'enemy', 'heavy', 'flak'];
const MAX = 1200;

const _p0 = new Vector3();
const _p1 = new Vector3();
const _hit = new Vector3();
const _dir = new Vector3();
const _q = new Quaternion();
const _m = new Matrix4();
const _s = new Vector3();
const _pos = new Vector3();
const Z = new Vector3(0, 0, 1);

/** Laser bolts, stored as flat arrays and drawn as one instanced mesh per bolt kind. */
export class Projectiles {
  count = 0;
  private readonly px = new Float32Array(MAX);
  private readonly py = new Float32Array(MAX);
  private readonly pz = new Float32Array(MAX);
  private readonly vx = new Float32Array(MAX);
  private readonly vy = new Float32Array(MAX);
  private readonly vz = new Float32Array(MAX);
  private readonly life = new Float32Array(MAX);
  private readonly dmg = new Float32Array(MAX);
  private readonly kind = new Uint8Array(MAX);
  private readonly team = new Uint8Array(MAX);
  private readonly owner = new Int32Array(MAX);
  private readonly meshes: InstancedMesh[] = [];
  private readonly counts = new Int32Array(KINDS.length);

  constructor(scene: Scene) {
    const geo = new BoxGeometry(1, 1, 1);
    for (const k of KINDS) {
      const vis = BOLTS[k];
      // Bright head fading to a faint tail; bloom turns it into a glowing streak.
      const mat = new ShaderMaterial({
        uniforms: { uColor: { value: new Color(vis.color).multiplyScalar(vis.intensity) } },
        vertexShader: `varying float vZ;
          void main() {
            vZ = position.z;
            gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `uniform vec3 uColor;
          varying float vZ;
          void main() {
            float head = smoothstep(-0.5, 0.42, vZ);
            float a = mix(0.12, 1.0, head * head) * (1.0 - smoothstep(0.44, 0.5, vZ));
            gl_FragColor = vec4(uColor * a, a);
          }`,
        toneMapped: false,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new InstancedMesh(geo, mat, MAX);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.renderOrder = 5;
      scene.add(mesh);
      this.meshes.push(mesh);
    }
  }

  spawn(
    kind: BoltKind,
    origin: Vector3,
    dir: Vector3,
    speed: number,
    damage: number,
    life: number,
    team: Team,
    ownerId: number,
  ): void {
    if (this.count >= MAX) return;
    const i = this.count++;
    this.px[i] = origin.x;
    this.py[i] = origin.y;
    this.pz[i] = origin.z;
    this.vx[i] = dir.x * speed;
    this.vy[i] = dir.y * speed;
    this.vz[i] = dir.z * speed;
    this.life[i] = life;
    this.dmg[i] = damage;
    this.kind[i] = KINDS.indexOf(kind);
    this.team[i] = team === 'player' ? 0 : 1;
    this.owner[i] = ownerId;
  }

  clear(): void {
    this.count = 0;
    for (const m of this.meshes) m.count = 0;
  }

  private remove(i: number): void {
    const j = --this.count;
    if (i === j) return;
    this.px[i] = this.px[j];
    this.py[i] = this.py[j];
    this.pz[i] = this.pz[j];
    this.vx[i] = this.vx[j];
    this.vy[i] = this.vy[j];
    this.vz[i] = this.vz[j];
    this.life[i] = this.life[j];
    this.dmg[i] = this.dmg[j];
    this.kind[i] = this.kind[j];
    this.team[i] = this.team[j];
    this.owner[i] = this.owner[j];
  }

  update(dt: number, world: World, cameraPos: Vector3): void {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.remove(i);
        continue;
      }
      _p0.set(this.px[i], this.py[i], this.pz[i]);
      _p1.set(this.px[i] + this.vx[i] * dt, this.py[i] + this.vy[i] * dt, this.pz[i] + this.vz[i] * dt);
      if (this.collide(i, world)) {
        this.remove(i);
        continue;
      }
      this.px[i] = _p1.x;
      this.py[i] = _p1.y;
      this.pz[i] = _p1.z;
      i++;
    }
    this.writeInstances(cameraPos);
  }

  /** Test bolt i along _p0 -> _p1. Applies the hit and returns true if something was struck. */
  private collide(i: number, world: World): boolean {
    const team: Team = this.team[i] === 0 ? 'player' : 'enemy';
    const vis = BOLTS[KINDS[this.kind[i]]];
    let bestT = 2;
    let bestEntity: Entity | null = null;
    let bestAsteroid: Asteroid | null = null;
    let hitShield = false;

    const candidates = world.collidablesFor(team);
    const playerBolt = KINDS[this.kind[i]] === 'player';
    const segLen = _p0.distanceTo(_p1);
    const midX = (_p0.x + _p1.x) * 0.5, midY = (_p0.y + _p1.y) * 0.5, midZ = (_p0.z + _p1.z) * 0.5;
    for (let k = 0; k < candidates.length; k++) {
      const e = candidates[k];
      if (!e.alive) continue;
      // The player's bolts count most of a far ship's magnification, so hits land on what is drawn.
      const r = e.radius * (playerBolt ? 1 + (e.viewScale - 1) * 0.6 : 1) + vis.hitRadius;
      const dx = e.position.x - midX, dy = e.position.y - midY, dz = e.position.z - midZ;
      const reach = segLen * 0.5 + r;
      if (dx * dx + dy * dy + dz * dz > reach * reach) continue;
      const t = segmentSphere(_p0, _p1, e.position, r);
      if (t >= 0 && t < bestT) {
        bestT = t;
        bestEntity = e;
      }
    }

    if (team === 'player' && world.capital.shieldActive) {
      const t = world.capital.segmentShieldT(_p0, _p1);
      if (t >= 0 && t < bestT) {
        bestT = t;
        bestEntity = null;
        hitShield = true;
      }
    }

    const ast = world.asteroids.segmentHit(_p0, _p1, 0);
    if (ast.asteroid && ast.t < bestT) {
      bestT = ast.t;
      bestAsteroid = ast.asteroid;
      bestEntity = null;
      hitShield = false;
    }

    if (bestT > 1) return false;
    _hit.lerpVectors(_p0, _p1, bestT);
    const owner = world.entityById(this.owner[i]);
    const damage = this.dmg[i];
    if (bestEntity) {
      bestEntity.takeDamage(damage, _hit, owner, world);
      if (owner && owner.kind === 'player') {
        (owner as Ship).shotsHit++;
        world.events.emit('playerHit', { target: bestEntity, point: _hit, killed: !bestEntity.alive });
      }
    } else if (hitShield) {
      world.capital.onShieldStruck(_hit, world);
      if (owner && owner.kind === 'player') world.events.emit('shieldBlocked', { point: _hit });
    } else if (bestAsteroid) {
      world.asteroids.damage(bestAsteroid, damage, _hit, world);
    }
    _dir.set(this.vx[i], this.vy[i], this.vz[i]).normalize();
    world.events.emit('boltImpact', { point: _hit, dir: _dir, kind: KINDS[this.kind[i]], shield: hitShield || (bestEntity !== null && bestEntity.shield > 0) });
    return true;
  }

  /** Visit the head of every live bolt of one kind (FX adds a bloom glow to the player's). */
  forEachHead(kind: BoltKind, cb: (x: number, y: number, z: number) => void): void {
    const k = KINDS.indexOf(kind);
    for (let i = 0; i < this.count; i++) if (this.kind[i] === k) cb(this.px[i], this.py[i], this.pz[i]);
  }

  private writeInstances(cameraPos: Vector3): void {
    this.counts.fill(0);
    for (let i = 0; i < this.count; i++) {
      const k = this.kind[i];
      const vis = BOLTS[KINDS[k]];
      const mesh = this.meshes[k];
      // Bolts skimming past the camera would fill the screen as flat bars: hide or thin them.
      const cdx = this.px[i] - cameraPos.x, cdy = this.py[i] - cameraPos.y, cdz = this.pz[i] - cameraPos.z;
      const camDist = Math.sqrt(cdx * cdx + cdy * cdy + cdz * cdz);
      // The player's own bolts spawn about 40 m ahead of the camera and stay full size; anything
      // else passing close to the camera is hidden or thinned so it never becomes a flat beam.
      const own = KINDS[k] === 'player';
      if (camDist < (own ? 8 : 16)) continue;
      const thin = own ? 1 : Math.min(1, Math.max(0.25, (camDist - 16) / 34));
      // Far bolts keep a minimum on-screen width (about 2 px at 720p) so they stay visible.
      const width = Math.max(vis.width * thin, camDist * 0.0042);
      const n = this.counts[k]++;
      _dir.set(this.vx[i], this.vy[i], this.vz[i]);
      const speed = _dir.length();
      _dir.multiplyScalar(1 / speed);
      _q.setFromUnitVectors(Z, _dir);
      // The bolt position is its head; the streak trails behind it.
      _pos.set(this.px[i], this.py[i], this.pz[i]).addScaledVector(_dir, -vis.length * 0.5);
      _s.set(width, width, vis.length);
      _m.compose(_pos, _q, _s);
      mesh.setMatrixAt(n, _m);
    }
    for (let k = 0; k < this.meshes.length; k++) {
      const mesh = this.meshes[k];
      mesh.count = this.counts[k];
      if (mesh.count > 0) mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
