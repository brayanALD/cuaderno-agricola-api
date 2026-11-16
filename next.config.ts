import type { NextConfig } from 'next';

// Sin `cacheComponents`: con esa opción Next no admite `export const runtime = "nodejs"`,
// que la especificación (sección 9) y AGENTS.md exigen en cada ruta.
const nextConfig: NextConfig = {};

export default nextConfig;
