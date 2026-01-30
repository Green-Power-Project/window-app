const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.DISABLE_PWA === 'true',
  // Disable offline functionality since it's not required
  runtimeCaching: [],
  buildExcludes: [/middleware-manifest\.json$/],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Ensure gallery API is never cached when deployed (CDN/edge/proxy)
  async headers() {
    return [
      {
        source: '/api/gallery/images',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, max-age=0, must-revalidate, s-maxage=0' },
          { key: 'CDN-Cache-Control', value: 'no-store' },
          { key: 'Vercel-CDN-Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
  // Improve chunk loading reliability
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      // Increase timeout for chunk loading in development
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
    return config;
  },
  // Add error handling for chunk loading
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
};

module.exports = withPWA(nextConfig);

