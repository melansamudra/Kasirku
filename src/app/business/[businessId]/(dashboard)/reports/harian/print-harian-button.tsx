"use client";

export default function PrintHarianButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
    >
      🖨️ Cetak PDF
    </button>
  );
}
