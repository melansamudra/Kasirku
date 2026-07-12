// Resolves to a real URL in every environment: an explicit override, then
// Vercel's own production domain env var, then localhost for local dev.
const rawUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : null) ||
  "http://localhost:3000";

export const SITE_URL = rawUrl.replace(/\/$/, "");
