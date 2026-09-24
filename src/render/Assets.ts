import { Group, type Object3D } from 'three';
import type { AsteroidVariant } from '../game/Asteroids';
import type { CapitalLayout } from '../game/CapitalShip';
import {
  greyAsteroidVariants,
  greyCapitalLayout,
  greyGenerator,
  greyKestrel,
  greyLeviathan,
  greyMaul,
  greyMissile,
  greyRazor,
  greyTurret,
} from './Greybox';

export type ModelName = 'kestrel' | 'razor' | 'maul' | 'missile' | 'leviathan' | 'generator' | 'turret';

/** Model registry. Milestone 1 serves primitive stand-ins. */
export class Assets {
  private readonly layout: CapitalLayout = greyCapitalLayout();
  private asteroidCache: AsteroidVariant[] | null = null;

  async load(onProgress?: (fraction: number) => void): Promise<void> {
    onProgress?.(1);
  }

  model(name: ModelName, variant?: 'wingman'): Object3D {
    switch (name) {
      case 'kestrel':
        return greyKestrel(variant === 'wingman' ? 0x5a8cff : 0x39d5ff);
      case 'razor':
      case 'maul': {
        // Enemies are drawn a size up for readability at dogfight range.
        const m = name === 'razor' ? greyRazor() : greyMaul();
        const wrap = new Group();
        m.scale.setScalar(1.4);
        wrap.add(m);
        return wrap;
      }
      case 'missile':
        return greyMissile();
      case 'leviathan':
        return greyLeviathan(this.layout);
      case 'generator':
        return greyGenerator();
      case 'turret':
        return greyTurret();
    }
  }

  capitalLayout(): CapitalLayout {
    return this.layout;
  }

  asteroidVariants(): AsteroidVariant[] {
    return (this.asteroidCache ??= greyAsteroidVariants());
  }
}
