export type ScreenName = 'loading' | 'title' | 'pause' | 'gameover' | 'victory' | 'none';

export interface EndStats {
  time: string;
  kills: number;
  score: number;
  accuracy: number;
  generators: number;
  asteroids: number;
  deaths: number;
  wave: number;
  /** What killed the player (failure screen only). */
  cause?: string;
}

const CONTROLS: [string, string][] = [
  ['Mouse', 'Aim - the ship turns toward the cyan dot'],
  ['Left mouse', 'Lasers'],
  ['Right mouse / F', 'Missile (when locked)'],
  ['W / S', 'Throttle up / down'],
  ['A / D', 'Roll'],
  ['Shift / Space', 'Boost'],
  ['Tab', 'Cycle target'],
  ['Esc / P', 'Pause'],
];

function controlsTable(): string {
  return `<div class="controls">${CONTROLS.map(([k, v]) => `<div class="ctl"><span class="key">${k}</span><span>${v}</span></div>`).join('')}</div>`;
}

/** Full-screen overlays: loading, title, pause, game over, victory. */
export class Screens {
  readonly root: HTMLDivElement;
  private readonly screens = new Map<ScreenName, HTMLDivElement>();
  current: ScreenName = 'loading';
  onAction: (action: string) => void = () => undefined;
  onHover: () => void = () => undefined;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'screens';
    parent.appendChild(this.root);
    this.add('loading', `<div class="panel center"><h1 class="logo">VOID WING</h1><div class="loadbar"><div class="loadfill"></div></div><p class="muted">Loading</p></div>`);
    this.add(
      'title',
      `<div class="panel center"><h1 class="logo">VOID WING</h1><p class="tagline">Clear three waves. Break the carrier's shield. Bring them home.</p>
       <button class="btn primary" data-action="launch">Launch</button>${controlsTable()}</div>`,
    );
    this.add(
      'pause',
      `<div class="panel center"><h2>Paused</h2><button class="btn primary" data-action="resume">Resume</button>
       <button class="btn" data-action="retry">Restart wave</button><button class="btn" data-action="title">Quit to title</button>${controlsTable()}</div>`,
    );
    this.add(
      'gameover',
      `<div class="panel center"><h2 class="bad">Mission failed</h2><div class="cause"></div><div class="stats"></div>
       <button class="btn primary" data-action="retry">Retry from checkpoint</button><button class="btn" data-action="restart">Restart mission</button><button class="btn" data-action="title">Quit to title</button></div>`,
    );
    this.add(
      'victory',
      `<div class="panel center"><h2 class="good">Mission complete</h2><div class="stats"></div>
       <button class="btn primary" data-action="restart">Fly again</button><button class="btn" data-action="title">Title screen</button></div>`,
    );
    this.root.addEventListener('mouseover', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-action]');
      if (btn && !btn.contains(e.relatedTarget as Node)) this.onHover();
    });
    this.root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (btn) {
        e.stopPropagation();
        this.onAction(btn.dataset.action ?? '');
      }
    });
  }

  private add(name: ScreenName, html: string): void {
    const div = document.createElement('div');
    div.className = `screen screen-${name}`;
    div.innerHTML = html;
    this.root.appendChild(div);
    this.screens.set(name, div);
  }

  show(name: ScreenName, stats?: EndStats): void {
    this.current = name;
    for (const [n, div] of this.screens) div.classList.toggle('show', n === name);
    this.root.classList.toggle('active', name !== 'none');
    if (stats) {
      const cause = this.screens.get(name)?.querySelector('.cause');
      if (cause) cause.textContent = stats.cause ?? '';
      const div = this.screens.get(name)?.querySelector('.stats');
      if (div) {
        div.innerHTML = [
          ['Time', stats.time],
          ['Your kills', String(stats.kills)],
          ['Accuracy', `${Math.round(stats.accuracy * 100)}%`],
          ['Generators', `${stats.generators}/4`],
          ['Score', String(stats.score)],
        ]
          .map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`)
          .join('');
      }
    }
  }

  setLoading(fraction: number): void {
    const fill = this.screens.get('loading')?.querySelector('.loadfill') as HTMLElement | null;
    if (fill) fill.style.width = `${Math.round(fraction * 100)}%`;
  }
}
