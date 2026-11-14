/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the built dist/ also loads from disk in the desktop app.
  base: './',
  // Several tests run whole seasons or many live snaps; under the full parallel run they sit near vitest's 5 s default.
  test: { testTimeout: 20_000 },
});
