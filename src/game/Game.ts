import { DirectionalLight, HemisphereLight, Vector3 } from 'three';
import { Engine } from '../core/Engine';
import { Input } from '../core/Input';
import { Rng, formatTime } from '../core/math';
import { installTestHooks } from '../debug/TestHooks';
import { Assets } from '../render/Assets';
import { CameraRig } from '../render/CameraRig';
import { Effects } from '../render/Effects';
import { setRimBoost } from '../render/materials';
import { Sky } from '../render/Sky';
import { Hud } from '../ui/Hud';
import { Screens, type EndStats } from '../ui/Screens';
import { ARENA, type Difficulty } from './config';
import { Mission, PHASES } from './Mission';
import { PlayerController, type PlayerSettings } from './PlayerController';
import type { Ship } from './Ship';
import { World } from './World';

export type GameState = 'loading' | 'title' | 'playing' | 'paused' | 'dying' | 'finale' | 'gameover' | 'victory';

export interface Settings extends PlayerSettings {
  difficulty: Difficulty;
}

const _v = new Vector3();

export class Game {
  readonly engine: Engine;
  readonly input: Input;
  readonly assets = new Assets();
  readonly rig: CameraRig;
  readonly hud: Hud;
  readonly screens: Screens;
  effects!: Effects;
  world!: World;
  mission!: Mission;
  controller!: PlayerController;
  sky!: Sky;
  state: GameState = 'loading';
  stateTime = 0;
  readonly settings: Settings = { sensitivity: 1, invertY: false, autoLevel: true, difficulty: 'normal' };
  timeScale = 1;
  fps = 60;
  frameMs = 16.7;
  private last = 0;
  private readonly params = new URLSearchParams(location.search);
  private readonly seed: number;
  private godMode = false;
  private missionStarted = false;
  private highlighted: Ship | null = null;

