import { cookies } from "next/headers";

// Sama filosofi dengan cashier-session.ts: lapisan ringan "siapa yang pegang
// device sekarang", BUKAN boundary keamanan (yang sebenarnya adalah slug
// portal + RPC security-definer di database). Sengaja cookie TERPISAH dari
// kasir (nama beda) -- staf lokasi bukan kasir/manajer/pelayan, dan
// mekanisme ini murni buat portal Kirim/Terima Barang/Stok Opname.
export type ProductionSession = {
  employeeId: string;
  businessId: string;
  locationId: string;
  name: string;
};

const COOKIE_NAME = "kasirku_portal_session";

export async function getProductionSession(
  businessId: string,
  locationId: string,
): Promise<ProductionSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as ProductionSession;
    if (session.businessId !== businessId || session.locationId !== locationId) return null;
    return session;
  } catch {
    return null;
  }
}

export async function setProductionSession(session: ProductionSession) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // ~12 jam, kira-kira 1 shift
  });
}

export async function clearProductionSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
