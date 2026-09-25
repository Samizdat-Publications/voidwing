import { Vector3 } from 'three';
import { DEG } from '../core/math';

export type Team = 'player' | 'enemy';
export type ShipKind = 'player' | 'wingman' | 'razor' | 'maul';
export type BoltKind = 'player' | 'wing' | 'enemy' | 'heavy' | 'flak';

export interface ShipSpec {
  displayName: string;
  radius: number;
  hull: number;
  shield: number;
  shieldRegen: number;
  shieldDelay: number;
  minSpeed: number;
  cruiseSpeed: number;
  boostSpeed: number;
  accel: number;
  /** How fast velocity re-aligns with the nose (1/s). Lower = more drift. */
  grip: number;
  pitchRate: number;
  yawRate: number;
  rollRate: number;
  /** Angular velocity response (1/s). */
  angResponse: number;
  guns: Vector3[];
  fireInterval: number;
  bolt: BoltKind;
  boltSpeed: number;
  boltDamage: number;
  boltLife: number;
  missiles: number;
  score: number;
}

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

export const SPECS: Record<ShipKind, ShipSpec> = {
  player: {
    displayName: 'KV-9 Kestrel', radius: 5, hull: 100, shield: 100, shieldRegen: 16, shieldDelay: 3,
    minSpeed: 0, cruiseSpeed: 115, boostSpeed: 240, accel: 55, grip: 2.2,
    pitchRate: 1.75, yawRate: 1.6, rollRate: 2.9, angResponse: 12,
    guns: [v(-2.4, -0.3, -3.4), v(2.4, -0.3, -3.4)], fireInterval: 0.085,
    bolt: 'player', boltSpeed: 950, boltDamage: 7, boltLife: 1.35, missiles: 8, score: 0,
  },
  wingman: {
    displayName: 'KV-9 Kestrel', radius: 4.5, hull: 160, shield: 120, shieldRegen: 12, shieldDelay: 4,
    minSpeed: 30, cruiseSpeed: 110, boostSpeed: 220, accel: 50, grip: 2.2,
    pitchRate: 1.45, yawRate: 1.35, rollRate: 2.6, angResponse: 9,
    guns: [v(-2.4, -0.3, -3.4), v(2.4, -0.3, -3.4)], fireInterval: 0.16,
    bolt: 'wing', boltSpeed: 900, boltDamage: 4.2, boltLife: 1.3, missiles: 0, score: 0,
  },
  razor: {
    // Model drawn at 1.35x (Assets.ENEMY_SCALE); radius and gun mounts match the scaled model.
    displayName: 'Razor', radius: 9.5, hull: 55, shield: 30, shieldRegen: 6, shieldDelay: 4,
    minSpeed: 40, cruiseSpeed: 104, boostSpeed: 185, accel: 50, grip: 2.4,
    pitchRate: 1.45, yawRate: 1.3, rollRate: 2.6, angResponse: 9,
    guns: [v(-2.6, -0.6, -6.5), v(2.6, -0.6, -6.5)], fireInterval: 0.13,
    bolt: 'enemy', boltSpeed: 700, boltDamage: 3.4, boltLife: 1.6, missiles: 0, score: 100,
  },
  maul: {
    // Model drawn at 2.2x (Assets.ENEMY_SCALE): a bomber should look heavy next to a Razor.
    displayName: 'Maul', radius: 29.3, hull: 130, shield: 60, shieldRegen: 8, shieldDelay: 5,
    minSpeed: 30, cruiseSpeed: 86, boostSpeed: 150, accel: 30, grip: 1.8,
    pitchRate: 0.85, yawRate: 0.8, rollRate: 1.6, angResponse: 6,
    guns: [v(-7.9, -3.1, -27.8), v(7.9, -3.1, -27.8)], fireInterval: 0.36,
    bolt: 'heavy', boltSpeed: 480, boltDamage: 5.5, boltLife: 2.4, missiles: 2, score: 250,
  },
};

export interface BoltVisual {
  color: number;
  intensity: number;
  length: number;
  width: number;
  /** Extra hit radius so fast bolts feel fair. */
  hitRadius: number;
}

