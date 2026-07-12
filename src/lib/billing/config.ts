// Midtrans account is still pending business verification (2026-07-12) — until
// it's approved and a real Sandbox/Production test has succeeded, the
// "Bayar Sekarang" buttons just error out. Flip this back to false once that's
// confirmed working (see [[billing-midtrans]] in project memory); the Midtrans
// integration itself is untouched, this only controls what the billing page
// renders.
export const BILLING_MANUAL_MODE = true;

export const BILLING_CONTACT = {
  whatsapp: "6281234556757",
  email: "create2impact.id@gmail.com",
};
