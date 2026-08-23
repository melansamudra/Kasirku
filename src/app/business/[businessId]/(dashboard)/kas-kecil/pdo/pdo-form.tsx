"use client";

import { useActionState, useRef, useState } from "react";
import type { TransferState } from "../../accounting/transfer-kas/actions";

const initialState: TransferState = { error: null };

function formatRupiah(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${Math.round(Math.abs(value)).toLocaleString("id-ID")}`;
}

export default function PdoForm({
  action,
  today,
  fromLabel,
  toLabel,
  totalNota,
  businessName,
  rekeningUtamaCode,
  rekeningOperasionalCode,
  rekeningOperasionalName,
}: {
  action: (state: TransferState, formData: FormData) => Promise<TransferState>;
  today: string;
  fromLabel: string;
  toLabel: string;
  totalNota: number;
  businessName: string;
  rekeningUtamaCode: string;
  rekeningOperasionalCode: string;
  rekeningOperasionalName: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [modalTunai, setModalTunai] = useState("");
  const [modalRekening, setModalRekening] = useState("");
  const [jumlahDiminta, setJumlahDiminta] = useState(String(totalNota || ""));
  const [catatan, setCatatan] = useState("");
  const [attempted, setAttempted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Diturunkan langsung dari state yang sudah ada (bukan disimpan state
  // terpisah) -- "sukses" itu murni fungsi dari attempted+pending+error saat
  // render, jadi tidak perlu efek yang manggil setState lagi setelahnya.
  const submitted = attempted && !pending && !state.error;

  const totalModalAwal = (Number(modalTunai) || 0) + (Number(modalRekening) || 0);
  const sisaSaldo = totalModalAwal - totalNota;
  const description =
    `PDO ${fromLabel} - ${toLabel} — Total Nota ${formatRupiah(totalNota)}, ` +
    `Modal Awal ${formatRupiah(totalModalAwal)} (Tunai ${formatRupiah(Number(modalTunai) || 0)} + ` +
    `Rekening ${formatRupiah(Number(modalRekening) || 0)})` +
    (catatan.trim() ? ` — ${catatan.trim()}` : "");

  if (submitted) {
    return (
      <div className="mt-4">
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 text-center text-sm font-medium text-brand-700 print:hidden">
          ✓ Transfer tercatat — {formatRupiah(Number(jumlahDiminta) || 0)} dari {rekeningUtamaCode} ke{" "}
          {rekeningOperasionalCode}
        </div>

        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-6 print:border-0 print:p-0">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase text-zinc-400">{businessName}</p>
            <h2 className="mt-1 text-lg font-bold text-zinc-900">Slip Permintaan Dana Operasional</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Periode nota: {fromLabel} – {toLabel}</p>
          </div>

          <div className="mt-4 space-y-1.5 border-t border-dashed border-zinc-300 pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">Modal Awal — Tunai</span>
              <span className="font-medium text-zinc-900">{formatRupiah(Number(modalTunai) || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Modal Awal — Rekening</span>
              <span className="font-medium text-zinc-900">{formatRupiah(Number(modalRekening) || 0)}</span>
            </div>
            <div className="flex justify-between border-t border-zinc-100 pt-1.5 font-semibold text-zinc-900">
              <span>Total Modal Awal</span>
              <span>{formatRupiah(totalModalAwal)}</span>
            </div>
            <div className="flex justify-between pt-1.5">
              <span className="text-zinc-500">Total Nota Dibayarkan</span>
              <span className="font-medium text-red-600">{formatRupiah(totalNota)}</span>
            </div>
            <div className="flex justify-between border-t border-zinc-100 pt-1.5 font-semibold text-zinc-900">
              <span>Sisa Saldo</span>
              <span>{formatRupiah(sisaSaldo)}</span>
            </div>
            <div className="flex justify-between border-t border-dashed border-zinc-300 pt-2 text-base font-bold text-brand-700">
              <span>Jumlah Diminta (Transfer)</span>
              <span>{formatRupiah(Number(jumlahDiminta) || 0)}</span>
            </div>
            {catatan.trim() && (
              <p className="pt-1 text-xs text-zinc-500">Catatan: {catatan.trim()}</p>
            )}
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
              setModalTunai("");
              setModalRekening("");
              setCatatan("");
              setJumlahDiminta(String(totalNota || ""));
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
      className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-white p-5"
    >
      <input type="hidden" name="date" value={today} />
      <input type="hidden" name="fromCode" value={rekeningUtamaCode} />
      <input type="hidden" name="toCode" value={rekeningOperasionalCode} />
      <input type="hidden" name="description" value={description} />

      <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3.5 py-2.5 text-sm">
        <div className="flex justify-between text-zinc-500">
          <span>Total Nota Dibayarkan (Kas Kecil, {fromLabel} – {toLabel})</span>
        </div>
        <p className="mt-0.5 text-lg font-bold text-red-600">{formatRupiah(totalNota)}</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Modal Awal — Tunai (Rp)</label>
          <input
            type="number"
            min="0"
            value={modalTunai}
            onChange={(e) => setModalTunai(e.target.value)}
            placeholder="mis. 2000000"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Modal Awal — Rekening (Rp)</label>
          <input
            type="number"
            min="0"
            value={modalRekening}
            onChange={(e) => setModalRekening(e.target.value)}
            placeholder="mis. 10000000"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 text-sm">
        <div className="rounded-xl border border-zinc-100 px-3 py-2">
          <p className="text-[10.5px] font-semibold uppercase text-zinc-400">Total Modal Awal</p>
          <p className="font-bold text-zinc-900">{formatRupiah(totalModalAwal)}</p>
        </div>
        <div className="rounded-xl border border-zinc-100 px-3 py-2">
          <p className="text-[10.5px] font-semibold uppercase text-zinc-400">Sisa Saldo</p>
          <p className={`font-bold ${sisaSaldo < 0 ? "text-red-600" : "text-zinc-900"}`}>{formatRupiah(sisaSaldo)}</p>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">
          Jumlah Diminta / Ditransfer ke {rekeningOperasionalName} (Rp)
        </label>
        <input
          type="number"
          name="amount"
          min="0"
          value={jumlahDiminta}
          onChange={(e) => setJumlahDiminta(e.target.value)}
          required
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <p className="mt-1 text-[11px] text-zinc-400">
          Default = Total Nota Dibayarkan (biar saldo balik ke Modal Awal) — bisa diubah kalau perlu.
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

      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || !jumlahDiminta || Number(jumlahDiminta) <= 0}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Memproses…" : "Ajukan & Catat Transfer"}
      </button>
    </form>
  );
}
