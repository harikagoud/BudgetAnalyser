const isMobile = process.env.BUILD_TARGET === 'mobile';

// Baseline security headers for the web build. CSP is intentionally NOT set
// yet: Next injects inline scripts and Recharts injects inline styles, so a
// correct policy needs nonce plumbing and browser verification first (see
// docs/PRODUCTION.md). HSTS is ignored over plain HTTP and only takes effect
// once served over HTTPS.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = isMobile
  ? {
      // Capacitor mobile build: a fully static bundle (served from the device)
      // that talks to a remote API (NEXT_PUBLIC_API_BASE). Static export can't
      // contain server code, so dropping "ts" from pageExtensions makes Next
      // ignore every route.ts (API routes) and middleware.ts for this build
      // only; all the app's pages are .tsx and are unaffected. The normal web
      // build/dev server (BUILD_TARGET unset) is unchanged.
      output: 'export',
      distDir: '.next-mobile', // keep the dev server's .next untouched
      trailingSlash: true,
      images: { unoptimized: true },
      pageExtensions: ['tsx', 'jsx'],
    }
  : {
      poweredByHeader: false,
      async headers() {
        return [{ source: '/:path*', headers: securityHeaders }];
      },
    };

export default nextConfig;
