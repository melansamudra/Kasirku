"use client";

type HistoryItem = {
  id: string;
  date: string;
  amount: number;
  detail: string;
};

type ParsedRincian = { date: string; description: string; amount: number };

type ParsedDetail = {
  summaryLine: string;
  modalAwal: number | null;
  totalPengeluaran: number | null;
  catatan: string;
  rincian: ParsedRincian[];
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

function parseRupiah(text: string): number {
  return Number(text.replace(/[^\d]/g, "")) || 0;
}

// Riwayat PDO belum punya tabel tersendiri -- rincian per-item ditempel di
// journal_entries.description saat submit (lihat pdo-form.tsx), jadi buat
// nampilin ulang di cetak, teks itu di-parse balik di sini. Entri lama
// (sebelum format "Rincian:" ini ada) otomatis fallback ke tampilan
// ringkasan teks polos -- rincian-nya memang tidak pernah tersimpan.
function parseDetail(detail: string): ParsedDetail {
  const lines = detail.split("\n").filter((l) => l.trim().length > 0);
  const summaryLine = lines[0] ?? detail;

  const totalMatch = summaryLine.match(/Total Pengeluaran (Rp[\d.]+)/);
  const modalMatch = summaryLine.match(/Saldo Awal Rekening (Rp[\d.]+)/);
  const catatanMatch = summaryLine.match(/Saldo Awal Rekening Rp[\d.]+ — (.+)$/);

  const rincianStart = lines.findIndex((l) => l.trim() === "Rincian:");
  const rincian: ParsedRincian[] =
    rincianStart === -1
      ? []
      : lines.slice(rincianStart + 1).flatMap((line) => {
          const m = line.match(/^(.+?) — (.+): (Rp[\d.]+)$/);
          if (!m) return [];
          return [{ date: m[1], description: m[2], amount: parseRupiah(m[3]) }];
        });

  return {
    summaryLine,
    totalPengeluaran: totalMatch ? parseRupiah(totalMatch[1]) : null,
    modalAwal: modalMatch ? parseRupiah(modalMatch[1]) : null,
    catatan: catatanMatch ? catatanMatch[1] : "",
    rincian,
  };
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Jendela baru khusus buat cetak, bukan window.print() di halaman ini --
// halaman PDO sudah punya beberapa elemen "print:block" lain (rekap Tunai,
// slip PDO yang lagi disubmit), jadi kalau ikut window.print() di sini bisa
// kecampur ke-print bareng.
function printSlip(businessName: string, item: HistoryItem) {
  const parsed = parseDetail(item.detail);
  const sisaSaldo =
    parsed.modalAwal !== null && parsed.totalPengeluaran !== null
      ? parsed.modalAwal - parsed.totalPengeluaran
      : null;

  const win = window.open("", "_blank", "width=420,height=680");
  if (!win) return;

  const rincianHtml =
    parsed.rincian.length > 0
      ? `
        <p class="rincian-title">Rincian Pengeluaran</p>
        <div class="rincian">
          ${parsed.rincian
            .map(
              (r) => `
            <div class="rincian-row">
              <span class="rincian-desc">${escapeHtml(r.date)} — ${escapeHtml(r.description)}</span>
              <span class="rincian-amount">${formatRupiah(r.amount)}</span>
            </div>`,
            )
            .join("")}
        </div>`
      : `<p class="detail">${escapeHtml(item.detail)}</p>`;

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
  .row { display: flex; justify-content: space-between; font-size: 13px; padding: 6px 0; border-top: 1px dashed #d4d4d8; }
  .row.strong { font-weight: 700; }
  .amount { font-size: 20px; font-weight: 700; text-align: center; margin: 16px 0; color: #1d4ed8; border-top: 1px dashed #d4d4d8; padding-top: 16px; }
  .catatan { font-size: 11px; color: #71717a; margin: 4px 0 0; }
  .rincian-title { font-size: 10.5px; font-weight: 700; text-transform: uppercase; color: #71717a; margin: 16px 0 4px; border-top: 1px dashed #d4d4d8; padding-top: 12px; }
  .rincian-row { display: flex; justify-content: space-between; font-size: 12px; color: #52525b; padding: 2px 0; gap: 12px; }
  .rincian-amount { flex-shrink: 0; font-weight: 600; }
  .detail { font-size: 12px; color: #52525b; white-space: pre-wrap; border-top: 1px dashed #d4d4d8; padding-top: 12px; margin-top: 12px; line-height: 1.6; }
  .sign { display: flex; justify-content: space-around; margin-top: 48px; font-size: 11px; text-align: center; color: #71717a; }
  .sign div { border-top: 1px solid #d4d4d8; padding-top: 6px; width: 120px; }
</style>
</head>
<body>
  <p class="biz">${escapeHtml(businessName)}</p>
  <h1>Slip Permintaan Dana Operasional</h1>
  <p class="period">${formatDateTime(item.date)}</p>

  ${parsed.modalAwal !== null ? `<div class="row"><span>Saldo Awal Rekening</span><span>${formatRupiah(parsed.modalAwal)}</span></div>` : ""}
  ${parsed.totalPengeluaran !== null ? `<div class="row"><span>Total Pengeluaran</span><span>${formatRupiah(parsed.totalPengeluaran)}</span></div>` : ""}
  ${sisaSaldo !== null ? `<div class="row strong"><span>Sisa Saldo</span><span>${formatRupiah(sisaSaldo)}</span></div>` : ""}
  ${parsed.catatan ? `<p class="catatan">Catatan: ${escapeHtml(parsed.catatan)}</p>` : ""}

  <p class="amount">Minta Dana (Transfer)<br />${formatRupiah(item.amount)}</p>

  ${rincianHtml}

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
      {history.map((h) => {
        const summaryLine = h.detail.split("\n")[0] ?? h.detail;
        return (
          <div key={h.id} className="flex items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">{formatDateTime(h.date)}</span>
                <span className="text-sm font-bold text-brand-700">{formatRupiah(h.amount)}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-zinc-600">{summaryLine}</p>
            </div>
            <button
              type="button"
              onClick={() => printSlip(businessName, h)}
              className="shrink-0 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
            >
              🖨️ Cetak
            </button>
          </div>
        );
      })}
    </div>
  );
}
