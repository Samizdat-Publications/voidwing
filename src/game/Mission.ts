import { Vector3 } from 'three';
import { ARENA, WAVES, type WaveGroup } from './config';
import type { Entity } from './Entity';
import type { Ship } from './Ship';
import type { World } from './World';

export type PhaseKind = 'intro' | 'wave' | 'break' | 'capital' | 'finale' | 'complete';

export interface Phase {
  kind: PhaseKind;
  wave?: number;
  duration?: number;
}

export const PHASES: Phase[] = [
  { kind: 'intro', duration: 6 },
  { kind: 'wave', wave: 0 },
  { kind: 'break', duration: 8 },
  { kind: 'wave', wave: 1 },
  { kind: 'break', duration: 8 },
  { kind: 'wave', wave: 2 },
  { kind: 'break', duration: 9 },
  { kind: 'capital' },
  { kind: 'finale', duration: 10 },
  { kind: 'complete' },
];

export interface RadioMessage {
  from: string;
  text: string;
  time: number;
  duration: number;
  team: 'friend' | 'enemy' | 'command';
}

export interface Banner {
  title: string;
  sub: string;
  time: number;
  duration: number;
  tone: 'info' | 'warn' | 'good';
}

export interface MissionStats {
  kills: number;
  score: number;
  startTime: number;
  endTime: number;
  deaths: number;
  generators: number;
  asteroids: number;
}

// Slightly ahead of the player so the wingmen stay in view of the chase camera.
const WING_SLOTS = [new Vector3(-46, 14, -60), new Vector3(48, 10, -72)];
const WING_NAMES = ['Void Two', 'Void Three'];

export class Mission {
  phaseIndex = 0;
  phaseTime = 0;
  private pending: { group: WaveGroup; at: number }[] = [];
  private waveShips: Ship[] = [];
  waveTotal = 0;
  waveHasBombers = false;
  waveKills = 0;
  objective = '';
  objectiveDetail = '';
  readonly messages: RadioMessage[] = [];
  banner: Banner | null = null;
  readonly stats: MissionStats = { kills: 0, score: 0, startTime: 0, endTime: 0, deaths: 0, generators: 0, asteroids: 0 };
  checkpoint = 1;
  onVictory: (() => void) | null = null;
  onFinaleStart: (() => void) | null = null;
  private wingmen: (Ship | null)[] = [null, null];
  private readonly unsubs: Array<() => void> = [];
  private hintedShield = false;
  private missileTimer = 0;

  constructor(private readonly world: World) {
    const ev = world.events;
    this.unsubs.push(
      ev.on('destroyed', ({ entity, source }) => this.onDestroyed(entity, source)),
      ev.on('asteroidDestroyed', () => this.stats.asteroids++),
      ev.on('shieldBlocked', () => {
        if (!this.hintedShield) {
          this.hintedShield = true;
          this.say('Void Two', 'Their shield is soaking our shots. Swing wide and hit the pylon from outside!', 'friend');
        }
      }),
      ev.on('generatorDestroyed', ({ remaining }) => {
        this.stats.generators++;
        if (remaining > 0) {
          this.say('Void Two', remaining === 1 ? 'One generator left! Finish it!' : `Generator down! ${remaining} to go.`, 'friend');
          this.showBanner('GENERATOR DESTROYED', `${remaining} remaining`, 'good', 2);
        }
      }),
      ev.on('escortLaunched', () => {
        if (this.world.rng.chance(0.5)) this.say('Void Three', 'More fighters launching from the carrier!', 'friend');
      }),
    );
  }

  get phase(): Phase {
    return PHASES[this.phaseIndex];
  }

  get waveNumber(): number {
    const p = this.phase;
    if (p.kind === 'wave') return (p.wave ?? 0) + 1;
    for (let i = this.phaseIndex; i >= 0; i--) if (PHASES[i].kind === 'wave') return (PHASES[i].wave ?? 0) + 1;
    return 0;
  }

  say(from: string, text: string, team: RadioMessage['team'] = 'friend', duration = 5): void {
    this.messages.push({ from, text, time: this.world.time, duration, team });
    if (this.messages.length > 6) this.messages.shift();
    this.world.events.emit('radio', { from, text });
  }

  showBanner(title: string, sub: string, tone: Banner['tone'] = 'info', duration = 3): void {
    this.banner = { title, sub, time: this.world.time, duration, tone };
  }

