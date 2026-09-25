import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  CubeCamera,
  Group,
  HalfFloatType,
  LinearFilter,
  Mesh,
  PMREMGenerator,
  Points,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Texture,
  Vector3,
  WebGLCubeRenderTarget,
  type Camera,
  type WebGLRenderer,
} from 'three';
import { Rng } from '../core/math';

/** Direction the sunlight comes from (matches the key DirectionalLight). */
export const SUN_DIR = new Vector3(-0.55, 0.42, -0.72).normalize();

const NOISE = /* glsl */ `
  // 3D value noise with smooth interpolation (hash-based, no textures).
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
                   mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
                   mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 7; i++) {
      s += a * vnoise(p);
      p = p * 2.03 + vec3(1.7, 9.2, 3.1);
      a *= 0.5;
    }
    return s;
  }
`;

const nebulaFrag = /* glsl */ `
  uniform vec3 uSun;
  varying vec3 vDir;
  ${NOISE}
  void main() {
    vec3 d = normalize(vDir);
    vec3 q = vec3(fbm(d * 1.6 + 1.3), fbm(d * 1.6 + 7.7), fbm(d * 1.6 + 4.1));
    float n = fbm(d * 2.2 + q * 2.2);
    float n2 = fbm(d * 4.5 - q * 1.6 + 11.0);
    float dust = fbm(d * 6.0 + q * 3.0 + 5.0);
    // A tilted galactic band where the gas is densest.
    float bandDist = dot(d, normalize(vec3(0.25, 1.0, 0.35)));
    float band = exp(-bandDist * bandDist / 0.22);
    vec3 deep = vec3(0.02, 0.012, 0.05);
    vec3 violet = vec3(0.16, 0.06, 0.32);
    vec3 teal = vec3(0.05, 0.28, 0.42);
    vec3 magenta = vec3(0.55, 0.12, 0.32);
    vec3 ember = vec3(1.0, 0.5, 0.22);
    float t = smoothstep(0.3, 0.78, n);
    vec3 col = mix(violet, teal, smoothstep(0.45, 0.75, q.x));
    col = mix(col, magenta, smoothstep(0.55, 0.85, n2) * 0.75);
    col += ember * pow(smoothstep(0.62, 0.92, n * n2 * 1.7), 2.0) * 0.7;
    col *= mix(1.0, 0.25, smoothstep(0.5, 0.72, dust));
    float density = t * (0.25 + 0.95 * band);
    col = deep + col * density * 1.35;
    // Faint unresolved-star glow along the band.
    col += vec3(0.1, 0.1, 0.14) * band * 0.18;
    // The local sun: tight core plus wide glare.
    float sd = max(dot(d, uSun), 0.0);
    col += vec3(1.0, 0.92, 0.8) * (pow(sd, 1800.0) * 9.0 + pow(sd, 90.0) * 0.35 + pow(sd, 8.0) * 0.03);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const starVert = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vColor = color;
    vTwinkle = 0.75 + 0.25 * sin(uTime * (1.5 + aPhase * 2.0) + aPhase * 40.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio;
  }
`;

const starFrag = /* glsl */ `
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c) * 2.0;
    float core = smoothstep(1.0, 0.0, r);
    core *= core;
    gl_FragColor = vec4(vColor * core * vTwinkle, core);
  }
`;

/**
 * Space backdrop: a procedural nebula baked once into a cubemap (also used as the PBR environment)
 * plus a twinkling point starfield that follows the camera.
 */
export class Sky {
  readonly group = new Group();
  background: Texture | null = null;
  environment: Texture | null = null;
  private readonly starMat: ShaderMaterial;

  constructor(seed = 11) {
    const rng = new Rng(seed);
    const n = 6500;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const phase = new Float32Array(n);
    const c = new Color();
    const R = 20000;
    for (let i = 0; i < n; i++) {
      // Bias some stars toward the galactic band.
      const v = rng.unitVector(new Vector3());
      if (rng.chance(0.4)) v.addScaledVector(new Vector3(0.25, 1.0, 0.35).normalize(), -v.dot(new Vector3(0.25, 1.0, 0.35).normalize()) * 0.8).normalize();
      pos[i * 3] = v.x * R;
      pos[i * 3 + 1] = v.y * R;
      pos[i * 3 + 2] = v.z * R;
      const tint = rng.next();
      c.setHSL(tint < 0.55 ? 0.6 : tint < 0.8 ? 0.12 : 0.02, rng.range(0.15, 0.6), rng.range(0.6, 0.92));
      const bright = Math.pow(rng.next(), 4);
      const b = 0.5 + bright * 3.2;
      col[i * 3] = c.r * b;
      col[i * 3 + 1] = c.g * b;
      col[i * 3 + 2] = c.b * b;
      size[i] = 1.4 + bright * 4.2;
      phase[i] = rng.next();
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('color', new BufferAttribute(col, 3));
    geo.setAttribute('aSize', new BufferAttribute(size, 1));
    geo.setAttribute('aPhase', new BufferAttribute(phase, 1));
    this.starMat = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
      vertexShader: starVert,
      fragmentShader: starFrag,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    const pts = new Points(geo, this.starMat);
    pts.frustumCulled = false;
    pts.renderOrder = -10;
    this.group.add(pts);
  }

  /** Render the nebula into a cubemap and derive the PBR environment. Call once. */
  bake(renderer: WebGLRenderer, faceSize = 768): void {
    const target = new WebGLCubeRenderTarget(faceSize, { type: HalfFloatType, generateMipmaps: false });
    target.texture.minFilter = LinearFilter;
    const scene = new Scene();
    const mat = new ShaderMaterial({
      uniforms: { uSun: { value: SUN_DIR.clone() } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: nebulaFrag,
      side: BackSide,
      depthWrite: false,
    });
    scene.add(new Mesh(new SphereGeometry(100, 64, 32), mat));
    const cam = new CubeCamera(1, 1000, target);
    cam.update(renderer, scene);
    this.background = target.texture;
    const pmrem = new PMREMGenerator(renderer);
    this.environment = pmrem.fromCubemap(target.texture).texture;
    pmrem.dispose();
    mat.dispose();
  }

  update(camera: Camera, time: number, pixelRatio: number): void {
    this.group.position.copy(camera.position);
    this.starMat.uniforms.uTime.value = time;
    this.starMat.uniforms.uPixelRatio.value = pixelRatio;
  }
}
