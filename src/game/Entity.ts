import { Vector3 } from 'three';
import type { Team } from './config';
import type { World } from './World';

export type EntityKind = 'player' | 'wingman' | 'razor' | 'maul' | 'generator' | 'turret' | 'missile';

let nextId = 1;

/** Anything that has a position, a team and can take damage. */
export abstract class Entity {
  readonly id = nextId++;
  alive = true;
  readonly velocity = new Vector3();
  radius = 5;
  hull = 100;
  maxHull = 100;
  shield = 0;
  maxShield = 0;
  /** Shows up in targeting, brackets and radar. */
  targetable = true;
  /** Counts as an objective marker (amber). */
  objective = false;
  lastHitTime = -999;
  lastShieldHitTime = -999;
  invulnerable = false;
  /** Hull never drops below this (test god mode shows real damage without dying). */
  hullFloor = 0;
  /** Damage multiplier applied to incoming damage. */
  damageTaken = 1;
  /** How much larger the renderer draws this than its real size (far ships are magnified). */
  viewScale = 1;

  constructor(
    readonly team: Team,
    readonly kind: EntityKind,
    public name: string,
    readonly position: Vector3,
  ) {}

  get hullFraction(): number {
    return this.maxHull > 0 ? this.hull / this.maxHull : 0;
  }
  get shieldFraction(): number {
    return this.maxShield > 0 ? this.shield / this.maxShield : 0;
  }

  /** Apply damage; shields soak first. Returns true if this killed the entity. */
  takeDamage(amount: number, point: Vector3, source: Entity | null, world: World): boolean {
    if (!this.alive) return false;
    amount *= this.damageTaken;
    this.lastHitTime = world.time;
    let rest = amount;
    if (this.shield > 0) {
      const soaked = Math.min(this.shield, rest);
      this.shield -= soaked;
      rest -= soaked;
      this.lastShieldHitTime = world.time;
      world.events.emit('shieldHit', { entity: this, point, amount: soaked, source });
    }
    // Invulnerable entities still lose shields but never hull; a hull floor caps hull damage.
    if (this.invulnerable) rest = 0;
    if (this.hullFloor > 0) rest = Math.min(rest, Math.max(0, this.hull - this.hullFloor));
    if (rest > 0 || (amount > 0 && this.maxShield === 0 && !this.invulnerable)) {
      this.hull -= rest;
      world.events.emit('hullHit', { entity: this, point, amount: rest, source });
    }
    if (this.hull <= 0) {
      this.hull = 0;
      this.alive = false;
      this.onDestroyed(world, source);
      world.events.emit('destroyed', { entity: this, source });
      return true;
    }
    return false;
  }

  protected onDestroyed(_world: World, _source: Entity | null): void {}
}
