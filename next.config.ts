import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**.backblazeb2.com' }],
  },
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
};

export default nextConfig;
