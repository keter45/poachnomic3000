import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // build autocontido (.next/standalone) que o app desktop (Electron) roda por dentro
  output: "standalone",
  // o better-sqlite3 escolhe o binário nativo em tempo de execução; o tracing não enxerga esse require dinâmico
  outputFileTracingIncludes: {
    "/*": ["./node_modules/better-sqlite3/prebuilds/**/*", "./node_modules/better-sqlite3/lib/**/*"],
  },
  outputFileTracingExcludes: {
    "/*": [
      // banco local de dev (tem chaves e dados): nunca pode ir para o build
      "./data/**/*",
      // sharp só serve ao next/image, que o app não usa
      "./node_modules/sharp/**/*",
      "./node_modules/@img/**/*",
    ],
  },
  images: { unoptimized: true },
};

export default nextConfig;
