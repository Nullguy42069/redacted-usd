import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// App-layer security headers. The single most important one for a wallet UI is
// frame-ancestors 'none' — it stops any site from iframing us to overlay a fake
// "approve" on the user's real signing flow (clickjacking). object-src/base-uri/
// form-action close the classic injection escapes.
//
// connect-src/img-src are deliberately broad (https:/wss:) rather than an
// exhaustive endpoint allow-list: this app talks to many rotating RPC/price/
// bridge/IPFS hosts, and a too-tight list silently breaks a route on the next
// provider change. We DO forbid `unsafe-eval` (arbitrary string→code); the ZK
// prover only needs `wasm-unsafe-eval`, which is the narrow WASM-compile grant.
const CSP = [
  "default-src 'self'",
  // Next.js injects inline hydration scripts; snarkjs/zk-prover compiles WASM.
  // No 'unsafe-eval' (the dangerous one) — only wasm-unsafe-eval.
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
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
