import type { Difficulty } from '../game/config';
import type { GraphicsSetting } from '../render/Quality';

/** Everything the settings screen can change. Persisted per browser. */
export interface UserSettings {
  sensitivity: number;
  invertY: boolean;
  autoLevel: boolean;
  difficulty: Difficulty;
  graphics: GraphicsSetting;
  master: number;
  music: number;
  sfx: number;
}

export const DEFAULT_SETTINGS: UserSettings = {
  sensitivity: 1,
  invertY: false,
  autoLevel: true,
  difficulty: 'normal',
  graphics: 'auto',
  master: 0.8,
  music: 0.55,
  sfx: 0.85,
};

const KEY = 'voidwing.settings.v1';

/** Read saved settings; storage can be blocked (private mode, previews), so fall back quietly. */
export function loadSettings(): UserSettings {
  const s = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return s;
    const saved = JSON.parse(raw) as Partial<UserSettings>;
    if (typeof saved.sensitivity === 'number') s.sensitivity = Math.min(2, Math.max(0.3, saved.sensitivity));
    if (typeof saved.invertY === 'boolean') s.invertY = saved.invertY;
    if (typeof saved.autoLevel === 'boolean') s.autoLevel = saved.autoLevel;
    if (saved.difficulty === 'easy' || saved.difficulty === 'normal' || saved.difficulty === 'hard') s.difficulty = saved.difficulty;
    if (saved.graphics === 'auto' || saved.graphics === 'high' || saved.graphics === 'medium' || saved.graphics === 'low') s.graphics = saved.graphics;
    for (const k of ['master', 'music', 'sfx'] as const) {
      const v = saved[k];
      if (typeof v === 'number') s[k] = Math.min(1, Math.max(0, v));
    }
  } catch {
    // Keep defaults.
  }
  return s;
}

export function saveSettings(s: UserSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage unavailable: settings last for this session only.
  }
}
