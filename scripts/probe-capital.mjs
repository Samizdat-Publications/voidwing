// Debug probe: jump to the carrier phase and report the hull's scene state.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, server: { port: 5210, strictPort: false }, logLevel: 'warn' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => console.log('console:', m.type(), m.text()));
await page.goto(`${url}?test&god&phase=7`);
await page.waitForFunction(() => window.__VW && window.__VW.state().gameState === 'title');
await page.click('.screen.show [data-action="launch"]');
await page.waitForTimeout(4000);
const info = await page.evaluate(() => {
  const g = window.__VW.game;
  const cap = g.world.capital;
  const hull = cap.hull;
  const meshes = [];
  hull.traverse((o) => { if (o.isMesh) meshes.push({ vis: o.visible, mat: o.material.type, pos: o.position.toArray() }); });
  const wp = cap.object.position.toArray().map(Math.round);
  return {
    state: cap.state, objVisible: cap.object.visible, hullVisible: hull.visible, hullParent: hull.parent === cap.object,
    inScene: !!cap.object.parent, capPos: wp, scale: cap.object.scale.toArray(), meshes: meshes.length, first: meshes[0],
    player: g.world.player.position.toArray().map(Math.round),
  };
});
console.log(JSON.stringify(info, null, 1));
// Put the camera near the carrier and look at it.
await page.evaluate(() => {
  const g = window.__VW.game;
  const p = g.world.player;
  const c = g.world.capital.position;
  p.position.set(c.x + 700, c.y + 150, c.z + 500);
  const dir = c.clone().sub(p.position).normalize();
  p.quaternion.setFromUnitVectors(p.forward(dir.clone()).set(0, 0, -1), dir);
  g.controller.resetAim(p);
  g.rig.snapTo(p);
  p.control.throttle = 0;
});
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(root, 'test-output', 'probe-capital.png') });
await browser.close();
await server.close();
