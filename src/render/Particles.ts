import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NormalBlending,
  Object3D,
  PointLight,
  Points,
  Quaternion,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type BufferGeometry as BG,
} from 'three';
import { fxRng } from '../core/math';

/* -------------------------------------------------------------------------------------------
 * Soft point sprites. One Points object per blend mode, CPU simulated, fixed capacity.
 * ----------------------------------------------------------------------------------------- */

const spriteVert = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aHot;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vHot;
  void main() {
    vColor = color;
    vAlpha = aAlpha;
    vHot = aHot;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(aSize * uScale / max(0.5, -mv.z), 900.0);
  }
`;

const spriteFrag = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vHot;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c) * 2.0;
    if (r > 1.0) discard;
    float soft = 1.0 - r;
    soft *= soft;
    // Hot particles get a bright core.
    float core = pow(max(0.0, 1.0 - r * 1.8), 3.0) * vHot;
    vec3 col = vColor * (soft + core * 2.5);
    gl_FragColor = vec4(col * vAlpha, soft * vAlpha);
  }
`;

interface SpriteSpec {
  pos: Vector3;
  vel: Vector3;
  life: number;
  size0: number;
  size1: number;
  color0: Color;
  color1: Color;
  alpha0?: number;
  alpha1?: number;
  drag?: number;
  hot?: number;
}

class SpriteLayer {
  readonly points: Points;
  private readonly geo: BufferGeometry;
  private readonly max: number;
  count = 0;
  private readonly px: Float32Array;
  private readonly vx: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly s0: Float32Array;
  private readonly s1: Float32Array;
  private readonly c0: Float32Array;
  private readonly c1: Float32Array;
  private readonly a0: Float32Array;
  private readonly a1: Float32Array;
  private readonly drag: Float32Array;
  private readonly hot: Float32Array;
  private readonly aPos: BufferAttribute;
  private readonly aCol: BufferAttribute;
  private readonly aSize: BufferAttribute;
  private readonly aAlpha: BufferAttribute;
  private readonly aHot: BufferAttribute;
  readonly material: ShaderMaterial;

