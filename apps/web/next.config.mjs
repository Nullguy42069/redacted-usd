import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    optimizePackageImports: ["@mui/material", "@mui/icons-material"],
  },
  // Pin the workspace root so Turbopack doesn't pick up /Users/anne/package-lock.json.
  turbopack: {
    root: resolve(__dirname, "../.."),
  },
  // @arcium-hq/client imports `fs` at module top for its uploadCircuit helper
  // (server-only). Stub it out for the browser bundle.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false,
        path: false,
        os: false,
      };
    }
    return config;
  },
};

export default nextConfig;
