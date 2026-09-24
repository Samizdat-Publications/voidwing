import {
  AdditiveBlending,
  Color,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  Scene,
  Vector3,
} from 'three';

interface Flash {
  mesh: Mesh;
  mat: MeshBasicMaterial;
  age: number;
  life: number;
  size: number;
  vel: Vector3;
  color: Color;
  active: boolean;
}

/** Greybox effects: additive flashes for explosions, hits and warp-ins. */
export class Effects {
  private readonly pool: Flash[] = [];
  private readonly geo = new IcosahedronGeometry(1, 1);

  constructor(scene: Scene) {
    for (let i = 0; i < 96; i++) {
      const mat = new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new Mesh(this.geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 6;
      scene.add(mesh);
      this.pool.push({ mesh, mat, age: 0, life: 1, size: 1, vel: new Vector3(), color: new Color(), active: false });
    }
  }

  private spawn(pos: Vector3, size: number, life: number, color: number, vel?: Vector3): void {
    let f = this.pool.find((p) => !p.active);
    if (!f) f = this.pool.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b));
    f.active = true;
    f.age = 0;
    f.life = life;
    f.size = size;
    f.color.set(color);
    f.vel.copy(vel ?? new Vector3());
    f.mesh.position.copy(pos);
    f.mesh.visible = true;
  }

  explosion(pos: Vector3, size: number, vel: Vector3): void {
    this.spawn(pos, 6 * size, 0.9, 0xff8a30, vel);
    this.spawn(pos, 3.5 * size, 0.5, 0xfff2c0, vel);
  }

  warpFlash(pos: Vector3, size: number): void {
    this.spawn(pos, size, 0.7, 0x9fd8ff);
  }

  spark(pos: Vector3, color = 0xffd080, size = 1.2): void {
    this.spawn(pos, size, 0.18, color);
  }

  update(dt: number): void {
    for (const f of this.pool) {
      if (!f.active) continue;
      f.age += dt;
      const t = f.age / f.life;
      if (t >= 1) {
        f.active = false;
        f.mesh.visible = false;
        continue;
      }
      f.mesh.position.addScaledVector(f.vel, dt);
      const s = f.size * (0.4 + 0.9 * Math.sqrt(t));
      f.mesh.scale.setScalar(s);
      const fade = (1 - t) * (1 - t);
      f.mat.color.copy(f.color).multiplyScalar(3 * fade);
    }
  }

  clear(): void {
    for (const f of this.pool) {
      f.active = false;
      f.mesh.visible = false;
    }
  }
}
