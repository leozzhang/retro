import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the built dist/ also loads from disk in the desktop app.
  base: './',
});
