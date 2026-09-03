"use client";

type HistoryItem = {
  id: string;
  date: string;
  amount: number;
  detail: string;
};

type ParsedRincianExpense = { date: string; description: string; amount: number; belumDibayar: boolean };
type ParsedRincianOmset = { date: string; amount: number };

type ParsedDetail = {
  periode: string;
  saldoAwalTunai: number | null;
  saldoAwalRekening: number | null;
  omsetMasuk: number | null;
  pengeluaranTunai: number | null;
  pengeluaranTf: number | null;
  sisaSaldoTunai: number | null;
  sisaSaldoRekening: number | null;
  catatan: string;
  rincianOmset: ParsedRincianOmset[];
  rincianTunai: ParsedRincianExpense[];
  rincianTf: ParsedRincianExpense[];
  rincianBelumDibayar: ParsedRincianExpense[];
};

function formatRupiah(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${Math.round(Math.abs(value)).toLocaleString("id-ID")}`;
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
  const sign = text.trim().startsWith("-") ? -1 : 1;
  return sign * (Number(text.replace(/[^\d]/g, "")) || 0);
}

function fieldValue(lines: string[], label: string): number | null {
  const line = lines.find((l) => l.startsWith(`${label}:`));
  if (!line) return null;
  const m = line.match(/Rp[\d.]+/);
  return m ? parseRupiah(m[0]) : null;
}

function sectionRows(lines: string[], header: string): string[] {
  const start = lines.findIndex((l) => l.trim() === header);
  if (start === -1) return [];
  const rows: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^Rincian /.test(lines[i]) || lines[i].startsWith("Catatan:")) break;
    rows.push(lines[i]);
  }
  return rows;
}

// Riwayat PDO disimpan di activity_log.detail dengan format multi-baris yang
// dibangun di pdo-slip-form.tsx (dua-duanya HARUS tetap sinkron kalau salah
// satu diubah). Entri lama (sebelum format Tunai/Rekening ini ada) otomatis
// jatuh ke fallback teks polos di bawah -- field-nya cuma null.
function parseDetail(detail: string): ParsedDetail {
  const lines = detail.split("\n");
  const nonEmpty = lines.filter((l) => l.trim().length > 0);

  const catatanLine = nonEmpty.find((l) => l.startsWith("Catatan:"));

  const rincianOmset: ParsedRincianOmset[] = sectionRows(nonEmpty, "Rincian Omset:").flatMap((line) => {
    const m = line.match(/^(.+?):\s*(Rp[\d.]+)$/);
    if (!m) return [];
    return [{ date: m[1], amount: parseRupiah(m[2]) }];
  });

  function parseExpenseRows(header: string, belumDibayar = false): ParsedRincianExpense[] {
    return sectionRows(nonEmpty, header).flatMap((line) => {
      // Format lama menaruh tag "[Belum Dibayar]" nempel di akhir baris
      // pengeluaran TF biasa -- entri baru sudah pisah section sendiri
      // (lihat "Rincian Belum Dibayar" di bawah), tapi baris lama ini masih
      // perlu dipahami buat riwayat yang sudah kepalang tersimpan.
      const legacyBelumDibayar = /\[Belum Dibayar\]$/.test(line);
      const clean = line.replace(/\s*\[Belum Dibayar\]$/, "");
      const m = clean.match(/^(.+?) — (.+): (Rp[\d.]+)$/);
      if (!m) return [];
      return [{ date: m[1], description: m[2], amount: parseRupiah(m[3]), belumDibayar: belumDibayar || legacyBelumDibayar }];
    });
  }

  return {
    periode: nonEmpty[0] ?? detail,
    saldoAwalTunai: fieldValue(nonEmpty, "Saldo Awal Tunai"),
    saldoAwalRekening: fieldValue(nonEmpty, "Saldo Awal Rekening"),
    omsetMasuk: fieldValue(nonEmpty, "Omset Tunai Masuk"),
    pengeluaranTunai: fieldValue(nonEmpty, "Pengeluaran Tunai"),
    pengeluaranTf: fieldValue(nonEmpty, "Pengeluaran TF"),
    sisaSaldoTunai: fieldValue(nonEmpty, "Sisa Saldo Tunai"),
    sisaSaldoRekening: fieldValue(nonEmpty, "Sisa Saldo Rekening"),
    catatan: catatanLine ? catatanLine.replace(/^Catatan:\s*/, "") : "",
    rincianOmset,
    rincianTunai: parseExpenseRows("Rincian Pengeluaran Tunai:"),
    rincianTf: parseExpenseRows("Rincian Pengeluaran TF:"),
    rincianBelumDibayar: parseExpenseRows("Rincian Belum Dibayar (tidak mengurangi saldo):", true),
  };
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function rowHtml(label: string, value: number | null, strong = false) {
  if (value === null) return "";
  return `<div class="row${strong ? " strong" : ""}"><span>${escapeHtml(label)}</span><span>${formatRupiah(value)}</span></div>`;
}

function expenseListHtml(title: string, rows: ParsedRincianExpense[], amber = false) {
  if (rows.length === 0) return "";
  return `
    <p class="rincian-title${amber ? " amber" : ""}">${escapeHtml(title)}</p>
    <div class="rincian">
      ${rows
        .map(
          (r) => `
        <div class="rincian-row${amber ? " amber" : ""}">
          <span class="rincian-desc">${escapeHtml(r.date)} — ${escapeHtml(r.description)}</span>
          <span class="rincian-amount">${formatRupiah(r.amount)}</span>
        </div>`,
        )
        .join("")}
    </div>`;
}

// Jendela baru khusus buat cetak, bukan window.print() di halaman ini --
// halaman PDO sudah punya elemen "print:block" lain (slip PDO yang lagi
// disubmit), jadi kalau ikut window.print() di sini bisa kecampur ke-print
// bareng.
function printSlip(businessName: string, item: HistoryItem) {
  const parsed = parseDetail(item.detail);

  const win = window.open("", "_blank", "width=420,height=760");
  if (!win) return;

  const omsetHtml =
    parsed.rincianOmset.length > 0
      ? `
    <p class="rincian-title">Rincian Omset Tunai</p>
    <div class="rincian">
      ${parsed.rincianOmset
        .map(
          (r) => `
        <div class="rincian-row">
          <span class="rincian-desc">${escapeHtml(r.date)}</span>
          <span class="rincian-amount">${formatRupiah(r.amount)}</span>
        </div>`,
        )
        .join("")}
    </div>`
      : "";

  const fallbackHtml =
    parsed.saldoAwalTunai === null && parsed.saldoAwalRekening === null
      ? `<p class="detail">${escapeHtml(item.detail)}</p>`
      : "";

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
  .rincian-title.amber { color: #b45309; border-top-color: #fde68a; }
  .rincian-row { display: flex; justify-content: space-between; font-size: 12px; color: #52525b; padding: 2px 0; gap: 12px; }
  .rincian-row.amber { color: #b45309; }
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

  ${rowHtml("Saldo Awal Tunai", parsed.saldoAwalTunai)}
  ${rowHtml("Saldo Awal Rekening", parsed.saldoAwalRekening)}
  ${rowHtml("Omset Tunai Masuk", parsed.omsetMasuk)}
  ${rowHtml("Pengeluaran Tunai", parsed.pengeluaranTunai)}
  ${rowHtml("Pengeluaran TF", parsed.pengeluaranTf)}
  ${rowHtml("Sisa Saldo Tunai", parsed.sisaSaldoTunai, true)}
  ${rowHtml("Sisa Saldo Rekening", parsed.sisaSaldoRekening, true)}
  ${parsed.catatan ? `<p class="catatan">Catatan: ${escapeHtml(parsed.catatan)}</p>` : ""}

  <p class="amount">Permintaan Dana<br />${formatRupiah(item.amount)}</p>

  ${fallbackHtml}
  ${omsetHtml}
  ${expenseListHtml("Rincian Pengeluaran Tunai", parsed.rincianTunai)}
  ${expenseListHtml("Rincian Pengeluaran TF", parsed.rincianTf)}
  ${expenseListHtml("Belum Dibayar (tidak mengurangi saldo)", parsed.rincianBelumDibayar, true)}

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
        const parsed = parseDetail(h.detail);
        return (
          <div key={h.id} className="flex items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">{formatDateTime(h.date)}</span>
                <span className="text-sm font-bold text-brand-700">{formatRupiah(h.amount)}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-zinc-600">{parsed.periode}</p>
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
