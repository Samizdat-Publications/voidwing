import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Points,
  PointsMaterial,
  type Camera,
} from 'three';
import { Rng } from '../core/math';

/** Star points on a huge sphere that follows the camera (milestone 1 backdrop). */
export class Sky {
  readonly group = new Group();

  constructor(seed = 11) {
    const rng = new Rng(seed);
    const n = 5000;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const c = new Color();
    for (let i = 0; i < n; i++) {
      const z = rng.range(-1, 1);
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(1 - z * z);
      const R = 20000;
      pos[i * 3] = r * Math.cos(a) * R;
      pos[i * 3 + 1] = z * R;
      pos[i * 3 + 2] = r * Math.sin(a) * R;
      const warm = rng.next();
      c.setHSL(warm < 0.5 ? 0.6 : 0.08, rng.range(0.1, 0.5), rng.range(0.55, 0.95));
      const b = Math.pow(rng.next(), 3) * 2 + 0.35;
      col[i * 3] = c.r * b;
      col[i * 3 + 1] = c.g * b;
      col[i * 3 + 2] = c.b * b;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('color', new BufferAttribute(col, 3));
    const mat = new PointsMaterial({
      size: 2,
      sizeAttenuation: false,
      vertexColors: true,
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
    });
    const pts = new Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = -10;
    this.group.add(pts);
  }

  update(camera: Camera): void {
    this.group.position.copy(camera.position);
  }
}
