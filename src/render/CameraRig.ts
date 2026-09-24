import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { clamp, damp, dampFactor } from '../core/math';
import type { Ship } from '../game/Ship';

export type CameraMode = 'chase' | 'orbit' | 'death' | 'cinematic';

const _off = new Vector3();
const _q = new Quaternion();
const _shakeQ = new Quaternion();
const _look = new Vector3();
const _e = new Vector3();

/** Chase camera with lag, boost pull-back, FOV kick and trauma-based shake. */
export class CameraRig {
  mode: CameraMode = 'orbit';
  private readonly smoothQ = new Quaternion();
  private trauma = 0;
  shakeScale = 1;
  baseFov = 72;
  private boostBlend = 0;
  private time = 0;
  // Orbit / cinematic parameters.
  readonly orbitCenter = new Vector3();
  orbitRadius = 34;
  orbitHeight = 9;
  orbitSpeed = 0.07;
  private orbitAngle = 0.6;
  readonly cinePos = new Vector3();
  readonly cineLook = new Vector3();
  private readonly deathPos = new Vector3();
  private readonly deathLook = new Vector3();

  constructor(readonly camera: PerspectiveCamera) {}

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  snapTo(ship: Ship): void {
    this.smoothQ.copy(ship.quaternion);
  }

  startDeath(at: Vector3): void {
    this.mode = 'death';
    this.deathLook.copy(at);
    this.deathPos.copy(this.camera.position);
  }

  update(dt: number, ship: Ship | null): void {
    this.time += dt;
    const cam = this.camera;
    if (this.mode === 'chase' && ship) {
      this.smoothQ.slerp(ship.quaternion, dampFactor(8.5, dt));
      this.boostBlend = damp(this.boostBlend, ship.boosting ? 1 : 0, 3.5, dt);
      _off.set(0, 5.4, 23 + this.boostBlend * 4);
      cam.position.copy(_off).applyQuaternion(this.smoothQ).add(ship.position);
      cam.quaternion.copy(this.smoothQ);
      this.setFov(this.baseFov + this.boostBlend * 9, dt);
    } else if (this.mode === 'orbit') {
      this.orbitAngle += this.orbitSpeed * dt;
      cam.position.set(
        this.orbitCenter.x + Math.cos(this.orbitAngle) * this.orbitRadius,
        this.orbitCenter.y + this.orbitHeight,
        this.orbitCenter.z + Math.sin(this.orbitAngle) * this.orbitRadius,
      );
      cam.lookAt(this.orbitCenter);
      this.setFov(this.baseFov - 12, dt);
    } else if (this.mode === 'death') {
      // Drift back and keep the wreck in frame.
      _look.subVectors(this.deathPos, this.deathLook).normalize();
      this.deathPos.addScaledVector(_look, 6 * dt);
      cam.position.copy(this.deathPos);
      cam.lookAt(this.deathLook);
    } else if (this.mode === 'cinematic') {
      cam.position.lerp(this.cinePos, dampFactor(1.6, dt));
      // Ease the view toward the look target rather than snapping to it.
      _q.copy(cam.quaternion);
      cam.lookAt(this.cineLook);
      _shakeQ.copy(cam.quaternion);
      cam.quaternion.copy(_q).slerp(_shakeQ, dampFactor(3, dt));
      this.setFov(this.baseFov - 8, dt);
    }

    // Shake: trauma squared drives small rotational jitter.
    this.trauma = Math.max(0, this.trauma - dt * 1.3);
    const shake = this.trauma * this.trauma * this.shakeScale;
    if (shake > 0.0005) {
      const t = this.time * 31;
      _e.set(
        (Math.sin(t * 1.13) + Math.sin(t * 2.71) * 0.5) * 0.022 * shake,
        (Math.sin(t * 1.37 + 1.7) + Math.sin(t * 3.13) * 0.5) * 0.022 * shake,
        (Math.sin(t * 0.97 + 3.1)) * 0.035 * shake,
      );
      _shakeQ.setFromAxisAngle(_look.set(1, 0, 0), _e.x);
      cam.quaternion.multiply(_shakeQ);
      _shakeQ.setFromAxisAngle(_look.set(0, 1, 0), _e.y);
      cam.quaternion.multiply(_shakeQ);
      _shakeQ.setFromAxisAngle(_look.set(0, 0, 1), _e.z);
      cam.quaternion.multiply(_shakeQ);
    }
    cam.updateMatrixWorld();
  }

  private setFov(target: number, dt: number): void {
    const fov = damp(this.camera.fov, clamp(target, 30, 110), 4, dt);
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
