import {
  Color,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Texture,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AsteroidVariant } from '../game/Asteroids';
import type { CapitalLayout } from '../game/CapitalShip';
import {
  greyAsteroidVariants,
  greyCapitalLayout,
  greyGenerator,
  greyKestrel,
  greyLeviathan,
  greyMaul,
  greyMissile,
  greyRazor,
  greyTurret,
} from './Greybox';

export type ModelName = 'kestrel' | 'razor' | 'maul' | 'missile' | 'leviathan' | 'generator' | 'turret' | 'debris';

const FILES: Record<string, string> = {
  kestrel: 'kestrel.glb',
  razor: 'razor.glb',
  maul: 'maul.glb',
  missile: 'missile.glb',
  leviathan: 'leviathan.glb',
  generator: 'generator.glb',
  turret: 'turret.glb',
  debris: 'debris.glb',
  asteroid_a: 'asteroid_a.glb',
  asteroid_b: 'asteroid_b.glb',
  asteroid_c: 'asteroid_c.glb',
  asteroid_d: 'asteroid_d.glb',
};

const WINGMAN_TRIM = new Color(0x4d7dff);
export const ENEMY_SCALE = { razor: 1.35, maul: 1.45 };
const _v = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();

/**
 * Model registry. Loads the Blender-made GLBs from public/assets; anything that fails to load
 * falls back to the greybox stand-in so the game always runs.
 */
export class Assets {
  private readonly scenes = new Map<string, Object3D>();
  private layout: CapitalLayout = greyCapitalLayout();
  private asteroidCache: AsteroidVariant[] | null = null;
  maxAnisotropy = 8;
  readonly missing: string[] = [];

  async load(onProgress?: (fraction: number) => void): Promise<void> {
    const loader = new GLTFLoader();
    const base = `${import.meta.env.BASE_URL}assets/`;
    const names = Object.keys(FILES);
    let done = 0;
    await Promise.all(
      names.map(async (name) => {
        try {
          const gltf = await loader.loadAsync(base + FILES[name]);
          this.prepare(gltf.scene);
          this.scenes.set(name, gltf.scene);
        } catch {
          this.missing.push(name);
        }
        onProgress?.(++done / names.length);
      }),
    );
    const lev = this.scenes.get('leviathan');
    if (lev) this.layout = this.extractLayout(lev);
  }

  get usingGreybox(): boolean {
    return this.missing.length > 0;
  }

