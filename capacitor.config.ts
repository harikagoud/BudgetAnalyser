import type { CapacitorConfig } from '@capacitor/cli';

// Static Next.js export (npm run build:mobile -> ./.next-mobile) bundled into the app.
// API calls go to NEXT_PUBLIC_API_BASE, baked in at build time.
//
// androidScheme "http" + cleartext are for LOCAL DEVICE TESTING against the
// dev server on your LAN (plain HTTP). A Play Store build must point at an
// HTTPS backend; switch androidScheme to "https" and drop cleartext then.
const config: CapacitorConfig = {
  appId: 'com.budgetanalyser.app',
  appName: 'Budget Analyser',
  webDir: '.next-mobile',
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
};

export default config;
