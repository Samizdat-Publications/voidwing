// Debug probe: park a Razor and a Maul in front of the player camera and report their scene state.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, server: { port: 5211, strictPort: false }, logLevel: 'warn' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() !== 'debug') console.log('console:', m.type(), m.text().slice(0, 300)); });
await page.goto(`${url}?test&god&debug`);
await page.waitForFunction(() => window.__VW && window.__VW.state().gameState === 'title');
await page.click('.screen.show [data-action="launch"]');
await page.waitForTimeout(1500);
const info = await page.evaluate(() => {
  const g = window.__VW.game;
  const w = g.world;
  const p = w.player;
  p.control.throttle = 0;
  p.resetMotion(0);
  const fwd = p.forward(p.position.clone().set(0, 0, 0));
  const out = [];
  for (const [kind, dist, side] of [['razor', 70, -18], ['maul', 140, 30]]) {
    const pos = p.position.clone().addScaledVector(fwd, dist).add(p.right(p.position.clone()).multiplyScalar(side));
    const s = w.spawnEnemy(kind, pos, fwd.clone().negate(), true);
    s.controller = null;
    s.control.throttle = 0;
    s.resetMotion(0);
    const meshes = [];
    s.model.traverse((o) => { if (o.isMesh) meshes.push({ name: o.name, vis: o.visible, mat: o.material.type, map: !!o.material.map, color: o.material.color?.getHexString(), emissive: o.material.emissive?.getHexString(), ei: o.material.emissiveIntensity, verts: o.geometry.attributes.position.count }); });
    const box = new s.position.constructor();
    out.push({ kind, meshes, modelScale: s.model.scale.toArray(), children: s.model.children.length });
  }
  return out;
});
console.log(JSON.stringify(info, null, 1));
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(root, 'test-output', 'probe-models.png') });
await browser.close();
await server.close();
