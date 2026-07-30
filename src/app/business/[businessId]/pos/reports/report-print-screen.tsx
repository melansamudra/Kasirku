"use client";

import { useState } from "react";
import Link from "next/link";
import ReportPrintButtons from "../../report-print-buttons";
import {
  getPeriodRange,
  PERIOD_LABELS,
  PERIOD_DESCRIPTIONS,
  type Period,
} from "../../(dashboard)/reports/period";

const QUICK_PERIODS: Period[] = ["today", "week", "month", "all"];

export default function ReportPrintScreen({
  businessId,
  businessName,
}: {
  businessId: string;
  businessName: string;
}) {
  const [period, setPeriod] = useState<Period>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const { fromIso, toIsoExclusive } = getPeriodRange(period, customFrom, customTo);
  const periodLabel =
    period === "custom" && customFrom
      ? `${customFrom}${customTo && customTo !== customFrom ? ` s/d ${customTo}` : ""}`
      : PERIOD_DESCRIPTIONS[period];

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6">
      <div className="mb-5 flex items-center gap-3">
        <Link
          href={`/business/${businessId}/pos`}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-sm text-zinc-500 hover:bg-zinc-200"
        >
          ←
        </Link>
        <div>
          <h1 className="text-sm font-bold text-zinc-900">Cetak Laporan</h1>
          <p className="text-xs text-zinc-500">{businessName}</p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <p className="mb-2 text-xs font-medium text-zinc-500">Pilih periode</p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                period === p
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPeriod("custom")}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              period === "custom"
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {PERIOD_LABELS.custom}
          </button>
        </div>

        {period === "custom" && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] text-zinc-500">Dari tanggal</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-2 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-zinc-500">Sampai tanggal</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-2 text-xs"
              />
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-zinc-100 pt-4">
          {period === "custom" && !customFrom ? (
            <p className="text-center text-xs text-zinc-400">Pilih tanggal dulu di atas.</p>
          ) : (
            <ReportPrintButtons
              businessId={businessId}
              fromIso={fromIso}
              toIsoExclusive={toIsoExclusive}
              periodLabel={periodLabel}
            />
          )}
        </div>
      </div>

      <p className="mt-4 text-[11px] text-zinc-400">
        Cetak otomatis ke printer yang ditandai &quot;cetak struk pelanggan&quot; di Pengaturan.
      </p>
    </div>
  );
}
