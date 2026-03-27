/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static file in /public — avoids rewriting to app/icon.svg (metadata route), which can 500 in dev.
  async redirects() {
    return [
      {
        source: '/favicon.ico',
        destination: '/favicon.svg',
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
