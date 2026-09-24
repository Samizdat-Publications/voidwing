import { Object3D, Quaternion, Vector3 } from 'three';
import { leadPoint, segmentSphere } from '../core/math';
import { MISSILES, type MissileSpec, type Team } from './config';
import { Entity } from './Entity';
import type { Ship } from './Ship';
import type { World } from './World';

const _lead = new Vector3();
const _desired = new Vector3();
const _axis = new Vector3();
const _p0 = new Vector3();
const _p1 = new Vector3();
const _hit = new Vector3();
const _q = new Quaternion();
const _fwd = new Vector3(0, 0, -1);
const _avoid = new Vector3();

export class Missile extends Entity {
  readonly object: Object3D;
  readonly dir = new Vector3();
  speed: number;
  age = 0;
  readonly spec: MissileSpec;
  owner: Ship;
  target: Entity | null;

  constructor(owner: Ship, target: Entity, model: Object3D) {
    super(owner.team, 'missile', owner.team === 'player' ? 'Missile' : 'Enemy missile', model.position);
    this.object = model;
    this.owner = owner;
    this.target = target;
    this.spec = MISSILES[owner.team];
    this.radius = 2.5;
    this.hull = this.maxHull = this.spec.hull;
    this.targetable = false;
    owner.forward(this.dir);
    this.speed = owner.speed + this.spec.startSpeed;
  }
}

/** Homing missiles for both teams. */
export class Missiles {
  readonly list: Missile[] = [];

  launch(owner: Ship, target: Entity, world: World): Missile {
    const model = world.assets.model('missile');
    const m = new Missile(owner, target, model);
    // Drop from under the hull, alternating sides.
    const side = owner.missilesFired % 2 === 0 ? -1 : 1;
    _p0.set(side * 1.6, -1.2, -1).applyQuaternion(owner.quaternion);
    m.position.copy(owner.position).add(_p0);
    m.object.quaternion.copy(owner.quaternion);
    m.velocity.copy(m.dir).multiplyScalar(m.speed);
    world.scene.add(m.object);
    this.list.push(m);
    world.events.emit('missileLaunched', { missile: m, owner, target });
    return m;
  }

  clear(world: World): void {
    for (const m of this.list) world.scene.remove(m.object);
    this.list.length = 0;
  }

  update(dt: number, world: World): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i];
      if (!m.alive) {
        this.removeAt(i, world);
        continue;
      }
      m.age += dt;
      const spec = m.spec;
      const t = m.target;
      if (t && t.alive && m.age > 0.12) {
        leadPoint(m.position, t.position, t.velocity, Math.max(m.speed, 150), _lead);
        _desired.subVectors(_lead, m.position).normalize();
        // Swerve around rocks in the flight path that sit before the target.
        const look = m.speed * 0.7 + 20;
        _p1.copy(m.position).addScaledVector(m.dir, look);
        const rock = world.asteroids.segmentHit(m.position, _p1, 6);
        if (rock.asteroid && rock.t * look < m.position.distanceTo(t.position)) {
          _avoid.subVectors(m.position, rock.asteroid.position);
          _avoid.addScaledVector(m.dir, -_avoid.dot(m.dir));
          if (_avoid.lengthSq() < 1e-4) _avoid.set(0, 1, 0);
          _desired.addScaledVector(_avoid.normalize(), 2.5).normalize();
        }
        const angle = m.dir.angleTo(_desired);
        const maxTurn = spec.turnRate * dt;
        if (angle > maxTurn && angle > 1e-5) {
          _axis.crossVectors(m.dir, _desired).normalize();
          m.dir.applyAxisAngle(_axis, maxTurn).normalize();
        } else {
          m.dir.copy(_desired);
        }
      }
      m.speed = Math.min(spec.maxSpeed, m.speed + spec.accel * dt);
      m.velocity.copy(m.dir).multiplyScalar(m.speed);
      _p0.copy(m.position);
      _p1.copy(m.position).addScaledVector(m.velocity, dt);

      if (m.age > spec.armTime && this.checkHit(m, world)) {
        this.explode(m, _hit, world);
        this.removeAt(i, world);
        continue;
      }
      m.position.copy(_p1);
      _q.setFromUnitVectors(_fwd, m.dir);
      m.object.quaternion.copy(_q);
      if (m.age > spec.life) {
        this.explode(m, m.position, world);
        this.removeAt(i, world);
      }
    }
  }

  private checkHit(m: Missile, world: World): boolean {
    let best = 2;
    const t = m.target;
    if (t && t.alive) {
      // Proximity fuse.
      const tt = segmentSphere(_p0, _p1, t.position, t.radius + 12);
      if (tt >= 0) best = tt;
    }
    for (const e of world.collidablesFor(m.team)) {
      if (!e.alive || e === t || e.kind === 'missile') continue;
      const tt = segmentSphere(_p0, _p1, e.position, e.radius + 2);
      if (tt >= 0 && tt < best) best = tt;
    }
    if (m.team === 'player' && world.capital.shieldActive) {
      const tt = world.capital.segmentShieldT(_p0, _p1);
      if (tt >= 0 && tt < best) best = tt;
    }
    const a = world.asteroids.segmentHit(_p0, _p1, 1);
    if (a.asteroid && a.t < best) best = a.t;
    if (best > 1) return false;
    _hit.lerpVectors(_p0, _p1, best);
    return true;
  }

  explode(m: Missile, at: Vector3, world: World): void {
    m.alive = false;
    const spec = m.spec;
    const point = at.clone();
    world.effects.explosion(point, 0.8, m.velocity.clone().multiplyScalar(0.1));
    world.events.emit('missileExploded', { point, team: m.team });
    const hostileTeam: Team = m.team === 'player' ? 'enemy' : 'player';
    for (const e of world.collidablesFor(m.team)) {
      if (!e.alive || e.team !== hostileTeam || e.kind === 'missile') continue;
      const d = e.position.distanceTo(point) - e.radius;
      if (d > spec.splash) continue;
      const falloff = d <= 8 ? 1 : 1 - (d - 8) / spec.splash;
      const dmg = (e === m.target ? spec.damage : spec.damage * 0.5) * Math.max(0.25, falloff);
      e.takeDamage(dmg * m.owner.damageDealt, point, m.owner, world);
      if (m.owner.kind === 'player') world.events.emit('playerHit', { target: e, point, killed: !e.alive });
    }
    if (m.team === 'player' && world.capital.shieldActive && world.capital.shieldDistance(point) < 8) {
      world.capital.onShieldStruck(point, world);
    }
    world.asteroids.queryRadius(point, spec.splash, (a) => {
      world.asteroids.damage(a, spec.damage * 0.6, point, world);
    });
  }

  private removeAt(i: number, world: World): void {
    const m = this.list[i];
    world.scene.remove(m.object);
    this.list.splice(i, 1);
  }

  /** Enemy missiles currently homing on the given entity. */
  incomingOn(e: Entity): number {
    let n = 0;
    for (const m of this.list) if (m.alive && m.target === e && m.team !== e.team) n++;
    return n;
  }
}