  constructor(max: number, additive: boolean) {
    this.max = max;
    this.px = new Float32Array(max * 3);
    this.vx = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    this.a0 = new Float32Array(max);
    this.a1 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.hot = new Float32Array(max);
    this.geo = new BufferGeometry();
    const mk = (n: number) => new BufferAttribute(new Float32Array(max * n), n).setUsage(DynamicDrawUsage);
    this.aPos = mk(3);
    this.aCol = mk(3);
    this.aSize = mk(1);
    this.aAlpha = mk(1);
    this.aHot = mk(1);
    this.geo.setAttribute('position', this.aPos);
    this.geo.setAttribute('color', this.aCol);
    this.geo.setAttribute('aSize', this.aSize);
    this.geo.setAttribute('aAlpha', this.aAlpha);
    this.geo.setAttribute('aHot', this.aHot);
    this.geo.setDrawRange(0, 0);
    this.material = new ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: spriteVert,
      fragmentShader: spriteFrag,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
      toneMapped: false,
    });
    this.points = new Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 8 : 7;
  }

  spawn(s: SpriteSpec): void {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.px[i * 3] = s.pos.x;
    this.px[i * 3 + 1] = s.pos.y;
    this.px[i * 3 + 2] = s.pos.z;
    this.vx[i * 3] = s.vel.x;
    this.vx[i * 3 + 1] = s.vel.y;
    this.vx[i * 3 + 2] = s.vel.z;
    this.life[i] = s.life;
    this.maxLife[i] = Math.max(1e-4, s.life);
    this.s0[i] = s.size0;
    this.s1[i] = s.size1;
    this.c0[i * 3] = s.color0.r;
    this.c0[i * 3 + 1] = s.color0.g;
    this.c0[i * 3 + 2] = s.color0.b;
    this.c1[i * 3] = s.color1.r;
    this.c1[i * 3 + 1] = s.color1.g;
    this.c1[i * 3 + 2] = s.color1.b;
    this.a0[i] = s.alpha0 ?? 1;
    this.a1[i] = s.alpha1 ?? 0;
    this.drag[i] = s.drag ?? 0.5;
    this.hot[i] = s.hot ?? 0;
  }

  private kill(i: number): void {
    const j = --this.count;
    if (i === j) return;
    for (let k = 0; k < 3; k++) {
      this.px[i * 3 + k] = this.px[j * 3 + k];
      this.vx[i * 3 + k] = this.vx[j * 3 + k];
      this.c0[i * 3 + k] = this.c0[j * 3 + k];
      this.c1[i * 3 + k] = this.c1[j * 3 + k];
    }
    this.life[i] = this.life[j];
    this.maxLife[i] = this.maxLife[j];
    this.s0[i] = this.s0[j];
    this.s1[i] = this.s1[j];
    this.a0[i] = this.a0[j];
    this.a1[i] = this.a1[j];
    this.drag[i] = this.drag[j];
    this.hot[i] = this.hot[j];
  }

  update(dt: number): void {
    const pos = this.aPos.array as Float32Array;
    const col = this.aCol.array as Float32Array;
    const size = this.aSize.array as Float32Array;
    const alpha = this.aAlpha.array as Float32Array;
    const hot = this.aHot.array as Float32Array;
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] < 0) {
        this.kill(i);
        continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      for (let a = 0; a < 3; a++) {
        this.vx[i * 3 + a] *= k;
        this.px[i * 3 + a] += this.vx[i * 3 + a] * dt;
        pos[i * 3 + a] = this.px[i * 3 + a];
      }
      const t = 1 - this.life[i] / this.maxLife[i];
      // Colour moves quickly toward the end colour; size eases out.
      const ct = Math.min(1, t * 1.6);
      col[i * 3] = this.c0[i * 3] + (this.c1[i * 3] - this.c0[i * 3]) * ct;
      col[i * 3 + 1] = this.c0[i * 3 + 1] + (this.c1[i * 3 + 1] - this.c0[i * 3 + 1]) * ct;
      col[i * 3 + 2] = this.c0[i * 3 + 2] + (this.c1[i * 3 + 2] - this.c0[i * 3 + 2]) * ct;
      size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * (1 - (1 - t) * (1 - t));
      alpha[i] = this.a0[i] + (this.a1[i] - this.a0[i]) * t;
      hot[i] = this.hot[i] * (1 - t);
      i++;
    }
    this.geo.setDrawRange(0, this.count);
    if (this.count > 0) {
      this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
      this.aAlpha.needsUpdate = this.aHot.needsUpdate = true;
    }
  }

  clear(): void {
    this.count = 0;
    this.geo.setDrawRange(0, 0);
  }
}

/* -------------------------------------------------------------------------------------------
 * Sparks: short additive line streaks stretched along their velocity.
 * ----------------------------------------------------------------------------------------- */
class SparkLayer {
  readonly lines: LineSegments;
  private readonly geo = new BufferGeometry();
  private readonly max: number;
  count = 0;
  private readonly p: Float32Array;
  private readonly v: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly col: Float32Array;
  private readonly aPos: BufferAttribute;
  private readonly aCol: BufferAttribute;

