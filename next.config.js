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
  // Force Vercel to include the ffmpeg/ffprobe binaries in the Lambda bundle.
  // Without this, output-file-tracing misses the dynamically-resolved binary
  // paths and the Lambda throws ENOENT at runtime.
  serverExternalPackages: ['@ffmpeg-installer/ffmpeg', '@ffprobe-installer/ffprobe'],
  outputFileTracingIncludes: {
    '/api/style-dna/analyze': [
      './node_modules/@ffmpeg-installer/**/*',
      './node_modules/@ffprobe-installer/**/*',
    ],
    '/api/style-dna/match': [
      './node_modules/@ffmpeg-installer/**/*',
      './node_modules/@ffprobe-installer/**/*',
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externals = Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean);
      externals.push({
        '@ffmpeg-installer/ffmpeg': 'commonjs @ffmpeg-installer/ffmpeg',
        '@ffprobe-installer/ffprobe': 'commonjs @ffprobe-installer/ffprobe',
      });
      config.externals = externals;
    }
    return config;
  },
};

module.exports = nextConfig;
