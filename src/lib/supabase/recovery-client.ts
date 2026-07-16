import { createClient } from "@supabase/supabase-js";

// @supabase/ssr's createBrowserClient hardcodes flowType: "pkce" (no way to
// override it — see node_modules/@supabase/ssr/dist/main/createBrowserClient.js).
// PKCE requires the code_verifier generated when resetPasswordForEmail() was
// called to still be present in the SAME browser when the link is opened —
// which breaks the moment a recovery email is opened in a different browser,
// device, or in-app email client webview than the one that requested the
// reset. Password recovery specifically needs to work across that gap, so
// forgot-password/page.tsx and reset-password/page.tsx use this plain
// (non-SSR) client instead, forced to the classic implicit/hash-token flow —
// the resulting email link carries #access_token=...&type=recovery directly,
// no code_verifier needed on either end. Not shared with the rest of the
// app's cookie-based session (login/signup/dashboard) on purpose.
export function createRecoveryClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { flowType: "implicit", persistSession: false } },
  );
}