  constructor(max: number) {
    this.max = max;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.col = new Float32Array(max * 3);
    this.aPos = new BufferAttribute(new Float32Array(max * 6), 3).setUsage(DynamicDrawUsage);
    this.aCol = new BufferAttribute(new Float32Array(max * 6), 3).setUsage(DynamicDrawUsage);
    this.geo.setAttribute('position', this.aPos);
    this.geo.setAttribute('color', this.aCol);
    this.geo.setDrawRange(0, 0);
    const mat = new LineBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    this.lines = new LineSegments(this.geo, mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 8;
  }

  spawn(pos: Vector3, vel: Vector3, life: number, color: Color): void {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.p[i * 3] = pos.x;
    this.p[i * 3 + 1] = pos.y;
    this.p[i * 3 + 2] = pos.z;
    this.v[i * 3] = vel.x;
    this.v[i * 3 + 1] = vel.y;
    this.v[i * 3 + 2] = vel.z;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.col[i * 3] = color.r;
    this.col[i * 3 + 1] = color.g;
    this.col[i * 3 + 2] = color.b;
  }

  update(dt: number): void {
    const pos = this.aPos.array as Float32Array;
    const col = this.aCol.array as Float32Array;
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] < 0) {
        const j = --this.count;
        if (i !== j) {
          for (let a = 0; a < 3; a++) {
            this.p[i * 3 + a] = this.p[j * 3 + a];
            this.v[i * 3 + a] = this.v[j * 3 + a];
            this.col[i * 3 + a] = this.col[j * 3 + a];
          }
          this.life[i] = this.life[j];
          this.maxLife[i] = this.maxLife[j];
        }
        continue;
      }
      const k = Math.exp(-1.8 * dt);
      const f = this.life[i] / this.maxLife[i];
      for (let a = 0; a < 3; a++) {
        this.v[i * 3 + a] *= k;
        this.p[i * 3 + a] += this.v[i * 3 + a] * dt;
        pos[i * 6 + a] = this.p[i * 3 + a];
        pos[i * 6 + 3 + a] = this.p[i * 3 + a] - this.v[i * 3 + a] * 0.045;
        col[i * 6 + a] = this.col[i * 3 + a] * f * 3;
        col[i * 6 + 3 + a] = 0;
      }
      i++;
    }
    this.geo.setDrawRange(0, this.count * 2);
    if (this.count) this.aPos.needsUpdate = this.aCol.needsUpdate = true;
  }

  clear(): void {
    this.count = 0;
    this.geo.setDrawRange(0, 0);
  }
}

/* -------------------------------------------------------------------------------------------
 * Debris: tumbling instanced chunks from debris.glb; hot metal glows and cools.
 * ----------------------------------------------------------------------------------------- */
interface Chunk {
  pos: Vector3;
  vel: Vector3;
  q: Quaternion;
  axis: Vector3;
  spin: number;
  scale: number;
  life: number;
  maxLife: number;
}

class DebrisLayer {
  readonly group = new Object3D();
  private readonly meshes: InstancedMesh[] = [];
  private readonly chunks: Chunk[][] = [];
  private readonly metalKinds: number[] = [];
  private readonly rockKinds: number[] = [];
  private readonly m = new Matrix4();
  private readonly s = new Vector3();
  private readonly dq = new Quaternion();
  private readonly c = new Color();

  constructor(pieces: { geometry: BG; material: MeshStandardMaterial; rock: boolean }[]) {
    for (const p of pieces) {
      const mat = p.material.clone();
      if (!p.rock) {
        // Glow fades with the instance colour (hot metal cooling).
        mat.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance *= vColor.r * vColor.r;\n#endif',
          );
        };
        mat.customProgramCacheKey = () => 'debris-hot';
      }
      const mesh = new InstancedMesh(p.geometry, mat, 96);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(96 * 3), 3);
      mesh.frustumCulled = false;
      mesh.count = 0;
      (p.rock ? this.rockKinds : this.metalKinds).push(this.meshes.length);
      this.meshes.push(mesh);
      this.chunks.push([]);
      this.group.add(mesh);
    }
  }

  spawn(rock: boolean, pos: Vector3, vel: Vector3, scale: number, life: number): void {
    const kinds = rock ? this.rockKinds : this.metalKinds;
    if (!kinds.length) return;
    const k = kinds[Math.floor(fxRng.next() * kinds.length)];
    const list = this.chunks[k];
    if (list.length >= 96) return;
    list.push({
      pos: pos.clone(),
      vel: vel.clone(),
      q: new Quaternion().setFromAxisAngle(fxRng.unitVector(new Vector3()), fxRng.range(0, 6.28)),
      axis: fxRng.unitVector(new Vector3()),
      spin: fxRng.range(1, 6),
      scale,
      life,
      maxLife: life,
    });
  }

  update(dt: number): void {
    for (let k = 0; k < this.meshes.length; k++) {
      const list = this.chunks[k];
      const mesh = this.meshes[k];
      let n = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        const c = list[i];
        c.life -= dt;
        if (c.life <= 0) {
          list.splice(i, 1);
          continue;
        }
        c.vel.multiplyScalar(Math.exp(-0.25 * dt));
        c.pos.addScaledVector(c.vel, dt);
        this.dq.setFromAxisAngle(c.axis, c.spin * dt);
        c.q.premultiply(this.dq);
        const fade = Math.min(1, c.life / 0.6);
        this.s.setScalar(c.scale * fade);
        this.m.compose(c.pos, c.q, this.s);
        mesh.setMatrixAt(n, this.m);
        const heat = Math.max(0.15, c.life / c.maxLife);
        this.c.setRGB(heat, heat, heat);
        mesh.setColorAt(n, this.c);
        n++;
      }
      mesh.count = n;
      if (n) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  clear(): void {
    for (const l of this.chunks) l.length = 0;
    for (const m of this.meshes) m.count = 0;
  }
}

