"use client";

import { useMemo, useState } from "react";

type Nota = {
  id: string;
  description: string;
  amount: number;
  created_at: string;
};

type OmsetRow = {
  id: string;
  date: string;
  amount: string;
};

type ManualRow = {
  id: string;
  date: string;
  description: string;
  amount: string;
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

function newOmsetRow(date: string): OmsetRow {
  return { id: crypto.randomUUID(), date, amount: "" };
}

function newManualRow(date: string): ManualRow {
  return { id: crypto.randomUUID(), date, description: "", amount: "" };
}

export default function PettyCashTunaiSection({
  today,
  fromLabel,
  toLabel,
  notaList,
  businessName,
}: {
  today: string;
  fromLabel: string;
  toLabel: string;
  notaList: Nota[];
  businessName: string;
}) {
  const [saldoAwal, setSaldoAwal] = useState("");
  const [omsetRows, setOmsetRows] = useState<OmsetRow[]>(() => [newOmsetRow(today)]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(notaList.map((n) => n.id)));
  // Baris pengeluaran manual -- murni state lokal buat hitungan lampiran ini
  // saja, TIDAK pernah dikirim ke server/dicatat ke jurnal mana pun (beda
  // dengan notaList yang memang tarikan data kas keluar yang sudah tercatat
  // beneran). Ceklis dari notaList atau isi manual di sini sama-sama cuma
  // numpang hitung Total Pengeluaran di lampiran.
  const [manualRows, setManualRows] = useState<ManualRow[]>([]);
  const [catatan, setCatatan] = useState("");

  const selectedNotas = useMemo(() => notaList.filter((n) => selectedIds.has(n.id)), [notaList, selectedIds]);
  const totalNotaTerpilih = selectedNotas.reduce((s, n) => s + n.amount, 0);
  const totalManual = manualRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const totalPengeluaran = totalNotaTerpilih + totalManual;

  const totalOmset = omsetRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const totalSaldoTunai = (Number(saldoAwal) || 0) + totalOmset;
  const saldoTunaiSaatIni = totalSaldoTunai - totalPengeluaran;

  const rincianPengeluaran = useMemo(
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

  const rincianOmset = useMemo(
    () =>
      omsetRows
        .filter((r) => (Number(r.amount) || 0) > 0)
        .map((r) => ({ id: r.id, date: `${r.date}T00:00:00+07:00`, amount: Number(r.amount) || 0 }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [omsetRows],
  );

  function toggleNota(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateOmsetRow(id: string, field: "date" | "amount", value: string) {
    setOmsetRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function removeOmsetRow(id: string) {
    setOmsetRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  }

  function updateManualRow(id: string, field: "date" | "description" | "amount", value: string) {
    setManualRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function removeManualRow(id: string) {
    setManualRows((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3 print:hidden">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Saldo Kas Tunai Awal</h3>
          <p className="mt-0.5 text-xs text-zinc-500">Sisa kas tunai sebelumnya (kalau ada).</p>
        </div>
        <input
          type="number"
          min="0"
          value={saldoAwal}
          onChange={(e) => setSaldoAwal(e.target.value)}
          placeholder="mis. 200000"
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />

        <div className="border-t border-zinc-100 pt-3">
          <h3 className="text-sm font-semibold text-zinc-900">+ Tambah Omset</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Tambahkan omset tunai per tanggal yang jadi tambahan modal kas tunai (isi manual).
          </p>
        </div>

        <div className="space-y-2">
          {omsetRows.map((row) => (
            <div key={row.id} className="flex items-center gap-2">
              <input
                type="date"
                value={row.date}
                onChange={(e) => updateOmsetRow(row.id, "date", e.target.value)}
                className="rounded-lg border border-zinc-200 px-2.5 py-2 text-sm"
              />
              <input
                type="number"
                min="0"
                value={row.amount}
                onChange={(e) => updateOmsetRow(row.id, "amount", e.target.value)}
                placeholder="Jumlah omset tunai (Rp)"
                className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => removeOmsetRow(row.id)}
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
          className="text-xs font-semibold text-brand-600 hover:underline"
        >
          + Tambah Omset Tunai
        </button>

        <div className="flex items-center justify-between border-t border-zinc-100 pt-2.5">
          <span className="text-xs font-medium text-zinc-500">Total Saldo Tunai</span>
          <span className="text-base font-bold text-zinc-900">{formatRupiah(totalSaldoTunai)}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3">
        <div className="print:hidden">
          <h3 className="text-sm font-semibold text-zinc-900">Pengeluaran</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Manual atau pilih dari nota kas keluar — cuma buat hitungan lampiran ini, tidak dicatat ke
            mana-mana.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-100 print:hidden">
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
                  <span className="min-w-0 flex-1 truncate text-zinc-700">{n.description}</span>
                  <span className="shrink-0 font-medium text-zinc-800">{formatRupiah(n.amount)}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2 print:hidden">
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
          className="text-xs font-semibold text-brand-600 hover:underline print:hidden"
        >
          + Tambah Pengeluaran Manual
        </button>

        <div className="flex items-center justify-between border-t border-zinc-100 pt-2.5">
          <span className="text-xs font-medium text-zinc-500">Total Pengeluaran</span>
          <span className="text-base font-bold text-red-600">{formatRupiah(totalPengeluaran)}</span>
        </div>
      </div>

      <div className="print:hidden">
        <label className="mb-1 block text-xs font-medium text-zinc-600">Catatan (opsional)</label>
        <input
          type="text"
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder="mis. Rekap mingguan"
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 print:border-0 print:p-0">
        <div className="hidden text-center print:block">
          <p className="text-xs font-semibold uppercase text-zinc-400">{businessName}</p>
          <h2 className="mt-1 text-lg font-bold text-zinc-900">Rekap Petty Cash Tunai</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Periode nota: {fromLabel} – {toLabel}
          </p>
        </div>
        <div className="space-y-1.5 text-sm print:mt-4 print:border-t print:border-dashed print:border-zinc-300 print:pt-3">
          <div className="flex justify-between">
            <span className="text-zinc-500">Saldo Kas Tunai Awal</span>
            <span className="font-medium text-zinc-900">{formatRupiah(Number(saldoAwal) || 0)}</span>
          </div>

          <div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Tambah Omset</span>
              <span className="font-medium text-zinc-900">{formatRupiah(totalOmset)}</span>
            </div>
            {rincianOmset.length > 0 && (
              <div className="mt-1 space-y-0.5 pl-3">
                <p className="text-[10px] font-semibold uppercase text-zinc-400">Catatan Kas Masuk</p>
                {rincianOmset.map((r) => (
                  <div key={r.id} className="flex justify-between text-xs text-zinc-500">
                    <span>{formatDateShort(r.date)}</span>
                    <span>{formatRupiah(r.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-between border-t border-zinc-100 pt-1.5 font-medium text-zinc-900">
            <span>Total Saldo Tunai</span>
            <span>{formatRupiah(totalSaldoTunai)}</span>
          </div>

          <div>
            <div className="flex justify-between pt-1.5">
              <span className="text-zinc-500">Total Pengeluaran</span>
              <span className="font-medium text-red-600">-{formatRupiah(totalPengeluaran)}</span>
            </div>
            {rincianPengeluaran.length > 0 && (
              <div className="mt-1 space-y-0.5 pl-3">
                <p className="text-[10px] font-semibold uppercase text-zinc-400">Catatan Kas Keluar</p>
                {rincianPengeluaran.map((n) => (
                  <div key={n.id} className="flex justify-between gap-2 text-xs text-zinc-500">
                    <span className="min-w-0 truncate">{formatDateShort(n.date)} — {n.description}</span>
                    <span className="shrink-0">{formatRupiah(n.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {catatan.trim() && <p className="pt-1 text-xs text-zinc-500">Catatan: {catatan.trim()}</p>}
          <div className="flex justify-between border-t border-zinc-200 pt-2 text-base font-bold text-brand-700">
            <span>Saldo Tunai Saat Ini</span>
            <span>{formatRupiah(saldoTunaiSaatIni)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
