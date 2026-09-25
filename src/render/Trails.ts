import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Mesh,
  Scene,
  ShaderMaterial,
  Vector3,
} from 'three';

const N = 28; // points per trail
const MAX_TRAILS = 96;

const vert = /* glsl */ `
  attribute float aAlpha;
  attribute float aEdge;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vEdge;
  void main() {
    vColor = color;
    vEdge = aEdge;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Fade ribbons that reach toward the camera (the player's own trail) so they never
    // smear across the screen.
    vAlpha = aAlpha * smoothstep(10.0, 45.0, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const frag = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vEdge;
  void main() {
    float across = 1.0 - abs(vEdge * 2.0 - 1.0);
    float a = vAlpha * smoothstep(0.0, 0.6, across);
    gl_FragColor = vec4(vColor * a, a);
  }
`;

interface Slot {
  active: boolean;
  fading: boolean;
  pts: Float32Array; // x, y, z, time per point, newest first
  count: number;
  width: number;
  color: Color;
  maxAge: number;
  lastInsert: number;
}

export type TrailHandle = number;

const _p = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _t = new Vector3();
const _vd = new Vector3();
const _s = new Vector3();

/** Camera-facing ribbon trails for engines, all in one dynamic buffer and one draw call. */
export class Trails {
  private readonly slots: Slot[] = [];
  private readonly geo = new BufferGeometry();
  private readonly aPos: BufferAttribute;
  private readonly aCol: BufferAttribute;
  private readonly aAlpha: BufferAttribute;
  readonly mesh: Mesh;
  private time = 0;

  constructor(scene: Scene) {
    const verts = MAX_TRAILS * N * 2;
    this.aPos = new BufferAttribute(new Float32Array(verts * 3), 3).setUsage(DynamicDrawUsage);
    this.aCol = new BufferAttribute(new Float32Array(verts * 3), 3).setUsage(DynamicDrawUsage);
    this.aAlpha = new BufferAttribute(new Float32Array(verts), 1).setUsage(DynamicDrawUsage);
    const edge = new Float32Array(verts);
    for (let i = 0; i < verts; i++) edge[i] = i % 2;
    const idx: number[] = [];
    for (let s = 0; s < MAX_TRAILS; s++) {
      const base = s * N * 2;
      for (let i = 0; i < N - 1; i++) {
        const a = base + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    this.geo.setIndex(idx);
    this.geo.setAttribute('position', this.aPos);
    this.geo.setAttribute('color', this.aCol);
    this.geo.setAttribute('aAlpha', this.aAlpha);
    this.geo.setAttribute('aEdge', new BufferAttribute(edge, 1));
    const mat = new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    this.mesh = new Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    scene.add(this.mesh);
    for (let i = 0; i < MAX_TRAILS; i++) {
      this.slots.push({ active: false, fading: false, pts: new Float32Array(N * 4), count: 0, width: 1, color: new Color(), maxAge: 0.6, lastInsert: -1 });
    }
  }

  create(color: Color, width: number, maxAge = 0.6): TrailHandle {
    const i = this.slots.findIndex((s) => !s.active);
    if (i < 0) return -1;
    const s = this.slots[i];
    s.active = true;
    s.fading = false;
    s.count = 0;
    s.width = width;
    s.color.copy(color);
    s.maxAge = maxAge;
    s.lastInsert = -1;
    return i;
  }

  /** Stop feeding a trail; it fades out and frees itself. */
  release(h: TrailHandle): void {
    if (h >= 0) this.slots[h].fading = true;
  }

  push(h: TrailHandle, pos: Vector3): void {
    if (h < 0) return;
    const s = this.slots[h];
    if (!s.active || s.fading) return;
    const p = s.pts;
    // Insert a new point every 30 ms (or when the first point arrives); otherwise the head
    // point just follows the engine so the ribbon stays attached.
    if (s.count === 0 || this.time - s.lastInsert > 0.03) {
      p.copyWithin(4, 0, (N - 1) * 4);
      s.count = Math.min(N, s.count + 1);
      s.lastInsert = this.time;
    }
    p[0] = pos.x;
    p[1] = pos.y;
    p[2] = pos.z;
    p[3] = this.time;
  }

  clear(): void {
    for (const s of this.slots) {
      s.active = false;
      s.count = 0;
    }
  }

  update(dt: number, cameraPos: Vector3): void {
    this.time += dt;
    const pos = this.aPos.array as Float32Array;
    const col = this.aCol.array as Float32Array;
    const alpha = this.aAlpha.array as Float32Array;
    for (let si = 0; si < MAX_TRAILS; si++) {
      const s = this.slots[si];
      const base = si * N * 2;
      if (!s.active) {
        alpha.fill(0, base, base + N * 2);
        continue;
      }
      const p = s.pts;
      // Drop points that have aged out.
      while (s.count > 0 && this.time - p[(s.count - 1) * 4 + 3] > s.maxAge) s.count--;
      if (s.fading && s.count <= 1) {
        s.active = false;
        alpha.fill(0, base, base + N * 2);
        continue;
      }
      for (let i = 0; i < N; i++) {
        const vi = base + i * 2;
        if (i >= s.count || s.count < 2) {
          alpha[vi] = alpha[vi + 1] = 0;
          // Collapse unused vertices onto the last point to avoid stray triangles.
          const li = Math.max(0, s.count - 1) * 4;
          for (let k = 0; k < 2; k++) {
            pos[(vi + k) * 3] = p[li];
            pos[(vi + k) * 3 + 1] = p[li + 1];
            pos[(vi + k) * 3 + 2] = p[li + 2];
          }
          continue;
        }
        _p.set(p[i * 4], p[i * 4 + 1], p[i * 4 + 2]);
        const prev = Math.max(0, i - 1);
        const next = Math.min(s.count - 1, i + 1);
        _a.set(p[prev * 4], p[prev * 4 + 1], p[prev * 4 + 2]);
        _b.set(p[next * 4], p[next * 4 + 1], p[next * 4 + 2]);
        _t.subVectors(_a, _b);
        if (_t.lengthSq() < 1e-8) _t.set(0, 0, 1);
        _vd.subVectors(cameraPos, _p);
        _s.crossVectors(_t, _vd).normalize();
        const age = (this.time - p[i * 4 + 3]) / s.maxAge;
        const u = i / (N - 1);
        const w = s.width * (1 - u * 0.75) * 0.5;
        const a = Math.max(0, 1 - age) ** 1.4;
        pos[vi * 3] = _p.x + _s.x * w;
        pos[vi * 3 + 1] = _p.y + _s.y * w;
        pos[vi * 3 + 2] = _p.z + _s.z * w;
        pos[(vi + 1) * 3] = _p.x - _s.x * w;
        pos[(vi + 1) * 3 + 1] = _p.y - _s.y * w;
        pos[(vi + 1) * 3 + 2] = _p.z - _s.z * w;
        alpha[vi] = alpha[vi + 1] = a;
        for (let k = 0; k < 2; k++) {
          col[(vi + k) * 3] = s.color.r;
          col[(vi + k) * 3 + 1] = s.color.g;
          col[(vi + k) * 3 + 2] = s.color.b;
        }
      }
    }
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aAlpha.needsUpdate = true;
  }
}
