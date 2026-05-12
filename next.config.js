/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.cloudflarestream.com',
      },
      {
        protocol: 'https',
        hostname: '*.r2.cloudflarestorage.com',
      },
    ],
  },
  // TODO: Add Vercel-specific optimizations
  // TODO: Configure headers for Cloudflare Stream embeds
};

module.exports = nextConfig;
