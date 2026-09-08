import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  experimental: {
    // Limit prerendering/static-generation concurrency during `next build`.
    cpus: 4,
  },
  // Host browser + Playwright inside the compose network both hit the dev server.
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "frontend",
    "host.docker.internal",
  ],
};

export default nextConfig;
