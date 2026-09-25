import { DIFFICULTY, type Difficulty } from '../game/config';
import type { GraphicsSetting } from '../render/Quality';
import type { UserSettings } from './SettingsStore';

export type ScreenName = 'loading' | 'title' | 'howto' | 'settings' | 'pause' | 'gameover' | 'victory' | 'none';

export interface EndStats {
  time: string;
  seconds: number;
  kills: number;
  score: number;
  accuracy: number;
  generators: number;
  asteroids: number;
  deaths: number;
  wave: number;
  difficulty: Difficulty;
  /** What killed the player (failure screen only). */
  cause?: string;
}

const CONTROLS: [string, string][] = [
  ['Mouse', 'Aim: the ship turns toward the white ring'],
  ['White cross', 'Where your guns point'],
  ['Yellow dot', 'Aim here to hit a moving enemy'],
  ['Left mouse', 'Lasers (hold)'],
  ['Right mouse / F', 'Missile, once the brackets say LOCK'],
  ['W / S', 'Throttle up / down'],
  ['A / D', 'Roll'],
  ['Shift / Space', 'Boost'],
  ['Tab', 'Next target'],
  ['Esc / P', 'Pause'],
];

function controlsTable(): string {
  return `<div class="controls">${CONTROLS.map(([k, v]) => `<div class="ctl"><span class="key">${k}</span><span class="ctl-desc">${v}</span></div>`).join('')}</div>`;
}

/** S to C from accuracy, retries and time. */
function rankFor(s: EndStats): { rank: string; title: string } {
  let pts = 0;
  pts += s.accuracy >= 0.4 ? 3 : s.accuracy >= 0.28 ? 2 : s.accuracy >= 0.18 ? 1 : 0;
  pts += s.deaths === 0 ? 3 : s.deaths === 1 ? 2 : s.deaths === 2 ? 1 : 0;
  pts += s.seconds < 300 ? 2 : s.seconds < 480 ? 1 : 0;
  if (s.difficulty === 'hard') pts += 1;
  if (pts >= 7) return { rank: 'S', title: 'Ace of the Belt' };
  if (pts >= 5) return { rank: 'A', title: 'Squadron Leader' };
  if (pts >= 3) return { rank: 'B', title: 'Steady Wingman' };
  return { rank: 'C', title: 'Survivor' };
}

/** Full-screen overlays: loading, title, how to fly, settings, pause, game over, victory. */
export class Screens {
  readonly root: HTMLDivElement;
  private readonly screens = new Map<ScreenName, HTMLDivElement>();
  current: ScreenName = 'loading';
  /** Where "Back" goes from the settings and how-to screens. */
  private returnTo: ScreenName = 'title';
  private settings: UserSettings | null = null;
  onAction: (action: string) => void = () => undefined;
  onHover: () => void = () => undefined;
  onSettings: (s: UserSettings) => void = () => undefined;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'screens';
    parent.appendChild(this.root);