/* -------------------------------------------------------------------------------------------
 * Shock shells and flash lights.
 * ----------------------------------------------------------------------------------------- */
const shellFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
    gl_FragColor = vec4(uColor * f * uAlpha, f * uAlpha);
  }
`;
const shellVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalMatrix * normal;
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

interface Shell {
  mesh: Mesh;
  mat: ShaderMaterial;
  age: number;
  life: number;
  radius: number;
  active: boolean;
}

const _v = new Vector3();
const _v2 = new Vector3();
const C = (hex: number, k = 1) => new Color(hex).multiplyScalar(k);

const FIRE_HOT = C(0xfff0c0, 4);
const FIRE_MID = C(0xff8a30, 2.2);
const FIRE_END = C(0x6a1a08, 0.4);
const SMOKE0 = C(0x3a3634, 1);
const SMOKE1 = C(0x151414, 1);
const SPARK = C(0xffc070, 1.4);

/** All particle-style effects, plus explosion recipes used by the game. */
export class Particles {
  readonly add = new SpriteLayer(4000, true);
  readonly smoke = new SpriteLayer(1600, false);
  readonly sparks = new SparkLayer(1500);
  debris: DebrisLayer | null = null;
  private readonly shells: Shell[] = [];
  private readonly lights: { light: PointLight; age: number; life: number; power: number }[] = [];

  constructor(private readonly scene: Scene) {
    scene.add(this.smoke.points, this.add.points, this.sparks.lines);
    const geo = new SphereGeometry(1, 24, 16);
    for (let i = 0; i < 10; i++) {
      const mat = new ShaderMaterial({
        uniforms: { uColor: { value: new Color() }, uAlpha: { value: 0 } },
        vertexShader: shellVert,
        fragmentShader: shellFrag,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 8;
      scene.add(mesh);
      this.shells.push({ mesh, mat, age: 0, life: 1, radius: 1, active: false });
    }
    for (let i = 0; i < 2; i++) {
      const light = new PointLight(0xff9a50, 0, 400, 2);
      scene.add(light);
      this.lights.push({ light, age: 0, life: 1, power: 0 });
    }
  }

  setDebris(pieces: { geometry: BG; material: MeshStandardMaterial; rock: boolean }[]): void {
    if (!pieces.length) return;
    this.debris = new DebrisLayer(pieces);
    this.scene.add(this.debris.group);
  }

  /** Scale point sprites with the render height so sizes stay in world units. */
  setViewport(heightPx: number, fovDeg: number): void {
    const s = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.add.material.uniforms.uScale.value = s;
    this.smoke.material.uniforms.uScale.value = s;
  }

  update(dt: number): void {
    this.add.update(dt);
    this.smoke.update(dt);
    this.sparks.update(dt);
    this.debris?.update(dt);
    for (const s of this.shells) {
      if (!s.active) continue;
      s.age += dt;
      const t = s.age / s.life;
      if (t >= 1) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.mesh.scale.setScalar(s.radius * (0.15 + 0.85 * (1 - (1 - t) * (1 - t))));
      s.mat.uniforms.uAlpha.value = (1 - t) * 1.6;
    }
    for (const l of this.lights) {
      if (l.power <= 0) continue;
      l.age += dt;
      const t = l.age / l.life;
      l.light.intensity = t >= 1 ? 0 : l.power * (1 - t) * (1 - t);
      if (t >= 1) l.power = 0;
    }
  }

  clear(): void {
    this.add.clear();
    this.smoke.clear();
    this.sparks.clear();
    this.debris?.clear();
    for (const s of this.shells) {
      s.active = false;
      s.mesh.visible = false;
    }
    for (const l of this.lights) {
      l.power = 0;
      l.light.intensity = 0;
    }
  }

  private shell(pos: Vector3, radius: number, life: number, color: Color): void {
    const s = this.shells.find((x) => !x.active) ?? this.shells.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b));
    s.active = true;
    s.age = 0;
    s.life = life;
    s.radius = radius;
    s.mesh.position.copy(pos);
    s.mesh.visible = true;
    s.mat.uniforms.uColor.value.copy(color);
  }

  private flashLight(pos: Vector3, power: number, range: number, life: number, color = 0xff9a50): void {
    const l = this.lights.reduce((a, b) => (a.power <= b.power ? a : b));
    l.light.position.copy(pos);
    l.light.color.set(color);
    l.light.distance = range;
    l.power = power;
    l.age = 0;
    l.life = life;
    l.light.intensity = power;
  }

  /** Fireball, sparks, smoke, debris and a light flash. size 1 = fighter. */
  explosion(pos: Vector3, size: number, vel: Vector3): void {
    const s = size;
    const sq = Math.sqrt(s);
    this.add.spawn({ pos, vel: _v.copy(vel).multiplyScalar(0.5), life: 0.16, size0: 16 * s, size1: 26 * s, color0: C(0xfff6e0, 5), color1: C(0xffb060, 2), alpha0: 1, alpha1: 0, hot: 1 });
    const n = Math.round(14 * sq);
    for (let i = 0; i < n; i++) {
      fxRng.unitVector(_v2);
      this.add.spawn({
        pos: _v.copy(pos).addScaledVector(_v2, fxRng.range(0, 2.5 * s)),
        vel: _v2.multiplyScalar(fxRng.range(4, 16) * sq).addScaledVector(vel, 0.4).clone(),
        life: fxRng.range(0.55, 1.2) * Math.min(2, sq),
        size0: fxRng.range(5, 9) * s,
        size1: fxRng.range(12, 20) * s,
        color0: FIRE_HOT,
        color1: fxRng.chance(0.5) ? FIRE_MID : FIRE_END,
        alpha0: 1,
        alpha1: 0,
        drag: 1.4,
        hot: 0.8,
      });
    }
    for (let i = 0; i < Math.round(22 * Math.min(sq, 2.5)); i++) {
      fxRng.unitVector(_v2).multiplyScalar(fxRng.range(50, 150) * Math.min(sq, 2)).addScaledVector(vel, 0.5);
      this.sparks.spawn(pos, _v2, fxRng.range(0.35, 0.9), SPARK);
    }
    for (let i = 0; i < Math.round(6 * sq); i++) {
      fxRng.unitVector(_v2);
      this.smoke.spawn({
        pos: _v.copy(pos).addScaledVector(_v2, fxRng.range(0, 3 * s)),
        vel: _v2.multiplyScalar(fxRng.range(2, 7) * sq).addScaledVector(vel, 0.3).clone(),
        life: fxRng.range(1.8, 3.2),
        size0: 8 * s,
        size1: 22 * s,
        color0: SMOKE0,
        color1: SMOKE1,
        alpha0: 0.55,
        alpha1: 0,
        drag: 0.8,
      });
    }
    if (this.debris) {
      for (let i = 0; i < Math.round(5 * Math.min(sq, 3)); i++) {
        fxRng.unitVector(_v2).multiplyScalar(fxRng.range(15, 45) * Math.min(sq, 2)).addScaledVector(vel, 0.6);
        this.debris.spawn(false, pos, _v2, fxRng.range(0.8, 2.2) * Math.min(s, 3), fxRng.range(2.5, 4.5));
      }
    }
    if (s >= 1.8) this.shell(pos, 18 * s, 0.55 + s * 0.02, C(0xffc080, 2.4));
    this.flashLight(pos, 60 * s, 80 * s, 0.35 + 0.05 * s);
  }

  /** Energy splash where a bolt hits: sparks and a small flash (blue on shields). */
  hit(pos: Vector3, dir: Vector3, shield: boolean, color: Color): void {
    const flashCol = shield ? C(0x70c8ff, 3) : color;
    this.add.spawn({ pos, vel: _v.set(0, 0, 0), life: 0.12, size0: 5, size1: 8, color0: flashCol, color1: flashCol, alpha0: 1, alpha1: 0, hot: 1 });
    for (let i = 0; i < 6; i++) {
      fxRng.unitVector(_v2).addScaledVector(dir, -1.2).normalize().multiplyScalar(fxRng.range(30, 90));
      this.sparks.spawn(pos, _v2, fxRng.range(0.15, 0.35), shield ? C(0x80d0ff, 1.5) : SPARK);
    }
  }

  /** Dust, rock chunks and a puff of sparks when an asteroid breaks. */
  rockBurst(pos: Vector3, radius: number): void {
    for (let i = 0; i < 10; i++) {
      fxRng.unitVector(_v2);
      this.smoke.spawn({
        pos: _v.copy(pos).addScaledVector(_v2, fxRng.range(0, radius * 0.6)),
        vel: _v2.multiplyScalar(fxRng.range(3, 12)).clone(),
        life: fxRng.range(1.5, 2.8),
        size0: radius * 0.8,
        size1: radius * 2.2,
        color0: C(0x6e6254, 1),
        color1: C(0x2a2622, 1),
        alpha0: 0.6,
        alpha1: 0,
        drag: 0.9,
      });
    }
    this.add.spawn({ pos, vel: _v.set(0, 0, 0), life: 0.25, size0: radius * 1.5, size1: radius * 2.5, color0: C(0xffd6a0, 2), color1: C(0x805030, 0.5), alpha0: 0.8, alpha1: 0, hot: 0.5 });
    for (let i = 0; i < 14; i++) {
      fxRng.unitVector(_v2).multiplyScalar(fxRng.range(20, 60));
      this.sparks.spawn(pos, _v2, fxRng.range(0.3, 0.7), C(0xffb070, 1));
    }
    if (this.debris) {
      for (let i = 0; i < 8; i++) {
        fxRng.unitVector(_v2).multiplyScalar(fxRng.range(6, 22));
        this.debris.spawn(true, _v.copy(pos).addScaledVector(_v2, 0.05), _v2, fxRng.range(0.4, 1.0) * radius * 0.35, fxRng.range(3, 6));
      }
    }
  }

  /** Blue warp flash with a ring shell. */
  warp(pos: Vector3, size: number): void {
    this.add.spawn({ pos, vel: _v.set(0, 0, 0), life: 0.5, size0: size * 2, size1: size * 5, color0: C(0xbfe6ff, 4), color1: C(0x3070ff, 1), alpha0: 1, alpha1: 0, hot: 1 });
    this.shell(pos, size * 2.5, 0.6, C(0x70b0ff, 2));
    for (let i = 0; i < 16; i++) {
      fxRng.unitVector(_v2).multiplyScalar(fxRng.range(40, 120) * Math.sqrt(size / 14));
      this.sparks.spawn(pos, _v2, fxRng.range(0.3, 0.6), C(0x9fd0ff, 1.5));
    }
  }

  /** One-frame glow sprite (engine flares, muzzle flashes). */
  glow(pos: Vector3, size: number, color: Color, life = 0): void {
    this.add.spawn({ pos, vel: _v.set(0, 0, 0), life, size0: size, size1: size, color0: color, color1: color, alpha0: 1, alpha1: life > 0 ? 0 : 1, hot: 0.6 });
  }

  /** Missile exhaust smoke puff. */
  puff(pos: Vector3, vel: Vector3): void {
    this.smoke.spawn({ pos, vel, life: fxRng.range(0.6, 1.0), size0: 1.2, size1: 5, color0: C(0x8a8a8a, 1), color1: C(0x303030, 1), alpha0: 0.45, alpha1: 0, drag: 1.5 });
  }

  /** A big shock shell for the carrier's final blast. */
  shockwave(pos: Vector3, radius: number, life: number): void {
    this.shell(pos, radius, life, C(0xffd0a0, 2));
    this.flashLight(pos, 800, radius * 2, life * 0.8, 0xffc080);
  }
}
