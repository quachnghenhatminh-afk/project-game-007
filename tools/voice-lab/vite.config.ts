import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the build works inside itch.io's iframe sub-folder.
  base: './',
  server: { port: 5174 },
  resolve: { dedupe: ['three'] },
  // vosk-browser inlines its ~6MB WASM worker; that size is expected.
  build: { chunkSizeWarningLimit: 8000 },
});
