"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CreatePayslipResult } from "../actions";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

type PreviewData = {
  salaryType: "harian" | "bulanan";
  monthlyRate: number;
  dailyRate: number;
  hariKerjaEfektif: number;
  hadirCount: number;
  sakitCount: number;
  izinCount: number;
  izinUnnotedCount: number;
  izinUnnotedWeekendCount: number;
  lateCount: number;
  basePay: number;
  mealAllowance: number;
  attendanceAllowance: number;
  transportAllowance: number;
  izinDeduction: number;
  izinWeekendPenalty: number;
  lateDeduction: number;
  tunjanganTetap: { label: string; amount: number }[];
};

export default function CreateSlipButton({
  businessId,
  lemburRate,
  defaultHours = 0,
  action,
  preview,
}: {
  businessId: string;
  lemburRate: number;
  defaultHours?: number;
  action: (lemburHours: number) => Promise<CreatePayslipResult>;
  preview: PreviewData;
}) {
  const router = useRouter();
  const [lemburHours, setLemburHours] = useState(defaultHours > 0 ? String(defaultHours) : "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const lemburPreview = (Number(lemburHours) || 0) * lemburRate;
  const tunjanganTetapTotal = preview.tunjanganTetap.reduce((s, a) => s + a.amount, 0);
  const totalPendapatan =
    preview.basePay + preview.mealAllowance + preview.attendanceAllowance + preview.transportAllowance + lemburPreview + tunjanganTetapTotal;
  const totalPotongan = preview.izinDeduction + preview.izinWeekendPenalty + preview.lateDeduction;
  const totalDiterima = totalPendapatan - totalPotongan;

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
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setShowPreview((v) => !v)}
        className="text-[11px] font-medium text-zinc-400 hover:text-brand-600 hover:underline"
      >
        {showPreview ? "Sembunyikan preview ▲" : "Lihat preview slip ▼"}
      </button>

      {showPreview && (
        <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-3 text-left text-xs">
          <div className="flex justify-between">
            <span className="text-zinc-600">
              {preview.salaryType === "bulanan"
                ? `Gaji Pokok (${preview.hadirCount + preview.sakitCount + preview.izinCount} hari x ${formatRupiah(preview.monthlyRate / preview.hariKerjaEfektif)})`
                : `Gaji Pokok (${preview.hadirCount + preview.sakitCount + preview.izinCount} hari x ${formatRupiah(preview.dailyRate)})`}
            </span>
            <span className="font-medium text-zinc-900">{formatRupiah(preview.basePay)}</span>
          </div>
          {preview.mealAllowance > 0 && (
            <div className="mt-1 flex justify-between text-brand-700">
              <span>+ Uang Makan ({preview.hadirCount} hari)</span>
              <span>{formatRupiah(preview.mealAllowance)}</span>
            </div>
          )}
          {preview.attendanceAllowance > 0 && (
            <div className="mt-1 flex justify-between text-brand-700">
              <span>+ Tunjangan Kehadiran ({preview.hadirCount} hari)</span>
              <span>{formatRupiah(preview.attendanceAllowance)}</span>
            </div>
          )}
          {preview.transportAllowance > 0 && (
            <div className="mt-1 flex justify-between text-brand-700">
              <span>+ Transport ({preview.hadirCount} hari)</span>
              <span>{formatRupiah(preview.transportAllowance)}</span>
            </div>
          )}
          {lemburPreview > 0 && (
            <div className="mt-1 flex justify-between text-brand-700">
              <span>+ Lembur ({lemburHours} jam)</span>
              <span>{formatRupiah(lemburPreview)}</span>
            </div>
          )}
          {preview.tunjanganTetap.map((a, i) => (
            <div key={i} className="mt-1 flex justify-between text-brand-700">
              <span>+ {a.label}</span>
              <span>{formatRupiah(a.amount)}</span>
            </div>
          ))}
          {preview.izinDeduction > 0 && (
            <div className="mt-1 flex justify-between text-red-500">
              <span>
                − Potongan Izin
                {preview.izinUnnotedCount > 0 ? ` Tanpa Keterangan (${preview.izinUnnotedCount}x hari)` : ""}
              </span>
              <span>{formatRupiah(preview.izinDeduction)}</span>
            </div>
          )}
          {preview.izinWeekendPenalty > 0 && (
            <div className="mt-1 flex justify-between text-red-500">
              <span>− Denda Izin Weekend/Tanggal Merah ({preview.izinUnnotedWeekendCount}x hari)</span>
              <span>{formatRupiah(preview.izinWeekendPenalty)}</span>
            </div>
          )}
          {preview.lateDeduction > 0 && (
            <div className="mt-1 flex justify-between text-red-500">
              <span>− Potongan Keterlambatan ({preview.lateCount}x)</span>
              <span>{formatRupiah(preview.lateDeduction)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t border-dashed border-zinc-300 pt-2 font-bold text-zinc-900">
            <span>Estimasi Total Diterima</span>
            <span>{formatRupiah(totalDiterima)}</span>
          </div>
          <p className="mt-1.5 text-[10px] text-zinc-400">
            Ini masih preview, belum tersimpan. THR/kasbon/potongan lain bisa ditambah di halaman slip
            setelah dibuat.
          </p>
        </div>
      )}

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
    </div>
  );
}
