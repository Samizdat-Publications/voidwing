import { PerspectiveCamera, Vector3 } from 'three';
import type { PlayerController } from '../game/PlayerController';
import type { Ship } from '../game/Ship';
import type { World } from '../game/World';
import type { AudioEngine, LaserKind } from './Audio';

const _v = new Vector3();

/** Turns world events and player state into positioned sound. */
export class SoundDirector {
  private lastBeep = 0;
  private playerGun = 0;

  constructor(
    private readonly audio: AudioEngine,
    private readonly camera: PerspectiveCamera,
  ) {}

  /** Stereo pan and distance gain for a world position, from the camera's point of view. */
  private spatial(p: Vector3): { pan: number; gain: number } {
    _v.copy(p).applyMatrix4(this.camera.matrixWorldInverse);
    const d = _v.length();
    const pan = Math.max(-1, Math.min(1, (_v.x / (Math.abs(_v.z) + Math.abs(_v.x) + 1)) * 1.4));
    const gain = 1 / (1 + (d / 380) * (d / 380));
    return { pan, gain };
  }

  attach(world: World): void {
    const a = this.audio;
    const ev = world.events;
    ev.on('fired', ({ ship, origin }) => {
      if (ship.kind === 'player') {
        this.playerGun ^= 1;
        a.laser('player', this.playerGun ? 0.22 : -0.22, 1);
        return;
      }
      const kind: LaserKind = ship.kind === 'wingman' ? 'wing' : ship.kind === 'maul' ? 'heavy' : 'enemy';
      const s = this.spatial(origin);
      a.laser(kind, s.pan, s.gain);
    });
    ev.on('turretFired', ({ position }) => {
      const s = this.spatial(position);
      a.laser('flak', s.pan, s.gain * 1.3);
    });
    ev.on('missileLaunched', ({ owner, missile }) => {
      const s = owner.kind === 'player' ? { pan: 0, gain: 1 } : this.spatial(missile.position);
      a.missileLaunch(s.pan, s.gain);
    });
    ev.on('missileExploded', ({ point }) => {
      const s = this.spatial(point);
      a.explosion(0.7, s.pan, s.gain);
    });
    ev.on('destroyed', ({ entity }) => {
      if (entity.kind === 'missile' || entity.kind === 'turret') return;
      const s = entity.kind === 'player' ? { pan: 0, gain: 1.2 } : this.spatial(entity.position);
      const size = entity.kind === 'generator' ? 4.5 : entity.kind === 'maul' ? 2.4 : entity.kind === 'player' ? 3 : 1.5;
      a.explosion(size, s.pan, s.gain);
    });
    ev.on('shieldHit', ({ entity, point }) => {
      if (entity === world.player) a.shieldHit(0, 1);
      else {
        const s = this.spatial(point);
        if (s.gain > 0.3) a.shieldHit(s.pan, s.gain * 0.4);
      }
    });
    ev.on('hullHit', ({ entity }) => {
      if (entity === world.player) a.hullHit(0, 1);
    });
    ev.on('capitalShieldHit', ({ point }) => {
      const s = this.spatial(point);
      a.shieldHit(s.pan, s.gain * 0.6);
    });
    ev.on('asteroidDestroyed', ({ position, radius }) => {
      const s = this.spatial(position);
      a.asteroidBreak(radius, s.pan, s.gain);
    });
    ev.on('asteroidCollision', ({ ship }) => {
      if (ship === world.player) a.hullHit(0, 1.3);
    });
    ev.on('hullScrape', ({ ship }) => {
      if (ship === world.player) a.hullHit(0, 1.3);
    });
    ev.on('shipWarpedIn', ({ ship }) => {
      if (ship.team !== 'enemy') return;
      const s = this.spatial(ship.position);
      a.warp(Math.max(0.35, s.gain));
    });
    ev.on('capitalArrived', () => a.warp(1, true));
    ev.on('capitalExplosion', ({ position, big }) => {
      const s = this.spatial(position);
      a.explosion(big ? 14 : 3.5, s.pan, big ? 1.3 : Math.max(0.4, s.gain));
    });
    ev.on('radio', () => a.ui('radio'));
  }

  /** Per-frame state: engine hum, boost roar, lock tones and alarms. */
  update(world: World, controller: PlayerController, playing: boolean): void {
    const a = this.audio;
    if (!a.ctx) return;
    const p: Ship | null = world.player;
    const live = playing && !!p && p.alive;
    a.setEngine(live, p?.throttle ?? 0, !!p?.boosting);
    a.setBoost(live && !!p?.boosting);
    const locking = live && controller.lockProgress > 0 && !controller.locked;
    if (locking) {
      const interval = 0.26 - controller.lockProgress * 0.19;
      const now = a.ctx.currentTime;
      if (now - this.lastBeep > interval) {
        this.lastBeep = now;
        a.lockBeep(controller.lockProgress);
      }
    }
    a.setLockSolid(live && controller.locked);
    a.setAlarm('missile', live && world.missiles.incomingOn(p!) > 0);
    a.setAlarm('hull', live && p!.hullFraction < 0.3);
  }
}
