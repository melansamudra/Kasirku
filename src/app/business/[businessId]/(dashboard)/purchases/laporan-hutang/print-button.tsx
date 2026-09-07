"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 print:hidden"
    >
      🖨️ Cetak
    </button>
  );
}
