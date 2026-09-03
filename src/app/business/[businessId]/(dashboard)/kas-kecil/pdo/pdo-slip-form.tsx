"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import type { PdoLogState } from "./actions";

const initialState: PdoLogState = { error: null };

type Nota = {
  id: string;
  description: string;
  amount: number;
  paymentMethod: "tunai" | "transfer" | null;
  created_at: string;
};

type OmsetRow = { id: string; date: string; amount: string };
type ManualExpenseRow = { id: string; date: string; description: string; amount: string; belumDibayar: boolean };

// Snapshot terstruktur dokumen PDO -- disimpan ke activity_log.data
// (migration 20260903100000) supaya slip yang sudah tersimpan bisa dibuka
// lagi & diedit persis seperti pas diisi, bukan di-parse ulang dari teks
// tampilan yang rawan ambigu (mis. tanggal tanpa tahun).
export type PdoSnapshot = {
  saldoAwalTunai: string;
  saldoAwalRekening: string;
  catatan: string;
  omsetRows: { date: string; amount: string }[];
  manualTunaiRows: { date: string; description: string; amount: string }[];
  manualTransferRows: { date: string; description: string; amount: string; belumDibayar: boolean }[];
};

type RincianOmset = { id: string; date: string; amount: number };
type RincianExpense = { id: string; date: string; description: string; amount: number; belumDibayar: boolean };

