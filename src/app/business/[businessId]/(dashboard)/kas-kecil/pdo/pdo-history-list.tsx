"use client";

type HistoryItem = {
  id: string;
  date: string;
  amount: number;
  detail: string;
};

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

// Buka jendela baru khusus buat cetak, bukan window.print() di halaman ini --
// halaman PDO sudah punya beberapa elemen "print:block" lain (rekap Tunai,
// slip PDO yang lagi disubmit), jadi kalau ikut window.print() di sini bisa
// kecampur ke-print bareng. Riwayat cuma nyimpen ringkasan teks (detail),
// bukan rincian per-item, karena memang belum ada tabel PDO terpisah --
// slip cetak ulang ini seadanya data yang ada.
function printSlip(businessName: string, item: HistoryItem) {
  const win = window.open("", "_blank", "width=420,height=640");
  if (!win) return;

  win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Slip PDO — ${formatDateTime(item.date)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Arial, sans-serif; padding: 24px; color: #18181b; }
  .biz { font-size: 11px; text-transform: uppercase; color: #71717a; text-align: center; letter-spacing: .05em; margin: 0; }
  h1 { font-size: 16px; margin: 4px 0 2px; text-align: center; }
  .period { font-size: 11px; color: #71717a; text-align: center; margin: 0 0 16px; }
  .amount { font-size: 20px; font-weight: 700; text-align: center; margin: 16px 0; color: #1d4ed8; }
  .detail { font-size: 12px; color: #52525b; white-space: pre-wrap; border-top: 1px dashed #d4d4d8; padding-top: 12px; margin-top: 12px; line-height: 1.6; }
  .sign { display: flex; justify-content: space-around; margin-top: 56px; font-size: 11px; text-align: center; color: #71717a; }
  .sign div { border-top: 1px solid #d4d4d8; padding-top: 6px; width: 120px; }
</style>
</head>
<body>
  <p class="biz">${businessName}</p>
  <h1>Slip Permintaan Dana Operasional</h1>
  <p class="period">${formatDateTime(item.date)}</p>
  <p class="amount">${formatRupiah(item.amount)}</p>
  <div class="detail">${item.detail}</div>
  <div class="sign">
    <div>Diajukan oleh (Admin)</div>
    <div>Disetujui oleh (Owner)</div>
  </div>
</body>
</html>`);
  win.document.close();
  win.focus();
  win.print();
}

export default function PdoHistoryList({
  businessName,
  history,
}: {
  businessName: string;
  history: HistoryItem[];
}) {
  return (
    <div className="divide-y divide-zinc-100">
      {history.map((h) => (
        <div key={h.id} className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">{formatDateTime(h.date)}</span>
              <span className="text-sm font-bold text-brand-700">{formatRupiah(h.amount)}</span>
            </div>
            <p className="mt-0.5 truncate text-xs text-zinc-600">{h.detail}</p>
          </div>
          <button
            type="button"
            onClick={() => printSlip(businessName, h)}
            className="shrink-0 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
          >
            🖨️ Cetak
          </button>
        </div>
      ))}
    </div>
  );
}
