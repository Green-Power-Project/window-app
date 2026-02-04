const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  // Disable in dev to avoid GenerateSW multiple calls and chunk 404s from wrong precache
  disable: process.env.NODE_ENV === 'development' || process.env.DISABLE_PWA === 'true',
  runtimeCaching: [],
  buildExcludes: [/middleware-manifest\.json$/],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Redirect /project (no id) to dashboard so links and refreshes don't 404
  async redirects() {
    return [{ source: '/project', destination: '/dashboard', permanent: false }];
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

