import { Color, Material, Mesh, MeshStandardMaterial, Object3D } from 'three';

export const TEAM_RIM = {
  player: new Color(0x3fc8ff),
  enemy: new Color(0xff3440),
};

/**
 * Adds a view-dependent (Fresnel) emissive rim to a standard material so ships read as
 * silhouettes against black space, tinted by team. Materials are patched in place, so shared
 * GLB materials get it once.
 */
export function addRim(mat: MeshStandardMaterial, color: Color, strength = 1.1, power = 2.6): void {
  if (mat.userData.rim) return;
  mat.userData.rim = true;
  const rimColor = color.clone().multiplyScalar(strength);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: rimColor };
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
  mat.customProgramCacheKey = () => `rim-${power.toFixed(2)}-${rimColor.getHexString()}`;
  mat.needsUpdate = true;
}

/** Apply a team rim to every standard material under an object. */
export function applyTeamRim(root: Object3D, color: Color, strength = 1.1): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const mats: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) if ((m as MeshStandardMaterial).isMeshStandardMaterial) addRim(m as MeshStandardMaterial, color, strength);
  });
}
