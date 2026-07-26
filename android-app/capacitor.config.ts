import type { CapacitorConfig } from '@capacitor/cli';

// server.url points the WebView straight at the live site instead of bundling
// a local copy — Kasirku is Server-Actions-heavy and isn't statically
// exportable, so there's no meaningful "webDir" build to ship. www/ is a
// placeholder Capacitor requires but never actually shows.
const config: CapacitorConfig = {
  appId: 'id.createimpact.kasirku',
  appName: 'Kasirku',
  webDir: 'www',
  server: {
    // Straight to login, not the public marketing homepage — this app is
    // for cashiers who already have an account, not for browsing the site.
    // Once logged in, normal in-app navigation reaches everything else
    // (Settings, Reports, etc.) exactly like the web version.
    url: 'https://createimpact.id/login',
    allowNavigation: ['createimpact.id', '*.createimpact.id'],
  },
};

export default config;
