import {
  ACESFilmicToneMapping,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
} from 'three';

/** Owns the WebGL renderer, the scene and the main camera. */
export class Engine {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  width = 1;
  height = 1;
  pixelRatio = 1;
  private readonly resizeListeners: Array<(w: number, h: number) => void> = [];

  constructor(readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.domElement.id = 'game-canvas';
    // Shader diagnostics only with ?debug: ANGLE's D3D compiler reports harmless constant-folding
    // notes for three's built-in chunks, which three would print as console warnings.
    this.renderer.debug.checkShaderErrors = new URLSearchParams(location.search).has('debug');
    container.appendChild(this.renderer.domElement);
    this.camera = new PerspectiveCamera(72, 1, 1, 60000);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  onResize(fn: (w: number, h: number) => void): void {
    this.resizeListeners.push(fn);
  }

  resize(): void {
    this.width = Math.max(1, this.container.clientWidth);
    this.height = Math.max(1, this.container.clientHeight);
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    for (const fn of this.resizeListeners) fn(this.width, this.height);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
