"use client";

type TxRow = {
  invoice_number: string;
  date: string;
  total: number;
  transaction_payments: { method: string; amount: number }[];
  transaction_items: { name: string; category: string | null; qty: number; price: number }[];
};

// Returns YYYY-MM-DD in WIB timezone — required by importTransactions action
function toWibDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
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
    // Format matches importTransactions: one row per item, grouped by reference
    const header = ["reference", "date", "productName", "qty", "paymentMethod", "customerName"];
    const dataRows: string[][] = [];

    for (const t of txs) {
      const date = toWibDate(t.date);
      const paymentMethod = t.transaction_payments.map((p) => p.method).join(" + ") || "";
      for (const item of t.transaction_items) {
        dataRows.push([
          t.invoice_number,
          date,
          item.name,
          String(item.qty),
          paymentMethod,
          "",
        ]);
      }
    }

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
