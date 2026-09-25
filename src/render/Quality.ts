/** Render quality presets, and the frame-time watcher behind the Auto graphics setting. */
export type QualityLevel = 'high' | 'medium' | 'low';
export type GraphicsSetting = 'auto' | QualityLevel;

export interface QualityPreset {
  label: string;
  /** Cap on the device pixel ratio; below 1 renders under the native resolution. */
  maxPixelRatio: number;
  /** MSAA samples for the HDR scene buffers (0 turns multisampling off). */
  samples: number;
}

export const QUALITY: Record<QualityLevel, QualityPreset> = {
  high: { label: 'High', maxPixelRatio: 1.5, samples: 4 },
  medium: { label: 'Medium', maxPixelRatio: 1, samples: 2 },
  low: { label: 'Low', maxPixelRatio: 0.75, samples: 0 },
};

const ORDER: QualityLevel[] = ['high', 'medium', 'low'];
/** Frames per judgement: about 2.5 s at 60 fps. */
const WINDOW = 150;
/** A median frame slower than this (about 54 fps) steps quality down. */
const SLOW_MS = 18.5;

/**
 * Auto mode starts at High. While the player is flying it keeps a window of frame times, and when
 * the median frame of a window is slower than about 54 fps it steps down one level. It never
 * steps back up on its own, so it cannot oscillate; the player can always pick a level in
 * Settings. The median ignores one-off spikes such as a tab switch or a garbage collection.
 */
export class AdaptiveQuality {
  level: QualityLevel;
  private setting: GraphicsSetting;
  private readonly frames: number[] = [];
  /** Seconds to ignore after a change, while the new buffers settle. */
  private settle = 2;

  constructor(setting: GraphicsSetting) {
    this.setting = setting;
    this.level = setting === 'auto' ? 'high' : setting;
  }

  get auto(): boolean {
    return this.setting === 'auto';
  }

  /** Apply a Settings choice. Returns the level to render at. */
  choose(setting: GraphicsSetting): QualityLevel {
    if (setting !== this.setting) {
      this.setting = setting;
      this.level = setting === 'auto' ? 'high' : setting;
      this.frames.length = 0;
      this.settle = 2;
    }
    return this.level;
  }

  /** Feed one frame of flight. Returns the new level when Auto steps down, otherwise null. */
  sample(frameMs: number, dt: number): QualityLevel | null {
    if (this.setting !== 'auto') return null;
    if (this.settle > 0) {
      this.settle -= dt;
      return null;
    }
    this.frames.push(frameMs);
    if (this.frames.length < WINDOW) return null;
    const sorted = this.frames.slice().sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    this.frames.length = 0;
    const i = ORDER.indexOf(this.level);
    if (median <= SLOW_MS || i >= ORDER.length - 1) return null;
    this.level = ORDER[i + 1];
    this.settle = 1.5;
    return this.level;
  }
}
