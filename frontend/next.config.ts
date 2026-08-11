import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Host browser + Playwright inside the compose network both hit the dev server.
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "frontend",
    "host.docker.internal",
  ],
};

export default nextConfig;
