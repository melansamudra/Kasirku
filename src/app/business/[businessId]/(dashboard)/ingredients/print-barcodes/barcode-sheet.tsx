"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import JsBarcode from "jsbarcode";

function Label({ name, unit, barcode }: { name: string; unit: string; barcode: string }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (ref.current) {
      JsBarcode(ref.current, barcode, {
        format: "CODE128",
        displayValue: true,
        fontSize: 11,
        height: 40,
        margin: 4,
      });
    }
  }, [barcode]);

  return (
    <div className="flex flex-col items-center rounded-lg border border-zinc-200 p-2.5 text-center">
      <p className="truncate text-xs font-semibold text-zinc-800">{name}</p>
      <p className="text-[10px] text-zinc-400">{unit}</p>
      <svg ref={ref} className="mt-1 max-w-full" />
    </div>
  );
}

export default function BarcodeSheet({
  businessName,
  items,
}: {
  businessName: string;
  items: { id: string; name: string; unit: string; barcode: string }[];
}) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="w-full max-w-3xl">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Cetak Barcode Bahan Baku — {businessName}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {items.length} label. Tempel di rak/wadah bahan supaya bisa discan di Permintaan
            Gudang & Order Barang.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            🖨️ Cetak
          </button>
          <Link
            href="../"
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
          >
            ← Kembali
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
          Belum ada bahan dengan barcode.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-3 gap-3 print:grid-cols-3 print:gap-2">
          {items.map((item) => (
            <Label key={item.id} name={item.name} unit={item.unit} barcode={item.barcode} />
          ))}
        </div>
      )}
    </div>
  );
}
