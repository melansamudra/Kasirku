"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PersonalLoanDeductionForm({
  action,
  initialPersonalLoan,
  outstandingPersonalLoan,
}: {
  action: (personalLoanDeduction: number) => Promise<{ error: string | null }>;
  initialPersonalLoan: number;
  outstandingPersonalLoan: number;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(initialPersonalLoan > 0 ? String(initialPersonalLoan) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    setError(null);
    setPending(true);
    const result = await action(Number(amount) || 0);
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-xs font-semibold text-zinc-600">Potongan Pinjaman Pribadi</p>
      <p className="text-[11px] text-zinc-400">
        Cuma mengurangi Total Diterima di slip ini — tidak menyentuh kas/jurnal (beda dari Kasbon).
      </p>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-[10px] text-zinc-500">Potongan Pinjaman Pribadi (Rp)</label>
          <span className="text-[10px] text-zinc-400">
            Sisa pinjaman: Rp{outstandingPersonalLoan.toLocaleString("id-ID")}
          </span>
        </div>
        <input
          type="number"
          min="0"
          max={outstandingPersonalLoan}
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "Simpan Potongan Pinjaman Pribadi"}
      </button>
    </div>
  );
}
