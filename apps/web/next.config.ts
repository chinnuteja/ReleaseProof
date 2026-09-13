import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@releaseproof/contracts', '@releaseproof/core'],
  serverExternalPackages: ['better-sqlite3']
};

export default nextConfig;
