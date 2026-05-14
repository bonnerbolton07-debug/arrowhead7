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
  // The ffmpeg / ffprobe installer packages bundle platform-specific binaries
  // via dynamic requires that webpack can't statically resolve. Keep them
  // external so they're loaded at runtime from node_modules instead of being
  // pulled into the webpack graph.
  experimental: {
    serverComponentsExternalPackages: ['@ffmpeg-installer/ffmpeg', '@ffprobe-installer/ffprobe'],
  },
  // Force Vercel to include the ffmpeg/ffprobe binaries in the Lambda bundle.
  // Without this, output-file-tracing misses the dynamically-resolved binary
  // paths and the Lambda throws ENOENT at runtime.
  outputFileTracingIncludes: {
    '/api/style-dna/analyze': [
      './node_modules/@ffmpeg-installer/**/*',
      './node_modules/@ffprobe-installer/**/*',
    ],
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
