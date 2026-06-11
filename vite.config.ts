import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base so the built app works from any static path
// (GitHub Pages subdirectory, file://, nginx subroute, etc.)
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    sourcemap: true,
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
