import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the build works inside itch.io's iframe sub-folder.
  base: './',
  server: { port: 5173, host: true }, // host: true → reachable from a phone on the same Wi-Fi
  preview: { port: 4173, host: true },
  // vosk-browser inlines its ~6MB WASM worker; that size is expected.
  build: { chunkSizeWarningLimit: 8000 },
});
