// Not DB-driven on purpose: fastest to ship, revisit if pricing needs to
// change without a deploy. ALL prices are FINAL (set by Melan 2026-07-17).
export type PlanCode = "yearly" | "lifetime" | "finance_yearly" | "starter_yearly";

// "full"    = Kasir/POS + Akuntansi + SDM bundled (the original product).
// "finance" = Akuntansi/SDM only, for businesses that already have their own
//             POS and don't need (or shouldn't see) the Operasional nav.
// "starter" = POS + COGS/Bahan Baku + Laporan Penjualan only (low-budget).
export type PlanFamily = "full" | "finance" | "starter";

export type Plan = {
  code: PlanCode;
  name: string;
  kind: "subscription" | "lifetime";
  periodDays: number | null; // null = lifetime, never expires
  price: number;
  family: PlanFamily;
};

export const PLANS: Plan[] = [
  { code: "yearly", name: "Langganan Tahunan", kind: "subscription", periodDays: 365, price: 3499000, family: "full" },
  { code: "lifetime", name: "Sekali Bayar (Lifetime)", kind: "lifetime", periodDays: null, price: 766000, family: "full" },
  { code: "finance_yearly", name: "Finance Only — Tahunan", kind: "subscription", periodDays: 365, price: 1299000, family: "finance" },
  { code: "starter_yearly", name: "Starter — Tahunan", kind: "subscription", periodDays: 365, price: 2199000, family: "starter" },
];

export function getPlan(code: string): Plan | undefined {
  return PLANS.find((p) => p.code === code);
}

export function isFinancePlan(code: string | null): boolean {
  if (!code) return false;
  return getPlan(code)?.family === "finance";
}

export function isStarterPlan(code: string | null): boolean {
  if (!code) return false;
  return getPlan(code)?.family === "starter";
}
