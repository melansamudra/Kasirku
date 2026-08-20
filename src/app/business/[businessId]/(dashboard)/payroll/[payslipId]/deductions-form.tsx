"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type LateMode = "unit" | "harian";
type LateUnit = "menit" | "jam";

export default function DeductionsForm({
  action,
  initialLate,
  initialKasbon,
  outstandingKasbon,
}: {
  action: (lateDeduction: number, kasbonDeduction: number) => Promise<{ error: string | null }>;
  initialLate: number;
  initialKasbon: number;
  outstandingKasbon: number;
}) {
  const router = useRouter();
  const [late, setLate] = useState(initialLate > 0 ? String(initialLate) : "");
  const [kasbon, setKasbon] = useState(initialKasbon > 0 ? String(initialKasbon) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [showCalc, setShowCalc] = useState(false);
  const [lateMode, setLateMode] = useState<LateMode>("unit");
  const [lateUnit, setLateUnit] = useState<LateUnit>("menit");
  const [lateQty, setLateQty] = useState("");
  const [lateRate, setLateRate] = useState("");

  const calcResult = (Number(lateQty) || 0) * (Number(lateRate) || 0);

  async function handleSubmit() {
    setError(null);
    setPending(true);
    const result = await action(Number(late) || 0, Number(kasbon) || 0);
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-xs font-semibold text-zinc-600">Potongan Keterlambatan &amp; Kasbon</p>

      <div>
        <label className="mb-1 block text-[10px] text-zinc-500">Potongan Keterlambatan (Rp)</label>
        <input
          type="number"
          min="0"
          step="1"
          value={late}
          onChange={(e) => setLate(e.target.value)}
          placeholder="0"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="button"
          onClick={() => setShowCalc((v) => !v)}
          className="mt-1 text-[11px] font-medium text-brand-600 hover:underline"
        >
          {showCalc ? "Tutup kalkulator" : "Bantu hitung dari menit/jam/hari terlambat"}
        </button>

        {showCalc && (
          <div className="mt-2 space-y-2 rounded-lg border border-zinc-200 bg-white p-2.5">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setLateMode("unit")}
                className={`rounded-lg border-2 py-1.5 text-[11px] font-semibold transition-colors ${
                  lateMode === "unit"
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-zinc-200 bg-white text-zinc-600"
                }`}
              >
                Per Menit/Jam
              </button>
              <button
                type="button"
                onClick={() => setLateMode("harian")}
                className={`rounded-lg border-2 py-1.5 text-[11px] font-semibold transition-colors ${
                  lateMode === "harian"
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-zinc-200 bg-white text-zinc-600"
                }`}
              >
                Per Hari (flat)
              </button>
            </div>

            {lateMode === "unit" && (
              <div className="flex gap-1.5">
                <select
                  value={lateUnit}
                  onChange={(e) => setLateUnit(e.target.value as LateUnit)}
                  className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
                >
                  <option value="menit">Menit</option>
                  <option value="jam">Jam</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={lateQty}
                  onChange={(e) => setLateQty(e.target.value)}
                  placeholder={`Jumlah ${lateUnit} terlambat`}
                  className="flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
                />
              </div>
            )}
            {lateMode === "harian" && (
              <input
                type="number"
                min="0"
                step="1"
                value={lateQty}
                onChange={(e) => setLateQty(e.target.value)}
                placeholder="Jumlah hari terlambat"
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
              />
            )}
            <input
              type="number"
              min="0"
              step="1"
              value={lateRate}
              onChange={(e) => setLateRate(e.target.value)}
              placeholder={
                lateMode === "unit" ? `Rate per ${lateUnit} (Rp)` : "Rate per hari (Rp)"
              }
              className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
            />

            <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-2.5 py-1.5">
              <span className="text-[11px] text-zinc-500">Hasil hitung</span>
              <span className="text-xs font-bold text-zinc-900">
                Rp{Math.round(calcResult).toLocaleString("id-ID")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setLate(String(Math.round(calcResult)));
                setShowCalc(false);
              }}
              disabled={calcResult <= 0}
              className="w-full rounded-lg bg-zinc-800 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Pakai Nominal Ini
            </button>
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-[10px] text-zinc-500">Potongan Kasbon (Rp)</label>
          <span className="text-[10px] text-zinc-400">
            Sisa kasbon: Rp{outstandingKasbon.toLocaleString("id-ID")}
          </span>
        </div>
        <input
          type="number"
          min="0"
          max={outstandingKasbon}
          step="1"
          value={kasbon}
          onChange={(e) => setKasbon(e.target.value)}
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
        {pending ? "Menyimpan…" : "Simpan Potongan"}
      </button>
    </div>
  );
}
