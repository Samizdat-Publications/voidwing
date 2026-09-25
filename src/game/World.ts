import { Camera, Quaternion, Scene, Vector3 } from 'three';
import { Emitter } from '../core/Events';
import { Rng } from '../core/math';
import type { Assets } from '../render/Assets';
import type { EffectsApi } from '../render/Effects';
import { TEAM_RIM, applyTeamRim } from '../render/materials';
import { BomberAI, DogfighterAI, WingmanAI } from './AI';
import { AsteroidField } from './Asteroids';
import { CapitalShip, type Generator } from './CapitalShip';
import { DIFFICULTY, type Difficulty, type Team } from './config';
import type { Entity } from './Entity';
import { Missiles, type Missile } from './Missiles';
import { Projectiles } from './Projectiles';
import { Ship } from './Ship';

export interface WorldEvents extends Record<string, unknown> {
  shieldHit: { entity: Entity; point: Vector3; amount: number; source: Entity | null };
  hullHit: { entity: Entity; point: Vector3; amount: number; source: Entity | null };
  destroyed: { entity: Entity; source: Entity | null };
  fired: { ship: Ship; origin: Vector3; dir: Vector3 };
  playerHit: { target: Entity; point: Vector3; killed: boolean };
  shieldBlocked: { point: Vector3 };
  boltImpact: { point: Vector3; dir: Vector3; kind: string; shield: boolean };
  missileLaunched: { missile: Missile; owner: Ship; target: Entity };
  missileExploded: { point: Vector3; team: Team };
  asteroidHit: { position: Vector3; radius: number };
  asteroidDestroyed: { position: Vector3; radius: number; tier: number };
  asteroidCollision: { ship: Ship; impact: number; point: Vector3 };
  asteroidVaporized: { position: Vector3; radius: number };
  turretFired: { position: Vector3 };
  capitalArrived: { position: Vector3 };
  capitalShieldHit: { point: Vector3 };
  generatorDestroyed: { generator: Generator; remaining: number };
  shieldCollapsed: { position: Vector3 };
  capitalExplosion: { position: Vector3; big: boolean };
  escortLaunched: { ship: Ship };
  shipWarpedIn: { ship: Ship };
  radio: { from: string; text: string };
}

const _n = new Vector3();
const _q = new Quaternion();
const _fwd = new Vector3(0, 0, -1);

export class World {
  readonly events = new Emitter<WorldEvents>();
  time = 0;
  readonly rng: Rng;
  readonly ships: Ship[] = [];
  player: Ship | null = null;
  readonly asteroids: AsteroidField;
  readonly projectiles: Projectiles;
  readonly missiles = new Missiles();
  readonly capital: CapitalShip;
  difficulty: Difficulty = 'normal';
  private readonly byId = new Map<number, Entity>();
  private readonly collidables: Record<Team, Entity[]> = { player: [], enemy: [] };
  private readonly targets: Record<Team, Entity[]> = { player: [], enemy: [] };
  godMode = false;

  constructor(
    readonly scene: Scene,
    readonly assets: Assets,
    readonly effects: EffectsApi,
    seed: number,
  ) {
    this.rng = new Rng(seed);
    this.asteroids = new AsteroidField(assets.asteroidVariants());
    this.asteroids.generate(this.rng);
    scene.add(this.asteroids.group);
    this.projectiles = new Projectiles(scene);
    this.capital = new CapitalShip(this);
    for (const g of this.capital.generators) this.byId.set(g.id, g);
    for (const t of this.capital.turrets) this.byId.set(t.id, t);
  }

  get diff() {
    return DIFFICULTY[this.difficulty];
  }

  private applyDifficultyTo(ship: Ship): void {
    ship.damageDealt = this.diff.enemyDamage;
    ship.aimSpread = (ship.kind === 'maul' ? 0.04 : 0.024) / this.diff.enemyAim;
  }

  /** Change difficulty on the fly (settings screen): enemies already out there adjust too. */
  setDifficulty(d: Difficulty): void {
    this.difficulty = d;
    for (const s of this.ships) if (s.alive && s.team === 'enemy') this.applyDifficultyTo(s);
  }

  entityById(id: number): Entity | null {
    return this.byId.get(id) ?? null;
  }

  /** Things a bolt fired by `team` can hit. */
  collidablesFor(team: Team): Entity[] {
    return this.collidables[team];
  }

  /** Targetable hostiles for `team` (HUD, lock-on, AI). */
  targetsFor(team: Team): Entity[] {
    return this.targets[team];
  }

  addShip(ship: Ship): Ship {
    this.ships.push(ship);
    this.byId.set(ship.id, ship);
    this.scene.add(ship.object);
    // Team-tinted silhouette rim so ships read against black space.
    const rim = ship.kind === 'player' ? 0.3 : ship.team === 'player' ? 0.9 : 1.9;
    applyTeamRim(ship.model, TEAM_RIM[ship.team], rim);
    return ship;
  }

  createPlayer(position: Vector3, dir: Vector3): Ship {
    const ship = new Ship('player', 'player', this.assets.model('kestrel'), 'Void One');
    ship.position.copy(position);
    _q.setFromUnitVectors(_fwd, dir.clone().normalize());
    ship.quaternion.copy(_q);
    ship.resetMotion(40);
    this.player = ship;
    return this.addShip(ship);
  }

