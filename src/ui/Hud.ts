import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { clamp } from '../core/math';
import { PLAYER, RADAR_RANGE, SPECS } from '../game/config';
import type { Entity } from '../game/Entity';
import type { Mission } from '../game/Mission';
import type { PlayerController } from '../game/PlayerController';
import type { Ship } from '../game/Ship';
import type { World } from '../game/World';

export const COLORS = {
  friend: '#52d9ff',
  foe: '#ff4b5c',
  objective: '#ffbe3d',
  white: 'rgba(226,238,255,0.92)',
  dim: 'rgba(170,200,230,0.45)',
  missile: '#ffffff',
  lead: '#ffe14d',
};

export interface HudContext {
  world: World;
  player: Ship;
  controller: PlayerController;
  mission: Mission;
  camera: PerspectiveCamera;
}

interface Proj {
  x: number;
  y: number;
  behind: boolean;
  onScreen: boolean;
  depth: number;
}

const _v = new Vector3();
const _v2 = new Vector3();
const _q = new Quaternion();

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

/** Cockpit HUD. DOM for text panels, one canvas for everything that tracks 3D positions. */
export class Hud {
  readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private readonly objTitle: HTMLElement;
  private readonly objDetail: HTMLElement;
  private readonly comms: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly bannerTitle: HTMLElement;
  private readonly bannerSub: HTMLElement;
  private readonly warnings: HTMLElement;
  private readonly bars: Record<'hull' | 'shield' | 'boost', { fill: HTMLElement; value: HTMLElement; row: HTMLElement }>;
  private readonly missilePips: HTMLElement[] = [];
  private readonly missileCount: HTMLElement;
  private readonly lockFill: HTMLElement;
  private readonly lockText: HTMLElement;
  private readonly lockRow: HTMLElement;
  private readonly speedValue: HTMLElement;
  private readonly throttleFill: HTMLElement;
  private readonly targetPanel: HTMLElement;
  private readonly targetName: HTMLElement;
  private readonly targetDist: HTMLElement;
  private readonly targetHull: HTMLElement;
  private readonly targetShield: HTMLElement;
  private hitMarker = 0;
  private killMarker = 0;
  private damageFlash = 0;
  private readonly damageDir = new Vector3();
  private time = 0;
  private lastCommsKey = '';
  private lastWarn = '';
  private lastBannerKey = '';
  private readonly cache = new Map<string, string | number>();
  private noLockFlash = 0;
  private lastShieldBlock = -99;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud hidden', parent);
    this.canvas = el('canvas', 'hud-canvas', this.root);
    this.g = this.canvas.getContext('2d')!;

    const obj = el('div', 'hud-panel hud-objective', this.root);
    this.objTitle = el('div', 'obj-title', obj);
    this.objDetail = el('div', 'obj-detail', obj);
    this.comms = el('div', 'hud-comms', this.root);
    this.banner = el('div', 'hud-banner', this.root);
    this.bannerTitle = el('div', 'banner-title', this.banner);
    this.bannerSub = el('div', 'banner-sub', this.banner);
    this.warnings = el('div', 'hud-warnings', this.root);

    const status = el('div', 'hud-panel hud-status', this.root);
    const mkBar = (key: 'hull' | 'shield' | 'boost', label: string) => {
      const row = el('div', `bar-row bar-${key}`, status);
      el('span', 'bar-label', row, label);
      const track = el('div', 'bar-track', row);
      const fill = el('div', 'bar-fill', track);
      const value = el('span', 'bar-value', row, '100');
      return { fill, value, row };
    };
    this.bars = { shield: mkBar('shield', 'SHIELD'), hull: mkBar('hull', 'HULL'), boost: mkBar('boost', 'BOOST') };

