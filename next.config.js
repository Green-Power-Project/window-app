// Only cache same-origin **non-navigation** requests. If `request.mode === 'navigate'`
// is included, Workbox NetworkFirst can throw `no-response` (dev server, slow HTML, HMR)
// when there is no cache entry yet — breaking full page loads.
const runtimeCachingSameOriginOnly = [
  {
    urlPattern: ({ request, url }) => {
      if (url.origin !== self.location.origin) return false;
      if (request.mode === 'navigate') return false;
      return true;
    },
    handler: 'NetworkFirst',
    options: {
      cacheName: 'same-origin',
      expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
      networkTimeoutSeconds: 10,
    },
  },
];

// In dev, next-pwa is disabled; do NOT commit public/sw.js or workbox-*.js (see .gitignore).
// If they exist from an old `next build`, stale SW intercepts /_next/static/* and causes ChunkLoadError.
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development' || process.env.DISABLE_PWA === 'true',
  runtimeCaching: runtimeCachingSameOriginOnly,
  buildExcludes: [/middleware-manifest\.json$/, /app-build-manifest\.json$/],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Redirect /project (no id) to dashboard so links and refreshes don't 404
  async redirects() {
    return [{ source: '/project', destination: '/dashboard', permanent: false }];
  },
  // Serve empty source maps for PWA scripts to avoid 404 in console (browser requests .map)
  async rewrites() {
    return [
      // Before static `public/` — customer app (3001) can load PDFs stored under admin-app `public/uploads` (3000).
      { source: '/uploads/:path*', destination: '/api/uploads-proxy/:path*' },
      { source: '/sw.js.map', destination: '/api/empty-map' },
      { source: '/workbox-:hash.js.map', destination: '/api/empty-map' },
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

