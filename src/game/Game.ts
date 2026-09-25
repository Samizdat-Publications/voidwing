import { DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from 'three';
import { Engine } from '../core/Engine';
import { Input } from '../core/Input';
import { Rng, formatTime } from '../core/math';
import { installTestHooks } from '../debug/TestHooks';
import { AudioEngine } from '../audio/Audio';
import { Music } from '../audio/Music';
import { SoundDirector } from '../audio/SoundDirector';
import { Assets, type ModelName } from '../render/Assets';
import { CameraRig } from '../render/CameraRig';
import { FX } from '../render/FX';
import { TEAM_RIM, applyTeamRim } from '../render/materials';
import { PostFX } from '../render/PostFX';
import { AdaptiveQuality, QUALITY, type QualityLevel } from '../render/Quality';
import { ShieldBubble } from '../render/ShieldFX';
import { Sky } from '../render/Sky';
import { Hud } from '../ui/Hud';
import { Screens, type EndStats } from '../ui/Screens';
import { loadSettings, saveSettings, type UserSettings } from '../ui/SettingsStore';
import { ARENA, type Difficulty } from './config';
import { Mission, PHASES } from './Mission';
import { PlayerController, type PlayerSettings } from './PlayerController';
import type { Entity } from './Entity';
import type { Ship } from './Ship';
import { World } from './World';

export type GameState = 'loading' | 'title' | 'playing' | 'paused' | 'dying' | 'finale' | 'gameover' | 'victory';

export interface Settings extends PlayerSettings {
  difficulty: Difficulty;
}

const _v = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();
const _up = new Vector3(0, 1, 0);

export class Game {
  readonly engine: Engine;
  readonly input: Input;
  readonly assets = new Assets();
  readonly rig: CameraRig;
  readonly hud: Hud;
  readonly screens: Screens;
  effects!: FX;
  post!: PostFX;
  readonly audio = new AudioEngine();
  readonly music: Music;
  private sound!: SoundDirector;
  world!: World;
  mission!: Mission;
  controller!: PlayerController;
  sky!: Sky;
  state: GameState = 'loading';
  stateTime = 0;
  readonly settings: Settings = { sensitivity: 1, invertY: false, autoLevel: true, difficulty: 'normal' };
  /** Everything the settings screen edits (persisted), mirrored into `settings` and the audio mix. */
  private readonly userSettings: UserSettings = loadSettings();
  /** Graphics level, and the frame-time watcher behind the Auto setting. */
  readonly quality: AdaptiveQuality;
  timeScale = 1;
  private deathCause = '';
  /** Zoomed camera for the targeting computer view in the HUD. */
  private readonly targetCam = new PerspectiveCamera(10, 1.8, 1, 60000);
  private lastRockHit = -99;
  private killerPos: Vector3 | null = null;
  fps = 60;
  frameMs = 16.7;
  /** Longest single frame while flying since the test hooks last read it (hitch tracking). */
  private worstFrame = 0;
  /** Recent long frames with where the time went (test diagnostics). */
  readonly hitches: { at: number; gap: number; update: number; render: number; phase: string; slowest: string }[] = [];
  /** Per-section times of the current frame's update (hitch diagnostics). */
  private readonly prof: Record<string, number> = {};
  private profT = 0;
  private mark(name: string): void {
    const now = performance.now();
    this.prof[name] = now - this.profT;
    this.profT = now;
  }
  /** Shader programs compiled after the warm-up, with when they appeared (test diagnostics). */
  readonly latePrograms: { at: number; name: string; key: string }[] = [];
  private programCount = -1;
  /** How long the shader warm-up took (test diagnostics). */
  prewarmMs = 0;
  private last = 0;
  private readonly params = new URLSearchParams(location.search);
  private readonly seed: number;
  private godMode = false;
  private missionStarted = false;

  constructor(container: HTMLElement) {
    this.engine = new Engine(container);
    this.input = new Input(this.engine.renderer.domElement);
    this.music = new Music(this.audio);
    this.engine.renderer.info.autoReset = false;
    if (new URLSearchParams(location.search).has('nosound')) this.audio.enabled = false;
    this.rig = new CameraRig(this.engine.camera);
    this.engine.camera.layers.enable(1);
    this.hud = new Hud(container);
    this.screens = new Screens(container);
    this.seed = Number(this.params.get('seed') ?? 1337) | 0;
    this.godMode = this.params.has('god');
    const diff = this.params.get('diff');
    if (diff === 'easy' || diff === 'normal' || diff === 'hard') this.userSettings.difficulty = diff;
    const q = this.params.get('quality');
    if (q === 'auto' || q === 'high' || q === 'medium' || q === 'low') this.userSettings.graphics = q;
    this.quality = new AdaptiveQuality(this.userSettings.graphics);
    this.applySettings(this.userSettings);
    this.screens.bindSettings(this.userSettings);
    this.screens.onSettings = (s) => {
      this.applySettings(s);
      saveSettings(s);
    };
    this.engine.onResize((w, h) => {
      this.hud.resize(w, h);
      this.post?.setSize(w, h, this.engine.pixelRatio);
    });
    this.hud.resize(this.engine.width, this.engine.height);
    this.screens.onAction = (a) => {
      this.audio.unlock();
      this.audio.ui('click');
      this.onAction(a);
    };
    this.screens.onHover = () => this.audio.ui('hover');
    // Audio can only start after a user gesture.
    const unlock = () => {
      this.audio.unlock();
      this.syncMusic();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
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
    await this.assets.load((f) => this.screens.setLoading(f * 0.85));
    if (this.assets.missing.length) console.info('VOID WING: greybox stand-ins for', this.assets.missing.join(', '));
    this.buildWorld();
    // Shaders compile behind the loading screen, so the title never sits over a blank frame.
    const t0 = performance.now();
    await this.prewarm();
    this.prewarmMs = Math.round(performance.now() - t0);
    this.screens.setLoading(1);
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
    scene.backgroundIntensity = 0.55;
    // The nebula doubles as image-based lighting, so hulls pick up its colours.
    scene.environment = this.sky.environment;
    scene.environmentIntensity = 1.15;
    scene.add(this.sky.group);
    this.effects = new FX(scene, this.assets);
    this.world = new World(scene, this.assets, this.effects, this.seed);
    this.effects.attach(this.world);
    this.post = new PostFX(this.engine.renderer, scene, this.engine.camera);
    this.post.setSize(this.engine.width, this.engine.height, this.engine.pixelRatio);
    this.post.setSamples(QUALITY[this.quality.level].samples);
    this.sound = new SoundDirector(this.audio, this.engine.camera);
    this.sound.attach(this.world);
    this.world.difficulty = this.settings.difficulty;
    this.mission = new Mission(this.world);
    this.controller = new PlayerController(this.input, this.settings);
    this.mission.onVictory = () => this.onVictory();
    this.mission.onFinaleStart = () => this.onFinaleStart();
    this.world.capital.onFinalBlast = () => this.onFinalBlast();
    this.world.events.on('destroyed', ({ entity, source }) => {
      if (entity === this.world.player) {
        this.deathCause = this.describeKiller(source);
        this.killerPos = source && source.alive ? source.position.clone() : null;
        this.onPlayerDeath();
      }
    });
    this.world.events.on('playerHit', ({ killed }) => this.hud.onPlayerHit(killed));
    this.world.events.on('shieldBlocked', () => this.hud.onShieldBlocked());
    this.world.events.on('hullHit', ({ entity, point, source }) => {
      if (entity === this.world.player) {
        this.hud.onPlayerDamaged(source && source.alive ? source.position : point);
        this.rig.addTrauma(0.25);
      }
    });
    this.world.events.on('shieldHit', ({ entity, point, source }) => {
      if (entity === this.world.player) {
        this.hud.onShieldHit();
        this.hud.onPlayerDamaged(source && source.alive ? source.position : point);
        this.rig.addTrauma(0.12);
      }
    });
    this.world.events.on('destroyed', ({ entity }) => {
      const p = this.world.player;
      if (!p) return;
      const d = entity.position.distanceTo(p.position);
      if (d < 600) this.rig.addTrauma(entity.kind === 'generator' ? 0.6 : 0.35 * (1 - d / 600));
    });
    this.world.events.on('missileExploded', ({ point }) => {
      const p = this.world.player;
      if (p && point.distanceTo(p.position) < 150) this.rig.addTrauma(0.3);
    });
    this.world.events.on('asteroidCollision', ({ ship }) => {
      if (ship === this.world.player) {
        this.rig.addTrauma(0.55);
        this.lastRockHit = this.world.time;
      }
    });
    this.world.events.on('capitalArrived', () => {
      this.rig.addTrauma(0.5);
      this.syncMusic();
    });
    this.world.events.on('capitalExplosion', ({ big }) => this.rig.addTrauma(big ? 1 : 0.25));
    this.world.events.on('fired', ({ ship }) => {
      if (ship === this.world.player) this.rig.addTrauma(0.012);
    });
  }

  /**
   * Compile every shader and upload the models before the title appears, so the first bomber,
   * carrier or enemy shield never stalls a frame mid-fight. Hidden objects (the carrier) are
   * compiled too; ships spawned later get their own material copies, so one of each is added.
   */
  private async prewarm(): Promise<void> {
    const r = this.engine.renderer;
    const scene = this.engine.scene;
    const cam = this.engine.camera;
    const group = new Group();
    const add = (name: ModelName, x: number, rim: number, team: 'player' | 'enemy' | null, variant?: 'wingman') => {
      const m = this.assets.model(name, variant);
      if (team) applyTeamRim(m, TEAM_RIM[team], rim);
      m.position.set(x, 0, -150);
      group.add(m);
      return m;
    };
    // The player's own hull is fade-ready (transparent, single pass), as FX sets it up at spawn.
    add('kestrel', -60, 0.3, 'player').traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh || mesh.userData.engineGlow) return;
      for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as MeshStandardMaterial[]) {
        if (!m.isMeshStandardMaterial) continue;
        m.transparent = true;
        m.forceSinglePass = true;
      }
    });
    add('kestrel', -30, 0.9, 'player', 'wingman');
    add('razor', 0, 1.9, 'enemy');
    add('maul', 30, 1.9, 'enemy');
    add('missile', 60, 0, null);
    const bubble = new ShieldBubble(0x4fd8ff, 2.4, 0);
    bubble.mesh.position.set(0, 20, -150);
    bubble.mesh.scale.setScalar(12);
    group.add(bubble.mesh);
    cam.updateMatrixWorld();
    group.position.copy(cam.position);
    group.quaternion.copy(cam.quaternion);
    scene.add(group);
    const cap = this.world.capital.object;
    const capVisible = cap.visible;
    cap.visible = true;
    // three builds a separate program per output: the main view draws into the HDR scene buffer,
    // the targeting view straight to the screen. Compile every material for both.
    try {
      r.setRenderTarget(this.post.composer.renderTarget1);
      await r.compileAsync(scene, cam);
      r.setRenderTarget(null);
      await r.compileAsync(scene, cam);
    } catch {
      // Shaders then compile on first use instead.
    }
    r.setRenderTarget(null);
    // One frame to the screen and one through the post chain upload geometry and textures and
    // cover the background, which is not part of the scene graph.
    r.render(scene, cam);
    this.post.render(0);
    cap.visible = capVisible;
    scene.remove(group);
    this.programCount = r.info.programs?.length ?? 0;
  }

  /** Render at a quality level: resolution cap and MSAA. */
  private applyQuality(level: QualityLevel): void {
    const q = QUALITY[level];
    if (this.engine.maxPixelRatio !== q.maxPixelRatio) {
      this.engine.maxPixelRatio = q.maxPixelRatio;
      this.engine.resize();
    }
    this.post?.setSamples(q.samples);
    this.screens.setGraphicsNote(
      this.quality.auto ? `Auto: rendering at ${q.label}. Steps down if the frame rate drops.` : `Rendering at ${q.label}.`,
    );
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
    p.invulnerable = false;
    p.hullFloor = this.godMode ? p.maxHull * 0.25 : 0;
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
    this.hud.setPaused(true);
    this.screens.show('pause');
    this.input.exitLock();
    this.input.releaseAll();
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.hud.setPaused(false);
    this.setState('playing');
    this.screens.show('none');
    this.input.requestLock();
  }

  /** Mirror the settings screen into flight controls, difficulty (next mission) and the audio mix. */
  private applySettings(s: UserSettings): void {
    this.settings.sensitivity = s.sensitivity;
    this.settings.invertY = s.invertY;
    this.settings.autoLevel = s.autoLevel;
    this.settings.difficulty = s.difficulty;
    this.world?.setDifficulty(s.difficulty);
    this.applyQuality(this.quality.choose(s.graphics));
    this.audio.volume.master = s.master;
    this.audio.volume.music = s.music;
    this.audio.volume.sfx = s.sfx;
    this.audio.applyVolumes();
  }

  setGod(on: boolean): void {
    this.godMode = on;
    const p = this.world.player;
    if (p) p.hullFloor = on ? p.maxHull * 0.25 : 0;
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

  /** One line for the failure screen: what killed the player. */
  private describeKiller(source: Entity | null): string {
    switch (source?.kind) {
      case 'razor':
        return 'Shot down by a Razor dogfighter';
      case 'maul':
        return 'Shot down by a Maul bomber';
      case 'turret':
        return 'Hit by Leviathan flak';
      case 'wingman':
      case 'player':
        return 'Lost to friendly fire';
    }
    return this.world.time - this.lastRockHit < 1 ? 'Collided with an asteroid' : 'Rammed the Leviathan';
  }

  private onPlayerDeath(): void {
    if (this.state !== 'playing' && this.state !== 'finale') return;
    const p = this.world.player;
    this.controller.enabled = false;
    this.hud.setMode('dead');
    this.setState('dying');
    this.rig.startDeath(p ? p.position.clone() : new Vector3(), this.killerPos);
    this.mission.showBanner('VOID ONE DOWN', this.deathCause, 'warn', 2.8);
    this.rig.addTrauma(0.8);
    this.timeScale = 0.35;
  }

  private onFinaleStart(): void {
    this.setState('finale');
    this.hud.setMode('cinematic');
    this.controller.enabled = false;
    const p = this.world.player;
    this.rig.mode = 'cinematic';
    this.rig.cineLerp = 5;
    if (p) {
      p.invulnerable = true;
      const away = _v.subVectors(p.position, this.world.capital.position).normalize();
      for (let k = 0; k <= 1400; k += 200) this.world.asteroids.vaporize(_v2.copy(p.position).addScaledVector(away, k), 260, this.world);
      this.updateEscape(0);
      this.rig.camera.position.copy(this.rig.cinePos);
    }
  }

  /** Finale: the ship turns and burns away while the camera looks back past it at the carrier. */
  private updateEscape(dt: number): void {
    const p = this.world.player;
    if (!p) return;
    const cap = this.world.capital.position;
    const away = _v.subVectors(p.position, cap).normalize();
    this.controller.aimDir.lerp(away, Math.min(1, dt * 1.2)).normalize();
    // Cruise first so the break-up stays close to the camera, then burn clear before the blast.
    p.control.throttle = 0.85;
    p.control.boost = this.stateTime > 5;
    p.control.fire = false;
    const side = _v2.crossVectors(away, _up).normalize();
    this.rig.cinePos.copy(p.position).addScaledVector(away, 75).addScaledVector(side, 28).add(_v3.set(0, 18, 0));
    this.rig.cineLook.lerpVectors(cap, p.position, 0.12);
  }

  private onFinalBlast(): void {
    this.rig.addTrauma(1);
    this.post.flash(0.9);
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
      seconds: end - st.startTime,
      difficulty: this.settings.difficulty,
      kills: st.kills,
      score: st.score,
      accuracy: p && p.shotsFired > 0 ? p.shotsHit / p.shotsFired : 0,
      generators: st.generators,
      asteroids: st.asteroids,
      deaths: st.deaths,
      wave: this.mission.waveNumber,
      cause: this.state === 'gameover' ? this.deathCause : '',
    };
  }

  private setState(s: GameState): void {
    this.state = s;
    this.stateTime = 0;
    this.syncMusic();
    if (s !== 'playing' && s !== 'finale') this.audio.stopLoops();
  }

  /** Pick the music bed for the current state and mission phase. */
  private syncMusic(): void {
    if (!this.audio.ctx) return;
    const phase = this.mission?.phase.kind;
    switch (this.state) {
      case 'loading':
      case 'title':
        this.music.setMode('title');
        break;
      case 'playing':
      case 'paused':
      case 'dying':
        this.music.setMode(phase === 'capital' || phase === 'finale' ? 'boss' : 'combat');
        break;
      case 'finale':
        this.music.setMode('boss');
        break;
      case 'victory':
        this.music.setMode('victory');
        break;
      case 'gameover':
        this.music.setMode('defeat');
        break;
    }
    this.music.setDucked(this.state === 'paused');
  }

  /** Longest frame since the last call, then reset (test hooks). */
  takeWorstFrame(): number {
    const w = this.worstFrame;
    this.worstFrame = 0;
    return w;
  }

  renderStats(): { calls: number; triangles: number } {
    const info = this.engine.renderer.info.render;
    return { calls: info.calls, triangles: info.triangles };
  }

  private loop(now: number): void {
    requestAnimationFrame((t) => this.loop(t));
    const elapsed = Math.max(0, now - this.last);
    const rawDt = Math.min(0.1, elapsed / 1000);
    this.last = now;
    if (this.state === 'playing' || this.state === 'finale') this.worstFrame = Math.max(this.worstFrame, elapsed);
    this.frameMs += (rawDt * 1000 - this.frameMs) * 0.05;
    this.fps = 1000 / Math.max(1, this.frameMs);
    const dt = Math.min(rawDt, 1 / 20);
    const t0 = performance.now();
    this.update(dt);
    const t1 = performance.now();
    if (this.state === 'playing' || this.state === 'finale') {
      const next = this.quality.sample(rawDt * 1000, rawDt);
      if (next) this.applyQuality(next);
    }
    // Count draw calls across all post passes for the whole frame.
    this.engine.renderer.info.reset();
    this.post.render(dt);
    this.renderTargetView();
    this.input.endFrame();
    const t2 = performance.now();
    const programs = this.engine.renderer.info.programs;
    if (programs && this.programCount >= 0 && programs.length > this.programCount) {
      for (const p of programs.slice(this.programCount)) {
        if (this.latePrograms.length < 24) this.latePrograms.push({ at: Math.round(this.world.time * 10) / 10, name: p.name, key: p.cacheKey });
      }
    }
    if (programs && this.programCount >= 0) this.programCount = programs.length;
    if ((this.state === 'playing' || this.state === 'finale') && (elapsed > 60 || t2 - t0 > 40)) {
      let slowest = '';
      let slowMs = -1;
      for (const k in this.prof) if (this.prof[k] > slowMs) [slowest, slowMs] = [k, this.prof[k]];
      this.hitches.push({ at: Math.round(this.world.time * 10) / 10, gap: Math.round(elapsed), update: Math.round(t1 - t0), render: Math.round(t2 - t1), phase: this.mission.phase.kind, slowest: `${slowest} ${Math.round(slowMs)}` });
      if (this.hitches.length > 12) this.hitches.shift();
    }
  }

  /** Targeting computer: a zoomed view of the current target, drawn into the HUD frame. */
  private renderTargetView(): void {
    const p = this.world?.player;
    const t = p && p.alive ? p.target : null;
    const rect = t && t.alive && this.state === 'playing' ? this.hud.targetViewRect() : null;
    if (!p || !t || !rect) return;
    const r = this.engine.renderer;
    const cam = this.targetCam;
    // Look from just ahead of the player so its own hull never blocks the view.
    _v.subVectors(t.position, p.position);
    const dist = _v.length();
    _v.multiplyScalar(1 / Math.max(dist, 1));
    cam.position.copy(p.position).addScaledVector(_v, p.radius * 3);
    cam.up.copy(this.engine.camera.up).applyQuaternion(this.engine.camera.quaternion);
    cam.lookAt(t.position);
    const model = (t as Ship).model;
    // A generator is small on a huge hull: frame its pylon and some of the carrier around it.
    const vis = t.kind === 'generator' ? Math.max(80, t.radius * 4) : t.radius * (model ? model.scale.x : 1) * 1.5;
    cam.fov = Math.min(40, Math.max(0.6, (2 * Math.atan(vis / Math.max(dist, 1)) * 180) / Math.PI));
    cam.aspect = rect.width / rect.height;
    cam.near = Math.max(1, dist - vis * 6);
    cam.far = 60000;
    cam.updateProjectionMatrix();
    const x = rect.left, y = this.engine.height - rect.bottom;
    r.setScissorTest(true);
    r.setScissor(x, y, rect.width, rect.height);
    r.setViewport(x, y, rect.width, rect.height);
    r.render(this.engine.scene, cam);
    r.setScissorTest(false);
    r.setViewport(0, 0, this.engine.width, this.engine.height);
  }

  private update(dt: number): void {
    this.profT = performance.now();
    this.stateTime += dt;
    const w = this.world;
    const input = this.input;

    if (this.state === 'title' && this.screens.current === 'title' && (input.wasPressed('Enter') || input.wasPressed('NumpadEnter'))) {
      this.audio.unlock();
      this.audio.ui('click');
      this.startMission();
    } else if (this.state === 'playing' && (input.wasPressed('Escape') || input.wasPressed('KeyP'))) {
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
    this.mark('input');
    if (simDt > 0) {
      w.update(simDt, this.engine.camera);
      this.mark('world');
      if (this.state === 'playing' || this.state === 'dying' || this.state === 'finale') this.mission.update(simDt);
      this.mark('mission');
      this.effects.update(simDt);
      this.mark('fx');
    }
    if (this.state === 'finale' && w.player) this.updateEscape(dt);
    if (this.state !== 'paused') {
      this.rig.aimDir.copy(this.controller.aimDir);
      this.rig.update(dt, w.player && w.player.alive ? w.player : null);
      w.asteroids.pushOut(this.engine.camera.position, this.state === 'finale' ? 45 : 8);
      this.engine.camera.updateMatrixWorld();
    }
    const cam = this.engine.camera;
    this.mark('camera');
    this.sky.update(cam, performance.now() / 1000, this.engine.pixelRatio);
    this.effects.updateView(this.state === 'paused' ? 0 : dt, cam.position, this.engine.height * this.engine.pixelRatio, cam.fov);
    this.mark('view');
    this.sound.update(w, this.controller, this.state === 'playing' || this.state === 'finale');
    this.mark('sound');

    const p = w.player;
    if (p && (this.state === 'playing' || this.state === 'finale' || this.state === 'dying')) {
      if (this.controller.missileDenied) {
        this.hud.onNoLock();
        this.audio.ui('deny');
      }
      this.hud.update(dt, { world: w, player: p, controller: this.controller, mission: this.mission, camera: this.engine.camera });
      this.effects.playerFadeTarget = this.hud.overlapShip ? 0.3 : 1;
    }
    this.mark('hud');
  }
}
