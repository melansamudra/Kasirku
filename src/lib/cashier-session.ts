import { cookies } from "next/headers";

// This is a lightweight, app-level "who's holding the device" marker — not
// a security boundary. The real access-control boundary is the owner's
// Supabase Auth session (checked by RLS on every query). A cashier can't
// see or touch another business's data no matter what this cookie says.
export type CashierSession = {
  cashierId: string;
  businessId: string;
  name: string;
  role: "kasir" | "manajer";
};

const COOKIE_NAME = "kasirku_cashier_session";

export async function getCashierSession(
  businessId: string,
): Promise<CashierSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as CashierSession;
    if (session.businessId !== businessId) return null;
    return session;
  } catch {
    return null;
  }
}

export async function setCashierSession(session: CashierSession) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // ~12 hours, roughly a shift
  });
}

export async function clearCashierSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