function formatRupiah(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${Math.round(Math.abs(value)).toLocaleString("id-ID")}`;
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short" });
}

function newOmsetRow(date: string): OmsetRow {
  return { id: crypto.randomUUID(), date, amount: "" };
}
function newManualRow(date: string): ManualExpenseRow {
  return { id: crypto.randomUUID(), date, description: "", amount: "", belumDibayar: false };
}

// Baris "Pilih dari Nota Kas Keluar" -- dipakai identik buat grup Tunai
// maupun TF, cuma daftar & label yang beda.
function NotaChecklist({
  label,
  notaList,
  selectedIds,
  onToggle,
  onSelectAll,
  onClear,
}: {
  label: string;
  notaList: Nota[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-100">
      <div className="flex items-center justify-between bg-zinc-50 px-3.5 py-2 text-xs">
        <span className="font-medium text-zinc-600">
          {label} — {selectedIds.size}/{notaList.length} dipilih
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={onSelectAll} className="font-semibold text-brand-600 hover:underline">
            Pilih semua
          </button>
          <button type="button" onClick={onClear} className="font-semibold text-zinc-400 hover:underline">
            Kosongkan
          </button>
        </div>
      </div>
      {notaList.length === 0 ? (
        <p className="px-3.5 py-4 text-center text-xs text-zinc-300">Tidak ada nota di periode ini.</p>
      ) : (
        <div className="max-h-44 divide-y divide-zinc-50 overflow-y-auto">
          {notaList.map((n) => (
            <label key={n.id} className="flex cursor-pointer items-center gap-2.5 px-3.5 py-2 text-xs hover:bg-zinc-50">
              <input
                type="checkbox"
                checked={selectedIds.has(n.id)}
                onChange={() => onToggle(n.id)}
                className="h-3.5 w-3.5 rounded border-zinc-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="w-11 shrink-0 text-zinc-400">{formatDateShort(n.created_at)}</span>
              <span className="min-w-0 flex-1 truncate text-zinc-700">{n.description}</span>
              <span className="shrink-0 font-medium text-zinc-800">{formatRupiah(n.amount)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function ManualRows({
  rows,
  showBelumDibayar,
  onAdd,
  onUpdate,
  onRemove,
}: {
  rows: ManualExpenseRow[];
  showBelumDibayar: boolean;
  onAdd: () => void;
  onUpdate: (id: string, field: "date" | "description" | "amount" | "belumDibayar", value: string | boolean) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={row.date}
            onChange={(e) => onUpdate(row.id, "date", e.target.value)}
            className="shrink-0 rounded-lg border border-zinc-200 px-2.5 py-2 text-xs"
          />
          <input
            type="text"
            value={row.description}
            onChange={(e) => onUpdate(row.id, "description", e.target.value)}
            placeholder="Keterangan"
            className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-xs"
          />
          <input
            type="number"
            min="0"
            value={row.amount}
            onChange={(e) => onUpdate(row.id, "amount", e.target.value)}
            placeholder="Jumlah (Rp)"
            className="w-28 shrink-0 rounded-lg border border-zinc-200 px-3 py-2 text-xs"
          />
          {showBelumDibayar && (
            <label className="flex shrink-0 items-center gap-1 text-[11px] text-amber-600">
              <input
                type="checkbox"
                checked={row.belumDibayar}
                onChange={(e) => onUpdate(row.id, "belumDibayar", e.target.checked)}
                className="h-3.5 w-3.5 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
              />
              Belum Dibayar
            </label>
          )}
          <button
            type="button"
            onClick={() => onRemove(row.id)}
            className="shrink-0 rounded-lg px-2 py-2 text-xs text-zinc-400 hover:text-red-600"
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={onAdd} className="text-xs font-semibold text-brand-600 hover:underline">
        + Tambah Baris
      </button>
    </div>
  );
}

function SlipSummary({
  businessName,
  fromLabel,
  toLabel,
  saldoAwalTunai,
  saldoAwalRekening,
  totalOmset,
  rincianOmset,
  totalPengeluaranTunai,
  rincianTunai,
  totalPengeluaranTransfer,
  rincianTransfer,
  totalBelumDibayar,
  rincianBelumDibayar,
  sisaSaldoTunai,
  sisaSaldoRekening,
  permintaanDana,
  catatan,
}: {
  businessName: string;
  fromLabel: string;
  toLabel: string;
  saldoAwalTunai: number;
  saldoAwalRekening: number;
  totalOmset: number;
  rincianOmset: RincianOmset[];
  totalPengeluaranTunai: number;
  rincianTunai: RincianExpense[];
  totalPengeluaranTransfer: number;
  rincianTransfer: RincianExpense[];
  totalBelumDibayar: number;
  rincianBelumDibayar: RincianExpense[];
  sisaSaldoTunai: number;
  sisaSaldoRekening: number;
  permintaanDana: number;
  catatan: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 print:border-0 print:p-0">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase text-zinc-400">{businessName}</p>
        <h2 className="mt-1 text-lg font-bold text-zinc-900">Slip Permintaan Dana Operasional</h2>
        <p className="mt-0.5 text-xs text-zinc-500">Periode nota: {fromLabel} – {toLabel}</p>
      </div>

      <div className="mt-4 border-t border-dashed border-zinc-300 pt-3">
        <p className="mb-1 text-[10.5px] font-semibold uppercase text-zinc-400">Saldo Awal</p>
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500">Tunai</span>
          <span className="font-medium text-zinc-900">{formatRupiah(saldoAwalTunai)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500">Rekening</span>
          <span className="font-medium text-zinc-900">{formatRupiah(saldoAwalRekening)}</span>
        </div>
      </div>

      <div className="mt-3 border-t border-dashed border-zinc-300 pt-3">
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500">Petty Cash Masuk dari Omset Tunai</span>
          <span className="font-medium text-brand-700">+{formatRupiah(totalOmset)}</span>
        </div>
        {rincianOmset.length > 0 && (
          <div className="mt-1 space-y-0.5 pl-3">
            {rincianOmset.map((r) => (
              <div key={r.id} className="flex justify-between text-xs text-zinc-500">
                <span>{formatDateShort(r.date)}</span>
                <span>{formatRupiah(r.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 border-t border-dashed border-zinc-300 pt-3">
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500">Pengeluaran by Tunai</span>
          <span className="font-medium text-red-600">-{formatRupiah(totalPengeluaranTunai)}</span>
        </div>
        {rincianTunai.length > 0 && (
          <div className="mt-1 space-y-0.5 pl-3">
            {rincianTunai.map((r) => (
              <div key={r.id} className="flex justify-between gap-2 text-xs text-zinc-500">
                <span className="min-w-0 truncate">{formatDateShort(r.date)} — {r.description}</span>
                <span className="shrink-0">{formatRupiah(r.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 border-t border-dashed border-zinc-300 pt-3">
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500">Pengeluaran by TF</span>
          <span className="font-medium text-red-600">-{formatRupiah(totalPengeluaranTransfer)}</span>
        </div>
        {rincianTransfer.length > 0 && (
          <div className="mt-1 space-y-0.5 pl-3">
            {rincianTransfer.map((r, i) => (
              <div key={r.id} className="flex justify-between gap-2 text-xs text-zinc-500">
                <span className="min-w-0 truncate">
                  {i + 1}. {r.description}
                </span>
                <span className="shrink-0">{formatRupiah(r.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {rincianBelumDibayar.length > 0 && (
        <div className="mt-3 border-t border-dashed border-amber-200 pt-3">
          <div className="flex justify-between text-sm">
            <span className="font-medium text-amber-600">Belum Dibayar (tidak mengurangi saldo)</span>
            <span className="font-medium text-amber-600">{formatRupiah(totalBelumDibayar)}</span>
          </div>
          <div className="mt-1 space-y-0.5 pl-3">
            {rincianBelumDibayar.map((r, i) => (
              <div key={r.id} className="flex justify-between gap-2 text-xs text-amber-600">
                <span className="min-w-0 truncate">
                  {i + 1}. {r.description}
                </span>
                <span className="shrink-0">{formatRupiah(r.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {catatan.trim() && <p className="mt-3 text-xs text-zinc-500">Catatan: {catatan.trim()}</p>}

      <div className="mt-4 space-y-1 border-t border-dashed border-zinc-300 pt-3">
        <p className="text-[10.5px] font-semibold uppercase text-zinc-400">Sisa Saldo</p>
        <div className="flex justify-between text-sm font-semibold text-zinc-900">
          <span>Tunai</span>
          <span>{formatRupiah(sisaSaldoTunai)}</span>
        </div>
        <div className="flex justify-between text-sm font-semibold text-zinc-900">
          <span>Rekening</span>
          <span>{formatRupiah(sisaSaldoRekening)}</span>
        </div>
      </div>

      <div className="mt-3 flex justify-between border-t border-dashed border-zinc-300 pt-3 text-base font-bold text-brand-700">
        <span>Permintaan Dana</span>
        <span>{formatRupiah(permintaanDana)}</span>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-6 text-center text-xs text-zinc-500">
        <div>
          <div className="h-14" />
          <p className="border-t border-zinc-300 pt-1.5">Diajukan oleh (Admin)</p>
        </div>
        <div>
          <div className="h-14" />
          <p className="border-t border-zinc-300 pt-1.5">Disetujui oleh (Owner)</p>
        </div>
      </div>
    </div>
  );
}

export default function PdoSlipForm({
  action,
  today,
  fromLabel,
  toLabel,
  notaList,
  businessName,
  editMode = false,
  initialSnapshot,
  cancelHref,
}: {
  action: (state: PdoLogState, formData: FormData) => Promise<PdoLogState>;
  today: string;
  fromLabel: string;
  toLabel: string;
  notaList: Nota[];
  businessName: string;
  editMode?: boolean;
  initialSnapshot?: PdoSnapshot;
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  const [saldoAwalTunai, setSaldoAwalTunai] = useState(initialSnapshot?.saldoAwalTunai ?? "");
  const [saldoAwalRekening, setSaldoAwalRekening] = useState(initialSnapshot?.saldoAwalRekening ?? "");
  const [omsetRows, setOmsetRows] = useState<OmsetRow[]>(
    () => initialSnapshot?.omsetRows.map((r) => ({ id: crypto.randomUUID(), ...r })) ?? [newOmsetRow(today)],
  );
  const [catatan, setCatatan] = useState(initialSnapshot?.catatan ?? "");
  const [previewMode, setPreviewMode] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const notaTunaiList = useMemo(() => notaList.filter((n) => n.paymentMethod !== "transfer"), [notaList]);
  const notaTransferList = useMemo(() => notaList.filter((n) => n.paymentMethod === "transfer"), [notaList]);

  // Mode edit: nota yang dulu dipilih sudah "dibekukan" jadi baris manual di
  // initialSnapshot (lihat buildSnapshot), jadi checklist nota mulai KOSONG
  // -- kalau tetap auto-select semua nota periode ini, angkanya bisa
  // dobel-hitung sama baris manual yang sudah ada.
  const [selectedTunaiIds, setSelectedTunaiIds] = useState<Set<string>>(() =>
    editMode ? new Set() : new Set(notaTunaiList.map((n) => n.id)),
  );
  const [selectedTransferIds, setSelectedTransferIds] = useState<Set<string>>(() =>
    editMode ? new Set() : new Set(notaTransferList.map((n) => n.id)),
  );
  const [manualTunaiRows, setManualTunaiRows] = useState<ManualExpenseRow[]>(
    () => initialSnapshot?.manualTunaiRows.map((r) => ({ id: crypto.randomUUID(), belumDibayar: false, ...r })) ?? [],
  );
  const [manualTransferRows, setManualTransferRows] = useState<ManualExpenseRow[]>(
    () => initialSnapshot?.manualTransferRows.map((r) => ({ id: crypto.randomUUID(), ...r })) ?? [],
  );

  const submitted = attempted && !pending && !state.error;

  const totalOmset = omsetRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const rincianOmset = useMemo<RincianOmset[]>(
    () =>
      omsetRows
        .filter((r) => (Number(r.amount) || 0) > 0)
        .map((r) => ({ id: r.id, date: `${r.date}T00:00:00+07:00`, amount: Number(r.amount) || 0 }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [omsetRows],
  );

  function buildRincian(notas: Nota[], selectedIds: Set<string>, manualRows: ManualExpenseRow[]): RincianExpense[] {
    return [
      ...notas
        .filter((n) => selectedIds.has(n.id))
        .map((n) => ({ id: n.id, date: n.created_at, description: n.description, amount: n.amount, belumDibayar: false })),
      ...manualRows
        .filter((r) => (Number(r.amount) || 0) > 0)
        .map((r) => ({
          id: r.id,
          date: `${r.date}T00:00:00+07:00`,
          description: r.description.trim() || "(tanpa keterangan)",
          amount: Number(r.amount) || 0,
          belumDibayar: r.belumDibayar,
        })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  const rincianTunai = useMemo(
    () => buildRincian(notaTunaiList, selectedTunaiIds, manualTunaiRows),
    [notaTunaiList, selectedTunaiIds, manualTunaiRows],
  );
  const rincianTransferAll = useMemo(
    () => buildRincian(notaTransferList, selectedTransferIds, manualTransferRows),
    [notaTransferList, selectedTransferIds, manualTransferRows],
  );
  // Baris "Belum Dibayar" dipisah dari rincian utama -- belum beneran
  // ditransfer, jadi TIDAK ikut mengurangi Sisa Saldo Rekening / Permintaan
  // Dana (arahan user 2026-09-03), cuma ditampilkan di bawah sebagai
  // catatan hutang yang masih nunggu.
  const rincianTransfer = useMemo(() => rincianTransferAll.filter((r) => !r.belumDibayar), [rincianTransferAll]);
  const rincianBelumDibayar = useMemo(() => rincianTransferAll.filter((r) => r.belumDibayar), [rincianTransferAll]);

  const totalPengeluaranTunai = rincianTunai.reduce((s, r) => s + r.amount, 0);
  const totalPengeluaranTransfer = rincianTransfer.reduce((s, r) => s + r.amount, 0);
  const totalBelumDibayar = rincianBelumDibayar.reduce((s, r) => s + r.amount, 0);

  const saldoAwalTunaiNum = Number(saldoAwalTunai) || 0;
  const saldoAwalRekeningNum = Number(saldoAwalRekening) || 0;
  const sisaSaldoTunai = saldoAwalTunaiNum + totalOmset - totalPengeluaranTunai;
  const sisaSaldoRekening = saldoAwalRekeningNum - totalPengeluaranTransfer;
  // Permintaan Dana SELALU ikut Total Pengeluaran by TF (yang sudah lunas
  // saja) -- biar Rekening balik ke saldo awal (arahan user 2026-09-03),
  // tidak bisa ditimpa manual.
  const permintaanDana = totalPengeluaranTransfer;

  const summaryProps = {
    businessName,
    fromLabel,
    toLabel,
    saldoAwalTunai: saldoAwalTunaiNum,
    saldoAwalRekening: saldoAwalRekeningNum,
    totalOmset,
    rincianOmset,
    totalPengeluaranTunai,
    rincianTunai,
    totalPengeluaranTransfer,
    rincianTransfer,
    totalBelumDibayar,
    rincianBelumDibayar,
    sisaSaldoTunai,
    sisaSaldoRekening,
    permintaanDana,
    catatan,
  };

  // Teks ini yang disimpan ke activity_log.detail (riwayat) DAN yang dibaca
  // balik pdo-history-list.tsx buat cetak ulang -- format & urutan baris
  // HARUS sinkron sama parser di sana kalau diubah.
  const description =
    `PDO ${fromLabel} - ${toLabel}\n` +
    `Saldo Awal Tunai: ${formatRupiah(saldoAwalTunaiNum)}\n` +
    `Saldo Awal Rekening: ${formatRupiah(saldoAwalRekeningNum)}\n` +
    `Omset Tunai Masuk: ${formatRupiah(totalOmset)}\n` +
    `Pengeluaran Tunai: ${formatRupiah(totalPengeluaranTunai)}\n` +
    `Pengeluaran TF: ${formatRupiah(totalPengeluaranTransfer)}\n` +
    `Sisa Saldo Tunai: ${formatRupiah(sisaSaldoTunai)}\n` +
    `Sisa Saldo Rekening: ${formatRupiah(sisaSaldoRekening)}` +
    (catatan.trim() ? `\nCatatan: ${catatan.trim()}` : "") +
    (rincianOmset.length > 0
      ? `\n\nRincian Omset:\n${rincianOmset.map((r) => `${formatDateShort(r.date)}: ${formatRupiah(r.amount)}`).join("\n")}`
      : "") +
    (rincianTunai.length > 0
      ? `\n\nRincian Pengeluaran Tunai:\n${rincianTunai.map((r) => `${formatDateShort(r.date)} — ${r.description}: ${formatRupiah(r.amount)}`).join("\n")}`
      : "") +
    (rincianTransfer.length > 0
      ? `\n\nRincian Pengeluaran TF:\n${rincianTransfer
          .map((r) => `${formatDateShort(r.date)} — ${r.description}: ${formatRupiah(r.amount)}`)
          .join("\n")}`
      : "") +
    (rincianBelumDibayar.length > 0
      ? `\n\nRincian Belum Dibayar (tidak mengurangi saldo):\n${rincianBelumDibayar
          .map((r) => `${formatDateShort(r.date)} — ${r.description}: ${formatRupiah(r.amount)}`)
          .join("\n")}`
      : "");

  // Snapshot terstruktur (dikirim sebagai JSON di field tersembunyi "snapshot")
  // -- dibangun dari rincian yang SUDAH DIRESOLVE (nota terpilih + baris
  // manual jadi satu daftar rata), supaya saat dibuka lagi untuk diedit,
  // semuanya tampil sebagai baris manual yang bisa diubah/dihapus/ditambah
  // bebas, tidak tergantung nota itu masih ada/di periode yang sama atau
  // tidak lagi saat form edit dibuka.
  const snapshot: PdoSnapshot = {
    saldoAwalTunai,
    saldoAwalRekening,
    catatan,
    omsetRows: rincianOmset.map((r) => ({ date: r.date.slice(0, 10), amount: String(r.amount) })),
    manualTunaiRows: rincianTunai.map((r) => ({ date: r.date.slice(0, 10), description: r.description, amount: String(r.amount) })),
    manualTransferRows: [
      ...rincianTransfer.map((r) => ({ date: r.date.slice(0, 10), description: r.description, amount: String(r.amount), belumDibayar: false })),
      ...rincianBelumDibayar.map((r) => ({ date: r.date.slice(0, 10), description: r.description, amount: String(r.amount), belumDibayar: true })),
    ],
  };

  function resetAll() {
    setAttempted(false);
    setPreviewMode(false);
    setSaldoAwalTunai("");
    setSaldoAwalRekening("");
    setOmsetRows([newOmsetRow(today)]);
    setCatatan("");
    setSelectedTunaiIds(new Set(notaTunaiList.map((n) => n.id)));
    setSelectedTransferIds(new Set(notaTransferList.map((n) => n.id)));
    setManualTunaiRows([]);
    setManualTransferRows([]);
  }

  if (submitted) {
    return (
      <div className="mt-2">
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 text-center text-sm font-medium text-brand-700 print:hidden">
          {editMode
            ? `✓ Perubahan tersimpan — Permintaan Dana ${formatRupiah(permintaanDana)}`
            : `✓ PDO tersimpan sebagai dokumen — Permintaan Dana ${formatRupiah(permintaanDana)}`}
        </div>
        <div className="mt-4">
          <SlipSummary {...summaryProps} />
        </div>
        <div className="mt-4 flex gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex-1 rounded-xl border border-zinc-200 bg-white py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            🖨️ Cetak PDF
          </button>
          {editMode && cancelHref ? (
            <Link
              href={cancelHref}
              className="flex-1 rounded-xl border border-zinc-200 bg-white py-2.5 text-center text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              ← Kembali ke Riwayat
            </Link>
          ) : (
            <button
              type="button"
              onClick={resetAll}
              className="flex-1 rounded-xl border border-zinc-200 bg-white py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              + Ajukan Baru
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={() => setAttempted(true)} className="mt-2 space-y-3">
      <input type="hidden" name="amount" value={permintaanDana} />
      <input type="hidden" name="description" value={description} />
      <input type="hidden" name="snapshot" value={JSON.stringify(snapshot)} />

      {editMode && cancelHref && (
        <div className="flex justify-end print:hidden">
          <Link href={cancelHref} className="text-xs font-medium text-zinc-400 hover:text-red-500">
            ✕ Batal edit
          </Link>
        </div>
      )}

      {previewMode ? (
        <>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-center text-xs font-medium text-amber-700 print:hidden">
            Pratinjau — belum tersimpan. Cek dulu sebelum diajukan.
          </div>
          <SlipSummary {...summaryProps} />
          {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 print:hidden">{state.error}</p>}
          <div className="flex gap-2 print:hidden">
            <button
              type="button"
              onClick={() => setPreviewMode(false)}
              disabled={pending}
              className="flex-1 rounded-xl border border-zinc-200 bg-white py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              ← Kembali
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Menyimpan…" : editMode ? "Simpan Perubahan" : "Simpan Dokumen PDO"}
            </button>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Saldo Awal</h3>
            <div className="mt-2 grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Tunai (Rp)</label>
                <input
                  type="number"
                  min="0"
                  value={saldoAwalTunai}
                  onChange={(e) => setSaldoAwalTunai(e.target.value)}
                  placeholder="mis. 200000"
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Rekening (Rp)</label>
                <input
                  type="number"
                  min="0"
                  value={saldoAwalRekening}
                  onChange={(e) => setSaldoAwalRekening(e.target.value)}
                  placeholder="mis. 10000000"
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-100 pt-3">
            <h3 className="text-sm font-semibold text-zinc-900">Petty Cash Masuk dari Omset Tunai</h3>
            <p className="mt-0.5 text-xs text-zinc-500">Omset tunai per tanggal yang jadi tambahan kas tunai.</p>
            <div className="mt-2 space-y-2">
              {omsetRows.map((row) => (
                <div key={row.id} className="flex items-center gap-2">
                  <input
                    type="date"
                    value={row.date}
                    onChange={(e) => setOmsetRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, date: e.target.value } : r)))}
                    className="rounded-lg border border-zinc-200 px-2.5 py-2 text-sm"
                  />
                  <input
                    type="number"
                    min="0"
                    value={row.amount}
                    onChange={(e) => setOmsetRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, amount: e.target.value } : r)))}
                    placeholder="Jumlah omset tunai (Rp)"
                    className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setOmsetRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== row.id) : prev))}
                    disabled={omsetRows.length <= 1}
                    className="shrink-0 rounded-lg px-2 py-2 text-xs text-zinc-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setOmsetRows((prev) => [...prev, newOmsetRow(today)])}
              className="mt-2 text-xs font-semibold text-brand-600 hover:underline"
            >
              + Tambah Omset Tunai
            </button>
            <div className="mt-2 flex items-center justify-between border-t border-zinc-100 pt-2">
              <span className="text-xs font-medium text-zinc-500">Total Omset Tunai</span>
              <span className="text-sm font-bold text-brand-700">{formatRupiah(totalOmset)}</span>
            </div>
          </div>

          <div className="border-t border-zinc-100 pt-3">
            <h3 className="text-sm font-semibold text-zinc-900">Pengeluaran by Tunai</h3>
            <p className="mt-0.5 text-xs text-zinc-500">Pilih dari nota Kas Keluar (metode tunai) atau isi manual.</p>
            <div className="mt-2">
              <NotaChecklist
                label={`Nota Tunai (${fromLabel} – ${toLabel})`}
                notaList={notaTunaiList}
                selectedIds={selectedTunaiIds}
                onToggle={(id) =>
                  setSelectedTunaiIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
                onSelectAll={() => setSelectedTunaiIds(new Set(notaTunaiList.map((n) => n.id)))}
                onClear={() => setSelectedTunaiIds(new Set())}
              />
            </div>
            <div className="mt-2">
              <ManualRows
                rows={manualTunaiRows}
                showBelumDibayar={false}
                onAdd={() => setManualTunaiRows((prev) => [...prev, newManualRow(today)])}
                onUpdate={(id, field, value) =>
                  setManualTunaiRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
                }
                onRemove={(id) => setManualTunaiRows((prev) => prev.filter((r) => r.id !== id))}
              />
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-zinc-100 pt-2">
              <span className="text-xs font-medium text-zinc-500">Total Pengeluaran Tunai</span>
              <span className="text-sm font-bold text-red-600">{formatRupiah(totalPengeluaranTunai)}</span>
            </div>
          </div>

          <div className="border-t border-zinc-100 pt-3">
            <h3 className="text-sm font-semibold text-zinc-900">Pengeluaran by TF</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Pilih dari nota Kas Keluar (metode transfer) atau isi manual — tandai &quot;Belum Dibayar&quot; kalau
              baris manual itu masih hutang, belum benar-benar ditransfer.
            </p>
            <div className="mt-2">
              <NotaChecklist
                label={`Nota Transfer (${fromLabel} – ${toLabel})`}
                notaList={notaTransferList}
                selectedIds={selectedTransferIds}
                onToggle={(id) =>
                  setSelectedTransferIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
                onSelectAll={() => setSelectedTransferIds(new Set(notaTransferList.map((n) => n.id)))}
                onClear={() => setSelectedTransferIds(new Set())}
              />
            </div>
            <div className="mt-2">
              <ManualRows
                rows={manualTransferRows}
                showBelumDibayar
                onAdd={() => setManualTransferRows((prev) => [...prev, newManualRow(today)])}
                onUpdate={(id, field, value) =>
                  setManualTransferRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
                }
                onRemove={(id) => setManualTransferRows((prev) => prev.filter((r) => r.id !== id))}
              />
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-zinc-100 pt-2">
              <span className="text-xs font-medium text-zinc-500">Total Pengeluaran TF (lunas)</span>
              <span className="text-sm font-bold text-red-600">{formatRupiah(totalPengeluaranTransfer)}</span>
            </div>
            {totalBelumDibayar > 0 && (
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs font-medium text-amber-600">Belum Dibayar (tidak mengurangi saldo)</span>
                <span className="text-sm font-bold text-amber-600">{formatRupiah(totalBelumDibayar)}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5 border-t border-zinc-100 pt-3">
            <div className="rounded-xl border border-zinc-100 px-3 py-2 text-sm">
              <p className="text-[10.5px] font-semibold uppercase text-zinc-400">Sisa Saldo Tunai</p>
              <p className={`font-bold ${sisaSaldoTunai < 0 ? "text-red-600" : "text-zinc-900"}`}>{formatRupiah(sisaSaldoTunai)}</p>
            </div>
            <div className="rounded-xl border border-zinc-100 px-3 py-2 text-sm">
              <p className="text-[10.5px] font-semibold uppercase text-zinc-400">Sisa Saldo Rekening</p>
              <p className={`font-bold ${sisaSaldoRekening < 0 ? "text-red-600" : "text-zinc-900"}`}>{formatRupiah(sisaSaldoRekening)}</p>
            </div>
          </div>

          <div className="rounded-xl border border-brand-100 bg-brand-50 px-3 py-2.5">
            <p className="text-[10.5px] font-semibold uppercase text-brand-500">Permintaan Dana</p>
            <p className="text-lg font-bold text-brand-700">{formatRupiah(permintaanDana)}</p>
            <p className="mt-0.5 text-[11px] text-brand-500">Otomatis = Total Pengeluaran by TF, biar Rekening balik ke saldo awal.</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Catatan (opsional)</label>
            <input
              type="text"
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              placeholder="mis. Top-up mingguan"
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <button
            type="button"
            onClick={() => setPreviewMode(true)}
            disabled={permintaanDana <= 0}
            className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Lihat Preview →
          </button>
        </div>
      )}
    </form>
  );
}
