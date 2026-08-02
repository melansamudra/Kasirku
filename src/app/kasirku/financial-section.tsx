"use client";

import { useState } from "react";

type FinTab = "kontrol-biaya" | "laba-rugi" | "hpp";

const FIN_TABS: { id: FinTab; label: string; sub: string }[] = [
  { id: "kontrol-biaya", label: "Kontrol Biaya", sub: "Budget vs Aktual" },
  { id: "laba-rugi", label: "Laba Rugi", sub: "Income Statement" },
  { id: "hpp", label: "Kalkulator HPP", sub: "Per Produk" },
];

const SIDEBAR_ITEMS = [
  { label: "Dashboard", key: "dash" },
  { label: "Kasir", key: "kasir" },
  { label: "Laporan", key: "laporan" },
  { label: "Produk", key: "produk" },
  { label: "Stok", key: "stok" },
  { label: "Keuangan", key: "keuangan", active: true },
];

const COST_ROWS = [
  { name: "Bahan Baku", budget: 8000000, actual: 7200000 },
  { name: "Gaji Karyawan", budget: 5000000, actual: 5000000 },
  { name: "Listrik & Utilitas", budget: 1500000, actual: 1800000 },
  { name: "Sewa Tempat", budget: 3000000, actual: 3000000 },
];

