import { Color, Material, Mesh, MeshStandardMaterial, Object3D } from 'three';

export const TEAM_RIM = {
  player: new Color(0x3fc8ff),
  enemy: new Color(0xff3440),
};

interface RimData {
  uniform: { value: Color };
  base: Color;
}

/**
 * Adds a view-dependent (Fresnel) emissive rim to a standard material so ships read as
 * silhouettes against space, tinted by team. The rim colour is a live uniform, so it can be
 * boosted per ship (e.g. the current target) without recompiling; all rims share one program.
 */
export function addRim(mat: MeshStandardMaterial, color: Color, strength = 1.1, power = 2.4): void {
  if (mat.userData.rim) return;
  const uniform = { value: color.clone().multiplyScalar(strength) };
  const data: RimData = { uniform, base: uniform.value.clone() };
  mat.userData.rim = data;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = uniform;
    shader.uniforms.uRimPower = { value: power };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimPower;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float rimDot = 1.0 - saturate(dot(normalize(normal), normalize(vViewPosition)));
          totalEmissiveRadiance += uRimColor * pow(rimDot, uRimPower);
        }`,
      );
  };
  mat.customProgramCacheKey = () => `rim-${power.toFixed(2)}`;
  mat.needsUpdate = true;
}

function eachMaterial(root: Object3D, fn: (m: Material) => void): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const mats: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) fn(m);
  });
}

/** Apply a team rim to every standard material under an object. */
export function applyTeamRim(root: Object3D, color: Color, strength = 1.1): void {
  eachMaterial(root, (m) => {
    if ((m as MeshStandardMaterial).isMeshStandardMaterial) addRim(m as MeshStandardMaterial, color, strength);
  });
}

/** Scale an object's rim brightness relative to its base (1 = normal). */
export function setRimBoost(root: Object3D, k: number): void {
  eachMaterial(root, (m) => {
    const rim = m.userData.rim as RimData | undefined;
    if (rim) rim.uniform.value.copy(rim.base).multiplyScalar(k);
  });
}