    const weapons = el('div', 'hud-panel hud-weapons', this.root);
    const mrow = el('div', 'weap-row', weapons);
    el('span', 'weap-label', mrow, 'MISSILES');
    const pips = el('div', 'missile-pips', mrow);
    for (let i = 0; i < SPECS.player.missiles; i++) this.missilePips.push(el('span', 'pip', pips));
    this.missileCount = el('span', 'weap-value', mrow, '8');
    const lrow = el('div', 'weap-row msl-status', weapons);
    el('span', 'weap-label', lrow, 'LOCK');
    const ltrack = el('div', 'bar-track lockbar', lrow);
    this.lockFill = el('div', 'bar-fill', ltrack);
    this.lockText = el('span', 'weap-status', lrow, 'READY');
    this.lockRow = lrow;
    const srow = el('div', 'weap-row', weapons);
    el('span', 'weap-label', srow, 'SPEED');
    this.speedValue = el('span', 'weap-value speed', srow, '0');
    el('span', 'weap-unit', srow, 'm/s');
    const trow = el('div', 'weap-row', weapons);
    el('span', 'weap-label', trow, 'THROTTLE');
    const ttrack = el('div', 'bar-track throttle', trow);
    this.throttleFill = el('div', 'bar-fill', ttrack);

    this.targetPanel = el('div', 'hud-panel hud-target hidden', this.root);
    el('div', 'tp-label', this.targetPanel, 'TARGET');
    this.targetName = el('div', 'tp-name', this.targetPanel);
    this.targetDist = el('div', 'tp-dist', this.targetPanel);
    const th = el('div', 'tp-bar tp-shield', this.targetPanel);
    this.targetShield = el('div', 'tp-fill', th);
    const hh = el('div', 'tp-bar tp-hull', this.targetPanel);
    this.targetHull = el('div', 'tp-fill', hh);
  }

  show(): void {
    this.root.classList.remove('hidden');
  }
  hide(): void {
    this.root.classList.add('hidden');
  }

  resize(w: number, h: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  onPlayerHit(killed: boolean): void {
    this.hitMarker = 1;
    if (killed) this.killMarker = 1;
  }

  onPlayerDamaged(from: Vector3 | null): void {
    this.damageFlash = 1;
    if (from) this.damageDir.copy(from);
  }

  onNoLock(): void {
    this.noLockFlash = 1;
  }

  onShieldBlocked(): void {
    this.lastShieldBlock = this.time;
  }

  private set(key: string, value: string | number, apply: (v: string | number) => void): void {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    apply(value);
  }

  private project(p: Vector3, cam: PerspectiveCamera, out: Proj): Proj {
    _v.copy(p).applyMatrix4(cam.matrixWorldInverse);
    out.depth = -_v.z;
    out.behind = _v.z > 0;
    _v.applyMatrix4(cam.projectionMatrix);
    let x = (_v.x * 0.5 + 0.5) * this.w;
    let y = (-_v.y * 0.5 + 0.5) * this.h;
    if (out.behind) {
      x = this.w - x;
      y = this.h - y;
    }
    out.x = x;
    out.y = y;
    out.onScreen = !out.behind && x >= 0 && x <= this.w && y >= 0 && y <= this.h;
    return out;
  }

  update(dt: number, ctx: HudContext): void {
    this.time += dt;
    this.hitMarker = Math.max(0, this.hitMarker - dt * 5);
    this.killMarker = Math.max(0, this.killMarker - dt * 2.2);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.5);
    this.noLockFlash = Math.max(0, this.noLockFlash - dt * 2);
    this.updateDom(ctx);
    this.draw(ctx);
  }

  private updateDom(ctx: HudContext): void {
    const { player, mission, world, controller } = ctx;
    this.set('objT', mission.objective, (v) => (this.objTitle.textContent = String(v)));
    this.set('objD', mission.objectiveDetail, (v) => (this.objDetail.textContent = String(v)));

    const bar = (key: 'hull' | 'shield' | 'boost', frac: number, value: number) => {
      const pct = Math.round(clamp(frac, 0, 1) * 1000) / 10;
      this.set(`${key}W`, pct, (v) => (this.bars[key].fill.style.width = `${v}%`));
      this.set(`${key}V`, Math.ceil(value), (v) => (this.bars[key].value.textContent = String(v)));
    };
    bar('hull', player.hullFraction, player.hull);
    bar('shield', player.shieldFraction, player.shield);
    bar('boost', player.boostEnergy / PLAYER.boostMax, player.boostEnergy);
    this.set('hullLow', player.hullFraction < 0.3 ? 1 : 0, (v) => this.bars.hull.row.classList.toggle('critical', v === 1));
    this.set('boosting', player.boosting ? 1 : 0, (v) => this.bars.boost.row.classList.toggle('active', v === 1));

    this.set('mis', player.missiles, (v) => {
      this.missileCount.textContent = String(v);
      this.missilePips.forEach((p, i) => p.classList.toggle('empty', i >= Number(v)));
    });
    // Missile status: reload cooldown, lock progress, or ready.
    const cd = Math.max(0, player.missileCooldown);
    let mode: string, frac: number;
    if (!player.alive) [mode, frac] = ['OFFLINE', 0];
    else if (this.noLockFlash > 0) [mode, frac] = ['NO LOCK', 0];
    else if (player.missiles <= 0) [mode, frac] = ['EMPTY', 0];
    else if (cd > 0) [mode, frac] = ['RELOAD', 1 - cd / PLAYER.missileCooldown];
    else if (controller.locked) [mode, frac] = ['LOCKED', 1];
    else if (controller.lockProgress > 0) [mode, frac] = ['LOCKING', controller.lockProgress];
    else [mode, frac] = ['READY', 0];
    this.set('lockMode', mode, (v) => {
      this.lockText.textContent = String(v);
      this.lockRow.setAttribute('data-mode', String(v).toLowerCase());
    });
    this.set('lockFrac', Math.round(frac * 50) * 2, (v) => (this.lockFill.style.width = `${v}%`));
    this.set('spd', Math.round(player.velocity.length()), (v) => (this.speedValue.textContent = String(v)));
    this.set('thr', Math.round(player.throttle * 100), (v) => (this.throttleFill.style.width = `${v}%`));

    const t = player.target;
    this.set('tpVis', t && player.alive ? 1 : 0, (v) => this.targetPanel.classList.toggle('hidden', v === 0));
    if (t) {
      this.set('tpName', t.name, (v) => (this.targetName.textContent = String(v)));
      this.set('tpTeam', t.objective ? 'obj' : 'foe', (v) => this.targetPanel.setAttribute('data-kind', String(v)));
      const d = Math.round(t.position.distanceTo(player.position));
      this.set('tpDist', d, (v) => (this.targetDist.textContent = `${v} m`));
      this.set('tpHull', Math.round(t.hullFraction * 100), (v) => (this.targetHull.style.width = `${v}%`));
      this.set('tpShield', Math.round(t.shieldFraction * 100), (v) => (this.targetShield.style.width = `${v}%`));
    }

    // Comms: last three live messages.
    const live = mission.messages.filter((m) => world.time - m.time < m.duration).slice(-3);
    const key = live.map((m) => m.time).join(',');
    if (key !== this.lastCommsKey) {
      this.lastCommsKey = key;
      this.comms.innerHTML = live
        .map((m) => `<div class="comm comm-${m.team}"><span class="comm-from">${esc(m.from)}</span><span class="comm-text">${esc(m.text)}</span></div>`)
        .join('');
    }

    const b = mission.banner;
    const bKey = b ? `${b.title}|${b.sub}|${b.time}` : '';
    if (bKey !== this.lastBannerKey) {
      this.lastBannerKey = bKey;
      this.banner.classList.toggle('show', !!b);
      if (b) {
        this.bannerTitle.textContent = b.title;
        this.bannerSub.textContent = b.sub;
        this.banner.setAttribute('data-tone', b.tone);
      }
    }

    const warns: string[] = [];
    if (world.missiles.incomingOn(player) > 0) warns.push('MISSILE INCOMING');
    if (player.hullFraction < 0.3 && player.alive) warns.push('HULL CRITICAL');
    if (controller.outOfBounds) warns.push('RETURN TO COMBAT AREA');
    if (this.time - this.lastShieldBlock < 1.6) warns.push('SHOTS BLOCKED BY SHIELD - FLANK THE GENERATOR');
    const wKey = warns.join('|');
    if (wKey !== this.lastWarn) {
      this.lastWarn = wKey;
      this.warnings.innerHTML = warns.map((w) => `<div class="warn">${esc(w)}</div>`).join('');
    }
  }

  private draw(ctx: HudContext): void {
    const g = this.g;
    const { camera, player, controller, world } = ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    if (!player.alive) return;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const pr: Proj = { x: 0, y: 0, behind: false, onScreen: false, depth: 0 };

    // Contacts: full brackets up close, small pips far away, arrows off screen.
    const target = player.target;
    const contacts: Entity[] = [];
    for (const s of world.ships) if (s.alive && s !== player) contacts.push(s);
    for (const gen of world.capital.generators) if (gen.alive && world.capital.state !== 'hidden') contacts.push(gen);
    const focal = (this.h / 2) / Math.tan((camera.fov * Math.PI) / 360);
    g.font = '600 11px "Chakra Petch", "Rajdhani", system-ui, sans-serif';
    g.textAlign = 'center';
    for (const e of contacts) {
      const d = e.position.distanceTo(player.position);
      this.project(e.position, camera, pr);
      const friend = e.team === 'player';
      const color = friend ? COLORS.friend : e.objective ? COLORS.objective : COLORS.foe;
      const isTarget = e === target;
      if (pr.onScreen) {
        const size = clamp((e.radius / Math.max(1, pr.depth)) * focal * 1.4, isTarget ? 16 : 9, 90);
        const far = !isTarget && !e.objective && d > 950;
        if (far) {
          g.fillStyle = color;
          g.globalAlpha = 0.85;
          g.beginPath();
          if (friend) g.arc(pr.x, pr.y, 2.5, 0, Math.PI * 2);
          else {
            g.moveTo(pr.x, pr.y - 4);
            g.lineTo(pr.x + 4, pr.y);
            g.lineTo(pr.x, pr.y + 4);
            g.lineTo(pr.x - 4, pr.y);
          }
          g.fill();
          g.globalAlpha = 1;
        } else {
          this.drawBracket(pr.x, pr.y, size, color, isTarget, friend, e.objective);
        }
        if (isTarget) {
          // Label and bars sit beside the bracket, clear of the crosshair above it.
          g.fillStyle = color;
          g.textAlign = 'left';
          g.fillText(e.name.toUpperCase(), pr.x + Math.max(size, 26) + 10, pr.y - 4);
          g.globalAlpha = 0.8;
          g.fillText(`${Math.round(d)} m`, pr.x + Math.max(size, 26) + 10, pr.y + 9);
          g.globalAlpha = 1;
          g.textAlign = 'center';
          this.drawMiniBars(pr.x + Math.max(size, 26) + 10 + 17, pr.y + 15, e, color);
        } else if (e.objective) {
          g.fillStyle = color;
          g.globalAlpha = 0.9;
          g.fillText(e.name.replace('Generator', 'GEN').toUpperCase(), pr.x, pr.y - size - 7);
          g.globalAlpha = 1;
          this.drawMiniBars(pr.x, pr.y + size + 6, e, color);
        } else if (friend && d < 400) {
          g.fillStyle = color;
          g.globalAlpha = 0.7;
          g.fillText(e.name.toUpperCase(), pr.x, pr.y - size - 6);
          g.globalAlpha = 1;
        }
      } else if (!friend && (isTarget || e.objective || d < 2600)) {
        this.drawEdgeArrow(pr, color, isTarget, isTarget ? `${Math.round(d)} m` : '');
      }
    }

    // Incoming enemy missiles.
    for (const m of world.missiles.list) {
      if (!m.alive || m.team === 'player') continue;
      this.project(m.position, camera, pr);
      if (pr.onScreen) {
        g.strokeStyle = COLORS.missile;
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(pr.x, pr.y, 7 + Math.sin(this.time * 20) * 2, 0, Math.PI * 2);
        g.stroke();
      } else if (m.target === player) this.drawEdgeArrow(pr, COLORS.missile, true, 'MISSILE');
    }

    // Lead pip (where to shoot, yellow) and missile lock ring (drawn outside the bracket).
    if (target && target.alive) {
      this.project(target.position, camera, pr);
      const tx = pr.x, ty = pr.y, tOn = pr.onScreen;
      const tSize = clamp((target.radius / Math.max(1, pr.depth)) * focal * 1.4, 16, 90);
      if (controller.hasLead && tOn) {
        this.project(controller.lead, camera, pr);
        const off = Math.hypot(pr.x - tx, pr.y - ty);
        if (pr.onScreen && off > 10) {
          g.strokeStyle = COLORS.lead;
          g.globalAlpha = 0.35;
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(tx, ty);
          g.lineTo(pr.x, pr.y);
          g.stroke();
          g.globalAlpha = 1;
          g.lineWidth = 2;
          g.beginPath();
          g.arc(pr.x, pr.y, 8, 0, Math.PI * 2);
          g.stroke();
          g.fillStyle = COLORS.lead;
          g.beginPath();
          g.arc(pr.x, pr.y, 3.2, 0, Math.PI * 2);
          g.fill();
        }
      }
      if (tOn && (controller.inLockCone || controller.lockProgress > 0)) {
        const p = controller.lockProgress;
        const rMin = Math.max(tSize * 1.25, 26);
        const r = rMin + (1 - p) * 26;
        g.strokeStyle = controller.locked ? COLORS.foe : 'rgba(255,90,100,0.75)';
        g.lineWidth = controller.locked ? 2.5 : 1.5;
        g.save();
        g.translate(tx, ty);
        g.rotate(controller.locked ? Math.PI / 4 : this.time * 3);
        g.beginPath();
        if (controller.locked) {
          g.rect(-r, -r, r * 2, r * 2);
        } else {
          for (let i = 0; i < 4; i++) {
            const a0 = (i * Math.PI) / 2 + 0.25;
            g.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
            g.arc(0, 0, r, a0, a0 + Math.PI / 2 - 0.5);
          }
        }
        g.stroke();
        g.restore();
      }
    }

    // Gun crosshair (white) and the steering cursor (cyan dot the ship turns toward).
    player.forward(_v2);
    this.project(_v2.clone().multiplyScalar(PLAYER.convergence).add(player.position), camera, pr);
    const cx = pr.x, cy = pr.y;
    this.drawCrosshair(cx, cy);
    this.project(_v2.copy(controller.aimDir).multiplyScalar(PLAYER.convergence).add(player.position), camera, pr);
    if (!pr.behind) {
      const dx = pr.x - cx, dy = pr.y - cy;
      const dist = Math.hypot(dx, dy);
      g.strokeStyle = COLORS.friend;
      g.fillStyle = COLORS.friend;
      g.globalAlpha = 0.9;
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(pr.x, pr.y, 2.6, 0, Math.PI * 2);
      g.fill();
      if (dist > 30) {
        g.globalAlpha = 0.3;
        g.beginPath();
        g.moveTo(cx + (dx / dist) * 26, cy + (dy / dist) * 26);
        g.lineTo(pr.x - (dx / dist) * 6, pr.y - (dy / dist) * 6);
        g.stroke();
      }
      g.globalAlpha = 1;
    }

    // Damage direction: a red glow on the screen edge facing the hit.
    if (this.damageFlash > 0) {
      _q.copy(player.quaternion).invert();
      _v.copy(this.damageDir).sub(player.position).applyQuaternion(_q);
      const ang = Math.atan2(-_v.y, _v.x);
      // Soft red glow pooled against the screen edge on the side the hit came from.
      const ex = this.w / 2 + Math.cos(ang) * this.w * 0.5;
      const ey = this.h / 2 + Math.sin(ang) * this.h * 0.5;
      const rad = Math.min(this.w, this.h) * 0.45;
      const grad = g.createRadialGradient(ex, ey, 0, ex, ey, rad);
      grad.addColorStop(0, `rgba(255,40,50,${this.damageFlash * 0.42})`);
      grad.addColorStop(1, 'rgba(255,40,50,0)');
      g.fillStyle = grad;
      g.fillRect(ex - rad, ey - rad, rad * 2, rad * 2);
    }

    this.drawRadar(ctx);
  }

  private drawCrosshair(x: number, y: number): void {
    const g = this.g;
    // Hollow gun sight: four ticks and a faint ring, clear in the middle so the target shows through.
    g.strokeStyle = COLORS.white;
    g.globalAlpha = 0.3;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(x, y, 15, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 0.95;
    g.lineWidth = 2;
    g.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      g.moveTo(x + dx * 10, y + dy * 10);
      g.lineTo(x + dx * 21, y + dy * 21);
    }
    g.stroke();
    g.globalAlpha = 1;
    if (this.hitMarker > 0 || this.killMarker > 0) {
      const k = Math.max(this.hitMarker, this.killMarker);
      g.strokeStyle = this.killMarker > 0 ? `rgba(255,80,90,${this.killMarker})` : `rgba(255,255,255,${k})`;
      g.lineWidth = this.killMarker > 0 ? 3 : 2;
      const r0 = 8, r1 = this.killMarker > 0 ? 20 : 15;
      g.beginPath();
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        g.moveTo(x + dx * r0, y + dy * r0);
        g.lineTo(x + dx * r1, y + dy * r1);
      }
      g.stroke();
    }
  }

  private drawBracket(x: number, y: number, s: number, color: string, isTarget: boolean, friend: boolean, objective: boolean): void {
    const g = this.g;
    g.strokeStyle = color;
    g.lineWidth = isTarget ? 2.2 : 1.4;
    if (objective) {
      g.beginPath();
      g.moveTo(x, y - s);
      g.lineTo(x + s, y);
      g.lineTo(x, y + s);
      g.lineTo(x - s, y);
      g.closePath();
      g.stroke();
      return;
    }
    if (friend) {
      g.beginPath();
      g.arc(x, y, s * 0.8, 0, Math.PI * 2);
      g.stroke();
      return;
    }
    const c = Math.max(4, s * 0.4);
    g.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const bx = x + sx * s, by = y + sy * s;
      g.moveTo(bx, by - sy * c);
      g.lineTo(bx, by);
      g.lineTo(bx - sx * c, by);
    }
    g.stroke();
  }

  private drawMiniBars(x: number, y: number, e: Entity, color: string): void {
    const g = this.g;
    const w = 34;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(x - w / 2, y, w, 3);
    g.fillStyle = color;
    g.fillRect(x - w / 2, y, w * e.hullFraction, 3);
    if (e.maxShield > 0) {
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(x - w / 2, y + 5, w, 2);
      g.fillStyle = '#8fd8ff';
      g.fillRect(x - w / 2, y + 5, w * e.shieldFraction, 2);
    }
  }

  private drawEdgeArrow(pr: Proj, color: string, big: boolean, label: string): void {
    const g = this.g;
    const cx = this.w / 2, cy = this.h / 2;
    let dx = pr.x - cx, dy = pr.y - cy;
    if (pr.behind) {
      // Targets behind the camera go to the side edges, never under the player's own ship.
      if (Math.abs(dx) < this.w * 0.15) dx = (dx >= 0 ? 1 : -1) * this.w * 0.3;
      dy = Math.min(dy, this.h * 0.1);
    }
    const ang = Math.atan2(dy, dx);
    // Ride an ellipse inside the screen edge; it is squashed vertically so arrows stay clear
    // of the corner panels.
    const rx = this.w / 2 - 70, ry = this.h / 2 - 110;
    const t = 1 / Math.sqrt((Math.cos(ang) / rx) ** 2 + (Math.sin(ang) / ry) ** 2);
    const x = cx + Math.cos(ang) * t, y = cy - 10 + Math.sin(ang) * t;
    const s = big ? 17 : 12;
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.beginPath();
    g.moveTo(s, 0);
    g.lineTo(-s * 0.7, s * 0.75);
    g.lineTo(-s * 0.3, 0);
    g.lineTo(-s * 0.7, -s * 0.75);
    g.closePath();
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0,0,0,0.75)';
    g.stroke();
    g.fillStyle = color;
    g.globalAlpha = big ? 1 : 0.9;
    g.fill();
    g.restore();
    g.globalAlpha = 1;
    if (label) {
      g.font = '700 12px "Chakra Petch", system-ui, sans-serif';
      g.textAlign = 'center';
      const lx = x - Math.cos(ang) * 30, ly = y - Math.sin(ang) * 30 + 4;
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(0,0,0,0.75)';
      g.strokeText(label, lx, ly);
      g.fillStyle = color;
      g.fillText(label, lx, ly);
    }
  }

  private drawRadar(ctx: HudContext): void {
    const g = this.g;
    const { player, world } = ctx;
    const R = Math.min(78, this.h * 0.1);
    // Bottom right, above the weapons panel, so it never sits on the ship.
    const cx = this.w - R - 30, cy = this.h - R - 150;
    g.fillStyle = 'rgba(6,14,26,0.55)';
    g.strokeStyle = 'rgba(120,190,255,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.beginPath();
    g.arc(cx, cy, R * 0.5, 0, Math.PI * 2);
    g.stroke();
    // Forward view cone.
    g.strokeStyle = 'rgba(120,190,255,0.2)';
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx - R * 0.6, cy - R * 0.8);
    g.moveTo(cx, cy);
    g.lineTo(cx + R * 0.6, cy - R * 0.8);
    g.stroke();
    _q.copy(player.quaternion).invert();
    const blip = (pos: Vector3, color: string, size: number, shape: 'dot' | 'diamond' | 'square') => {
      _v.copy(pos).sub(player.position).applyQuaternion(_q);
      const d = Math.hypot(_v.x, _v.z);
      const r = Math.min(1, Math.sqrt(d / RADAR_RANGE)) * R;
      const a = Math.atan2(_v.x, -_v.z);
      const x = cx + Math.sin(a) * r, y = cy - Math.cos(a) * r;
      const above = clamp(_v.y / 400, -1, 1) * 9;
      g.strokeStyle = color;
      g.globalAlpha = 0.6;
      g.lineWidth = 1;
      if (Math.abs(above) > 1.5) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y - above);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = color;
      const by = y - above;
      g.beginPath();
      if (shape === 'dot') g.arc(x, by, size, 0, Math.PI * 2);
      else if (shape === 'square') g.rect(x - size, by - size, size * 2, size * 2);
      else {
        g.moveTo(x, by - size);
        g.lineTo(x + size, by);
        g.lineTo(x, by + size);
        g.lineTo(x - size, by);
      }
      g.fill();
    };
    if (world.capital.state !== 'hidden' && world.capital.state !== 'dead') blip(world.capital.position, COLORS.objective, 5, 'square');
    for (const gen of world.capital.generators) if (gen.alive && world.capital.state !== 'hidden') blip(gen.position, COLORS.objective, 3, 'diamond');
    for (const s of world.ships) {
      if (!s.alive || s === player) continue;
      blip(s.position, s.team === 'player' ? COLORS.friend : COLORS.foe, s === player.target ? 3.4 : 2.4, 'dot');
    }
    const blink = Math.sin(this.time * 18) > 0;
    for (const m of world.missiles.list) if (m.alive && m.team === 'enemy' && blink) blip(m.position, COLORS.missile, 3.2, 'diamond');
    g.fillStyle = COLORS.white;
    g.beginPath();
    g.moveTo(cx, cy - 5);
    g.lineTo(cx + 3.5, cy + 3.5);
    g.lineTo(cx - 3.5, cy + 3.5);
    g.closePath();
    g.fill();
  }
}
