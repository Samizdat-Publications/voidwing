import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: '127.0.0.1', port: 5173 },
  // Pre-bundle every three.js entry point up front so the dev server never re-optimises
  // mid-session (which answers stale module requests with 504s).
  optimizeDeps: {
    include: [
      'three',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/postprocessing/EffectComposer.js',
      'three/examples/jsm/postprocessing/RenderPass.js',
      'three/examples/jsm/postprocessing/UnrealBloomPass.js',
      'three/examples/jsm/postprocessing/OutputPass.js',
    ],
  },
  preview: { host: '127.0.0.1', port: 4173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
