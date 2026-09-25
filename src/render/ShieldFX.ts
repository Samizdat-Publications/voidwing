import {
  AdditiveBlending,
  Color,
  FrontSide,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  Vector4,
} from 'three';

const MAX_HITS = 8;

const vertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vP;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    vP = normalize(position);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  uniform float uIdle;
  uniform float uTime;
  uniform float uHexScale;
  uniform vec4 uHits[${MAX_HITS}];
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vP;

  float hexEdge(vec2 p) {
    const vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(p, r) - h;
    vec2 b = mod(p - h, r) - h;
    vec2 g = dot(a, a) < dot(b, b) ? a : b;
    g = abs(g);
    float d = max(dot(g, normalize(r)), g.x);
    return smoothstep(0.42, 0.5, d);
  }

  void main() {
    float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
    // Spherical coordinates for the hex lattice.
    vec2 sph = vec2(atan(vP.z, vP.x) * 3.0, acos(clamp(vP.y, -1.0, 1.0)) * 3.0) * uHexScale;
    float hex = hexEdge(sph);
    float ripple = 0.0;
    float glow = 0.0;
    for (int i = 0; i < ${MAX_HITS}; i++) {
      vec4 h = uHits[i];
      float age = uTime - h.w;
      if (age < 0.0 || age > 1.6) continue;
      float d = distance(vP, normalize(h.xyz));
      float front = age * 0.9;
      float fade = exp(-age * 2.6);
      ripple += smoothstep(0.1, 0.0, abs(d - front)) * fade;
      glow += smoothstep(0.35, 0.0, d) * exp(-age * 5.0);
    }
    // A slow band of lit cells sweeps the surface so the bubble reads as a volume, not a rim.
    float band = exp(-pow((vP.y - sin(uTime * 0.4) * 0.85) * 5.0, 2.0));
    float idle = (0.03 + 0.5 * fres + hex * (0.015 + 0.2 * fres) + band * hex * 0.12) * uIdle;
    float a = (idle + ripple * (0.5 + hex * 0.9) + glow * 0.9) * uStrength;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

/** Ellipsoid energy shield with hex cells and impact ripples. */
export class ShieldBubble {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  private readonly hits: Vector4[] = [];
  private hitIndex = 0;
  private readonly local = new Vector3();

  constructor(color: number, hexScale = 1, idle = 1) {
    for (let i = 0; i < MAX_HITS; i++) this.hits.push(new Vector4(0, 1, 0, -100));
    this.material = new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color(color) },
        uStrength: { value: 1 },
        uIdle: { value: idle },
        uTime: { value: 0 },
        uHexScale: { value: hexScale },
        uHits: { value: this.hits },
      },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: FrontSide,
    });
    this.mesh = new Mesh(new SphereGeometry(1, 48, 32), this.material);
    this.mesh.renderOrder = 4;
  }

  /** Register an impact at a world-space point. */
  hit(worldPoint: Vector3, time: number): void {
    this.mesh.updateMatrixWorld();
    this.local.copy(worldPoint);
    this.mesh.worldToLocal(this.local);
    const h = this.hits[this.hitIndex];
    h.set(this.local.x, this.local.y, this.local.z, time);
    this.hitIndex = (this.hitIndex + 1) % MAX_HITS;
  }

  update(time: number, strength: number): void {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uStrength.value = strength;
  }
}
