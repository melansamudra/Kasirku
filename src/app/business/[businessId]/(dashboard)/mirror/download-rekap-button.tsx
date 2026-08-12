"use client";

type TxRow = {
  invoice_number: string;
  date: string;
  total: number;
  transaction_payments: { method: string; amount: number }[];
  transaction_items: { name: string; category: string | null; qty: number; price: number }[];
};

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

function toCSV(rows: string[][]): string {
  return rows
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");
}

export default function DownloadRekapButton({
  txs,
  label,
}: {
  txs: TxRow[];
  label: string;
}) {
  function handleDownload() {
    const header = ["No", "Invoice", "Tanggal", "Metode Bayar", "Total", "Items"];
    const dataRows = txs.map((t, i) => [
      String(i + 1),
      t.invoice_number,
      formatDate(t.date),
      t.transaction_payments.map((p) => p.method).join(" + ") || "—",
      formatRupiah(Number(t.total)),
      t.transaction_items
        .map((it) => `${it.name} x${it.qty}`)
        .join("; "),
    ]);

    const csv = toCSV([header, ...dataRows]);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transaksi-mirror-${label}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm hover:bg-zinc-50 active:bg-zinc-100"
    >
      ⬇ Download CSV
    </button>
  );
}
