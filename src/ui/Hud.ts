import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { clamp } from '../core/math';
import { PLAYER, RADAR_RANGE, SPECS } from '../game/config';
import type { Entity } from '../game/Entity';
import type { Mission } from '../game/Mission';
import type { PlayerController } from '../game/PlayerController';
import type { Ship } from '../game/Ship';
import type { World } from '../game/World';

/** Same palette as styles.css: cyan friends, red enemies only, amber objectives, orange warnings. */
export const COLORS = {
  friend: '#4fd8ff',
  foe: '#ff4d5e',
  bomber: '#ff8a4a',
  objective: '#ffc24a',
  warn: '#ff8c3a',
  white: 'rgba(232,241,255,0.95)',
  dim: 'rgba(170,190,215,0.6)',
  missile: '#ffffff',
  lead: '#ffe45c',
  /** Your own positive state: a missile lock. */
  good: '#7dffb6',
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

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** combat: full HUD. cinematic: finale camera, only objective and comms. dead: death camera. */
export type HudMode = 'combat' | 'cinematic' | 'dead';

const CLASS_LABEL: Record<string, string> = {
  razor: 'DOGFIGHTER',
  maul: 'HEAVY BOMBER',
  generator: 'SHIELD GENERATOR',
};

const _v = new Vector3();
const _v2 = new Vector3();
const _q = new Quaternion();
const _proj2: Proj = { x: 0, y: 0, behind: false, onScreen: false, depth: 0 };
const _proj3: Proj = { x: 0, y: 0, behind: false, onScreen: false, depth: 0 };

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

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
  private readonly targetClass: HTMLElement;
  private readonly targetDist: HTMLElement;
  private readonly targetHull: HTMLElement;
  private readonly targetView: HTMLElement;
  private readonly targetShield: HTMLElement;
  private readonly targetShieldLabel: HTMLElement;
  private hitMarker = 0;
  private killMarker = 0;
  private damageFlash = 0;
  private shieldFlash = 0;
  private readonly damageDir = new Vector3();
  private time = 0;
  private lastCommsKey = '';
  private lastWarn = '';
  private lastBannerKey = '';
  private readonly cache = new Map<string, string | number>();
  private noLockFlash = 0;
  private lastShieldBlock = -99;
  private mode: HudMode = 'combat';
  /** Screen rects already taken by labels this frame, so later labels can dodge them. */
  private readonly labelRects: Rect[] = [];
  /** HUD panel rects (from the DOM) that off-screen arrows slide around. */
  private panelRects: Rect[] = [];
  /** The radio box's rect (it fades when a marker that matters is behind it). */
  private commsRect: Rect | null = null;
  /** Each on-screen contact's bracket rect this frame (tag placement and crowding). */
  private readonly bracketRects = new Map<Entity, Rect>();
  /** The current target's frame on screen this frame (centre and half-size), for the reticle. */
  private tgt: { x: number; y: number; ss: number } | null = null;
  /** Off-screen arrows already drawn this frame (so two never sit on top of each other). */
  private readonly arrowSpots: { x: number; y: number }[] = [];
  private panelRectsAge = 99;
  /** True when the target or lead mark sits behind the player's own ship on screen. */
  overlapShip = false;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud hidden', parent);
    this.canvas = el('canvas', 'hud-canvas', this.root);
    // The canvas sits above the DOM panels so markers stay visible when a ship passes behind one.
    this.canvas.style.zIndex = '2';
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
    this.targetClass = el('div', 'tp-class', this.targetPanel);
    this.targetDist = el('div', 'tp-dist', this.targetPanel);
    const sr = el('div', 'tp-row', this.targetPanel);
    this.targetShieldLabel = el('span', 'tp-row-label', sr, 'SHIELD');
    const th = el('div', 'tp-bar tp-shield', sr);
    this.targetShield = el('div', 'tp-fill', th);
    const hr = el('div', 'tp-row', this.targetPanel);
    el('span', 'tp-row-label', hr, 'HULL');
    const hh = el('div', 'tp-bar tp-hull', hr);
    this.targetHull = el('div', 'tp-fill', hh);
    // Targeting computer: the game renders a zoomed view of the target into this frame.
    this.targetView = el('div', 'hud-target-view hidden', this.root);
    el('div', 'tv-label', this.targetView, 'TARGET VIEW');
  }

  /** Screen rect of the target view frame, or null when there is nothing to show. */
  targetViewRect(): DOMRect | null {
    if (this.mode !== 'combat' || this.targetView.classList.contains('hidden') || this.root.classList.contains('hidden')) return null;
    return this.targetView.getBoundingClientRect();
  }

  show(): void {
    this.root.classList.remove('hidden');
    this.setMode('combat');
    this.setPaused(false);
  }

  /** While a menu is open, banners and warnings step back so they never show through it. */
  setPaused(paused: boolean): void {
    this.root.classList.toggle('paused', paused);
  }

  setMode(mode: HudMode): void {
    this.mode = mode;
    this.root.classList.toggle('cinematic', mode === 'cinematic');
    this.root.classList.toggle('dead', mode === 'dead');
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

  /** A hit the shield absorbed: a cyan edge pulse and a flash on the shield bar. */
  onShieldHit(): void {
    this.shieldFlash = 1;
    const row = this.bars.shield.row;
    row.classList.remove('hit');
    void row.offsetWidth;
    row.classList.add('hit');
  }

  /** True when whatever hit you is already on screen (then the chevrons would just add clutter). */
  private damageSourceVisible(camera: PerspectiveCamera): boolean {
    return this.project(this.damageDir, camera, _proj2).onScreen;
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
    this.shieldFlash = Math.max(0, this.shieldFlash - dt * 3.5);
    this.noLockFlash = Math.max(0, this.noLockFlash - dt * 2);
    this.updateDom(ctx);
    this.panelRectsAge += dt;
    if (this.panelRectsAge > 0.5) this.refreshPanelRects();
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
    else [mode, frac] = ['NO LOCK', 0];
    this.set('lockMode', mode + (this.noLockFlash > 0 ? '!' : ''), (v) => {
      this.lockText.textContent = mode;
      this.lockRow.setAttribute('data-mode', String(v).toLowerCase().replace('!', ' flash'));
    });
    this.set('lockFrac', Math.round(frac * 50) * 2, (v) => (this.lockFill.style.width = `${v}%`));
    this.set('spd', Math.round(player.velocity.length()), (v) => (this.speedValue.textContent = String(v)));
    this.set('thr', Math.round(player.throttle * 100), (v) => (this.throttleFill.style.width = `${v}%`));

    const t = player.target;
    this.set('tpVis', t && player.alive ? 1 : 0, (v) => {
      this.targetPanel.classList.toggle('hidden', v === 0);
      this.panelRectsAge = 99;
    });
    // The zoomed view has nothing to add when the target is right in front of you.
    const close = !!t && t.position.distanceTo(player.position) < t.radius * 3 + 25;
    this.set('tvVis', t && player.alive && !close ? 1 : 0, (v) => {
      this.targetView.classList.toggle('hidden', v === 0);
      this.panelRectsAge = 99;
    });
    if (t) {
      this.set('tpName', t.name, (v) => (this.targetName.textContent = String(v)));
      this.set('tpClass', CLASS_LABEL[t.kind] ?? '', (v) => (this.targetClass.textContent = String(v)));
      this.set('tpTeam', t.objective ? 'obj' : 'foe', (v) => this.targetPanel.setAttribute('data-kind', String(v)));
      const d = Math.round(t.position.distanceTo(player.position));
      this.set('tpDist', d, (v) => (this.targetDist.textContent = `${v} m`));
      this.set('tpHull', Math.round(t.hullFraction * 100), (v) => (this.targetHull.style.width = `${v}%`));
      const gen = t.kind === 'generator';
      const cap = world.capital;
      const shieldFrac = gen ? (cap.shieldActive ? cap.generatorsAlive / Math.max(1, cap.generators.length) : 0) : t.shieldFraction;
      this.set('tpShieldLabel', gen ? 'BUBBLE' : 'SHIELD', (v) => (this.targetShieldLabel.textContent = String(v)));
      this.set('tpShield', Math.round(shieldFrac * 100), (v) => (this.targetShield.style.width = `${v}%`));
      this.set('tpShieldBubble', gen ? 1 : 0, (v) => this.targetShield.classList.toggle('bubble', v === 1));
    }

    // Comms: last three live messages.
    const live = mission.messages.filter((m) => world.time - m.time < m.duration).slice(-2);
    const key = live.map((m) => m.time).join(',');
    if (key !== this.lastCommsKey) {
      this.lastCommsKey = key;
      this.panelRectsAge = 99;
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

    const warns: [string, string][] = [];
    if (player.alive) {
      if (world.missiles.incomingOn(player) > 0) warns.push(['missile', 'MISSILE INCOMING - BREAK HARD']);
      if (player.hullFraction < 0.3) warns.push(['hull', 'HULL CRITICAL']);
      else if (player.shield < 1 && player.maxShield > 0) warns.push(['hull', 'SHIELDS DOWN']);
      if (controller.outOfBounds) warns.push(['bounds', 'RETURN TO COMBAT AREA']);
      if (this.time - this.lastShieldBlock < 1.6 && !mission.banner) warns.push(['info', 'SHIELD IN THE WAY - FLANK THE GENERATOR']);
    }
    // Never more than two at once, most urgent first.
    warns.length = Math.min(warns.length, 2);
    const wKey = warns.map((w) => w[1]).join('|');
    if (wKey !== this.lastWarn) {
      this.lastWarn = wKey;
      this.warnings.innerHTML = warns.map(([k, w]) => `<div class="warn warn-${k}">${esc(w)}</div>`).join('');
    }
  }

  private draw(ctx: HudContext): void {
    const g = this.g;
    const { camera, player, controller, world, mission } = ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    if (!player.alive || this.mode !== 'combat') return;
    this.labelRects.length = 0;
    this.tgt = null;
    this.arrowSpots.length = 0;
    // World labels never print over the HUD panels, or through the banner while it is up.
    for (const r of this.panelRects) this.labelRects.push(r);
    if (mission.banner) this.labelRects.push({ x: this.w * 0.25, y: this.h * 0.17 - 6, w: this.w * 0.5, h: 64 });
    this.drawLowHull(player);
    if (this.shieldFlash > 0) {
      // Cyan pulse around the screen edge: your shield just took a hit.
      const r0 = Math.min(this.w, this.h) * 0.46, r1 = Math.hypot(this.w, this.h) * 0.56;
      const grad = g.createRadialGradient(this.w / 2, this.h / 2, r0, this.w / 2, this.h / 2, r1);
      grad.addColorStop(0, 'rgba(79,216,255,0)');
      grad.addColorStop(1, `rgba(79,216,255,${this.shieldFlash * 0.28})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, this.w, this.h);
    }
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const pr: Proj = { x: 0, y: 0, behind: false, onScreen: false, depth: 0 };

    // Contacts: brackets on screen (tiny pips only beyond 1.6 km), arrows at the screen edge.
    const target = player.target;
    const locking = !!target && target.alive && (controller.inLockCone || controller.lockProgress > 0);
    const missileReady = player.missiles > 0 && player.missileCooldown <= 0;
    const lockTag = !locking || !missileReady ? '' : controller.locked ? 'LOCK' : 'LOCKING';
    const contacts: Entity[] = [];
    // The current target goes first so its label claims its spot before any other label.
    if (target && target.alive) contacts.push(target);
    for (const s of world.ships) if (s.alive && s !== player && s !== target) contacts.push(s);
    for (const gen of world.capital.generators) if (gen.alive && gen !== target && world.capital.state !== 'hidden') contacts.push(gen);
    const focal = (this.h / 2) / Math.tan((camera.fov * Math.PI) / 360);
    g.font = '600 11px "Chakra Petch", system-ui, sans-serif';
    g.textAlign = 'center';
    this.bracketRects.clear();
    for (const e of contacts) {
      this.project(e.position, camera, pr);
      if (!pr.onScreen) continue;
      const s = clamp((e.radius * this.viewScale(e) / Math.max(1, pr.depth)) * focal * 1.15, 7, e.objective ? 46 : 90);
      const r = { x: pr.x - s, y: pr.y - s, w: s * 2, h: s * 2 };
      this.labelRects.push(r);
      this.bracketRects.set(e, r);
    }
    // The player's ship on screen: labels and turret markers keep off it; it fades when a target is behind it.
    this.project(player.position, camera, pr);
    const shipRect = { x: pr.x - 82, y: pr.y - 48, w: 164, h: 74 };
    this.labelRects.push(shipRect);
    let overlap = false;
    let targetFrame: Rect | null = null;
    // Everything world-anchored is clipped out of the HUD panels, so no marker draws across them.
    g.save();
    g.beginPath();
    g.rect(0, 0, this.w, this.h);
    for (const r of this.panelRects) g.rect(r.x, r.y, r.w, r.h);
    g.clip('evenodd');
    for (const e of contacts) {
      const d = e.position.distanceTo(player.position);
      this.project(e.position, camera, pr);
      const friend = e.team === 'player';
      const color = friend ? COLORS.friend : e.objective ? COLORS.objective : COLORS.foe;
      const isTarget = e === target;
      if (pr.onScreen) {
        // Generator markers stay compact even when you are right on top of one.
        const size = clamp((e.radius * this.viewScale(e) / Math.max(1, pr.depth)) * focal * 1.15, isTarget ? 16 : d > 600 ? 7 : 9, e.objective ? 46 : 90);
        // A marker whose ship sits behind a HUD panel is hidden with it (the rest is clipped at panel edges).
        if (!isTarget && this.insidePanel(pr.x, pr.y)) continue;
        const underBanner = !!mission.banner && pr.y > this.h * 0.17 - 10 && pr.y < this.h * 0.17 + 64 && Math.abs(pr.x - this.w / 2) < this.w * 0.25;
        g.globalAlpha = underBanner ? 0.35 : 1;
        // Fade your ship only for a small marker hiding behind it, never for a target that fills the view.
        if (size < 44 && pr.x > shipRect.x - size && pr.x < shipRect.x + shipRect.w + size && pr.y > shipRect.y - size && pr.y < shipRect.y + shipRect.h + size) overlap = true;
        if (!isTarget && !e.objective && d > 1600) {
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
          continue;
        }
        if (underBanner) {
          this.drawBracket(pr.x, pr.y, size, color, isTarget, friend, e.objective, e.kind === 'maul');
          g.globalAlpha = 1;
          continue;
        }
        g.globalAlpha = 1;
        if (isTarget) {
          // Lock state lives on the target's own brackets: they close in while locking and turn
          // solid when locked. No extra rings stacked on the aim point.
          const p = locking ? controller.lockProgress : 1;
          const ss = size + 5 + (locking ? (1 - p) * 22 : 0);
          targetFrame = { x: pr.x - ss, y: pr.y - ss, w: ss * 2, h: ss * 2 };
          this.tgt = { x: pr.x, y: pr.y, ss };
          const ready = missileReady && controller.locked;
          g.globalAlpha = locking && !controller.locked ? 0.55 + 0.45 * p : 1;
          this.drawBracket(pr.x, pr.y, ss, color, true, false, e.objective, e.kind === 'maul', ready ? 3.4 : 2.2);
          g.globalAlpha = 1;
          // One tag per target, pinned to the bracket's top-right corner: lock state, type and range
          // together, so it can never read as belonging to a neighbouring ship.
          const blocked = e.objective && world.capital.shieldActive && (world.capital.segmentShieldT(player.position, e.position) >= 0 || this.time - this.lastShieldBlock < 1.6);
          const parts: string[] = [];
          if (lockTag) parts.push(lockTag);
          if (blocked) parts.push('SHIELD IN THE WAY');
          else if (e.kind === 'maul') parts.push('BOMBER');
          parts.push(`${Math.round(d)} m`);
          const text = parts.join('  ');
          g.font = '700 11px "Chakra Petch", system-ui, sans-serif';
          const tw = g.measureText(text).width + 12;
          const locked = lockTag === 'LOCK';
          // The tag sits flush against the frame (above, below, right or left, whichever side is
          // clear of other ships' brackets), so it can never read as another ship's label.
          const avoid: Rect[] = [];
          if (controller.hasLead) {
            this.project(controller.lead, camera, _proj2);
            if (_proj2.onScreen) avoid.push({ x: _proj2.x - 10, y: _proj2.y - 10, w: 20, h: 20 });
          }
          // A bomber's double bar sits over the top of its frame.
          if (e.kind === 'maul') {
            const bw = Math.max(7, ss * 0.45);
            avoid.push({ x: pr.x - bw - 3, y: pr.y - ss - 12, w: bw * 2 + 6, h: 10 });
          }
          const { x: tx, y: ty } = this.placeTag(e, pr.x, pr.y, ss, tw, avoid);
          if (locked) {
            g.strokeStyle = color;
            g.lineWidth = 1.2;
            g.strokeRect(pr.x - ss, pr.y - ss, ss * 2, ss * 2);
          }
          const fill = locked ? COLORS.good : blocked ? 'rgba(255,140,58,0.92)' : 'rgba(6,10,19,0.78)';
          g.fillStyle = fill;
          g.fillRect(tx, ty, tw, 16);
          g.strokeStyle = locked ? COLORS.good : color;
          g.lineWidth = 1;
          g.strokeRect(tx + 0.5, ty + 0.5, tw - 1, 15);
          g.fillStyle = locked ? '#06131c' : blocked ? '#fff' : color === COLORS.objective ? COLORS.objective : COLORS.white;
          g.textAlign = 'left';
          g.fillText(text, tx + 6, ty + 12);
          g.textAlign = 'center';
          g.font = '600 11px "Chakra Petch", system-ui, sans-serif';
          this.labelRects.push({ x: tx, y: ty, w: tw, h: 16 });
        } else {
          // A neighbour whose bracket crosses the target's frame steps back, so the target's frame
          // and tag are the ones that read.
          const r = this.bracketRects.get(e);
          const crowding = !!targetFrame && !!r && !friend && overlaps(r, targetFrame);
          if (!friend && !e.objective) g.globalAlpha = crowding ? 0.35 : 0.85;
          this.drawBracket(pr.x, pr.y, size, color, false, friend, e.objective, e.kind === 'maul', friend || e.objective ? undefined : crowding ? 1 : 1.4);
          g.globalAlpha = 1;
          if (e.objective) {
            const name = e.name.replace('Generator', 'GEN').toUpperCase();
            const ly = this.placeLabel(pr.x - 24, Math.max(4, pr.y - size - 19), 48, 14);
            if (ly !== null) this.labelText(name, pr.x, ly + 11, color, 'center', 0.9);
            this.drawMiniBars(pr.x, pr.y + size + 6, e, color);
          } else if (friend && d < 400 && Math.hypot(pr.x - this.w / 2, pr.y - this.h / 2) > 110) {
            // Wingman names stay out of the sight area.
            const ly = this.placeLabel(pr.x - 32, Math.max(4, pr.y - Math.min(size, 22) - 30), 64, 14);
            if (ly !== null) this.labelText(e.name.toUpperCase(), pr.x, ly + 11, color, 'center', 0.8);
          }
        }
      } else if (!friend && (isTarget || e.objective || d < 2600)) {
        this.drawEdgeArrow(pr, color, isTarget, isTarget ? `${Math.round(d)} m` : '');
      }
    }

    g.restore();
    this.overlapShip = overlap;
    let behindComms = false;
    if (this.commsRect) {
      const c = this.commsRect;
      for (const e of contacts) {
        if (e !== target && !e.objective) continue;
        this.project(e.position, camera, pr);
        if (pr.onScreen && pr.x > c.x - 20 && pr.x < c.x + c.w + 20 && pr.y > c.y - 20 && pr.y < c.y + c.h + 20) behindComms = true;
      }
    }
    this.set('commsFade', behindComms ? 1 : 0, (v) => this.comms.classList.toggle('see-through', v === 1));

    // Out of bounds: an amber arrow toward the combat area.
    if (controller.outOfBounds) {
      _v.copy(player.position).negate().normalize().multiplyScalar(600).add(player.position);
      this.project(_v, camera, pr);
      if (pr.onScreen) {
        g.strokeStyle = COLORS.objective;
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(pr.x, pr.y - 12);
        g.lineTo(pr.x + 12, pr.y);
        g.lineTo(pr.x, pr.y + 12);
        g.lineTo(pr.x - 12, pr.y);
        g.closePath();
        g.stroke();
        this.labelText('COMBAT AREA', pr.x, pr.y + 28, COLORS.objective, 'center', 1);
      } else this.drawEdgeArrow(pr, COLORS.objective, true, 'COMBAT AREA');
    }

    // Carrier turrets tracking the player: small red squares, the nearest labelled FLAK.
    if (world.capital.state === 'active') {
      let nearest: Entity | null = null;
      let nearestD = Infinity;
      for (const t of world.capital.turrets) {
        if (!t.alive || t.target !== player) continue;
        const d = t.position.distanceTo(player.position);
        this.project(t.position, camera, pr);
        if (!pr.onScreen) continue;
        if (pr.x > shipRect.x && pr.x < shipRect.x + shipRect.w && pr.y > shipRect.y && pr.y < shipRect.y + shipRect.h) continue;
        if (this.insidePanel(pr.x, pr.y)) continue;
        g.strokeStyle = COLORS.foe;
        g.lineWidth = 1.6;
        g.strokeRect(pr.x - 5, pr.y - 5, 10, 10);
        if (d < nearestD) {
          nearestD = d;
          nearest = t;
        }
      }
      if (nearest) {
        this.project(nearest.position, camera, pr);
        const ly = this.placeLabel(pr.x - 20, pr.y + 8, 40, 14);
        g.font = '700 12px "Chakra Petch", system-ui, sans-serif';
        if (ly !== null) this.labelText('FLAK', pr.x, ly + 11, COLORS.foe, 'center', 1);
        g.font = '600 11px "Chakra Petch", system-ui, sans-serif';
      }
    }

    // Incoming enemy missiles: a pulsing triangle on screen, and a threat chevron around the sight
    // pointing at every missile that is tracking the player (only the nearest carries the label).
    let nearestThreat: Entity | null = null;
    let nearestThreatD = Infinity;
    for (const m of world.missiles.list) {
      if (!m.alive || m.team === 'player' || m.target !== player) continue;
      const d = m.position.distanceTo(player.position);
      if (d < nearestThreatD) [nearestThreat, nearestThreatD] = [m, d];
    }
    for (const m of world.missiles.list) {
      if (!m.alive || m.team === 'player') continue;
      this.project(m.position, camera, pr);
      // A missile just leaving its launcher sits on that ship's bracket: the bracket says enough.
      const onBracket = [...this.bracketRects.values()].some((r) => pr.x > r.x && pr.x < r.x + r.w && pr.y > r.y && pr.y < r.y + r.h);
      const triangle = pr.onScreen && !onBracket && m.position.distanceTo(player.position) < 900;
      if (triangle) {
        const r = 8 + Math.sin(this.time * 20) * 2;
        g.strokeStyle = COLORS.warn;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(pr.x, pr.y - r);
        g.lineTo(pr.x + r * 0.9, pr.y + r * 0.6);
        g.lineTo(pr.x - r * 0.9, pr.y + r * 0.6);
        g.closePath();
        g.stroke();
      }
      // A missile tracking you always gets one cue: its triangle, or a chevron around the sight.
      if (m.target === player && !triangle) this.drawThreat(m.position, camera, 136, COLORS.warn, m === nearestThreat ? 'MISSILE' : '', shipRect);
    }

    // Lead: a yellow diamond where to shoot, tied to the target when it sits ahead of it.
    if (target && target.alive && controller.hasLead) {
      this.project(target.position, camera, pr);
      const tx = pr.x, ty = pr.y, tOn = pr.onScreen;
      this.project(controller.lead, camera, pr);
      const off = Math.hypot(pr.x - tx, pr.y - ty);
      const inFrame = !!this.tgt && Math.abs(pr.x - tx) < this.tgt.ss * 0.75 && Math.abs(pr.y - ty) < this.tgt.ss * 0.75;
      if (tOn && pr.onScreen && inFrame) {
        // The lead falls on the ship itself: a small dot, so the ship stays visible.
        g.beginPath();
        g.arc(pr.x, pr.y, 3.6, 0, Math.PI * 2);
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(0,0,0,0.75)';
        g.stroke();
        g.fillStyle = COLORS.lead;
        g.fill();
      } else if (tOn && pr.onScreen) {
        if (pr.x > shipRect.x && pr.x < shipRect.x + shipRect.w && pr.y > shipRect.y && pr.y < shipRect.y + shipRect.h) this.overlapShip = true;
        if (off > 12) {
          g.strokeStyle = COLORS.lead;
          g.globalAlpha = 0.5;
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(tx, ty);
          g.lineTo(pr.x, pr.y);
          g.stroke();
          g.globalAlpha = 1;
        }
        g.beginPath();
        g.arc(pr.x, pr.y, off > 12 ? 6.5 : 7, 0, Math.PI * 2);
        g.lineWidth = 3.5;
        g.strokeStyle = 'rgba(0,0,0,0.75)';
        g.stroke();
        if (off > 12) {
          g.fillStyle = COLORS.lead;
          g.fill();
        } else {
          // On the target: a hollow ring so the ship itself stays visible.
          g.lineWidth = 1.8;
          g.strokeStyle = COLORS.lead;
          g.stroke();
        }
      }
    }

    // Gun crosshair (white) and the steering cursor (cyan dot the ship turns toward).
    player.forward(_v2);
    this.project(_v2.clone().multiplyScalar(PLAYER.convergence).add(player.position), camera, pr);
    const cx = pr.x, cy = pr.y;
    // On target: the cross opens up to frame the ship (ticks outside its frame) and the steering
    // ring steps aside, so the ship you are shooting is never under the symbols.
    const onTarget = !!this.tgt && Math.abs(cx - this.tgt.x) < this.tgt.ss && Math.abs(cy - this.tgt.y) < this.tgt.ss;
    this.drawCrosshair(cx, cy, onTarget && this.tgt ? Math.max(14, this.tgt.ss + 4) : 14);
    this.project(_v2.copy(controller.aimDir).multiplyScalar(PLAYER.convergence).add(player.position), camera, pr);
    const adx = pr.x - cx, ady = pr.y - cy;
    // Steering ring: where the ship is turning to. It sits inside the gun sight when on course.
    if (!pr.behind && !onTarget) {
      const dist = Math.hypot(adx, ady);
      const onLead = !!target && target.alive && controller.hasLead && this.project(controller.lead, camera, _proj2).onScreen && Math.hypot(_proj2.x - pr.x, _proj2.y - pr.y) < 16;
      const ringR = onLead ? 0 : 9;
      g.strokeStyle = 'rgba(0,0,0,0.55)';
      g.lineWidth = 4;
      g.fillStyle = COLORS.white;
      g.globalAlpha = 0.95;
      if (ringR > 0) {
        g.beginPath();
        g.arc(pr.x, pr.y, ringR, 0, Math.PI * 2);
        g.stroke();
        g.strokeStyle = COLORS.white;
        g.lineWidth = 1.6;
        g.beginPath();
        g.arc(pr.x, pr.y, ringR, 0, Math.PI * 2);
        g.stroke();
      }
      g.beginPath();
      g.arc(pr.x, pr.y, 1.8, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 1.5;
      if (dist > 34) {
        g.globalAlpha = 0.3;
        g.beginPath();
        g.moveTo(cx + (adx / dist) * 28, cy + (ady / dist) * 28);
        g.lineTo(pr.x - (adx / dist) * 6, pr.y - (ady / dist) * 6);
        g.stroke();
      }
      g.globalAlpha = 1;
    }

    // Damage direction: an orange glow on the screen edge facing the hit and an arc around the sight.
    if (this.damageFlash > 0 && !this.damageSourceVisible(camera)) {
      const { ang } = this.screenAngle(this.damageDir, camera);
      const ex = this.w / 2 + Math.cos(ang) * this.w * 0.5;
      const ey = this.h / 2 + Math.sin(ang) * this.h * 0.5;
      const rad = Math.min(this.w, this.h) * 0.5;
      const grad = g.createRadialGradient(ex, ey, 0, ex, ey, rad);
      grad.addColorStop(0, `rgba(255,110,40,${this.damageFlash * 0.5})`);
      grad.addColorStop(1, 'rgba(255,110,40,0)');
      g.fillStyle = grad;
      g.fillRect(ex - rad, ey - rad, rad * 2, rad * 2);
      // Two chevrons on a ring around your own ship point at whoever hit you.
      this.project(player.position, camera, pr);
      const a = Math.min(1, this.damageFlash * 1.5);
      g.save();
      g.translate(pr.x, pr.y - 8);
      g.rotate(ang);
      g.strokeStyle = `rgba(255,150,60,${a})`;
      g.lineWidth = 4;
      g.beginPath();
      for (const r of [96, 112]) {
        g.moveTo(r - 8, -11);
        g.lineTo(r, 0);
        g.lineTo(r - 8, 11);
      }
      g.stroke();
      g.restore();
    }

    this.drawRadar(ctx);
  }

  /**
   * Reserve a label rect next to its marker, nudging it at most two label heights up or down past
   * labels, brackets and HUD panels already placed this frame. Returns null (draw no label) when
   * there is no room nearby: a label far from its marker would read as someone else's.
   */
  private placeLabel(x: number, y: number, w: number, h: number): number | null {
    const free = (ry: number) => !this.labelRects.some((r) => x < r.x + r.w && x + w > r.x && ry < r.y + r.h && ry + h > r.y);
    const y0 = Math.max(4, y);
    for (const cand of [y0, y0 - (h + 2), y0 + (h + 2), y0 - 2 * (h + 2), y0 + 2 * (h + 2)]) {
      if (cand < 4 || cand > this.h - h - 4 || !free(cand)) continue;
      this.labelRects.push({ x, y: cand, w, h });
      return cand;
    }
    return null;
  }

  /** Where the target's tag goes: flush against its frame, on the first side clear of other brackets. */
  private placeTag(target: Entity, x: number, y: number, ss: number, tw: number, extra: Rect[] = []): { x: number; y: number } {
    const own = this.bracketRects.get(target);
    const blockers: Rect[] = [...extra];
    for (const [e, r] of this.bracketRects) if (e !== target && r !== own) blockers.push(r);
    const cands = [
      { x: x + 10, y: y - ss - 16 },
      { x: x + 10, y: y + ss },
      { x: x - 10 - tw, y: y - ss - 16 },
      { x: x - 10 - tw, y: y + ss },
    ].map((c) => ({ x: clamp(c.x, 6, this.w - tw - 6), y: clamp(c.y, 4, this.h - 20) }));
    const pick = cands.find((c) => !blockers.some((r) => overlaps(r, { x: c.x, y: c.y, w: tw, h: 16 }))) ?? cands[0];
    this.labelRects.push({ x: pick.x, y: pick.y, w: tw, h: 16 });
    return pick;
  }

  /** How much larger the renderer draws a ship than its real size (so brackets fit the drawing). */
  private viewScale(e: Entity): number {
    return e.kind === 'razor' || e.kind === 'maul' || e.kind === 'wingman' ? e.viewScale : 1;
  }

  private insidePanel(x: number, y: number): boolean {
    return this.panelRects.some((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);
  }

  private labelText(text: string, x: number, y: number, color: string, align: CanvasTextAlign, alpha: number): void {
    const g = this.g;
    const tw = g.measureText(text).width;
    if (align === 'center') x = clamp(x, tw / 2 + 6, this.w - tw / 2 - 6);
    else if (align === 'left') x = clamp(x, 6, this.w - tw - 6);
    y = clamp(y, 14, this.h - 6);
    g.textAlign = align;
    g.globalAlpha = alpha;
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.strokeText(text, x, y);
    g.fillStyle = color;
    g.fillText(text, x, y);
    g.globalAlpha = 1;
    g.textAlign = 'center';
  }

  /** Pulsing red vignette while the hull is low. */
  private drawLowHull(player: Ship): void {
    const f = player.hullFraction;
    if (f >= 0.35) return;
    const g = this.g;
    const k = (0.35 - f) / 0.35;
    const a = 0.16 + k * 0.22 + Math.sin(this.time * 6) * 0.07 * (0.5 + k);
    const r0 = Math.min(this.w, this.h) * 0.42, r1 = Math.hypot(this.w, this.h) * 0.58;
    const grad = g.createRadialGradient(this.w / 2, this.h / 2, r0, this.w / 2, this.h / 2, r1);
    grad.addColorStop(0, 'rgba(255,30,40,0)');
    grad.addColorStop(1, `rgba(255,30,40,${a})`);
    g.fillStyle = grad;
    g.fillRect(0, 0, this.w, this.h);
  }

  /** A chevron on a ring around the sight pointing at a threat (works on and off screen). */
  /**
   * Screen direction (radians, from the screen centre) toward a world point, with the edge arrows'
   * convention: something behind you points to the nearer side edge. Threat chevrons and the
   * damage cue use it too, so all three always agree.
   */
  private screenAngle(pos: Vector3, camera: PerspectiveCamera): { ang: number; behind: boolean } {
    const pr = this.project(pos, camera, _proj3);
    let dx = pr.x - this.w / 2, dy = pr.y - this.h / 2;
    if (pr.behind) {
      if (Math.abs(dx) < this.w * 0.15) dx = (dx >= 0 ? 1 : -1) * this.w * 0.3;
      dy = Math.min(dy, this.h * 0.1);
    }
    return { ang: Math.atan2(dy, dx), behind: pr.behind };
  }

  private drawThreat(pos: Vector3, camera: PerspectiveCamera, radius: number, color: string, label: string, avoid: Rect): void {
    const g = this.g;
    const { ang, behind } = this.screenAngle(pos, camera);
    const pulse = 0.65 + 0.35 * Math.sin(this.time * 16);
    const x = this.w / 2 + Math.cos(ang) * radius, y = this.h / 2 + Math.sin(ang) * radius;
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.beginPath();
    g.moveTo(12, 0);
    g.lineTo(-7, 10);
    g.lineTo(-2, 0);
    g.lineTo(-7, -10);
    g.closePath();
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0,0,0,0.7)';
    g.stroke();
    g.fillStyle = color;
    g.globalAlpha = pulse;
    g.fill();
    g.restore();
    g.globalAlpha = 1;
    if (label) {
      g.font = '700 13px "Chakra Petch", system-ui, sans-serif';
      // Push the label further out if it would print across your own ship.
      let lr = radius + 30;
      const inside = (r: number) => {
        const x = this.w / 2 + Math.cos(ang) * r, y = this.h / 2 + Math.sin(ang) * r;
        return x > avoid.x && x < avoid.x + avoid.w && y > avoid.y - 8 && y < avoid.y + avoid.h + 8;
      };
      while (inside(lr) && lr < radius + 200) lr += 16;
      const lx = this.w / 2 + Math.cos(ang) * lr, ly = this.h / 2 + Math.sin(ang) * lr + 4;
      this.labelText(behind ? `${label} BEHIND` : label, lx, ly, color, 'center', pulse);
      g.font = '600 11px "Chakra Petch", "Rajdhani", system-ui, sans-serif';
    }
  }

  private drawCrosshair(x: number, y: number, inner = 14): void {
    const g = this.g;
    // Gun sight: four ticks with a dark outline and a clear middle so the target shows through.
    const ticks = () => {
      g.beginPath();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        g.moveTo(x + dx * inner, y + dy * inner);
        g.lineTo(x + dx * (inner + 11), y + dy * (inner + 11));
      }
      g.stroke();
    };
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 4.5;
    ticks();
    g.strokeStyle = COLORS.white;
    g.lineWidth = 2;
    ticks();
    if (this.hitMarker > 0 || this.killMarker > 0) {
      const k = Math.max(this.hitMarker, this.killMarker);
      g.strokeStyle = this.killMarker > 0 ? `rgba(255,77,94,${this.killMarker})` : `rgba(255,255,255,${k})`;
      g.lineWidth = this.killMarker > 0 ? 3 : 2;
      const r0 = Math.max(7, inner * 0.55), r1 = r0 + (this.killMarker > 0 ? 11 : 6);
      g.beginPath();
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        g.moveTo(x + dx * r0, y + dy * r0);
        g.lineTo(x + dx * r1, y + dy * r1);
      }
      g.stroke();
    }
  }

  private drawBracket(x: number, y: number, s: number, color: string, isTarget: boolean, friend: boolean, objective: boolean, heavy = false, width?: number): void {
    const g = this.g;
    g.strokeStyle = color;
    g.lineWidth = width ?? (isTarget ? 2.2 : 1.4);
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
      // Friendly: a cyan caret over the ship (no circle, so it never looks like the steering ring).
      const nearSight = Math.hypot(x - this.w / 2, y - this.h / 2) < 110;
      const a = g.globalAlpha;
      g.globalAlpha = a * (nearSight ? 0.5 : 0.9);
      const top = y - Math.min(s, 22) - 6;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x - 7, top - 7);
      g.lineTo(x, top);
      g.lineTo(x + 7, top - 7);
      g.stroke();
      g.globalAlpha = a;
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
    if (heavy) {
      // Bombers: a raised double bar over the bracket, so they read apart from fighters at a glance.
      const w = Math.max(7, s * 0.45);
      g.moveTo(x - w, y - s - 5);
      g.lineTo(x + w, y - s - 5);
      g.moveTo(x - w * 0.7, y - s - 9);
      g.lineTo(x + w * 0.7, y - s - 9);
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
    // At the true screen edge (34 px in), then slid along the edge off any HUD panel.
    const m = 34;
    const hw = this.w / 2 - m, hh = this.h / 2 - m;
    const t = Math.min(hw / Math.max(1e-6, Math.abs(Math.cos(ang))), hh / Math.max(1e-6, Math.abs(Math.sin(ang))));
    const pt = this.dodgePanels(cx + Math.cos(ang) * t, cy + Math.sin(ang) * t, m);
    const x = pt.x, y = pt.y;
    if (!big && this.arrowSpots.some((a) => Math.hypot(a.x - x, a.y - y) < 30)) return;
    this.arrowSpots.push({ x, y });
    const s = big ? 20 : 14;
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
      this.labelText(label, x - Math.cos(ang) * 32, y - Math.sin(ang) * 32 + 4, color, 'center', 1);
      g.font = '600 11px "Chakra Petch", system-ui, sans-serif';
    }
  }

  /** Read the HUD panels' screen rects (plus the radar) for arrow placement. */
  private refreshPanelRects(): void {
    this.panelRectsAge = 0;
    const base = this.root.getBoundingClientRect();
    const rects: Rect[] = [];
    const visible = (el: HTMLElement) => {
      if (el.classList.contains('hidden')) return null;
      const r = el.getBoundingClientRect();
      return r.width < 2 || r.height < 2 ? null : r;
    };
    for (const el of this.root.querySelectorAll<HTMLElement>('.hud-objective, .hud-comms, .hud-status, .hud-weapons')) {
      const r = visible(el);
      if (r) rects.push({ x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height });
    }
    // The target card and the view below it count as one block: no arrow squeezes between them,
    // and no two rects overlap (the marker clip uses the even-odd rule).
    const tp = visible(this.targetPanel), tv = visible(this.targetView);
    const block = [tp, tv].filter((r): r is DOMRect => !!r);
    if (block.length) {
      const x0 = Math.min(...block.map((r) => r.left)) - base.left, y0 = Math.min(...block.map((r) => r.top)) - base.top;
      const x1 = Math.max(...block.map((r) => r.right)) - base.left, y1 = Math.max(...block.map((r) => r.bottom)) - base.top;
      rects.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
    this.commsRect = null;
    const cr = this.comms.children.length ? visible(this.comms) : null;
    if (cr) this.commsRect = { x: cr.left - base.left, y: cr.top - base.top, w: cr.width, h: cr.height };
    const rad = this.radarGeom();
    rects.push({ x: rad.cx - rad.R, y: rad.cy - rad.R, w: rad.R * 2, h: rad.R * 2 });
    this.panelRects = rects;
  }

  /** Slide an edge point along its edge until it clears every HUD panel. */
  private dodgePanels(x: number, y: number, m: number): { x: number; y: number } {
    const pad = 24;
    const sideEdge = x <= m + 1 || x >= this.w - m - 1;
    const blocked = (px: number, py: number) => this.panelRects.some((r) => px > r.x - pad && px < r.x + r.w + pad && py > r.y - pad && py < r.y + r.h + pad);
    if (!blocked(x, y)) return { x, y };
    // Walk outward along the edge in both directions and take the nearest clear spot.
    for (let d = 8; d < Math.max(this.w, this.h); d += 8) {
      for (const s of [-1, 1]) {
        const px = sideEdge ? x : x + s * d, py = sideEdge ? y + s * d : y;
        if (px < m || px > this.w - m || py < m || py > this.h - m) continue;
        if (!blocked(px, py)) return { x: px, y: py };
      }
    }
    return { x: clamp(x, m, this.w - m), y: clamp(y, m, this.h - m) };
  }

  /** Bottom right, above the weapons panel, so it never sits on the ship. */
  private radarGeom(): { cx: number; cy: number; R: number } {
    const R = Math.min(78, this.h * 0.1);
    return { cx: this.w - R - 30, cy: this.h - R - 150, R };
  }

  private drawRadar(ctx: HudContext): void {
    const g = this.g;
    const { player, world } = ctx;
    const { cx, cy, R } = this.radarGeom();
    g.fillStyle = 'rgba(6,12,22,0.84)';
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
