// Placeholder prices — edit before going live. Not DB-driven on purpose:
// fastest to ship, revisit if pricing needs to change without a deploy.
export type PlanCode = "monthly" | "yearly" | "lifetime" | "finance_monthly" | "finance_yearly";

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
  { code: "monthly", name: "Langganan Bulanan", kind: "subscription", periodDays: 30, price: 99000, family: "full" },
  { code: "yearly", name: "Langganan Tahunan", kind: "subscription", periodDays: 365, price: 990000, family: "full" },
  { code: "lifetime", name: "Sekali Bayar (Lifetime)", kind: "lifetime", periodDays: null, price: 2500000, family: "full" },
  { code: "finance_monthly", name: "Finance Only — Bulanan", kind: "subscription", periodDays: 30, price: 49000, family: "finance" },
  { code: "finance_yearly", name: "Finance Only — Tahunan", kind: "subscription", periodDays: 365, price: 490000, family: "finance" },
];

export function getPlan(code: string): Plan | undefined {
  return PLANS.find((p) => p.code === code);
}

export function isFinancePlan(code: string | null): boolean {
  if (!code) return false;
  return getPlan(code)?.family === "finance";
}
