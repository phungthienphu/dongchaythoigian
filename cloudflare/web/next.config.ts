import type { NextConfig } from 'next';

// This app has only the public homepage and metadata. The original app keeps
// its API/dev routes and its normal Next build throughout the migration.
const config: NextConfig = {
  output: 'export',
  poweredByHeader: false,
};
export default config;
