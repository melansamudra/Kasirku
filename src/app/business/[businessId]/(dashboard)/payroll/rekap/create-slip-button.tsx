"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CreatePayslipResult } from "../actions";

export default function CreateSlipButton({
  businessId,
  lemburRate,
  defaultHours = 0,
  action,
}: {
  businessId: string;
  lemburRate: number;
  defaultHours?: number;
  action: (lemburHours: number) => Promise<CreatePayslipResult>;
}) {
  const router = useRouter();
  const [lemburHours, setLemburHours] = useState(defaultHours > 0 ? String(defaultHours) : "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lemburPreview = (Number(lemburHours) || 0) * lemburRate;

  async function handleClick() {
    setError(null);
    setPending(true);
    const result = await action(Number(lemburHours) || 0);
    setPending(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    router.push(`/business/${businessId}/payroll/${result.payslipId}`);
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min="0"
          step="0.5"
          value={lemburHours}
          onChange={(e) => setLemburHours(e.target.value)}
          placeholder="Jam lembur"
          className="w-24 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        {Number(lemburHours) > 0 && (
          <span className="text-[10px] text-zinc-400">
            ≈ Rp{Math.round(lemburPreview).toLocaleString("id-ID")}
          </span>
        )}
      </div>
      <button
        onClick={handleClick}
        disabled={pending}
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Membuat…" : "Buat Slip"}
      </button>
      {error && <p className="w-full text-right text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
