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
  // Improve chunk loading reliability in dev (reduce ChunkLoadError on first open)
  webpack: (config, { dev, isServer }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    if (dev && !isServer) {
      // Fewer chunks in dev = faster first load, less chance of layout chunk timeout
      config.optimization = {
        ...config.optimization,
        splitChunks: false,
        removeAvailableModules: false,
        removeEmptyChunks: false,
      };
    }
    return config;
  },
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 4,
  },
};

module.exports = withPWA(nextConfig);

