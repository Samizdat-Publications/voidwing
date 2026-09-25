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

/**
 * Procedural hull panelling for a very large model: panel seams on two scales and a per-panel
 * tint, generated in object space (triplanar by the face normal). One baked texture cannot carry
 * seams across a hull hundreds of metres long; this adds them at any distance. Chains after any
 * existing onBeforeCompile (the team rim).
 */
export function addHullDetail(mat: MeshStandardMaterial, panel = 11): void {
  if (mat.userData.hullDetail) return;
  mat.userData.hullDetail = true;
  const prev = mat.onBeforeCompile.bind(mat);
  const prevKey = mat.customProgramCacheKey.bind(mat);
  const p = panel.toFixed(1);
  const sp = (panel * 0.36).toFixed(2);
  const region = (panel * 2).toFixed(1);
  mat.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;\nvObjNrm = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vObjPos;
        varying vec3 vObjNrm;
        float hullHash(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
        float hullSeams(vec2 q, float size, float width) {
          vec2 g = q / size;
          vec2 d = abs(fract(g) - 0.5);
          vec2 w = fwidth(g) * 1.2 + width / size;
          vec2 l = smoothstep(0.5 - w, vec2(0.5), d);
          return max(l.x, l.y);
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec3 an = abs(vObjNrm);
          vec2 hq = an.x > an.y && an.x > an.z ? vObjPos.yz : (an.y > an.z ? vObjPos.xz : vObjPos.xy);
          float bigSeam = hullSeams(hq, ${p}, 0.4);
          float smallSeam = hullSeams(hq + 3.1, ${sp}, 0.2) * step(0.55, hullHash(floor(hq / ${region})));
          vec2 cellId = floor(hq / ${p});
          float tint = 0.78 + 0.36 * hullHash(cellId);
          // An inset plate in some panels: a lighter or darker rectangle, anti-aliased.
          vec2 f = fract(hq / ${p});
          vec2 inset = vec2(0.16 + 0.18 * hullHash(cellId + 7.3), 0.18 + 0.2 * hullHash(cellId + 1.9));
          vec2 aa = fwidth(hq / ${p}) * 1.5;
          vec2 inside = smoothstep(inset - aa, inset + aa, f) * (1.0 - smoothstep(1.0 - inset - aa, 1.0 - inset + aa, f));
          float plate = inside.x * inside.y * step(0.45, hullHash(cellId + 3.7));
          float plateTone = mix(0.86, 1.12, hullHash(cellId + 4.1));
          float fade = 1.0 - smoothstep(1800.0, 3200.0, length(vViewPosition));
          float k = tint * mix(1.0, plateTone, plate) * (1.0 - 0.62 * max(bigSeam, smallSeam * 0.7));
          diffuseColor.rgb *= mix(1.0, k, fade);
        }`,
      );
  };
  mat.customProgramCacheKey = () => `${prevKey()}|hull-${p}`;
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
export function applyTeamRim(root: Object3D, color: Color, strength = 1.1, power = 2.4): void {
  eachMaterial(root, (m) => {
    if ((m as MeshStandardMaterial).isMeshStandardMaterial) addRim(m as MeshStandardMaterial, color, strength, power);
  });
}

/** Scale an object's rim brightness relative to its base (1 = normal). */
export function setRimBoost(root: Object3D, k: number): void {
  eachMaterial(root, (m) => {
    const rim = m.userData.rim as RimData | undefined;
    if (rim) rim.uniform.value.copy(rim.base).multiplyScalar(k);
  });
}
