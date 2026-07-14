"use client";

import Link from "next/link";
import { PERIOD_LABELS, PERIOD_COOKIE_NAME, type Period } from "./period";

const PERIOD_OPTIONS: Period[] = ["today", "week", "month", "all", "custom"];

// Menyimpan pilihan periode ke cookie saat diklik supaya halaman lain (yang
// juga pakai komponen ini) ikut menampilkan periode yang sama secara default,
// tanpa perlu mengetik ulang query string setiap pindah halaman.
function rememberPeriod(p: Period) {
  document.cookie = `${PERIOD_COOKIE_NAME}=${p}; path=/; max-age=${60 * 60 * 24 * 365}`;
}

export default function PeriodTabs({
  basePath,
  period,
  extraQuery,
}: {
  basePath: string;
  period: Period;
  extraQuery?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PERIOD_OPTIONS.map((p) => (
        <Link
          key={p}
          href={`${basePath}?period=${p}${extraQuery ? `&${extraQuery}` : ""}`}
          onClick={() => rememberPeriod(p)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            p === period ? "bg-brand-600 text-white" : "bg-white text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          {PERIOD_LABELS[p]}
        </Link>
      ))}
    </div>
  );
}