  start(): void {
    this.stats.kills = this.stats.score = this.stats.deaths = this.stats.generators = this.stats.asteroids = 0;
    this.stats.startTime = this.world.time;
    this.stats.endTime = 0;
    this.messages.length = 0;
    this.hintedShield = false;
    this.checkpoint = 1;
    this.spawnWingmen(true);
    this.enter(0);
  }

  /** Restart from the last checkpoint (start of the current wave or the carrier fight). */
  retry(): void {
    this.stats.deaths++;
    this.world.clearCombat();
    this.wingmen = [null, null];
    const cpPhase = PHASES[this.checkpoint];
    if (cpPhase.kind === 'capital') this.world.capital.reset(this.world);
    this.spawnWingmen(true);
    this.enter(this.checkpoint);
  }

  /** Debug / test: skip straight to a phase. */
  jumpTo(index: number): void {
    this.world.clearCombat();
    this.wingmen = [null, null];
    if (index <= PHASES.findIndex((p) => p.kind === 'capital')) this.world.capital.reset(this.world);
    this.spawnWingmen(true);
    this.enter(index);
  }

  private spawnWingmen(force: boolean): void {
    const p = this.world.player;
    if (!p) return;
    for (let i = 0; i < 2; i++) {
      const w = this.wingmen[i];
      if (w && w.alive && !force) continue;
      if (w && w.alive) continue;
      const pos = WING_SLOTS[i].clone().applyQuaternion(p.quaternion).add(p.position);
      const dir = p.forward(new Vector3());
      this.wingmen[i] = this.world.spawnWingman(WING_NAMES[i], pos, dir, WING_SLOTS[i]);
    }
  }

  private enter(index: number): void {
    this.phaseIndex = index;
    this.phaseTime = 0;
    const p = this.phase;
    const w = this.world;
    switch (p.kind) {
      case 'intro':
        this.objective = 'Stand by';
        this.objectiveDetail = 'Hegemony fighters inbound';
        this.showBanner('VOID WING', 'Tarsus Belt', 'info', 4.5);
        this.say('Halcyon', 'Void Wing, Hegemony fighters are jumping in. Weapons free.', 'command', 6);
        break;
      case 'wave': {
        const def = WAVES[p.wave ?? 0];
        this.checkpoint = index;
        this.pending = def.groups.map((g) => ({ group: g, at: g.delay }));
        this.waveShips = [];
        this.waveTotal = def.groups.reduce((n, g) => n + g.count, 0);
        this.waveHasBombers = def.groups.some((g) => g.kind === 'maul');
        this.waveKills = 0;
        this.objective = `Wave ${(p.wave ?? 0) + 1} of ${WAVES.length}`;
        this.showBanner(`WAVE ${(p.wave ?? 0) + 1}`, def.name, 'warn', 2.4);
        if (p.wave === 1) this.say('Halcyon', 'Bombers in this wave. They make long strafing runs, so break off their line.', 'command', 6);
        if (p.wave === 2) this.say('Void Two', 'Here they come. Stay close, Void One.', 'friend');
        break;
      }
      case 'break': {
        const next = PHASES[index + 1];
        const player = w.player;
        if (player && player.alive) {
          player.missiles = player.spec.missiles;
          player.hull = Math.min(player.maxHull, player.hull + 30);
          player.shield = player.maxShield;
        }
        this.spawnWingmen(false);
        if (next.kind === 'capital') {
          this.objective = 'Stand by';
          this.objectiveDetail = 'Hold position, rearming';
          this.showBanner('WARNING', 'Massive jump signature', 'warn', 4);
          this.say('Halcyon', 'Something big is jumping in. Hegemony carrier signature!', 'command', 6);
        } else {
          this.objective = 'Regroup';
          this.objectiveDetail = 'Rearmed. Next wave soon';
          this.showBanner('WAVE CLEARED', 'Missiles rearmed', 'good', 3);
          this.say('Void Three', 'Scope is clear. Nice shooting, lead.', 'friend');
        }
        break;
      }
      case 'capital':
        this.checkpoint = index;
        w.capital.warpIn(w);
        this.objective = 'Destroy the Leviathan';
        this.showBanner('LEVIATHAN', 'Hegemony carrier', 'warn', 4);
        this.say('Halcyon', 'Its shield bubble stops our guns. Hit the four generator pylons from outside it!', 'command', 8);
        break;
      case 'finale':
        this.objective = 'Get clear';
        this.objectiveDetail = 'The Leviathan is breaking up';
        this.showBanner('SHIELDS DOWN', 'Reactor chain reaction', 'good', 3);
        this.say('Void Two', "The carrier's reactor is going! Get clear!", 'friend', 6);
        this.onFinaleStart?.();
        // Every remaining enemy fighter is caught in the blast.
        break;
      case 'complete':
        this.stats.endTime = w.time;
        this.objective = 'Mission complete';
        this.objectiveDetail = '';
        this.onVictory?.();
        break;
    }
  }

