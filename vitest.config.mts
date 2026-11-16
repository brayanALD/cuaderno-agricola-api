import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/services/**/*.ts', 'src/lib/**/*.ts', 'src/schemas/**/*.ts'],
      // Adaptadores delgados que solo se pueden probar con Firebase o Blob reales (D58): se verifican con
      // el emulador (`scripts/humo.mjs`) o desplegado. `puertos.ts` solo trae tipos.
      exclude: [
        'src/lib/firebase/admin.ts',
        'src/lib/firebase/almacenFirestore.ts',
        'src/lib/blob/**',
        'src/lib/dependencias.ts',
        'src/lib/api.ts',
        'src/lib/puertos.ts',
      ],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