  constructor(container: HTMLElement) {
    this.engine = new Engine(container);
    this.input = new Input(this.engine.renderer.domElement);
    this.rig = new CameraRig(this.engine.camera);
    this.hud = new Hud(container);
    this.screens = new Screens(container);
    this.seed = Number(this.params.get('seed') ?? 1337) | 0;
    this.godMode = this.params.has('god');
    const diff = this.params.get('diff');
    if (diff === 'easy' || diff === 'normal' || diff === 'hard') this.settings.difficulty = diff;
    this.engine.onResize((w, h) => this.hud.resize(w, h));
    this.hud.resize(this.engine.width, this.engine.height);
    this.screens.onAction = (a) => this.onAction(a);
    this.input.onPointerLockLost = () => {
      if (this.state === 'playing') this.pause();
    };
    this.engine.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.pointerLocked) this.input.requestLock();
    });
    if (this.params.has('test')) installTestHooks(this);
  }

  async init(): Promise<void> {
    this.screens.show('loading');
    this.assets.maxAnisotropy = Math.min(8, this.engine.renderer.capabilities.getMaxAnisotropy());
    await this.assets.load((f) => this.screens.setLoading(f));
    if (this.assets.missing.length) console.info('VOID WING: greybox stand-ins for', this.assets.missing.join(', '));
    this.buildWorld();
    this.enterTitle();
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  private buildWorld(): void {
    const scene = this.engine.scene;
    const sun = new DirectionalLight(0xfff0dc, 3.0);
    sun.position.set(-0.55, 0.42, -0.72).multiplyScalar(1000);
    scene.add(sun);
    // Cool rim light from the opposite side so dark hulls never vanish against space.
    const rim = new DirectionalLight(0x6f9cff, 1.1);
    rim.position.set(0.6, -0.25, 0.75).multiplyScalar(1000);
    scene.add(rim);
    scene.add(new HemisphereLight(0x8aa2d0, 0x3a2640, 0.75));
    this.sky = new Sky();
    this.sky.bake(this.engine.renderer);
    scene.background = this.sky.background;
    // A backdrop, not the subject: keep the nebula well below the action and the HUD.
    scene.backgroundIntensity = 0.62;
    // The nebula doubles as image-based lighting, so hulls pick up its colours.
    scene.environment = this.sky.environment;
    scene.environmentIntensity = 1.15;
    scene.add(this.sky.group);
    this.effects = new Effects(scene);
    this.world = new World(scene, this.assets, this.effects, this.seed);
    this.world.difficulty = this.settings.difficulty;
    this.mission = new Mission(this.world);
    this.controller = new PlayerController(this.input, this.settings);
    this.mission.onVictory = () => this.onVictory();
    this.mission.onFinaleStart = () => this.onFinaleStart();
    this.world.capital.onFinalBlast = () => this.onFinalBlast();
    this.world.events.on('destroyed', ({ entity }) => {
      if (entity === this.world.player) this.onPlayerDeath();
    });
    this.world.events.on('playerHit', ({ killed }) => this.hud.onPlayerHit(killed));
    this.world.events.on('shieldBlocked', () => this.hud.onShieldBlocked());
    this.world.events.on('asteroidDestroyed', ({ position, radius }) => this.effects.dust(position, radius));
    this.world.events.on('hullHit', ({ entity, point }) => {
      if (entity === this.world.player) {
        this.hud.onPlayerDamaged(point);
        this.rig.addTrauma(0.25);
      }
    });
    this.world.events.on('shieldHit', ({ entity, point }) => {
      if (entity === this.world.player) {
        this.hud.onPlayerDamaged(point);
        this.rig.addTrauma(0.12);
      }
    });
    this.world.events.on('destroyed', ({ entity }) => {
      if (this.world.player && entity.position.distanceTo(this.world.player.position) < 400) this.rig.addTrauma(0.3);
    });
  }

  /** Park a display ship for the title screen. */
  private enterTitle(): void {
    this.resetWorld();
    const p = this.world.createPlayer(ARENA.playerStart, new Vector3(0, 0, -1));
    p.controller = null;
    p.resetMotion(0);
    p.control.throttle = 0;
    p.throttle = 0;
    p.invulnerable = true;
    this.rig.mode = 'orbit';
    this.rig.orbitCenter.copy(p.position);
    this.setState('title');
    this.hud.hide();
    this.screens.show('title');
    this.input.exitLock();
  }

  private resetWorld(): void {
    const w = this.world;
    w.clearCombat();
    if (w.player) {
      w.scene.remove(w.player.object);
      w.ships.length = 0;
      w.player = null;
    }
    w.projectiles.clear();
    w.asteroids.generate(new Rng(this.seed));
    w.capital.reset(w);
    this.effects.clear();
    this.timeScale = 1;
  }

  startMission(): void {
    this.resetWorld();
    this.world.difficulty = this.settings.difficulty;
    const p = this.world.createPlayer(ARENA.playerStart, new Vector3(0, 0, -1));
    this.attachPlayer(p);
    this.mission.start();
    this.missionStarted = true;
    const jump = Number(this.params.get('phase') ?? -1);
    if (jump > 0 && jump < PHASES.length) this.mission.jumpTo(jump);
    this.setState('playing');
    this.hud.show();
    this.screens.show('none');
    this.input.requestLock();
  }

  private attachPlayer(p: Ship): void {
    p.controller = this.controller;
    this.controller.enabled = true;
    this.controller.resetAim(p);
    p.invulnerable = this.godMode;
    p.control.throttle = 0.55;
    this.rig.mode = 'chase';
    this.rig.snapTo(p);
  }

  retry(): void {
    if (!this.missionStarted) return this.startMission();
    const w = this.world;
    const cp = PHASES[this.mission.checkpoint];
    // Respawn the player at a safe spot for the checkpoint.
    let p = w.player;
    if (!p || !p.alive) {
      if (p) w.scene.remove(p.object);
      w.ships.splice(0, w.ships.length, ...w.ships.filter((s) => s !== p));
      const spawn = cp.kind === 'capital'
        ? w.capital.position.clone().add(_v.set(0, 250, 1300))
        : (p ? p.position.clone() : ARENA.playerStart.clone());
      if (spawn.length() > 2600) spawn.setLength(2400);
      w.findSpawnPoint(spawn, 1, null, spawn);
      const dir = cp.kind === 'capital' ? w.capital.position.clone().sub(spawn).normalize() : spawn.clone().negate().normalize();
      p = w.createPlayer(spawn, dir);
    }
    p.hull = Math.max(p.hull, p.maxHull * 0.75);
    p.shield = p.maxShield;
    p.missiles = Math.max(p.missiles, 4);
    p.boostEnergy = 100;
    this.attachPlayer(p);
    this.mission.retry();
    this.timeScale = 1;
    this.setState('playing');
    this.hud.show();
    this.screens.show('none');
    this.input.requestLock();
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.setState('paused');
    this.screens.show('pause');
    this.input.exitLock();
    this.input.releaseAll();
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.setState('playing');
    this.screens.show('none');
    this.input.requestLock();
  }

  setGod(on: boolean): void {
    this.godMode = on;
    if (this.world.player) this.world.player.invulnerable = on;
  }

  private onAction(a: string): void {
    switch (a) {
      case 'launch':
      case 'restart':
        this.startMission();
        break;
      case 'resume':
        this.resume();
        break;
      case 'retry':
        this.retry();
        break;
      case 'title':
        this.missionStarted = false;
        this.enterTitle();
        break;
    }
  }

  private onPlayerDeath(): void {
    if (this.state !== 'playing' && this.state !== 'finale') return;
    const p = this.world.player;
    this.controller.enabled = false;
    this.setState('dying');
    this.rig.startDeath(p ? p.position.clone() : new Vector3());
    this.rig.addTrauma(0.8);
    this.timeScale = 0.35;
  }

  private onFinaleStart(): void {
    this.setState('finale');
    this.controller.enabled = false;
    const cap = this.world.capital.position;
    const p = this.world.player;
    // Frame the carrier from beside the player's ship.
    const from = p ? p.position.clone() : cap.clone().add(_v.set(0, 300, 1200));
    const away = from.clone().sub(cap).normalize();
    this.rig.cinePos.copy(cap).addScaledVector(away, Math.max(900, from.distanceTo(cap) + 250)).add(_v.set(0, 160, 0));
    this.rig.cineLook.copy(cap);
    this.rig.mode = 'cinematic';
    if (p) p.invulnerable = true;
  }

  private onFinalBlast(): void {
    this.rig.addTrauma(1);
    for (const s of this.world.ships) {
      if (s.alive && s.team === 'enemy') s.takeDamage(9999, s.position, null, this.world);
    }
  }

  private onVictory(): void {
    this.setState('victory');
    this.hud.hide();
    this.input.exitLock();
    this.screens.show('victory', this.endStats());
  }

  private endStats(): EndStats {
    const st = this.mission.stats;
    const p = this.world.player;
    const end = st.endTime > 0 ? st.endTime : this.world.time;
    return {
      time: formatTime(end - st.startTime),
      kills: st.kills,
      score: st.score,
      accuracy: p && p.shotsFired > 0 ? p.shotsHit / p.shotsFired : 0,
      generators: st.generators,
      asteroids: st.asteroids,
      deaths: st.deaths,
      wave: this.mission.waveNumber,
    };
  }

  private setState(s: GameState): void {
    this.state = s;
    this.stateTime = 0;
  }

  renderStats(): { calls: number; triangles: number } {
    const info = this.engine.renderer.info.render;
    return { calls: info.calls, triangles: info.triangles };
  }

  private loop(now: number): void {
    requestAnimationFrame((t) => this.loop(t));
    const rawDt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.frameMs += (rawDt * 1000 - this.frameMs) * 0.05;
    this.fps = 1000 / Math.max(1, this.frameMs);
    const dt = Math.min(rawDt, 1 / 20);
    this.update(dt);
    this.engine.render();
    this.input.endFrame();
  }

  private update(dt: number): void {
    this.stateTime += dt;
    const w = this.world;
    const input = this.input;

    if (this.state === 'playing' && (input.wasPressed('Escape') || input.wasPressed('KeyP'))) {
      this.pause();
    } else if (this.state === 'paused' && input.wasPressed('KeyP')) {
      this.resume();
    }

    if (this.state === 'dying') {
      // Slow motion recovers, then the failure screen.
      this.timeScale = Math.min(1, this.timeScale + dt * 0.5);
      if (this.stateTime > 2.8) {
        this.setState('gameover');
        this.hud.hide();
        this.input.exitLock();
        this.screens.show('gameover', this.endStats());
      }
    }
    if (this.state === 'finale') {
      const prog = w.capital.finaleProgress;
      this.timeScale = prog > 0.76 && prog < 0.86 ? 0.4 : 1;
    }

    const simDt = this.state === 'paused' ? 0 : dt * this.timeScale;
    if (simDt > 0) {
      w.update(simDt, this.engine.camera);
      if (this.state === 'playing' || this.state === 'dying' || this.state === 'finale') this.mission.update(simDt);
      this.effects.update(simDt);
    }
    if (this.state !== 'paused') this.rig.update(dt, w.player && w.player.alive ? w.player : null);
    this.sky.update(this.engine.camera, performance.now() / 1000, this.engine.pixelRatio);

    const p = w.player;
    // The current target's rim pulses brighter so it stands out from the crowd.
    const tgt = p && p.alive && p.target && 'model' in p.target ? (p.target as Ship) : null;
    if (tgt !== this.highlighted) {
      if (this.highlighted) setRimBoost(this.highlighted.model, 1);
      this.highlighted = tgt;
    }
    if (tgt) setRimBoost(tgt.model, 1.9 + 0.5 * Math.sin(performance.now() / 160));
    if (p && (this.state === 'playing' || this.state === 'finale' || this.state === 'dying')) {
      if (this.controller.missileDenied) this.hud.onNoLock();
      this.hud.update(dt, { world: w, player: p, controller: this.controller, mission: this.mission, camera: this.engine.camera });
    }
  }
}
