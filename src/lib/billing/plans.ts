// Not DB-driven on purpose: fastest to ship, revisit if pricing needs to
// change without a deploy. ALL prices are FINAL (set by Melan 2026-07-17).
export type PlanCode = "monthly" | "yearly" | "lifetime" | "finance_monthly" | "finance_lifetime";

// "full" = Kasir/POS + Akuntansi + SDM bundled (the original product).
// "finance" = Akuntansi/SDM only, for businesses that already have their own
// POS and don't need (or shouldn't see) the Operasional nav — see
// isFinancePlan() below and its use in dashboard-shell.tsx's buildNavGroups.
export type PlanFamily = "full" | "finance";

export type Plan = {
  code: PlanCode;
  name: string;
  kind: "subscription" | "lifetime";
  periodDays: number | null; // null = lifetime, never expires
  price: number;
  family: PlanFamily;
};

export const PLANS: Plan[] = [
  { code: "monthly", name: "Langganan Bulanan", kind: "subscription", periodDays: 30, price: 88000, family: "full" },
  { code: "yearly", name: "Langganan Tahunan", kind: "subscription", periodDays: 365, price: 588000, family: "full" },
  { code: "lifetime", name: "Sekali Bayar (Lifetime)", kind: "lifetime", periodDays: null, price: 766000, family: "full" },
  { code: "finance_monthly", name: "Finance Only — Bulanan", kind: "subscription", periodDays: 30, price: 48000, family: "finance" },
  { code: "finance_lifetime", name: "Finance Only — Sekali Bayar", kind: "lifetime", periodDays: null, price: 488000, family: "finance" },
];

export function getPlan(code: string): Plan | undefined {
  return PLANS.find((p) => p.code === code);
}

export function isFinancePlan(code: string | null): boolean {
  if (!code) return false;
  return getPlan(code)?.family === "finance";
}
