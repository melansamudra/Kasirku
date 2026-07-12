// Placeholder prices — edit before going live. Not DB-driven on purpose:
// fastest to ship, revisit if pricing needs to change without a deploy.
export type PlanCode = "monthly" | "yearly" | "lifetime";

export type Plan = {
  code: PlanCode;
  name: string;
  kind: "subscription" | "lifetime";
  periodDays: number | null; // null = lifetime, never expires
  price: number;
};

export const PLANS: Plan[] = [
  { code: "monthly", name: "Langganan Bulanan", kind: "subscription", periodDays: 30, price: 99000 },
  { code: "yearly", name: "Langganan Tahunan", kind: "subscription", periodDays: 365, price: 990000 },
  { code: "lifetime", name: "Sekali Bayar (Lifetime)", kind: "lifetime", periodDays: null, price: 2500000 },
];

export function getPlan(code: string): Plan | undefined {
  return PLANS.find((p) => p.code === code);
}
