import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from 'three';
import { Rng } from '../core/math';
import type { AsteroidVariant } from '../game/Asteroids';
import type { CapitalLayout } from '../game/CapitalShip';

/** Primitive-shape stand-ins for every model (milestone 1). */

const std = (color: number, rough = 0.6, metal = 0.3) => new MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const glow = (color: number, k = 3): MeshBasicMaterial => {
  const m = new MeshBasicMaterial({ color, toneMapped: false });
  m.color.multiplyScalar(k);
  return m;
};

function box(w: number, h: number, d: number, mat: MeshStandardMaterial | MeshBasicMaterial, x = 0, y = 0, z = 0): Mesh {
  const m = new Mesh(new BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

export function greyKestrel(trim = 0x39d5ff): Object3D {
  const g = new Group();
  const hull = std(0xb8c0c8, 0.5, 0.4);
  const dark = std(0x3a4048, 0.7, 0.3);
  g.add(box(2.2, 1.3, 9, hull, 0, 0, 0));
  const nose = new Mesh(new ConeGeometry(1.1, 4, 8), hull);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0, -6.4);
  g.add(nose);
  g.add(box(9.5, 0.25, 3, hull, 0, -0.2, 1.2));
  g.add(box(1.2, 0.8, 2.2, std(0x223344, 0.1, 0.8), 0, 0.9, -2.2)); // cockpit
  for (const s of [-1, 1]) {
    const eng = new Mesh(new CylinderGeometry(0.6, 0.7, 3, 10), dark);
    eng.rotation.x = Math.PI / 2;
    eng.position.set(s * 1.3, 0, 4.3);
    g.add(eng);
    const noz = new Mesh(new CylinderGeometry(0.5, 0.5, 0.2, 10), glow(trim, 4));
    noz.rotation.x = Math.PI / 2;
    noz.position.set(s * 1.3, 0, 5.85);
    g.add(noz);
    g.add(box(0.2, 0.2, 2.6, glow(trim, 3), s * 4.7, -0.1, 1.2));
  }
  return g;
}

export function greyRazor(): Object3D {
  const g = new Group();
  const hull = std(0x8c9098, 0.5, 0.45);
  const red = std(0x7a1c22, 0.5, 0.4);
  const body = new Mesh(new ConeGeometry(1.8, 9, 4), hull);
  body.rotation.x = -Math.PI / 2;
  g.add(body);
  for (const s of [-1, 1]) {
    const w = box(5.5, 0.35, 3, red, s * 3.1, 0, 1.6);
    w.rotation.y = s * 0.5;
    g.add(w);
    g.add(box(0.35, 0.35, 2.4, glow(0xff3030, 6), s * 5.3, 0, 2.2));
  }
  g.add(box(1.3, 1.3, 0.4, glow(0xff5020, 6), 0, 0, 4.5));
  g.add(box(0.8, 0.5, 1.2, glow(0xff2020, 5), 0, 0.9, -1.5)); // sensor eye
  return g;
}

export function greyMaul(): Object3D {
  const g = new Group();
  const hull = std(0x8a8078, 0.55, 0.4);
  const red = std(0x6e2226, 0.55, 0.4);
  g.add(box(6, 3.4, 17, hull));
  for (const s of [-1, 1]) {
    g.add(box(3, 3, 13, red, s * 5.4, -0.8, 1.5));
    g.add(box(2.2, 2.2, 0.4, glow(0xff6020, 6), s * 5.4, -0.8, 8.1));
    g.add(box(0.4, 0.4, 9, glow(0xff3030, 4), s * 7, -0.8, 1));
  }
  g.add(box(1.8, 1, 2.6, glow(0xff3030, 4), 0, 1.9, -5.5));
  return g;
}

export function greyMissile(): Object3D {
  const g = new Group();
  const body = new Mesh(new CylinderGeometry(0.28, 0.28, 2.6, 8), std(0xd8d8d8, 0.4, 0.6));
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const tip = new Mesh(new SphereGeometry(0.35, 8, 6), glow(0xffe080, 5));
  tip.position.z = 1.4;
  g.add(tip);
  return g;
}

export function greyLeviathan(layout: CapitalLayout): Object3D {
  const g = new Group();
  const hull = std(0x7d838e, 0.7, 0.3);
  const dark = std(0x4a4e57, 0.8, 0.3);
  g.add(box(80, 60, 500, hull, 0, 0, 0));
  g.add(box(54, 36, 110, hull, 0, 0, -300));
  g.add(box(34, 40, 60, dark, 0, 45, 160));
  g.add(box(130, 14, 150, dark, 0, -8, 60));
  g.add(box(30, 20, 30, glow(0xff5a3a, 2), 0, -5, -372));
  // Generator pylons.
  for (const p of layout.generators) {
    const len = Math.max(Math.abs(p.x), Math.abs(p.y)) - 20;
    const pylon = box(Math.abs(p.x) > 1 ? len : 8, Math.abs(p.y) > 1 ? len : 8, 10, dark);
    pylon.position.set(p.x * 0.5, p.y * 0.5, p.z);
    g.add(pylon);
  }
  return g;
}

export function greyGenerator(): Object3D {
  const g = new Group();
  const orb = new Mesh(new SphereGeometry(12, 20, 14), glow(0xffa030, 2.5));
  g.add(orb);
  const ring = new Mesh(new CylinderGeometry(15, 15, 3, 24, 1, true), std(0x333840, 0.6, 0.5));
  g.add(ring);
  return g;
}

export function greyTurret(): Object3D {
  const base = new Group();
  base.add(box(9, 3, 9, std(0x3a3d44, 0.7, 0.3), 0, 1.5, 0));
  const head = new Group();
  head.name = 'head';
  head.position.y = 5;
  head.add(box(6, 4, 6, std(0x4a4d55, 0.6, 0.4)));
  for (const s of [-1, 1]) {
    const barrel = new Mesh(new CylinderGeometry(0.5, 0.5, 9, 6), std(0x222222, 0.5, 0.6));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(s * 1.4, 0, -5.5);
    head.add(barrel);
  }
  base.add(head);
  return base;
}

export function greyCapitalLayout(): CapitalLayout {
  const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
  const hullPoints: Vector3[] = [];
  for (let z = -330; z <= 250; z += 55) hullPoints.push(v(0, 28, z), v(30, -18, z), v(-30, -18, z));
  return {
    // Tall pylons put the orbs well outside the shield, so any approach from their side has a clear shot.
    generators: [v(0, 185, -180), v(0, 185, 190), v(-195, 0, 20), v(195, 0, 20)],
    turrets: [
      { position: v(32, 30, -200), normal: v(0, 1, 0) },
      { position: v(-32, 30, -200), normal: v(0, 1, 0) },
      { position: v(32, 30, 40), normal: v(0, 1, 0) },
      { position: v(-32, 30, 40), normal: v(0, 1, 0) },
      { position: v(0, -30, -120), normal: v(0, -1, 0) },
      { position: v(0, -30, 150), normal: v(0, -1, 0) },
      { position: v(40, 0, -90), normal: v(1, 0, 0) },
      { position: v(-40, 0, -90), normal: v(-1, 0, 0) },
    ],
    hangar: { position: v(0, -10, -400), direction: v(0, 0, -1) },
    shieldCenter: v(0, 0, -20),
    shieldRadii: v(100, 82, 372),
    hullPoints,
  };
}

/** Lumpy icosahedron rocks. */
export function greyAsteroidVariants(seed = 7): AsteroidVariant[] {
  const rng = new Rng(seed);
  const variants: AsteroidVariant[] = [];
  const colors = [0x8a8078, 0x7a746e, 0x948a7c, 0x6e6a66];
  for (let k = 0; k < 4; k++) {
    const geo = new IcosahedronGeometry(1, 3);
    const pos = geo.getAttribute('position') as BufferAttribute;
    // Deform with a few random dents and bulges.
    const bumps = Array.from({ length: 9 }, () => ({ d: rng.unitVector(new Vector3()), a: rng.range(-0.35, 0.3), w: rng.range(2, 6) }));
    const p = new Vector3();
    let maxR = 0;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).normalize();
      let r = 1;
      for (const b of bumps) r += b.a * Math.exp(-b.w * (1 - p.dot(b.d)));
      r *= 1 + (rng.next() - 0.5) * 0.06;
      p.multiplyScalar(r);
      p.y *= 0.8 + k * 0.05;
      maxR = Math.max(maxR, p.length());
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    geo.computeVertexNormals();
    variants.push({ geometry: geo as BufferGeometry, material: std(colors[k], 0.95, 0.05), radius: maxR });
  }
  return variants;
}

export { glow as greyGlow };
