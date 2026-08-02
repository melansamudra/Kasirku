"use client";

import { useState } from "react";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "kasir", label: "Kasir" },
  { id: "laporan", label: "Laporan" },
  { id: "keuangan", label: "Keuangan" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const SIDEBAR_ITEMS: { label: string; active: TabId[] }[] = [
  { label: "Dashboard", active: ["dashboard"] },
  { label: "Kasir", active: ["kasir"] },
  { label: "Laporan", active: ["laporan"] },
  { label: "Produk", active: [] },
  { label: "Stok", active: [] },
  { label: "Keuangan", active: ["keuangan"] },
  { label: "Pengaturan", active: [] },
];

function AppShell({ activeTab, children }: { activeTab: TabId; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg shadow-zinc-200/60">
      {/* Browser chrome */}
      <div className="flex items-center gap-1.5 border-b border-zinc-100 bg-brand-50/40 px-4 py-2.5">
        <span className="h-2 w-2 rounded-full bg-red-300" aria-hidden />
        <span className="h-2 w-2 rounded-full bg-amber-300" aria-hidden />
        <span className="h-2 w-2 rounded-full bg-emerald-300" aria-hidden />
        <span className="ml-2 text-[11px] font-bold text-brand-600">KasirKu</span>
        <span className="ml-auto text-[9px] text-zinc-400">Kopi Sore · Sudirman</span>
      </div>
      <div className="grid min-h-[300px] grid-cols-[96px_1fr]">
        {/* Sidebar */}
        <div className="border-r border-zinc-100 bg-zinc-50/50 py-2">
          {SIDEBAR_ITEMS.map((item) => (
            <div
              key={item.label}
              className={`px-3 py-1.5 text-[10px] font-medium transition-colors ${
                item.active.includes(activeTab)
                  ? "border-r-2 border-brand-500 bg-brand-50 font-semibold text-brand-700"
                  : "text-zinc-400"
              }`}
            >
              {item.label}
            </div>
          ))}
        </div>
        {/* Content */}
        <div className="overflow-hidden p-4">{children}</div>
      </div>
    </div>
  );
}

const CHART_BARS = [40, 55, 48, 72, 60, 88, 65, 78, 55, 92, 70, 95];

function DashboardContent() {
  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        {[
          { label: "Penjualan", value: "Rp8,4jt", sub: "+12% bulan ini" },
          { label: "Transaksi", value: "284", sub: "Hari ini: 18" },
          { label: "Margin", value: "62%", sub: "Laba Rp2,9jt" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-brand-100 bg-brand-50 p-2">
            <div className="text-[8px] uppercase tracking-wide text-zinc-400">{s.label}</div>
            <div className="text-sm font-bold text-zinc-900">{s.value}</div>
            <div className="mt-0.5 text-[8px] text-brand-600">{s.sub}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-zinc-50 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[9px] font-semibold text-zinc-500">Penjualan Bulan Ini</span>
          <span className="text-[8px] text-brand-600">Agustus 2026</span>
        </div>
        <div className="flex h-14 items-end gap-1">
          {CHART_BARS.map((h, i) => (
            <div
              key={i}
              className={`flex-1 rounded-t ${i === CHART_BARS.length - 1 ? "bg-brand-500" : "bg-brand-200"}`}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-zinc-100 p-2">
          <div className="text-[8px] text-zinc-400">Produk Terlaris</div>
          <div className="mt-0.5 text-[10px] font-semibold text-zinc-800">Kopi Susu G. Aren</div>
          <div className="text-[8px] text-brand-600">48 porsi · Rp1,15jt</div>
        </div>
        <div className="rounded-lg border border-zinc-100 p-2">
          <div className="text-[8px] text-zinc-400">Jam Tersibuk</div>
          <div className="mt-0.5 text-[10px] font-semibold text-zinc-800">08:00 – 09:00</div>
          <div className="text-[8px] text-brand-600">23 transaksi/jam</div>
        </div>
      </div>
    </div>
  );
}

function KasirContent() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <div className="mb-2 text-[9px] font-semibold text-zinc-500">Pilih Produk</div>
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              ["Kopi Susu", "24k"],
              ["Matcha Latte", "32k"],
              ["Es Teh", "8k"],
              ["Croissant", "22k"],
              ["Roti Bakar", "18k"],
              ["Pisang Goreng", "15k"],
            ] as [string, string][]
          ).map(([name, price], i) => (
            <div
              key={name}
              className={`cursor-pointer rounded-lg border p-2 text-center transition-colors ${
                i === 0 ? "border-brand-300 bg-brand-50" : "border-zinc-100 bg-white"
              }`}
            >
              <div className="truncate text-[9px] font-medium leading-tight text-zinc-700">{name}</div>
              <div className="mt-0.5 text-[8px] text-brand-600">{price}</div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 text-[9px] font-semibold text-zinc-500">Pesanan</div>
        <div className="space-y-1.5 rounded-lg bg-zinc-50 p-2">
          {[
            { name: "Kopi Susu G. Aren", qty: 2, price: "Rp48.000" },
            { name: "Croissant Keju", qty: 1, price: "Rp22.000" },
          ].map((item) => (
            <div key={item.name} className="flex items-center justify-between">
              <span className="text-[9px] text-zinc-600">
                {item.name} ×{item.qty}
              </span>
              <span className="text-[9px] font-semibold text-zinc-800">{item.price}</span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-zinc-200 pt-1.5">
            <span className="text-[9px] font-bold text-zinc-900">Total</span>
            <span className="text-[9px] font-bold text-brand-700">Rp70.000</span>
          </div>
        </div>
        <button
          type="button"
          className="mt-2 w-full rounded-lg bg-brand-500 py-2 text-[10px] font-bold text-white"
        >
          Bayar →
        </button>
        <div className="mt-1.5 grid grid-cols-3 gap-1">
          {["Cash", "QRIS", "Transfer"].map((m) => (
            <div key={m} className="rounded border border-zinc-100 py-1 text-center text-[8px] text-zinc-500">
              {m}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LaporanContent() {
  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-brand-100 bg-brand-50 p-3">
          <div className="text-[8px] uppercase tracking-wide text-zinc-400">Pendapatan</div>
          <div className="text-base font-bold text-zinc-900">Rp18,4jt</div>
          <div className="mt-0.5 text-[8px] text-brand-600">+8,2% vs bulan lalu</div>
        </div>
        <div className="rounded-lg border border-brand-100 bg-brand-50 p-3">
          <div className="text-[8px] uppercase tracking-wide text-zinc-400">Laba Bersih</div>
          <div className="text-base font-bold text-brand-600">Rp2,99jt</div>
          <div className="mt-0.5 text-[8px] text-zinc-400">Margin 16,3%</div>
        </div>
      </div>
      <div className="space-y-1.5 rounded-lg bg-zinc-50 p-3">
        <div className="mb-1 text-[9px] font-semibold text-zinc-500">Laba Rugi · Agustus</div>
        {[
          { label: "Penjualan bersih", value: "18.400.000", cls: "text-zinc-800" },
          { label: "(−) HPP", value: "(10.208.000)", cls: "text-red-500" },
          { label: "Laba Kotor", value: "8.192.000", cls: "text-brand-700 font-bold" },
          { label: "(−) Biaya operasional", value: "(5.200.000)", cls: "text-red-500" },
          { label: "Laba Bersih", value: "2.992.000", cls: "text-brand-600 font-bold" },
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <span className={`text-[9px] ${row.cls.includes("font-bold") ? "font-semibold text-zinc-700" : "text-zinc-500"}`}>
              {row.label}
            </span>
            <span className={`font-mono text-[9px] tabular-nums ${row.cls}`}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const COST_CATEGORIES = [
  { name: "Bahan Baku", budget: 8000000, actual: 7200000, over: false },
  { name: "Gaji", budget: 5000000, actual: 5000000, over: false },
  { name: "Listrik & Air", budget: 1500000, actual: 1800000, over: true },
  { name: "Sewa", budget: 3000000, actual: 3000000, over: false },
];

const HPP_PRODUCTS = [
  { name: "Roti Bakar", hpp: "5.000", jual: "18.000", margin: "72,2%" },
  { name: "Es Teh Manis", hpp: "2.500", jual: "8.000", margin: "68,8%" },
  { name: "Kopi Susu", hpp: "9.800", jual: "24.000", margin: "59,2%" },
];

function KeuanganContent() {
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-2 text-[9px] font-semibold text-zinc-500">Kontrol Biaya · Budget vs Aktual</div>
        <div className="space-y-2">
          {COST_CATEGORIES.map((c) => {
            const pct = Math.min((c.actual / c.budget) * 100, 120);
            return (
              <div key={c.name}>
                <div className="mb-0.5 flex items-center justify-between">
                  <span className={`text-[9px] ${c.over ? "font-semibold text-red-500" : "text-zinc-600"}`}>
                    {c.name}
                  </span>
                  <span className={`text-[8px] font-bold ${c.over ? "text-red-500" : "text-brand-600"}`}>
                    {Math.round(pct)}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-zinc-100">
                  <div
                    className={`h-full rounded-full ${c.over ? "bg-red-400" : "bg-brand-500"}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <div className="mb-1.5 text-[9px] font-semibold text-zinc-500">HPP per Produk</div>
        <div className="overflow-hidden rounded-lg border border-zinc-100">
          <div className="grid grid-cols-4 gap-0 bg-brand-50 px-2 py-1">
            {["Produk", "HPP", "Jual", "Margin"].map((h) => (
              <div key={h} className="text-[8px] font-semibold text-brand-700">
                {h}
              </div>
            ))}
          </div>
          {HPP_PRODUCTS.map((p) => (
            <div key={p.name} className="grid grid-cols-4 gap-0 border-t border-zinc-50 px-2 py-1.5">
              <div className="text-[9px] font-medium text-zinc-700">{p.name}</div>
              <div className="font-mono text-[9px] text-zinc-500">{p.hpp}</div>
              <div className="font-mono text-[9px] text-zinc-500">{p.jual}</div>
              <div className="text-[9px] font-bold text-brand-600">{p.margin}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AppScreens() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

  return (
    <div>
      <div className="mb-6 flex flex-wrap justify-center gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === tab.id
                ? "bg-brand-600 text-white shadow-sm"
                : "border border-zinc-200 bg-white text-zinc-600 hover:border-brand-300 hover:text-brand-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mx-auto max-w-2xl">
        <AppShell activeTab={activeTab}>
          {activeTab === "dashboard" && <DashboardContent />}
          {activeTab === "kasir" && <KasirContent />}
          {activeTab === "laporan" && <LaporanContent />}
          {activeTab === "keuangan" && <KeuanganContent />}
        </AppShell>
      </div>
    </div>
  );
}
