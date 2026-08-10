import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Permet accedir al servidor de dev des d'altres dispositius de la xarxa local
  allowedDevOrigins: ['192.168.178.20'],
  // Assegura que el binari natiu de better-sqlite3 s'inclogui al standalone output
  outputFileTracingIncludes: {
    '/**': ['./node_modules/better-sqlite3/prebuilds/**'],
  },
};

export default nextConfig;
