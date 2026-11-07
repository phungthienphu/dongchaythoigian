import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep local integration QA independent of an already running game dev server.
  distDir: process.env.SYNC_QA === '1' ? '.next-sync-qa' : '.next',
};

export default nextConfig;
