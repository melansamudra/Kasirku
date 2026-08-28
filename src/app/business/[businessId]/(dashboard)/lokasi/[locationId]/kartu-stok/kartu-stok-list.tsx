"use client";

import { useMemo, useState } from "react";

function formatQty(value: number) {
  return Number(value.toFixed(2)).toLocaleString("id-ID");
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
  });
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: "Menunggu verifikasi", className: "bg-amber-50 text-amber-700" },
  verified: { label: "Terverifikasi", className: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "Ditolak", className: "bg-red-50 text-red-700" },
};

export type KartuStokRow = {
  key: string;
  id: string;
  componentType: "ingredient" | "semi_finished";
  name: string;
  unit: string;
  stokData: number;
  stockMasuk: number;
  stockKeluar: number;
  lastOpname: { reportedStock: number; status: "pending" | "verified" | "rejected"; entryDate: string } | null;
};

export default function KartuStokList({ items }: { items: KartuStokRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <div>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari bahan…"
          className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm text-zinc-700 focus:border-brand-400 focus:outline-none"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-600"
            title="Bersihkan pencarian"
          >
            ✕
          </button>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {filtered.length > 0 ? (
          filtered.map((item) => {
            const selisih = item.lastOpname ? item.lastOpname.reportedStock - item.stokData : null;
            const status = item.lastOpname ? STATUS_LABEL[item.lastOpname.status] : null;
            return (
              <div key={item.key} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-900">{item.name}</p>
                  {status && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}>
                      {status.label}
                      {item.lastOpname && ` · ${formatDate(item.lastOpname.entryDate)}`}
                    </span>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  <div>
                    <p className="text-[10px] text-zinc-400">Stok Data</p>
                    <p className="text-sm font-semibold text-zinc-800">
                      {formatQty(item.stokData)} {item.unit}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-400">Stok Riil</p>
                    <p className="text-sm font-semibold text-zinc-800">
                      {item.lastOpname ? `${formatQty(item.lastOpname.reportedStock)} ${item.unit}` : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-400">Selisih</p>
                    <p
                      className={`text-sm font-semibold ${
                        selisih == null || selisih === 0
                          ? "text-zinc-800"
                          : selisih > 0
                            ? "text-emerald-600"
                            : "text-red-600"
                      }`}
                    >
                      {selisih == null ? "-" : `${selisih > 0 ? "+" : ""}${formatQty(selisih)} ${item.unit}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-400">Stock Masuk</p>
                    <p className="text-sm font-semibold text-emerald-600">
                      {item.stockMasuk > 0 ? `+${formatQty(item.stockMasuk)} ${item.unit}` : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-400">Stock Keluar</p>
                    <p className="text-sm font-semibold text-red-600">
                      {item.stockKeluar > 0 ? `-${formatQty(item.stockKeluar)} ${item.unit}` : "-"}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            {query ? "Tidak ada bahan yang cocok dengan pencarian ini." : "Belum ada data stok di lokasi ini."}
          </p>
        )}
      </div>
    </div>
  );
}
