import { Quaternion, Vector3 } from 'three';

export const DEG = Math.PI / 180;

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Frame-rate independent exponential approach of a toward b. */
export const damp = (a: number, b: number, lambda: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));

export const dampFactor = (lambda: number, dt: number): number => 1 - Math.exp(-lambda * dt);

/** Move current toward target by at most maxDelta. */
export const approach = (current: number, target: number, maxDelta: number): number => {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
};

/** Mulberry32 seeded random generator. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }
  unitVector(out: Vector3): Vector3 {
    const z = this.range(-1, 1);
    const a = this.range(0, Math.PI * 2);
    const r = Math.sqrt(1 - z * z);
    return out.set(r * Math.cos(a), r * Math.sin(a), z);
  }
  /** Rough gaussian (sum of uniforms), mean 0, sd ~1. */
  gauss(): number {
    return (this.next() + this.next() + this.next() + this.next() - 2) * 1.73;
  }
}

/** Unseeded generator for cosmetic randomness. */
export const fxRng = new Rng((Math.random() * 2 ** 31) | 0);

/**
 * Time for a projectile of speed s, fired from the origin, to meet a target at relPos moving
 * with vel. Returns -1 when there is no solution.
 */
export function interceptTime(relPos: Vector3, vel: Vector3, s: number): number {
  const a = vel.dot(vel) - s * s;
  const b = 2 * relPos.dot(vel);
  const c = relPos.dot(relPos);
  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) < 1e-9) return -1;
    const t = -c / b;
    return t > 0 ? t : -1;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  const t2 = (-b + sq) / (2 * a);
  let t = Math.min(t1, t2);
  if (t < 0) t = Math.max(t1, t2);
  return t > 0 ? t : -1;
}

const _rel = new Vector3();
/** Lead point for hitting a moving target. Falls back to the target position. */
export function leadPoint(
  shooter: Vector3,
  targetPos: Vector3,
  targetVel: Vector3,
  projSpeed: number,
  out: Vector3,
): Vector3 {
  _rel.subVectors(targetPos, shooter);
  const t = interceptTime(_rel, targetVel, projSpeed);
  if (t < 0 || t > 8) return out.copy(targetPos);
  return out.copy(targetVel).multiplyScalar(t).add(targetPos);
}

/**
 * First intersection parameter t in [0, 1] of segment p0 -> p1 with a sphere, or -1.
 * Returns 0 when p0 starts inside the sphere.
 */
export function segmentSphere(p0: Vector3, p1: Vector3, c: Vector3, r: number): number {
  const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
  const fx = p0.x - c.x, fy = p0.y - c.y, fz = p0.z - c.z;
  const cc = fx * fx + fy * fy + fz * fz - r * r;
  if (cc <= 0) return 0;
  const a = dx * dx + dy * dy + dz * dz;
  if (a < 1e-9) return -1;
  const b = 2 * (fx * dx + fy * dy + fz * dz);
  if (b > 0) return -1; // moving away
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

export const FORWARD = new Vector3(0, 0, -1);
export const UP = new Vector3(0, 1, 0);
export const RIGHT = new Vector3(1, 0, 0);

/** Signed angle (radians) to rotate `from` into `to` about `axis` (all unit, from/to roughly perpendicular to axis). */
export function signedAngleAbout(from: Vector3, to: Vector3, axis: Vector3): number {
  const cx = from.y * to.z - from.z * to.y;
  const cy = from.z * to.x - from.x * to.z;
  const cz = from.x * to.y - from.y * to.x;
  const sin = cx * axis.x + cy * axis.y + cz * axis.z;
  const cos = from.dot(to);
  return Math.atan2(sin, cos);
}

const _axis = new Vector3();
const _dq = new Quaternion();
/** Integrate a local-space angular velocity (rad/s) into a quaternion. */
export function integrateAngular(q: Quaternion, angVelLocal: Vector3, dt: number): void {
  const w = angVelLocal.length();
  const angle = w * dt;
  if (angle < 1e-9) return;
  _axis.copy(angVelLocal).multiplyScalar(1 / w);
  _dq.setFromAxisAngle(_axis, angle);
  q.multiply(_dq).normalize();
}

/** Yaw (+ right) and pitch (+ up) errors, in radians, of a world direction seen from an orientation. */
export function localAngles(q: Quaternion, worldDir: Vector3, out: { yaw: number; pitch: number }): void {
  const inv = _dq.copy(q).invert();
  const l = _axis.copy(worldDir).applyQuaternion(inv);
  out.yaw = Math.atan2(l.x, -l.z);
  out.pitch = Math.atan2(l.y, Math.hypot(l.x, l.z));
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