    this.add(
      'loading',
      `<div class="loading-card"><div class="logo small">VOID<span>WING</span></div>
       <div class="loadbar"><div class="loadfill"></div></div><div class="loadtext">Loading flight systems</div></div>`,
    );
    this.add(
      'title',
      `<div class="title-layout">
         <div class="title-col">
           <div class="kicker">Tarsus Belt &middot; Hegemony War</div>
           <h1 class="logo">VOID<span>WING</span></h1>
           <p class="tagline">Lead Void Wing through three waves of Hegemony fighters, then break the carrier Leviathan.</p>
           <nav class="menu">
             <button class="btn primary" data-action="launch">Launch mission<kbd>Enter</kbd></button>
             <button class="btn" data-action="howto">How to fly</button>
             <button class="btn" data-action="settings">Settings</button>
           </nav>
           <div class="title-diff"><span>Difficulty</span><div class="seg" data-seg="difficulty">
             <button data-value="easy">${DIFFICULTY.easy.label}</button><button data-value="normal">${DIFFICULTY.normal.label}</button><button data-value="hard">${DIFFICULTY.hard.label}</button></div></div>
           <p class="hint">Launching captures the mouse. Press Esc to pause and release it.</p>
         </div>
         <aside class="card briefing">
           <div class="card-title">Briefing</div>
           <ol class="steps">
             <li><b>Waves 1 to 3</b><span>Razor dogfighters, then Maul bombers on strafing runs</span></li>
             <li><b>The Leviathan</b><span>Its shield bubble stops your shots. Hit its 4 generator pylons from outside the bubble</span></li>
             <li><b>Get clear</b><span>Its reactor takes the carrier with it</span></li>
           </ol>
           <div class="card-title">Controls</div>
           ${controlsTable()}
         </aside>
       </div>`,
    );
    this.add(
      'howto',
      `<div class="panel wide">
         <div class="panel-kicker">Flight school</div>
         <h2>How to fly</h2>
         <div class="howto-grid">
           <div class="howto"><div class="glyph glyph-dot"></div><div><b>Point where you want to go.</b> Move the mouse: your ship turns toward the white ring and the camera follows. Cyan marks are your wingmen.</div></div>
           <div class="howto"><div class="glyph glyph-cross"></div><div><b>The white cross is your guns.</b> Hold left mouse to fire lasers along it.</div></div>
           <div class="howto"><div class="glyph glyph-leaddot"></div><div><b>Shoot at the yellow dot.</b> It marks where your lasers meet a moving enemy: ahead of a crossing fighter, on top of one flying straight at you.</div></div>
           <div class="howto"><div class="glyph glyph-lock"></div><div><b>Missiles lock on.</b> Keep the target near the cross until its red brackets say LOCK, then press right mouse or F.</div></div>
           <div class="howto"><div class="glyph glyph-arrow"></div><div><b>Arrows at the screen edge</b> point to enemies you cannot see. Tab switches target.</div></div>
           <div class="howto"><div class="glyph glyph-shield"></div><div><b>Shields recharge, hull does not.</b> Boost (Shift) out of trouble; wave breaks rearm and patch you up.</div></div>
           <div class="howto"><div class="glyph glyph-hit"></div><div><b>Orange chevrons</b> around your ship point at whatever is hitting you from off screen. <b>MISSILE</b> arrows mean break hard and boost.</div></div>
           <div class="howto"><div class="glyph glyph-gen"></div><div><b>The carrier's shield</b> blocks your shots. If a generator tag says SHIELD IN THE WAY, swing out until it clears.</div></div>
         </div>
         <div class="howto-controls">${controlsTable()}</div>
         <div class="row-buttons"><button class="btn primary" data-action="back">Back</button></div>
       </div>`,
    );
    this.add(
      'settings',
      `<div class="panel settings-panel">
         <div class="panel-kicker">Options</div>
         <h2>Settings</h2>
         <div class="settings-group">
           <div class="group-title">Flight</div>
           <label class="setting"><span>Mouse sensitivity</span><input type="range" min="0.4" max="2" step="0.05" data-setting="sensitivity"><output data-out="sensitivity"></output></label>
           <div class="setting split"><span>Invert mouse Y</span><button class="toggle" data-toggle="invertY" aria-pressed="false"><i></i></button></div>
           <div class="setting split"><span>Auto-level (rolls you back upright)</span><button class="toggle" data-toggle="autoLevel" aria-pressed="false"><i></i></button></div>
           <div class="setting split"><span>Difficulty</span><div class="seg" data-seg="difficulty">
             <button data-value="easy">${DIFFICULTY.easy.label}</button><button data-value="normal">${DIFFICULTY.normal.label}</button><button data-value="hard">${DIFFICULTY.hard.label}</button></div></div>
         </div>
         <div class="settings-group">
           <div class="group-title">Display</div>
           <div class="setting split"><span>Graphics</span><div class="seg" data-seg="graphics">
             <button data-value="auto">Auto</button><button data-value="high">High</button><button data-value="medium">Medium</button><button data-value="low">Low</button></div></div>
           <div class="setting-note" data-note="graphics"></div>
         </div>
         <div class="settings-group">
           <div class="group-title">Sound</div>
           <label class="setting"><span>Master volume</span><input type="range" min="0" max="1" step="0.05" data-setting="master"><output data-out="master"></output></label>
           <label class="setting"><span>Music</span><input type="range" min="0" max="1" step="0.05" data-setting="music"><output data-out="music"></output></label>
           <label class="setting"><span>Effects</span><input type="range" min="0" max="1" step="0.05" data-setting="sfx"><output data-out="sfx"></output></label>
         </div>
         <div class="row-buttons"><button class="btn primary" data-action="back">Done</button></div>
       </div>`,
    );
    this.add(
      'pause',
      `<div class="panel pause-panel">
         <div class="panel-kicker">Void One, holding</div>
         <h2>Paused</h2>
         <div class="menu">
           <button class="btn primary" data-action="resume">Resume</button>
           <button class="btn" data-action="settings">Settings</button>
           <button class="btn" data-action="howto">How to fly</button>
           <button class="btn" data-action="retry">Restart wave</button>
           <button class="btn subtle" data-action="title">Quit to title</button>
         </div>
       </div>`,
    );
    this.add(
      'gameover',
      `<div class="panel end-panel bad">
         <div class="panel-kicker">Void One is down</div>
         <h2>Mission failed</h2>
         <div class="cause"></div>
         <div class="stats"></div>
         <div class="menu row">
           <button class="btn primary" data-action="retry">Retry from checkpoint</button>
           <button class="btn" data-action="restart">Restart mission</button>
           <button class="btn subtle" data-action="title">Quit to title</button>
         </div>
       </div>`,
    );
    this.add(
      'victory',
      `<div class="panel end-panel good">
         <div class="panel-kicker">Leviathan destroyed</div>
         <h2>Mission complete</h2>
         <div class="rank"><div class="rank-letter"></div><div class="rank-title"></div></div>
         <div class="stats"></div>
         <div class="menu row">
           <button class="btn primary" data-action="restart">Fly again</button>
           <button class="btn subtle" data-action="title">Title screen</button>
         </div>
       </div>`,
    );

