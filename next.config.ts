import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  experimental: { serverActions: { allowedOrigins: ["localhost:3000", "fearsome-crematorium-p79pr65rwx4h554-3000.app.github.dev"] } },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
