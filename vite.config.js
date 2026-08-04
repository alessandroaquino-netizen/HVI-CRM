import { defineConfig } from 'vite';

export default defineConfig({
  // Exposes VITE_* variables from .env to the browser bundle.
  // Any variable NOT prefixed with VITE_ stays server-side only.
  build: {
    outDir: 'dist',
  },
});
