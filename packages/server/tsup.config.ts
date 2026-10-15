import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  // The workspace package is TypeScript source; inline it so the bundle runs on plain Node.
  noExternal: ['@scrum-mate/shared'],
});