function fmt(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(".0", "")} jt`;
  if (n >= 1000) return `${Math.round(n / 1000)} rb`;
  return n.toLocaleString("id-ID");
}

function AppFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-widest text-brand-500">
        Halaman Keuangan → {label}
      </p>
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl shadow-zinc-200/60">
        {/* Browser bar */}
        <div className="flex items-center gap-1.5 border-b border-zinc-100 bg-brand-50/40 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-300" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" aria-hidden />
          <span className="ml-3 text-xs font-bold text-brand-600">KasirKu</span>
          <span className="ml-auto text-[10px] text-zinc-400">Kopi Sore · Sudirman</span>
          <span className="ml-3 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-[9px] font-bold text-white">
            KS
          </span>
        </div>
        {/* Layout */}
        <div className="grid grid-cols-[120px_1fr] sm:grid-cols-[140px_1fr]">
          {/* Sidebar */}
          <div className="border-r border-zinc-100 bg-zinc-50/50 py-3">
            {SIDEBAR_ITEMS.map((item) => (
              <div
                key={item.key}
                className={`px-3 py-2 text-xs font-medium ${
                  item.active
                    ? "border-r-2 border-brand-500 bg-brand-50 font-semibold text-brand-700"
                    : "text-zinc-400"
                }`}
              >
                {item.label}
              </div>
            ))}
            {/* Sub-items under Keuangan */}
            {(["Kontrol Biaya", "Laba Rugi", "Arus Kas", "HPP"] as const).map((sub) => (
              <div key={sub} className="pl-5 py-1.5 text-[11px] text-zinc-400">
                › {sub}
              </div>
            ))}
          </div>
          {/* Content */}
          <div className="min-h-[340px] overflow-hidden p-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

function KontrolBiayaContent() {
  const total = COST_ROWS.reduce((s, r) => s + r.actual, 0);
  const budget = COST_ROWS.reduce((s, r) => s + r.budget, 0);
  const sisa = budget - total;
  const efisiensi = ((total / budget) * 100).toFixed(1);

  return (
    <div>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-base font-bold text-zinc-900">Kontrol Biaya</h3>
          <p className="text-xs text-zinc-400">Agustus 2026 · Budget tracking</p>
        </div>
        <div className="flex gap-2">
          <span className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600">
            Bulan Ini
          </span>
          <span className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">
            + Biaya
          </span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">
            Total Biaya
          </p>
          <p className="mt-1 text-lg font-bold text-zinc-900">{fmt(total)}</p>
          <p className="text-[10px] text-zinc-400">vs budget {fmt(budget)}</p>
        </div>
        <div className="rounded-xl border border-brand-100 bg-brand-50 p-3">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">
            Budget Tersisa
          </p>
          <p className="mt-1 text-lg font-bold text-brand-600">{fmt(sisa)}</p>
          <p className="text-[10px] text-brand-500">Sisa {((sisa / budget) * 100).toFixed(1)}% dari budget</p>
        </div>
        <div className="rounded-xl border border-brand-100 bg-brand-50 p-3">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">
            Efisiensi
          </p>
          <p className="mt-1 text-lg font-bold text-brand-600">{efisiensi}%</p>
          <p className="text-[10px] text-brand-500">Hemat vs budget</p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-zinc-100">
        <div className="grid grid-cols-[1fr_80px_80px_56px] gap-0 bg-zinc-50 px-4 py-2">
          {["Kategori", "Budget", "Aktual", "Status"].map((h) => (
            <div key={h} className="text-[10px] font-semibold text-zinc-500">{h}</div>
          ))}
        </div>
        {COST_ROWS.map((row) => {
          const pct = (row.actual / row.budget) * 100;
          const over = pct > 100;
          return (
            <div key={row.name} className="border-t border-zinc-50 px-4 py-3">
              <div className="grid grid-cols-[1fr_80px_80px_56px] items-center gap-0">
                <span className={`text-xs font-medium ${over ? "text-red-600" : "text-zinc-700"}`}>
                  {row.name}
                </span>
                <span className="font-mono text-xs text-zinc-400">
                  {row.budget.toLocaleString("id-ID")}
                </span>
                <span className="font-mono text-xs text-zinc-700">
                  {row.actual.toLocaleString("id-ID")}
                </span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold ${
                    over
                      ? "bg-red-100 text-red-600"
                      : pct === 100
                      ? "bg-amber-100 text-amber-600"
                      : "bg-brand-50 text-brand-600"
                  }`}
                >
                  {Math.round(pct)}%
                </span>
              </div>
              <div className="mt-1.5 h-1 w-full rounded-full bg-zinc-100">
                <div
                  className={`h-full rounded-full ${over ? "bg-red-400" : "bg-brand-500"}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PNL_ROWS = [
  { label: "Penjualan bersih", value: 18400000, cls: "text-zinc-800", bold: false },
  { label: "HPP produk terjual", value: -10208000, cls: "text-red-500", bold: false },
  { label: "Laba Kotor", value: 8192000, cls: "text-brand-700", bold: true, pct: "44.5%" },
  { label: "Gaji karyawan", value: -3200000, cls: "text-red-400", bold: false },
  { label: "Sewa tempat", value: -3000000, cls: "text-red-400", bold: false },
  { label: "Listrik & utilitas", value: -1800000, cls: "text-red-400", bold: false },
  { label: "Lain-lain", value: -700000, cls: "text-red-400", bold: false },
  { label: "Total Biaya Operasional", value: -8700000, cls: "text-red-500", bold: true },
  { label: "Laba Bersih", value: 2992000, cls: "text-brand-600", bold: true, pct: "16.3%" },
];

const CASHFLOW_BARS = [40, 52, 61, 74, 88, 95];
const CASHFLOW_MONTHS = ["Mar", "Apr", "Mei", "Jun", "Jul", "Ags"];

function LabaRugiContent() {
  return (
    <div className="grid grid-cols-[1fr_180px] gap-4">
      {/* P&L */}
      <div>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-zinc-900">Laporan Laba Rugi</h3>
            <p className="text-xs text-zinc-400">Agustus 2026 · Income Statement</p>
          </div>
          <div className="flex gap-2">
            <span className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600">
              Bulan Ini
            </span>
            <span className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">
              Ekspor
            </span>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-100 bg-zinc-50 p-4">
          <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-zinc-500">
            Laporan Laba Rugi · 1–31 Agustus 2026
          </p>
          <div className="space-y-1.5">
            {PNL_ROWS.map((row) => (
              <div
                key={row.label}
                className={`flex items-center justify-between ${
                  row.bold ? "border-t border-zinc-200 pt-1.5" : ""
                }`}
              >
                <span
                  className={`text-xs ${
                    row.bold ? "font-semibold text-zinc-700" : "text-zinc-500"
                  }`}
                >
                  {row.label}
                </span>
                <div className="flex items-center gap-2">
                  {row.pct && (
                    <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[9px] font-bold text-brand-600">
                      {row.pct}
                    </span>
                  )}
                  <span className={`font-mono text-xs tabular-nums ${row.cls} ${row.bold ? "font-bold" : ""}`}>
                    {row.value < 0
                      ? `(${Math.abs(row.value).toLocaleString("id-ID")})`
                      : row.value.toLocaleString("id-ID")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="space-y-3">
        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
          <p className="mb-2 text-[9px] font-semibold uppercase tracking-wide text-zinc-400">
            Ringkasan Margin
          </p>
          {[
            { label: "Margin Kotor", pct: 44.5, color: "bg-brand-500" },
            { label: "Margin Bersih", pct: 16.3, color: "bg-brand-400" },
            { label: "Rasio Biaya/Omzet", pct: 47.3, color: "bg-amber-400" },
          ].map((m) => (
            <div key={m.label} className="mb-2">
              <div className="flex justify-between text-[10px]">
                <span className="text-zinc-500">{m.label}</span>
                <span className="font-bold text-zinc-700">{m.pct}%</span>
              </div>
              <div className="mt-0.5 h-1.5 w-full rounded-full bg-zinc-200">
                <div className={`h-full rounded-full ${m.color}`} style={{ width: `${m.pct}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
          <p className="mb-2 text-[9px] font-semibold uppercase tracking-wide text-zinc-400">
            Arus Kas 6 Bulan
          </p>
          <div className="flex h-12 items-end gap-1">
            {CASHFLOW_BARS.map((h, i) => (
              <div className="flex flex-1 flex-col items-center gap-0.5" key={i}>
                <div
                  className={`w-full rounded-t ${
                    i === CASHFLOW_BARS.length - 1 ? "bg-brand-500" : "bg-brand-200"
                  }`}
                  style={{ height: `${h}%` }}
                />
                <span className="text-[7px] text-zinc-400">{CASHFLOW_MONTHS[i]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-brand-100 bg-brand-50 p-2 text-center">
            <p className="text-sm font-bold text-brand-700">2,99 jt</p>
            <p className="text-[9px] text-zinc-400">Laba Bersih</p>
          </div>
          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-2 text-center">
            <p className="text-sm font-bold text-zinc-800">4,2×</p>
            <p className="text-[9px] text-zinc-400">Current Ratio</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const HPP_PRODUCTS = [
  { name: "Kopi Susu Gula Aren", bahan: 9800, kemasan: 500, overhead: 1200, total: 11500, jual: 24000 },
  { name: "Roti Bakar Keju", bahan: 4200, kemasan: 300, overhead: 500, total: 5000, jual: 18000 },
  { name: "Es Teh Manis", bahan: 1800, kemasan: 200, overhead: 300, total: 2300, jual: 8000 },
  { name: "Matcha Latte", bahan: 14000, kemasan: 500, overhead: 1500, total: 16000, jual: 35000 },
];

function HPPContent() {
  const [selected, setSelected] = useState(0);
  const p = HPP_PRODUCTS[selected];
  const margin = (((p.jual - p.total) / p.jual) * 100).toFixed(1);

  return (
    <div className="grid grid-cols-[1fr_160px] gap-4">
      <div>
        <div className="mb-3">
          <h3 className="text-base font-bold text-zinc-900">Kalkulator HPP</h3>
          <p className="text-xs text-zinc-400">Harga Pokok Produksi per produk</p>
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-100">
          <div className="grid grid-cols-[1fr_64px_64px_64px_56px] bg-zinc-50 px-4 py-2">
            {["Produk", "HPP", "Jual", "Margin", ""].map((h, i) => (
              <div key={i} className="text-[10px] font-semibold text-zinc-500">{h}</div>
            ))}
          </div>
          {HPP_PRODUCTS.map((prod, i) => {
            const m = (((prod.jual - prod.total) / prod.jual) * 100).toFixed(1);
            return (
              <button
                key={prod.name}
                type="button"
                onClick={() => setSelected(i)}
                className={`w-full border-t border-zinc-50 px-4 py-2.5 text-left transition-colors ${
                  selected === i ? "bg-brand-50" : "hover:bg-zinc-50"
                }`}
              >
                <div className="grid grid-cols-[1fr_64px_64px_64px_56px] items-center">
                  <span className="truncate text-xs font-medium text-zinc-700">{prod.name}</span>
                  <span className="font-mono text-xs text-zinc-500">
                    {prod.total.toLocaleString("id-ID")}
                  </span>
                  <span className="font-mono text-xs text-zinc-500">
                    {prod.jual.toLocaleString("id-ID")}
                  </span>
                  <span className="text-xs font-bold text-brand-600">{m}%</span>
                  <span
                    className={`h-1.5 rounded-full ${
                      parseFloat(m) >= 60
                        ? "bg-brand-500"
                        : parseFloat(m) >= 40
                        ? "bg-amber-400"
                        : "bg-red-400"
                    }`}
                    style={{ width: `${Math.min(parseFloat(m), 100)}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      <div className="rounded-xl border border-brand-100 bg-brand-50 p-3">
        <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-brand-600">
          Rincian HPP
        </p>
        <p className="mb-3 truncate text-[10px] font-bold text-zinc-800">{p.name}</p>
        <div className="space-y-2">
          {[
            { label: "Bahan baku", val: p.bahan },
            { label: "Kemasan", val: p.kemasan },
            { label: "Overhead", val: p.overhead },
          ].map((row) => (
            <div key={row.label} className="flex justify-between text-[10px]">
              <span className="text-zinc-500">{row.label}</span>
              <span className="font-mono font-semibold text-zinc-700">
                {row.val.toLocaleString("id-ID")}
              </span>
            </div>
          ))}
          <div className="flex justify-between border-t border-brand-200 pt-2 text-[10px]">
            <span className="font-bold text-zinc-700">Total HPP</span>
            <span className="font-mono font-bold text-zinc-900">
              {p.total.toLocaleString("id-ID")}
            </span>
          </div>
        </div>
        <div className="mt-3 rounded-lg bg-white p-2 text-center">
          <p className="text-xl font-bold text-brand-600">{margin}%</p>
          <p className="text-[9px] text-zinc-400">Margin</p>
        </div>
        <div className="mt-2 rounded-lg bg-white p-2 text-center">
          <p className="text-base font-bold text-zinc-800">
            Rp{p.jual.toLocaleString("id-ID")}
          </p>
          <p className="text-[9px] text-zinc-400">Harga Jual</p>
        </div>
      </div>
    </div>
  );
}

export default function FinancialSection() {
  const [activeTab, setActiveTab] = useState<FinTab>("kontrol-biaya");

  return (
    <section className="bg-zinc-50/60 px-4 py-20">
      <div className="mx-auto max-w-6xl">
        {/* Section header */}
        <div className="mx-auto max-w-2xl text-center">
          <div className="flex items-center justify-center gap-4">
            <div className="h-px w-10 bg-brand-300" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-600">
              Modul Keuangan Lanjutan
            </span>
            <div className="h-px w-10 bg-brand-300" />
          </div>
          <h2
            className="mt-4 text-2xl font-bold text-zinc-900 sm:text-3xl"
            style={{ fontFamily: "var(--font-playfair), Georgia, serif" }}
          >
            Cost Control · Finance · HPP
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-500">
            Kendalikan biaya operasional, pantau laba rugi secara akurat, dan hitung HPP setiap
            produk — semua terintegrasi.
          </p>
        </div>

        {/* Tabs */}
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {FIN_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-all ${
                activeTab === tab.id
                  ? "bg-brand-600 text-white shadow-sm"
                  : "border border-zinc-200 bg-white text-zinc-600 hover:border-brand-300 hover:text-brand-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* App frame */}
        <div className="mt-8">
          {activeTab === "kontrol-biaya" && (
            <AppFrame label="Kontrol Biaya">
              <KontrolBiayaContent />
            </AppFrame>
          )}
          {activeTab === "laba-rugi" && (
            <AppFrame label="Laba Rugi">
              <LabaRugiContent />
            </AppFrame>
          )}
          {activeTab === "hpp" && (
            <AppFrame label="Kalkulator HPP">
              <HPPContent />
            </AppFrame>
          )}
        </div>
      </div>
    </section>
  );
}
