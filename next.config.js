/** @type {import('next').NextConfig} */
const securityHeaders = [
  // Block MIME-type sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Disable the browser's referrer except for same-origin
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disallow embedding in iframes (clickjacking)
  { key: 'X-Frame-Options', value: 'DENY' },
  // Force HTTPS for 2 years (preload after verification)
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  // Limit powerful browser APIs we don't use
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
