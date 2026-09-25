import { HalfFloatType, PerspectiveCamera, Scene, Vector2, WebGLRenderTarget, WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * Scene -> HDR (half float, MSAA) -> bloom -> tone mapping + sRGB output.
 * Emissive materials above the threshold (lasers, engines, trails, explosions) bloom.
 */
export class PostFX {
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  enabled = true;
  private flashAmount = 0;
  private readonly baseExposure: number;

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
  ) {
    const size = renderer.getSize(new Vector2());
    const target = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    // High threshold: only emissive light (lasers, engines, trails, fire) blooms, not lit hulls.
    this.bloom = new UnrealBloomPass(new Vector2(size.x, size.y), 0.75, 0.45, 1.6);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.baseExposure = renderer.toneMappingExposure;
  }

  setSize(w: number, h: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
  }

  /** MSAA samples for the HDR scene buffers (0 turns multisampling off). */
  setSamples(n: number): void {
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (rt.samples === n) continue;
      rt.samples = n;
      // Disposing drops the GL buffers; they are rebuilt with the new sample count on next use.
      rt.dispose();
    }
  }

  /** Brief exposure and bloom kick for the carrier's final blast (0..1, decays in about 0.6 s). */
  flash(amount: number): void {
    this.flashAmount = Math.max(this.flashAmount, amount);
  }

  render(dt: number): void {
    if (this.flashAmount > 0) {
      this.flashAmount = Math.max(0, this.flashAmount - dt * 1.6);
      const f = this.flashAmount * this.flashAmount;
      this.renderer.toneMappingExposure = this.baseExposure * (1 + f * 0.7);
      this.bloom.strength = 0.75 + f * 1.1;
    } else {
      this.renderer.toneMappingExposure = this.baseExposure;
      this.bloom.strength = 0.75;
    }
    if (this.enabled) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
