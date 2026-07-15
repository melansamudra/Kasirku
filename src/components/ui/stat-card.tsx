import type { LucideIcon } from "lucide-react";

export type StatTone = "brand" | "red" | "amber" | "blue" | "zinc";

const ICON_TONE: Record<StatTone, string> = {
  brand: "bg-brand-50 text-brand-600",
  red: "bg-red-50 text-red-600",
  amber: "bg-amber-50 text-amber-600",
  blue: "bg-blue-50 text-blue-600",
  zinc: "bg-zinc-100 text-zinc-500",
};

const VALUE_TONE: Record<StatTone, string> = {
  brand: "text-zinc-900",
  red: "text-red-600",
  amber: "text-zinc-900",
  blue: "text-zinc-900",
  zinc: "text-zinc-900",
};

// Shared stat tile used across dashboard/report pages — factored out of the
// pattern duplicated inline across (dashboard)/page.tsx's 4 stat cards, so
// the denser Akuntansi/SDM reskin (see plan Fase 8) has one place to style.
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "brand",
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  tone?: StatTone;
}) {
  return (
    <div className="rounded-xl bg-white shadow-sm p-4">
      {Icon && (
        <div
          className={`mb-2 flex h-7 w-7 items-center justify-center rounded-lg ${ICON_TONE[tone]}`}
        >
          <Icon className="h-[15px] w-[15px]" strokeWidth={2} aria-hidden="true" />
        </div>
      )}
      <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400">
        {label}
      </p>
      <p className={`text-xl font-bold ${VALUE_TONE[tone]}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[10.5px] text-zinc-400">{sub}</p>}
    </div>
  );
}
