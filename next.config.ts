import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // El proxy emmagatzema el cos de les peticions; per defecte el talla a 10 MB,
  // i una BD importada més gran arribaria truncada.
  experimental: { proxyClientMaxBodySize: '200mb' },
  // Permet accedir al servidor de dev des d'altres dispositius de la xarxa local
  allowedDevOrigins: ['192.168.178.20'],
  // Assegura que el binari natiu de better-sqlite3 s'inclogui al standalone output
  outputFileTracingIncludes: {
    '/**': ['./node_modules/better-sqlite3/prebuilds/**'],
  },
};

export default nextConfig;
