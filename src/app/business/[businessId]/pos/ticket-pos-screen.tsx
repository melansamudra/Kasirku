"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { closeShift, type CloseShiftSummary } from "./actions";
import { checkoutTicket, type TicketCartItemInput } from "./ticket-actions";
import { calculateTicketTotals, ticketUnitPrice } from "@/lib/ticket-checkout-totals";
import SwitchCashierButton from "./switch-cashier-button";
import MemberPanel, { type FullMember, type SelectedMember } from "./member-panel";

type TicketCategory = {
  id: string;
  name: string;
  priceWeekday: number;
  priceHoliday: number;
  memberPrice: number;
};

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
  members,
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
  members: FullMember[];
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

  const [unitsByCategory, setUnitsByCategory] = useState<Record<string, string[]>>({});
  const lastAddedRef = useRef<{ categoryId: string; index: number } | null>(null);
  const unitInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const [member, setMember] = useState<SelectedMember | null>(null);

  const [paying, setPaying] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(BUILTIN_PAYMENT_METHODS[0]);
  const [received, setReceived] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInvoice, setSuccessInvoice] = useState<string | null>(null);
  const [successTransactionId, setSuccessTransactionId] = useState<string | null>(null);

  const [closingShift, setClosingShift] = useState(false);
  const [closingCash, setClosingCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [closedSummary, setClosedSummary] = useState<CloseShiftSummary | null>(null);

  function unitPriceFor(category: TicketCategory) {
    return ticketUnitPrice(category, { isMember: !!member, isHoliday });
  }

  function addUnit(categoryId: string) {
    setUnitsByCategory((prev) => {
      const next = [...(prev[categoryId] ?? []), ""];
      lastAddedRef.current = { categoryId, index: next.length - 1 };
      return { ...prev, [categoryId]: next };
    });
  }

  useEffect(() => {
    if (!lastAddedRef.current) return;
    const { categoryId, index } = lastAddedRef.current;
    lastAddedRef.current = null;
    unitInputRefs.current.get(`${categoryId}-${index}`)?.focus();
  }, [unitsByCategory]);

  function removeUnit(categoryId: string, index: number) {
    setUnitsByCategory((prev) => {
      const next = { ...prev };
      const arr = (next[categoryId] ?? []).filter((_, i) => i !== index);
      if (arr.length === 0) {
        delete next[categoryId];
      } else {
        next[categoryId] = arr;
      }
      return next;
    });
  }

  function setUnitNumber(categoryId: string, index: number, value: string) {
    setUnitsByCategory((prev) => {
      const arr = [...(prev[categoryId] ?? [])];
      arr[index] = value;
      return { ...prev, [categoryId]: arr };
    });
  }

  const cartLines = categories
    .filter((c) => (unitsByCategory[c.id] ?? []).length > 0)
    .map((c) => ({
      category: c,
      units: unitsByCategory[c.id] ?? [],
      unitPrice: unitPriceFor(c),
    }));

  const { subtotal, serviceAmt, taxAmt, total } = calculateTicketTotals({
    lines: cartLines.map((l) => ({ unitPrice: l.unitPrice, qty: l.units.length })),
    serviceRate,
    taxRate,
  });
  const receivedAmount = Number(received) || 0;
  const change = paymentMethod === "Tunai" ? receivedAmount - total : 0;

  async function handleConfirmPayment() {
    setError(null);

    if (paymentMethod === "Tunai" && receivedAmount < total) {
      setError("Uang diterima kurang dari total.");
      return;
    }

    if (cartLines.some((l) => l.units.some((u) => u.trim() === ""))) {
      setError("Semua nomor tiket fisik harus diisi.");
      return;
    }

    const items: TicketCartItemInput[] = cartLines.map((l) => ({
      ticketCategoryId: l.category.id,
      manualNumbers: l.units.map((u) => u.trim()),
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
    setSuccessTransactionId(result.transactionId);
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
    setSuccessTransactionId(null);
    setUnitsByCategory({});
    setMember(null);
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
          {successTransactionId && (
            <Link
              href={`/business/${businessId}/ticket-reports/${successTransactionId}/receipt`}
              target="_blank"
              className="mt-6 block w-full rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              🖨️ Cetak Struk
            </Link>
          )}
          <button
            onClick={resetForNextTransaction}
            className="mt-3 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
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

        <MemberPanel
          businessId={businessId}
          members={members}
          member={member}
          onSelect={setMember}
          onRelease={() => setMember(null)}
        />

        <div className="space-y-3">
          {categories.map((c) => {
            const units = unitsByCategory[c.id] ?? [];
            const price = unitPriceFor(c);
            return (
              <div key={c.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-zinc-900">{c.name}</p>
                    <p className="text-xs text-zinc-500">
                      {formatRupiah(price)}
                      {units.length > 0 &&
                        ` · ${units.length} tiket · ${formatRupiah(price * units.length)}`}
                    </p>
                  </div>
                  <button
                    onClick={() => addUnit(c.id)}
                    className="rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                  >
                    + Tambah Tiket
                  </button>
                </div>
                {units.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {units.map((u, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-5 shrink-0 text-xs text-zinc-400">{i + 1}.</span>
                        <input
                          ref={(el) => {
                            const key = `${c.id}-${i}`;
                            if (el) unitInputRefs.current.set(key, el);
                            else unitInputRefs.current.delete(key);
                          }}
                          type="text"
                          value={u}
                          onChange={(e) => setUnitNumber(c.id, i, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addUnit(c.id);
                            }
                          }}
                          placeholder="No. tiket fisik"
                          className="flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                        />
                        <button
                          onClick={() => removeUnit(c.id, i)}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 hover:border-red-300 hover:text-red-600"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {categories.length === 0 && (
            <p className="py-12 text-center text-xs text-zinc-400">
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
                  {l.units.length}x {l.category.name}
                </span>
                <span className="tabular-nums text-zinc-900">
                  {formatRupiah(l.unitPrice * l.units.length)}
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