export const BOLTS: Record<BoltKind, BoltVisual> = {
  player: { color: 0x5fe8ff, intensity: 7, length: 34, width: 0.56, hitRadius: 1.4 },
  wing: { color: 0x7fb4ff, intensity: 5, length: 15, width: 0.42, hitRadius: 1.0 },
  enemy: { color: 0xff3b3b, intensity: 5.5, length: 13, width: 0.48, hitRadius: 1.0 },
  heavy: { color: 0xff8a1f, intensity: 5, length: 7, width: 1.3, hitRadius: 2.0 },
  flak: { color: 0xffb040, intensity: 5.5, length: 10, width: 1.1, hitRadius: 1.6 },
};

export const PLAYER = {
  throttleRate: 0.6,
  startThrottle: 0.55,
  boostMax: 100,
  boostDrain: 28,
  boostRegen: 16,
  boostRegenDelay: 1.0,
  /** Radians of mouse aim per pixel at sensitivity 1. */
  mouseRadPerPx: 0.0021,
  /** Max angle the aim can lead the nose by. */
  maxAimLead: 32 * DEG,
  steerGain: 3.0,
  aimAssistCone: 2.6 * DEG,
  convergence: 450,
  lockCone: 11 * DEG,
  lockRange: 900,
  lockTime: 1.0,
  missileCooldown: 1.2,
};

export interface MissileSpec {
  startSpeed: number;
  maxSpeed: number;
  accel: number;
  turnRate: number;
  life: number;
  damage: number;
  splash: number;
  armTime: number;
  hull: number;
}

export const MISSILES: Record<Team, MissileSpec> = {
  player: { startSpeed: 60, maxSpeed: 390, accel: 300, turnRate: 4.6, life: 6, damage: 75, splash: 24, armTime: 0.25, hull: 999 },
  enemy: { startSpeed: 40, maxSpeed: 250, accel: 150, turnRate: 1.6, life: 7, damage: 22, splash: 12, armTime: 0.4, hull: 8 },
};

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTY: Record<Difficulty, { enemyDamage: number; enemyAim: number; label: string }> = {
  easy: { enemyDamage: 0.55, enemyAim: 0.7, label: 'Cadet' },
  normal: { enemyDamage: 1, enemyAim: 1, label: 'Pilot' },
  hard: { enemyDamage: 1.45, enemyAim: 1.2, label: 'Ace' },
};

export interface WaveGroup {
  kind: 'razor' | 'maul';
  count: number;
  delay: number;
}
export interface WaveDef {
  name: string;
  groups: WaveGroup[];
}

export const WAVES: WaveDef[] = [
  // A warm-up: two fighters, then two more once the player has had a moment with the controls.
  { name: 'First Contact', groups: [{ kind: 'razor', count: 2, delay: 0 }, { kind: 'razor', count: 2, delay: 14 }] },
  {
    name: 'Hammerfall',
    groups: [
      { kind: 'razor', count: 3, delay: 0 },
      { kind: 'maul', count: 2, delay: 5 },
      { kind: 'razor', count: 2, delay: 14 },
    ],
  },
  {
    name: 'Swarm',
    groups: [
      { kind: 'razor', count: 4, delay: 0 },
      { kind: 'maul', count: 2, delay: 4 },
      { kind: 'razor', count: 3, delay: 13 },
      { kind: 'maul', count: 1, delay: 18 },
    ],
  },
];

export const ARENA = {
  radius: 3900,
  warnRadius: 3400,
  fieldRadius: 2500,
  fieldHalfThickness: 380,
  playerStart: new Vector3(0, 40, 1350),
  capitalPos: new Vector3(-100, 140, -650),
  /** Capital ship yaw so its broadside faces the field. */
  capitalYaw: 90 * DEG,
};

export const CAPITAL = {
  /** Model scale baked into leviathan.glb (CARRIER_SCALE in capital_ship.py): scales finale offsets. */
  scale: 1.35,
  shieldRadii: new Vector3(130, 125, 380),
  generatorHull: 380,
  generatorRadius: 20,
  turretRange: 1100,
  turretFireInterval: 0.22,
  turretBurst: 3,
  turretCooldown: 2.4,
  turretBoltSpeed: 560,
  turretDamage: 3,
  launchInterval: 22,
  maxEscorts: 4,
};

export const RADAR_RANGE = 2400;
