const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' }, // o painel nao pode ser embutido em outros sites
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: '300mb' } },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/download/version.json', headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }] },
      { source: '/download/:file*.apk', headers: [{ key: 'Content-Type', value: 'application/vnd.android.package-archive' }, { key: 'Content-Disposition', value: 'attachment; filename="YesDoohPlayer.apk"' }] },
    ];
  },
};
export default nextConfig;