  private prepare(root: Object3D): void {
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = mesh.receiveShadow = false;
      const mats: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const sm = m as MeshStandardMaterial;
        if (!sm.isMeshStandardMaterial) continue;
        for (const tex of [sm.map, sm.normalMap, sm.emissiveMap, sm.roughnessMap] as (Texture | null)[]) {
          if (tex) tex.anisotropy = this.maxAnisotropy;
        }
      }
      // Engine glow discs get their brightness driven by throttle; Blender's strengths are tuned
      // for Cycles, so bring them into the game's tone-mapped range.
      if (/EngineGlow|Missile_Glow|Leviathan_Engines/.test(mesh.name)) {
        mesh.userData.engineGlow = true;
        for (const m of mats) {
          const sm = m as MeshStandardMaterial;
          if (sm.isMeshStandardMaterial) sm.emissiveIntensity = Math.min(sm.emissiveIntensity, 3.2);
        }
      }
    });
  }

  model(name: ModelName, variant?: 'wingman'): Object3D {
    const src = this.scenes.get(name);
    if (!src) return this.greybox(name, variant);
    const clone = src.clone(true);
    if (variant === 'wingman') {
      // Wingmen fly the same Kestrel with blue trim so the player can tell them apart.
      clone.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh || !/Trim|EngineGlow/.test(mesh.name)) return;
        const m = (mesh.material as MeshStandardMaterial).clone();
        m.emissive.copy(WINGMAN_TRIM);
        mesh.material = m;
      });
    }
    if (name === 'kestrel' || name === 'razor' || name === 'maul') {
      // Per-ship materials so hit flashes and rim tints never leak between ships.
      clone.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
      });
    }
    if (name === 'kestrel' && !variant) {
      // The player's own ship sits just under the crosshair: keep its trim from blooming white.
      clone.traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.isMesh && /Trim/.test(mesh.name)) (mesh.material as MeshStandardMaterial).emissiveIntensity *= 0.45;
      });
    }
    if (name === 'razor' || name === 'maul') {
      // Enemies are drawn a size up so they read at dogfight range (config radii and guns match).
      const wrap = new Group();
      clone.scale.setScalar(ENEMY_SCALE[name]);
      wrap.add(clone);
      return wrap;
    }
    return clone;
  }

  private greybox(name: ModelName, variant?: 'wingman'): Object3D {
    switch (name) {
      case 'kestrel':
        return greyKestrel(variant === 'wingman' ? 0x5a8cff : 0x39d5ff);
      case 'razor':
      case 'maul': {
        const m = name === 'razor' ? greyRazor() : greyMaul();
        const wrap = new Group();
        m.scale.setScalar(name === 'razor' ? 1.8 : 1.7);
        wrap.add(m);
        return wrap;
      }
      case 'missile':
        return greyMissile();
      case 'leviathan':
        return greyLeviathan(this.layout);
      case 'generator':
        return greyGenerator();
      case 'turret':
        return greyTurret();
      case 'debris':
        return new Group();
    }
  }

  /** Read generator, turret, hangar and shield hardpoints from the carrier GLB's empties. */
  private extractLayout(root: Object3D): CapitalLayout {
    root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert();
    root.getWorldQuaternion(_q2).invert();
    const local = (o: Object3D) => o.getWorldPosition(new Vector3()).applyMatrix4(inv);
    const byName = (n: string) => root.getObjectByName(n);
    const fallback = greyCapitalLayout();
    const gens = ['HP_Gen_A', 'HP_Gen_B', 'HP_Gen_C', 'HP_Gen_D'].map(byName).filter((o): o is Object3D => !!o);
    const turrets: CapitalLayout['turrets'] = [];
    const hullPoints: Vector3[] = [];
    root.traverse((o) => {
      if (o.name.startsWith('HP_Turret_')) {
        o.getWorldQuaternion(_q).premultiply(_q2);
        turrets.push({ position: local(o), normal: _v.set(0, 1, 0).applyQuaternion(_q).clone() });
      } else if (o.name.startsWith('HP_Hull_')) hullPoints.push(local(o));
    });
    const shield = byName('Shield');
    const hangar = byName('HP_Hangar');
    const shieldRadii = shield ? shield.getWorldScale(new Vector3()) : fallback.shieldRadii;
    return {
      generators: gens.length === 4 ? gens.map(local) : fallback.generators,
      turrets: turrets.length ? turrets : fallback.turrets,
      hangar: hangar ? { position: local(hangar), direction: new Vector3(0, 0, -1) } : fallback.hangar,
      shieldCenter: shield ? local(shield) : fallback.shieldCenter,
      shieldRadii,
      hullPoints: hullPoints.length ? hullPoints : fallback.hullPoints,
    };
  }

  capitalLayout(): CapitalLayout {
    return this.layout;
  }

  /** Named child meshes of a loaded model (e.g. carrier sections), or null when greybox. */
  part(name: ModelName, child: string): Object3D | null {
    return this.scenes.get(name)?.getObjectByName(child) ?? null;
  }

  asteroidVariants(): AsteroidVariant[] {
    if (this.asteroidCache) return this.asteroidCache;
    const out: AsteroidVariant[] = [];
    for (const key of ['asteroid_a', 'asteroid_b', 'asteroid_c', 'asteroid_d']) {
      const scene = this.scenes.get(key);
      let mesh: Mesh | null = null;
      scene?.traverse((o) => {
        if (!mesh && (o as Mesh).isMesh) mesh = o as Mesh;
      });
      if (!mesh) continue;
      const m = mesh as Mesh;
      m.updateWorldMatrix(true, false);
      const geo = m.geometry.clone();
      geo.applyMatrix4(m.matrixWorld);
      geo.computeBoundingSphere();
      out.push({ geometry: geo, material: m.material as Material, radius: geo.boundingSphere?.radius ?? 1 });
    }
    this.asteroidCache = out.length === 4 ? out : greyAsteroidVariants();
    return this.asteroidCache;
  }
}
