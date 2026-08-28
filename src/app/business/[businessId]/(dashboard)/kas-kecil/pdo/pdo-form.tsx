"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import type { TransferState } from "../../accounting/transfer-kas/actions";

const initialState: TransferState = { error: null };

type Nota = {
  id: string;
  description: string;
  amount: number;
  category: string | null;
  created_at: string;
};

type ManualRow = {
  id: string;
  date: string;
  description: string;
  amount: string;
};

type RincianItem = {
  id: string;
  date: string;
  description: string;
  amount: number;
};

function formatRupiah(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${Math.round(Math.abs(value)).toLocaleString("id-ID")}`;
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
  });
}

function newManualRow(date: string): ManualRow {
  return { id: crypto.randomUUID(), date, description: "", amount: "" };
}

function SlipSummary({
  businessName,
  fromLabel,
  toLabel,
  modalAwal,
  totalPengeluaran,
  sisaSaldo,
  jumlahDiminta,
  catatan,
  rincian,
  bankName,
  bankAccountNumber,
  bankAccountHolder,
}: {
  businessName: string;
  fromLabel: string;
  toLabel: string;
  modalAwal: number;
  totalPengeluaran: number;
  sisaSaldo: number;
  jumlahDiminta: number;
  catatan: string;
  rincian: RincianItem[];
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountHolder: string | null;
}) {
  const hasBankDetails = !!(bankName || bankAccountNumber || bankAccountHolder);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 print:border-0 print:p-0">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase text-zinc-400">{businessName}</p>
        <h2 className="mt-1 text-lg font-bold text-zinc-900">Slip Permintaan Dana Operasional</h2>
        <p className="mt-0.5 text-xs text-zinc-500">Periode nota: {fromLabel} – {toLabel}</p>
      </div>

      {hasBankDetails && (
        <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50 px-3.5 py-2.5 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-500">
            Transfer ke rekening
          </p>
          <p className="mt-0.5 text-sm font-bold text-brand-700">
            {bankName || "—"} {bankAccountNumber || ""}
          </p>
          {bankAccountHolder && <p className="text-xs text-brand-600">a.n. {bankAccountHolder}</p>}
        </div>
      )}

      <div className="mt-4 space-y-1.5 border-t border-dashed border-zinc-300 pt-3 text-sm">
        <div className="flex justify-between">
          <span className="text-zinc-500">Saldo Awal Rekening</span>
          <span className="font-medium text-zinc-900">{formatRupiah(modalAwal)}</span>
        </div>
        <div className="flex justify-between pt-1.5">
          <span className="text-zinc-500">Total Pengeluaran ({rincian.length} item)</span>
          <span className="font-medium text-red-600">{formatRupiah(totalPengeluaran)}</span>
        </div>
        <div className="flex justify-between border-t border-zinc-100 pt-1.5 font-semibold text-zinc-900">
          <span>Sisa Saldo</span>
          <span>{formatRupiah(sisaSaldo)}</span>
        </div>
        <div className="flex justify-between border-t border-dashed border-zinc-300 pt-2 text-base font-bold text-brand-700">
          <span>Minta Dana (Transfer)</span>
          <span>{formatRupiah(jumlahDiminta)}</span>
        </div>
        {catatan.trim() && <p className="pt-1 text-xs text-zinc-500">Catatan: {catatan.trim()}</p>}
      </div>

      {rincian.length > 0 && (
        <div className="mt-4 border-t border-dashed border-zinc-300 pt-3">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-zinc-400">Rincian Pengeluaran</p>
          <div className="space-y-1 text-xs">
            {rincian.map((n) => (
              <div key={n.id} className="flex justify-between text-zinc-600">
                <span className="truncate pr-2">{formatDateShort(n.date)} — {n.description}</span>
                <span className="shrink-0 font-medium">{formatRupiah(n.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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

export default function PdoForm({
  action,
  today,
  fromLabel,
  toLabel,
  notaList,
  businessName,
  rekeningUtamaCode,
  rekeningOperasionalCode,
  rekeningOperasionalName,
  bankName,
  bankAccountNumber,
  bankAccountHolder,
}: {
  action: (state: TransferState, formData: FormData) => Promise<TransferState>;
  today: string;
  fromLabel: string;
  toLabel: string;
  notaList: Nota[];
  businessName: string;
  rekeningUtamaCode: string;
  rekeningOperasionalCode: string;
  rekeningOperasionalName: string;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountHolder: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [modalAwal, setModalAwal] = useState("");
  // Default: semua nota kecentang -- admin boleh uncheck yang nggak mau
  // dimasukkan (mis. sudah kepakai di permintaan PDO sebelumnya).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(notaList.map((n) => n.id)));
  // Baris pengeluaran manual -- murni state lokal buat lampiran slip ini,
  // TIDAK dikirim sebagai jurnal terpisah. Yang beneran tercatat ke jurnal
  // cuma satu transfer (Rekening Utama -> Rekening Operasional) senilai
  // "Minta Dana" saat form ini disubmit -- daftar pengeluaran di sini (baik
  // ceklis dari notaList maupun input manual) cuma dasar hitungan angkanya,
  // sifatnya sama seperti lampiran kertas di belakang slip.
  const [manualRows, setManualRows] = useState<ManualRow[]>([]);
  const [amountOverride, setAmountOverride] = useState<string | null>(null);
  const [catatan, setCatatan] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Diturunkan langsung dari state yang sudah ada (bukan disimpan state
  // terpisah) -- "sukses" itu murni fungsi dari attempted+pending+error saat
  // render, jadi tidak perlu efek yang manggil setState lagi setelahnya.
  const submitted = attempted && !pending && !state.error;

  const selectedNotas = useMemo(() => notaList.filter((n) => selectedIds.has(n.id)), [notaList, selectedIds]);
  const totalNotaTerpilih = selectedNotas.reduce((s, n) => s + n.amount, 0);
  const totalManual = manualRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const totalPengeluaran = totalNotaTerpilih + totalManual;

  const rincian = useMemo<RincianItem[]>(
    () =>
      [
        ...selectedNotas.map((n) => ({ id: n.id, date: n.created_at, description: n.description, amount: n.amount })),
        ...manualRows
          .filter((r) => (Number(r.amount) || 0) > 0)
          .map((r) => ({
            id: r.id,
            date: `${r.date}T00:00:00+07:00`,
            description: r.description.trim() || "(tanpa keterangan)",
            amount: Number(r.amount) || 0,
          })),
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [selectedNotas, manualRows],
  );

  // Minta Dana ikut Total Pengeluaran otomatis selama admin belum pernah
  // ubah manual -- begitu diubah manual, nilai itu yang dipakai terus walau
  // ceklis/baris manual berubah (dianggap keputusan sadar admin).
  const jumlahDiminta = amountOverride ?? String(totalPengeluaran || "");

  function toggleNota(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateManualRow(id: string, field: "date" | "description" | "amount", value: string) {
    setManualRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function removeManualRow(id: string) {
    setManualRows((prev) => prev.filter((r) => r.id !== id));
  }

  const modalAwalValue = Number(modalAwal) || 0;
  const sisaSaldo = modalAwalValue - totalPengeluaran;
  // Rincian per-item ditempel di bawah baris ringkasan (bukan cuma disimpan
  // di state) supaya kebawa ke journal_entries.description -- PDO belum
  // punya tabel tersendiri, jadi ini satu-satunya tempat rincian bisa
  // dibaca lagi nanti buat cetak ulang dari Riwayat Permintaan (lihat
  // pdo-history-list.tsx yang nge-parse balik format ini).
  const description =
    `PDO ${fromLabel} - ${toLabel} — Total Pengeluaran ${formatRupiah(totalPengeluaran)} (${rincian.length} item), ` +
    `Saldo Awal Rekening ${formatRupiah(modalAwalValue)}` +
    (catatan.trim() ? ` — ${catatan.trim()}` : "") +
    (rincian.length > 0
      ? `\n\nRincian:\n${rincian.map((r) => `${formatDateShort(r.date)} — ${r.description}: ${formatRupiah(r.amount)}`).join("\n")}`
      : "");

  const summaryProps = {
    businessName,
    fromLabel,
    toLabel,
    modalAwal: modalAwalValue,
    totalPengeluaran,
    sisaSaldo,
    jumlahDiminta: Number(jumlahDiminta) || 0,
    catatan,
    rincian,
    bankName,
    bankAccountNumber,
    bankAccountHolder,
  };

  if (submitted) {
    return (
      <div className="mt-4">
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 text-center text-sm font-medium text-brand-700 print:hidden">
          ✓ Transfer tercatat — {formatRupiah(Number(jumlahDiminta) || 0)} dari {rekeningUtamaCode} ke{" "}
          {rekeningOperasionalCode}
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
          <button
            type="button"
            onClick={() => {
              setAttempted(false);
              setPreviewMode(false);
              setModalAwal("");
              setCatatan("");
              setAmountOverride(null);
              setManualRows([]);
              setSelectedIds(new Set(notaList.map((n) => n.id)));
            }}
            className="flex-1 rounded-xl border border-zinc-200 bg-white py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            + Ajukan Baru
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={() => setAttempted(true)}
      className="mt-4 space-y-3"
    >
      <input type="hidden" name="date" value={today} />
      <input type="hidden" name="fromCode" value={rekeningUtamaCode} />
      <input type="hidden" name="toCode" value={rekeningOperasionalCode} />
      <input type="hidden" name="description" value={description} />
      <input type="hidden" name="amount" value={jumlahDiminta} />

      {previewMode ? (
        <>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-center text-xs font-medium text-amber-700">
            Pratinjau — belum tercatat. Cek dulu sebelum diajukan.
          </div>

          <SlipSummary {...summaryProps} />

          {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>}

          <div className="flex gap-2">
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
              {pending ? "Memproses…" : "Ajukan & Catat Transfer"}
            </button>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Pengeluaran</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Manual atau pilih dari transaksi — cuma buat hitungan lampiran ini, tidak dicatat ke mana-mana.
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-100">
            <div className="flex items-center justify-between bg-zinc-50 px-3.5 py-2 text-xs">
              <span className="font-medium text-zinc-600">
                Nota Kas Keluar ({fromLabel} – {toLabel}) — {selectedNotas.length}/{notaList.length} dipilih
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set(notaList.map((n) => n.id)))}
                  className="font-semibold text-brand-600 hover:underline"
                >
                  Pilih semua
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="font-semibold text-zinc-400 hover:underline"
                >
                  Kosongkan
                </button>
              </div>
            </div>
            {notaList.length === 0 ? (
              <p className="px-3.5 py-4 text-center text-xs text-zinc-300">
                Tidak ada nota kas keluar di periode ini.
              </p>
            ) : (
              <div className="max-h-56 divide-y divide-zinc-50 overflow-y-auto">
                {notaList.map((n) => (
                  <label
                    key={n.id}
                    className="flex cursor-pointer items-center gap-2.5 px-3.5 py-2 text-xs hover:bg-zinc-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(n.id)}
                      onChange={() => toggleNota(n.id)}
                      className="h-3.5 w-3.5 rounded border-zinc-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="w-11 shrink-0 text-zinc-400">{formatDateShort(n.created_at)}</span>
                    <span className="min-w-0 flex-1 truncate text-zinc-700">
                      {n.description}
                      {n.category && <span className="ml-1 text-zinc-400">({n.category})</span>}
                    </span>
                    <span className="shrink-0 font-medium text-zinc-800">{formatRupiah(n.amount)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            {manualRows.map((row) => (
              <div key={row.id} className="flex items-center gap-2">
                <input
                  type="date"
                  value={row.date}
                  onChange={(e) => updateManualRow(row.id, "date", e.target.value)}
                  className="shrink-0 rounded-lg border border-zinc-200 px-2.5 py-2 text-xs"
                />
                <input
                  type="text"
                  value={row.description}
                  onChange={(e) => updateManualRow(row.id, "description", e.target.value)}
                  placeholder="Keterangan"
                  className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-xs"
                />
                <input
                  type="number"
                  min="0"
                  value={row.amount}
                  onChange={(e) => updateManualRow(row.id, "amount", e.target.value)}
                  placeholder="Jumlah (Rp)"
                  className="w-28 shrink-0 rounded-lg border border-zinc-200 px-3 py-2 text-xs"
                />
                <button
                  type="button"
                  onClick={() => removeManualRow(row.id)}
                  className="shrink-0 rounded-lg px-2 py-2 text-xs text-zinc-400 hover:text-red-600"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setManualRows((prev) => [...prev, newManualRow(today)])}
            className="text-xs font-semibold text-brand-600 hover:underline"
          >
            + Tambah Pengeluaran Manual
          </button>

          <div className="flex items-center justify-between border-t border-zinc-100 pt-2.5">
            <span className="text-xs font-medium text-zinc-500">Total Pengeluaran</span>
            <span className="text-base font-bold text-red-600">{formatRupiah(totalPengeluaran)}</span>
          </div>

          <div className="border-t border-zinc-100 pt-3">
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Saldo Awal Rekening — {rekeningOperasionalName} (Rp)
            </label>
            <input
              type="number"
              min="0"
              value={modalAwal}
              onChange={(e) => setModalAwal(e.target.value)}
              placeholder="mis. 10000000"
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div className="rounded-xl border border-zinc-100 px-3 py-2 text-sm">
            <p className="text-[10.5px] font-semibold uppercase text-zinc-400">Sisa Saldo</p>
            <p className={`font-bold ${sisaSaldo < 0 ? "text-red-600" : "text-zinc-900"}`}>{formatRupiah(sisaSaldo)}</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Minta Dana / Ditransfer ke {rekeningOperasionalName} (Rp)
            </label>
            <input
              type="number"
              min="0"
              value={jumlahDiminta}
              onChange={(e) => setAmountOverride(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <p className="mt-1 text-[11px] text-zinc-400">
              Otomatis ikut Total Pengeluaran di atas — kalau diubah manual, nilainya tidak lagi ikut
              berubah walau daftar pengeluaran diubah.
            </p>
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
            disabled={!jumlahDiminta || Number(jumlahDiminta) <= 0}
            className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Lihat Preview →
          </button>
        </div>
      )}
    </form>
  );
}