  update(dt: number): void {
    this.phaseTime += dt;
    const p = this.phase;
    const w = this.world;
    if (this.banner && w.time - this.banner.time > this.banner.duration) this.banner = null;

    switch (p.kind) {
      case 'intro':
      case 'break': {
        const left = (p.duration ?? 5) - this.phaseTime;
        if (p.kind === 'break' && PHASES[this.phaseIndex + 1]?.kind === 'wave') {
          this.objectiveDetail = `Rearmed. Next wave in ${Math.max(1, Math.ceil(left))} s`;
        }
        if (left <= 0) this.enter(this.phaseIndex + 1);
        break;
      }
      case 'wave': {
        for (let i = this.pending.length - 1; i >= 0; i--) {
          if (this.phaseTime >= this.pending[i].at) {
            this.spawnGroup(this.pending[i].group);
            this.pending.splice(i, 1);
          }
        }
        const alive = this.waveShips.filter((s) => s.alive).length;
        this.objectiveDetail = `Destroy ${this.waveHasBombers ? 'fighters and bombers' : 'enemy fighters'}  ${this.waveKills}/${this.waveTotal}`;
        if (this.pending.length === 0 && alive === 0 && this.phaseTime > 1) this.enter(this.phaseIndex + 1);
        break;
      }
      case 'capital': {
        const left = w.capital.generatorsAlive;
        const total = w.capital.generators.length;
        this.objectiveDetail = `Shield generators destroyed  ${total - left}/${total}`;
        if (w.capital.state === 'dying') this.enter(this.phaseIndex + 1);
        break;
      }
      case 'finale':
        if (w.capital.state === 'dead' || this.phaseTime > (p.duration ?? 10)) this.enter(this.phaseIndex + 1);
        break;
      case 'complete':
        break;
    }
    // Keep wingmen alive between waves.
    if (p.kind === 'break' && this.phaseTime < dt * 1.5) this.spawnWingmen(false);
    // The carrier Halcyon trickles missiles to the player during a fight.
    if (p.kind === 'wave' || p.kind === 'capital') {
      this.missileTimer += dt;
      const player = w.player;
      if (this.missileTimer >= 20 && player && player.alive) {
        this.missileTimer = 0;
        if (player.missiles < player.spec.missiles) player.missiles++;
      }
    }
  }

  private spawnGroup(g: WaveGroup): void {
    const w = this.world;
    const player = w.player;
    const center = player ? player.position : ARENA.playerStart;
    const bias = player ? player.forward(new Vector3()) : new Vector3(0, 0, -1);
    // Pull fights back toward the middle of the belt when the player has drifted out.
    const out = center.length();
    if (out > 1500) bias.addScaledVector(center, (-1 / out) * Math.min(1.5, (out - 1500) / 800)).normalize();
    const base = w.findSpawnPoint(center, g.kind === 'maul' ? 1500 : 1250, bias, new Vector3());
    const toPlayer = center.clone().sub(base).normalize();
    const side = new Vector3().crossVectors(toPlayer, new Vector3(0, 1, 0)).normalize();
    for (let i = 0; i < g.count; i++) {
      const offset = side.clone().multiplyScalar((i - (g.count - 1) / 2) * 40).addScaledVector(toPlayer, -Math.abs(i - (g.count - 1) / 2) * 25);
      const pos = base.clone().add(offset);
      const ship = w.spawnEnemy(g.kind, pos, toPlayer);
      this.waveShips.push(ship);
    }
    if (g.kind === 'maul') this.say('Void Three', 'Bombers! Watch for their plasma runs.', 'friend');
  }

  private onDestroyed(e: Entity, source: Entity | null): void {
    const w = this.world;
    if (e.team === 'enemy' && (e.kind === 'razor' || e.kind === 'maul')) {
      if (this.waveShips.includes(e as Ship)) this.waveKills++;
      if (source && source.kind === 'player') {
        this.stats.kills++;
        this.stats.score += (e as Ship).spec.score;
        const player = w.player;
        if (player) player.kills++;
      }
    }
    if (e.kind === 'generator' && source && source.kind === 'player') this.stats.score += 1000;
    if (e.kind === 'wingman') {
      this.say(e.name, 'I am hit! Ejecting!', 'friend', 4);
    }
  }

  dispose(): void {
    for (const u of this.unsubs) u();
  }
}
