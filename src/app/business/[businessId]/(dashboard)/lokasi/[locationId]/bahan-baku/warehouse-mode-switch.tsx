"use client";

import { useTransition } from "react";

export default function WarehouseModeSwitch({
  mode,
  action,
}: {
  mode: "connected" | "standalone";
  action: (mode: "connected" | "standalone") => Promise<{ error: string | null }>;
}) {
  const [isPending, startTransition] = useTransition();

  function handleChange(next: "connected" | "standalone") {
    if (next === mode || isPending) return;
    if (
      !confirm(
        next === "standalone"
          ? "Ganti ke mode Berdiri Sendiri? Daftar bahan di halaman ini akan diganti dengan daftar barang Gudang sendiri (kosong dulu), terpisah dari master bahan baku. Barang lama yang tampil sekarang tidak akan hilang, cuma tidak ditampilkan di sini lagi."
          : "Balik ke mode Terhubung ke Master? Daftar barang Gudang standalone tidak akan hilang, tapi halaman ini akan balik menampilkan bahan dari master bahan baku.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      await action(next);
    });
  }

  return (
    <div className="mt-3 flex items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3">
      <p className="text-xs font-medium text-zinc-600">Sistem stok Gudang ini:</p>
      <div className="flex overflow-hidden rounded-lg border border-zinc-200">
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleChange("connected")}
          className={`px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
            mode === "connected" ? "bg-brand-600 text-white" : "bg-white text-zinc-500 hover:bg-zinc-50"
          }`}
        >
          Terhubung ke Master
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleChange("standalone")}
          className={`px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
            mode === "standalone" ? "bg-brand-600 text-white" : "bg-white text-zinc-500 hover:bg-zinc-50"
          }`}
        >
          Berdiri Sendiri
        </button>
      </div>
    </div>
  );
}
