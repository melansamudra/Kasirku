export type PillTone = "green" | "red" | "amber" | "blue" | "zinc";

const TONE_CLASSES: Record<PillTone, string> = {
  green: "bg-brand-50 text-brand-700",
  red: "bg-red-50 text-red-600",
  amber: "bg-amber-50 text-amber-700",
  blue: "bg-blue-50 text-blue-700",
  zinc: "bg-zinc-100 text-zinc-600",
};

// Shared small status/type pill — consolidates the STATUS_BADGE-style
// Record<string, string> maps duplicated across admin/page.tsx,
// billing/page.tsx, etc. New Akuntansi/SDM pages (Fase 8 reskin) should use
// this instead of inlining another one-off tone map.
export function PillBadge({
  children,
  tone = "zinc",
}: {
  children: React.ReactNode;
  tone?: PillTone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