    this.root.addEventListener('mouseover', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (btn && !btn.contains(e.relatedTarget as Node)) this.onHover();
    });
    this.root.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const btn = el.closest('[data-action]') as HTMLElement | null;
      if (btn) {
        e.stopPropagation();
        const a = btn.dataset.action ?? '';
        if (a === 'back') this.show(this.returnTo);
        else if (a === 'settings' || a === 'howto') {
          this.returnTo = this.current === 'pause' ? 'pause' : 'title';
          this.show(a);
        }
        this.onAction(a);
        return;
      }
      const toggle = el.closest('[data-toggle]') as HTMLElement | null;
      if (toggle && this.settings) {
        const key = toggle.dataset.toggle as 'invertY' | 'autoLevel';
        this.settings[key] = !this.settings[key];
        this.syncSettings();
        this.onSettings(this.settings);
        this.onAction('toggle');
        return;
      }
      const seg = el.closest('.seg button') as HTMLElement | null;
      if (seg && this.settings) {
        const key = (seg.closest('.seg') as HTMLElement).dataset.seg;
        if (key === 'graphics') this.settings.graphics = seg.dataset.value as GraphicsSetting;
        else this.settings.difficulty = seg.dataset.value as Difficulty;
        this.syncSettings();
        this.onSettings(this.settings);
        this.onAction('toggle');
      }
    });
    this.root.addEventListener('input', (e) => {
      const input = e.target as HTMLInputElement;
      const key = input.dataset.setting as 'sensitivity' | 'master' | 'music' | 'sfx' | undefined;
      if (!key || !this.settings) return;
      this.settings[key] = Number(input.value);
      this.syncSettings();
      this.onSettings(this.settings);
    });
  }

  private add(name: ScreenName, html: string): void {
    const div = document.createElement('div');
    div.className = `screen screen-${name}`;
    div.innerHTML = html;
    this.root.appendChild(div);
    this.screens.set(name, div);
  }

  /** Give the settings screen the live settings object (it edits it in place). */
  bindSettings(s: UserSettings): void {
    this.settings = s;
    this.syncSettings();
  }

  private syncSettings(): void {
    const s = this.settings;
    const div = this.screens.get('settings');
    if (!s || !div) return;
    div.querySelectorAll<HTMLInputElement>('input[data-setting]').forEach((input) => {
      const key = input.dataset.setting as 'sensitivity' | 'master' | 'music' | 'sfx';
      input.value = String(s[key]);
      const out = div.querySelector(`[data-out="${key}"]`);
      if (out) out.textContent = key === 'sensitivity' ? `${s[key].toFixed(2)}x` : `${Math.round(s[key] * 100)}%`;
    });
    div.querySelectorAll<HTMLElement>('[data-toggle]').forEach((t) => {
      const on = s[t.dataset.toggle as 'invertY' | 'autoLevel'];
      t.setAttribute('aria-pressed', String(on));
      t.classList.toggle('on', on);
    });
    this.root.querySelectorAll<HTMLElement>('.seg').forEach((seg) => {
      const value = seg.dataset.seg === 'graphics' ? s.graphics : s.difficulty;
      seg.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.value === value));
    });
  }

  /** The line under the Graphics setting (what Auto is rendering at). */
  setGraphicsNote(text: string): void {
    const note = this.root.querySelector('[data-note="graphics"]');
    if (note) note.textContent = text;
  }

  show(name: ScreenName, stats?: EndStats): void {
    this.current = name;
    for (const [n, div] of this.screens) div.classList.toggle('show', n === name);
    this.root.classList.toggle('active', name !== 'none');
    this.root.classList.toggle('over-title', name === 'title' || ((name === 'settings' || name === 'howto') && this.returnTo === 'title'));
    if (stats) this.fillStats(name, stats);
  }

  private fillStats(name: ScreenName, stats: EndStats): void {
    const div = this.screens.get(name);
    if (!div) return;
    const cause = div.querySelector('.cause');
    if (cause) cause.textContent = stats.cause ?? '';
    const grid = div.querySelector('.stats');
    if (grid) {
      grid.innerHTML = [
        ['Time', stats.time],
        ['Your kills', String(stats.kills)],
        ['Accuracy', `${Math.round(stats.accuracy * 100)}%`],
        ['Generators', `${stats.generators}/4`],
        ['Score', String(stats.score)],
      ]
        .map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`)
        .join('');
    }
    if (name === 'victory') {
      const r = rankFor(stats);
      const letter = div.querySelector('.rank-letter');
      const title = div.querySelector('.rank-title');
      if (letter) letter.textContent = r.rank;
      if (title) title.textContent = `${r.title} · ${DIFFICULTY[stats.difficulty].label}`;
    }
  }

  setLoading(fraction: number): void {
    const fill = this.screens.get('loading')?.querySelector('.loadfill') as HTMLElement | null;
    if (fill) fill.style.width = `${Math.round(fraction * 100)}%`;
  }
}
