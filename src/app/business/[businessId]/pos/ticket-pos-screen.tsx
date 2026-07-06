"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { closeShift, type CloseShiftSummary } from "./actions";
import { checkoutTicket, lookupMemberByCode, type TicketCartItemInput } from "./ticket-actions";
import SwitchCashierButton from "./switch-cashier-button";

type TicketCategory = {
  id: string;
  name: string;
  priceWeekday: number;
  priceHoliday: number;
  memberPrice: number;
};

type Member = { id: string; name: string; memberCode: string; validUntil: string };

const BUILTIN_PAYMENT_METHODS = ["Tunai", "Kartu", "QRIS"];

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

export default function TicketPosScreen({
  businessId,
  businessName,
  cashierId,
  cashierName,
  shiftId,
  categories,
  taxRate,
  serviceRate,
  isHoliday,
  customPaymentMethods,
}: {
  businessId: string;
  businessName: string;
  cashierId: string;
  cashierName: string;
  shiftId: string;
  categories: TicketCategory[];
  taxRate: number;
  serviceRate: number;
  isHoliday: boolean;
  customPaymentMethods: string[];
}) {
  const router = useRouter();
  const paymentMethods = useMemo(
    () => [...BUILTIN_PAYMENT_METHODS, ...customPaymentMethods],
    [customPaymentMethods],
  );

  const [qtyByCategory, setQtyByCategory] = useState<Record<string, number>>({});

  const [memberCode, setMemberCode] = useState("");
  const [member, setMember] = useState<Member | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberBusy, setMemberBusy] = useState(false);

  const [paying, setPaying] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(BUILTIN_PAYMENT_METHODS[0]);
  const [received, setReceived] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInvoice, setSuccessInvoice] = useState<string | null>(null);

  const [closingShift, setClosingShift] = useState(false);
  const [closingCash, setClosingCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [closedSummary, setClosedSummary] = useState<CloseShiftSummary | null>(null);

  function unitPriceFor(category: TicketCategory) {
    if (member) return category.memberPrice;
    return isHoliday ? category.priceHoliday : category.priceWeekday;
  }

  function changeQty(categoryId: string, delta: number) {
    setQtyByCategory((prev) => {
      const nextQty = Math.max(0, (prev[categoryId] ?? 0) + delta);
      const next = { ...prev };
      if (nextQty <= 0) {
        delete next[categoryId];
      } else {
        next[categoryId] = nextQty;
      }
      return next;
    });
  }

  const cartLines = categories
    .filter((c) => (qtyByCategory[c.id] ?? 0) > 0)
    .map((c) => ({
      category: c,
      qty: qtyByCategory[c.id],
      unitPrice: unitPriceFor(c),
    }));

  const subtotal = cartLines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
  const serviceAmt = serviceRate > 0 ? Math.round((subtotal * serviceRate) / 100) : 0;
  const taxAmt = taxRate > 0 ? Math.round(((subtotal + serviceAmt) * taxRate) / 100) : 0;
  const total = subtotal + serviceAmt + taxAmt;
  const receivedAmount = Number(received) || 0;
  const change = paymentMethod === "Tunai" ? receivedAmount - total : 0;

  async function handleLookupMember() {
    setMemberError(null);
    setMemberBusy(true);
    const result = await lookupMemberByCode(businessId, memberCode);
    setMemberBusy(false);
    if (!result.success) {
      setMemberError(result.error);
      return;
    }
    setMember(result.member);
  }

  async function handleConfirmPayment() {
    setError(null);

    if (paymentMethod === "Tunai" && receivedAmount < total) {
      setError("Uang diterima kurang dari total.");
      return;
    }

    const items: TicketCartItemInput[] = cartLines.map((l) => ({
      ticketCategoryId: l.category.id,
      qty: l.qty,
    }));

    setSubmitting(true);
    const result = await checkoutTicket(
      businessId,
      cashierId,
      items,
      paymentMethod,
      paymentMethod === "Tunai" ? receivedAmount : total,
      member?.id ?? null,
    );
    setSubmitting(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    setSuccessInvoice(result.invoiceNumber);
  }

  async function handleConfirmCloseShift() {
    setCloseError(null);

    const amount = Number(closingCash);
    if (!closingCash || Number.isNaN(amount) || amount < 0) {
      setCloseError("Jumlah kas harus angka dan tidak boleh negatif.");
      return;
    }

    setCloseSubmitting(true);
    const result = await closeShift(businessId, shiftId, amount, closeNotes);
    setCloseSubmitting(false);

    if (!result.success) {
      setCloseError(result.error);
      return;
    }

    setClosedSummary(result.summary);
  }

  function resetForNextTransaction() {
    setSuccessInvoice(null);
    setQtyByCategory({});
    setMember(null);
    setMemberCode("");
    setPaying(false);
    setReceived("");
    router.refresh();
  }

  if (successInvoice) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-2xl">
            🎟️
          </div>
          <h1 className="text-lg font-bold text-zinc-900">Tiket berhasil terbit</h1>
          <p className="mt-1 text-sm text-zinc-500">No. Tiket: {successInvoice}</p>
          <button
            onClick={resetForNextTransaction}
            className="mt-6 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Transaksi Baru
          </button>
        </div>
      </div>
    );
  }

  if (closedSummary) {
    const diff = closedSummary.difference;
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6">
          <h1 className="text-center text-lg font-bold text-zinc-900">Shift Ditutup</h1>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between text-zinc-600">
              <span>Total Penjualan</span>
              <span className="font-medium text-zinc-900">
                {formatRupiah(closedSummary.total_sales)}
              </span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>Penjualan Tunai</span>
              <span className="font-medium text-zinc-900">
                {formatRupiah(closedSummary.cash_sales)}
              </span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>Penjualan Non-Tunai</span>
              <span className="font-medium text-zinc-900">
                {formatRupiah(closedSummary.non_cash_sales)}
              </span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>Jumlah Transaksi</span>
              <span className="font-medium text-zinc-900">{closedSummary.tx_count}</span>
            </div>
            <div className="flex justify-between border-t border-zinc-100 pt-2 text-zinc-600">
              <span>Kas Diharapkan</span>
              <span className="font-medium text-zinc-900">
                {formatRupiah(closedSummary.expected_cash)}
              </span>
            </div>
            <div className="flex justify-between font-semibold">
              <span className={diff === 0 ? "text-zinc-900" : diff > 0 ? "text-brand-700" : "text-red-600"}>
                Selisih
              </span>
              <span className={diff === 0 ? "text-zinc-900" : diff > 0 ? "text-brand-700" : "text-red-600"}>
                {diff === 0 ? "Pas" : `${diff > 0 ? "+" : ""}${formatRupiah(diff)}`}
              </span>
            </div>
          </div>
          <button
            onClick={() => router.refresh()}
            className="mt-6 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Selesai
          </button>
        </div>
      </div>
    );
  }

  if (closingShift) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6">
          <h1 className="text-lg font-bold text-zinc-900">Tutup Shift</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Hitung uang tunai di laci, lalu masukkan jumlahnya.
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="closingCash" className="mb-1 block text-xs font-medium text-zinc-600">
                Kas di Laci Sekarang (Rp)
              </label>
              <input
                id="closingCash"
                type="number"
                min="0"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                placeholder="mis. 750000"
              />
            </div>
            <div>
              <label htmlFor="closeNotes" className="mb-1 block text-xs font-medium text-zinc-600">
                Catatan (opsional)
              </label>
              <input
                id="closeNotes"
                type="text"
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>

            {closeError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{closeError}</p>
            )}

            <button
              onClick={handleConfirmCloseShift}
              disabled={closeSubmitting}
              className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {closeSubmitting ? "Memproses…" : "Tutup Shift"}
            </button>
            <button
              onClick={() => {
                setClosingShift(false);
                setCloseError(null);
              }}
              className="w-full py-1 text-center text-xs font-medium text-zinc-400 hover:text-zinc-600"
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      {/* Kategori tiket */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-zinc-900">{businessName}</h1>
            <p className="text-xs text-zinc-500">Kasir: {cashierName}</p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              isHoliday ? "bg-amber-50 text-amber-700" : "bg-zinc-100 text-zinc-600"
            }`}
          >
            {isHoliday ? "🌴 Hari Libur" : "📅 Hari Kerja"}
          </span>
        </div>

        <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-3.5">
          <p className="mb-2 text-xs font-medium text-zinc-600">Member (opsional)</p>
          {member ? (
            <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2">
              <div>
                <p className="text-sm font-semibold text-brand-700">{member.name}</p>
                <p className="text-[11px] text-brand-600">
                  {member.memberCode} · berlaku s/d{" "}
                  {new Date(member.validUntil).toLocaleDateString("id-ID")}
                </p>
              </div>
              <button
                onClick={() => {
                  setMember(null);
                  setMemberCode("");
                }}
                className="text-xs font-medium text-brand-700 hover:underline"
              >
                Lepas
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={memberCode}
                onChange={(e) => setMemberCode(e.target.value)}
                placeholder="Kode member"
                className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <button
                onClick={handleLookupMember}
                disabled={memberBusy}
                className="rounded-lg bg-zinc-900 px-4 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {memberBusy ? "Mencari…" : "Cari"}
              </button>
            </div>
          )}
          {memberError && <p className="mt-1.5 text-xs text-red-600">{memberError}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {categories.map((c) => {
            const qty = qtyByCategory[c.id] ?? 0;
            const price = unitPriceFor(c);
            return (
              <div
                key={c.id}
                className="rounded-2xl border border-zinc-200 bg-white p-4 text-center"
              >
                <p className="text-sm font-bold text-zinc-900">{c.name}</p>
                <p className="mt-1 text-xs text-zinc-500">{formatRupiah(price)}</p>
                <div className="mt-3 flex items-center justify-center gap-3">
                  <button
                    onClick={() => changeQty(c.id, -1)}
                    disabled={qty <= 0}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="w-6 text-sm font-semibold tabular-nums">{qty}</span>
                  <button
                    onClick={() => changeQty(c.id, 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 hover:border-brand-300 hover:text-brand-700"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
          {categories.length === 0 && (
            <p className="col-span-full py-12 text-center text-xs text-zinc-400">
              Belum ada kategori tiket. Tambahkan lewat menu Pengaturan.
            </p>
          )}
        </div>
      </div>

      {/* Keranjang & pembayaran */}
      <div className="flex w-full flex-col border-t border-zinc-200 bg-white p-4 md:w-80 md:border-l md:border-t-0">
        <div className="flex-1 space-y-2 overflow-y-auto">
          {cartLines.length === 0 ? (
            <p className="py-12 text-center text-xs text-zinc-400">Belum ada tiket dipilih</p>
          ) : (
            cartLines.map((l) => (
              <div key={l.category.id} className="flex items-center justify-between text-sm">
                <span className="text-zinc-700">
                  {l.qty}x {l.category.name}
                </span>
                <span className="tabular-nums text-zinc-900">
                  {formatRupiah(l.unitPrice * l.qty)}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="mt-3 space-y-1 border-t border-zinc-100 pt-3">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatRupiah(subtotal)}</span>
          </div>
          {serviceAmt > 0 && (
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>Layanan ({serviceRate}%)</span>
              <span className="tabular-nums">{formatRupiah(serviceAmt)}</span>
            </div>
          )}
          {taxAmt > 0 && (
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>PPN ({taxRate}%)</span>
              <span className="tabular-nums">{formatRupiah(taxAmt)}</span>
            </div>
          )}
          <div className="flex items-center justify-between pt-1 text-sm font-semibold text-zinc-900">
            <span>Total</span>
            <span className="tabular-nums">{formatRupiah(total)}</span>
          </div>
        </div>

        {!paying ? (
          <>
            <button
              onClick={() => setPaying(true)}
              disabled={cartLines.length === 0}
              className="mt-3 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Bayar
            </button>
            <button
              onClick={() => setClosingShift(true)}
              className="mt-2 w-full rounded-xl border border-red-200 py-2.5 text-sm font-semibold text-red-500 transition-colors hover:bg-red-50"
            >
              Tutup Shift
            </button>
            <SwitchCashierButton />
          </>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {paymentMethods.map((m) => (
                <button
                  key={m}
                  onClick={() => setPaymentMethod(m)}
                  className={`rounded-xl border py-2 text-xs font-medium transition-colors ${
                    paymentMethod === m
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {paymentMethod === "Tunai" && (
              <div>
                <label htmlFor="received" className="mb-1 block text-xs font-medium text-zinc-600">
                  Uang Diterima
                </label>
                <input
                  id="received"
                  type="number"
                  min="0"
                  value={received}
                  onChange={(e) => setReceived(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 px-3.5 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  placeholder={String(total)}
                />
                {receivedAmount >= total && received !== "" && (
                  <p className="mt-1 text-xs text-zinc-500">Kembalian: {formatRupiah(change)}</p>
                )}
              </div>
            )}

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

            <button
              onClick={handleConfirmPayment}
              disabled={submitting}
              className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Memproses…" : "Konfirmasi Pembayaran"}
            </button>
            <button
              onClick={() => {
                setPaying(false);
                setError(null);
              }}
              className="w-full py-1 text-center text-xs font-medium text-zinc-400 hover:text-zinc-600"
            >
              Batal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