  spawnWingman(name: string, position: Vector3, dir: Vector3, slot: Vector3): Ship {
    const ship = new Ship('wingman', 'player', this.assets.model('kestrel', 'wingman'), name);
    ship.position.copy(position);
    _q.setFromUnitVectors(_fwd, dir.clone().normalize());
    ship.quaternion.copy(_q);
    ship.resetMotion(40);
    ship.damageDealt = 1;
    ship.aimSpread = 0.03;
    ship.controller = new WingmanAI(slot);
    this.events.emit('shipWarpedIn', { ship });
    return this.addShip(ship);
  }

  spawnEnemy(kind: 'razor' | 'maul', position: Vector3, dir: Vector3, quiet = false): Ship {
    const ship = new Ship(kind, 'enemy', this.assets.model(kind));
    ship.position.copy(position);
    _q.setFromUnitVectors(_fwd, dir.clone().normalize());
    ship.quaternion.copy(_q);
    ship.resetMotion(kind === 'maul' ? 70 : 90);
    this.applyDifficultyTo(ship);
    ship.controller = kind === 'maul' ? new BomberAI(this.rng) : new DogfighterAI(this.rng);
    this.addShip(ship);
    if (!quiet) this.effects.warpFlash(position, kind === 'maul' ? 22 : 14);
    this.events.emit('shipWarpedIn', { ship });
    return ship;
  }

  /** Find a spawn point around `center` at `dist`, biased toward `bias`, clear of rocks. */
  findSpawnPoint(center: Vector3, dist: number, bias: Vector3 | null, out: Vector3): Vector3 {
    for (let attempt = 0; attempt < 30; attempt++) {
      const dir = this.rng.unitVector(_n);
      dir.y *= 0.35;
      if (bias) dir.addScaledVector(bias, 1.2);
      dir.normalize();
      out.copy(center).addScaledVector(dir, dist * this.rng.range(0.9, 1.1));
      if (out.length() > 3300) out.setLength(3000);
      if (this.asteroids.clearance(out, 60) && (this.capital.state === 'hidden' || this.capital.shieldDistance(out) > 80)) return out;
    }
    return out;
  }

  private rebuildLists(): void {
    const cp = this.collidables.player, ce = this.collidables.enemy;
    const tp = this.targets.player, te = this.targets.enemy;
    cp.length = ce.length = tp.length = te.length = 0;
    for (const s of this.ships) {
      if (!s.alive) continue;
      if (s.team === 'player') {
        ce.push(s);
        te.push(s);
      } else {
        cp.push(s);
        tp.push(s);
      }
    }
    if (this.capital.state === 'active' || this.capital.state === 'warping') {
      for (const g of this.capital.generators) {
        if (!g.alive) continue;
        cp.push(g);
        tp.push(g);
      }
    }
    for (const m of this.missiles.list) {
      if (m.alive && m.team === 'enemy') cp.push(m);
    }
  }

  update(dt: number, camera: Camera): void {
    this.time += dt;
    this.rebuildLists();
    for (const s of this.ships) if (s.alive) s.update(dt, this);
    this.capital.update(dt, this);
    this.rebuildLists();
    this.missiles.update(dt, this);
    for (const m of this.missiles.list) if (!this.byId.has(m.id)) this.byId.set(m.id, m);
    this.projectiles.update(dt, this, camera.position);
    this.asteroids.update(dt, camera);
    this.collideShips();
    this.cleanup();
  }

  private collideShips(): void {
    for (const s of this.ships) {
      if (!s.alive) continue;
      this.asteroids.queryRadius(s.position, s.radius, (a) => {
        _n.subVectors(s.position, a.position);
        const d = _n.length() || 1e-3;
        const minD = a.radius + s.radius;
        if (d >= minD) return;
        _n.multiplyScalar(1 / d);
        s.position.copy(a.position).addScaledVector(_n, minD + 0.1);
        const vn = s.velocity.dot(_n) - a.velocity.dot(_n);
        if (vn < 0) {
          const impact = -vn;
          s.velocity.addScaledVector(_n, impact * 1.5);
          s.speed *= 0.45;
          const point = a.position.clone().addScaledVector(_n, a.radius);
          if (impact > 8) {
            s.takeDamage(Math.min(55, impact * 0.32), point, null, this);
            if (a.tier !== 0) this.asteroids.damage(a, impact * 0.6, point, this);
            this.events.emit('asteroidCollision', { ship: s, impact, point });
          }
        }
      });
      this.capital.collideShip(s, this);
      for (const g of this.capital.generators) {
        if (!g.alive || this.capital.state === 'hidden') continue;
        _n.subVectors(s.position, g.position);
        const d = _n.length();
        const minD = g.radius + s.radius + 4;
        if (d < minD && d > 1e-3) {
          _n.multiplyScalar(1 / d);
          s.position.copy(g.position).addScaledVector(_n, minD);
          const vn = s.velocity.dot(_n);
          if (vn < 0) s.velocity.addScaledVector(_n, -vn * 1.6);
        }
      }
    }
  }

  private cleanup(): void {
    for (let i = this.ships.length - 1; i >= 0; i--) {
      const s = this.ships[i];
      if (s.alive) continue;
      this.scene.remove(s.object);
      this.byId.delete(s.id);
      this.ships.splice(i, 1);
    }
  }

  /** Remove every non-player ship and all ordnance (used by retry). */
  clearCombat(): void {
    for (const s of this.ships) {
      if (s !== this.player) {
        this.scene.remove(s.object);
        this.byId.delete(s.id);
      }
    }
    this.ships.length = 0;
    if (this.player && this.player.alive) this.ships.push(this.player);
    this.projectiles.clear();
    this.missiles.clear(this);
  }

  enemyShipsAlive(): number {
    let n = 0;
    for (const s of this.ships) if (s.alive && s.team === 'enemy') n++;
    return n;
  }

}
