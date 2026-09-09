"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import type { ReservationState } from "./actions";
import { getTableAvailability, type TableAvailability } from "./actions";

type Product = { id: string; name: string; price: number; category: string | null };

const initialState: ReservationState = { error: null, success: false };

// Posisi tetap tiap meja di denah (persen dari lebar/tinggi area lantai) --
// disusun manual meniru layout resto sederhana: 2 meja dekat jendela, 2 di
// tengah, 2 dekat pintu masuk. Meja dengan nomor di luar daftar ini jatuh ke
// posisi tengah default.
const TABLE_LAYOUT: Record<string, { x: number; y: number }> = {
  "1": { x: 14, y: 32 },
  "2": { x: 14, y: 68 },
  "3": { x: 47, y: 22 },
  "4": { x: 47, y: 62 },
  "5": { x: 80, y: 32 },
  "6": { x: 80, y: 68 },
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function MieKotaReservationFlow({
  slug,
  products,
  action,
}: {
  slug: string;
  products: Product[];
  action: (state: ReservationState, formData: FormData) => Promise<ReservationState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  // Kosong di render pertama (server & client sama-sama "") lalu diisi di
  // useEffect (client-only) -- menghindari mismatch hydration kalau
  // new Date() dipanggil di render server vs render client beda sepersekian
  // detik (apalagi dekat pergantian hari), yang bisa bikin React membuang
  // seluruh subtree ini dan mematikan semua onClick di dalamnya.
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:00");
  const [tables, setTables] = useState<TableAvailability[]>([]);
  const [loadingTables, startLoadingTables] = useTransition();
  const [selectedTableId, setSelectedTableId] = useState<string>("");
  const [qtyByProduct, setQtyByProduct] = useState<Record<string, number>>({});
  const [noteByProduct, setNoteByProduct] = useState<Record<string, string>>({});

  useEffect(() => {
    setDate(todayStr());
  }, []);

  useEffect(() => {
    if (!date) return;
    setSelectedTableId("");
    startLoadingTables(async () => {
      const rows = await getTableAvailability(slug, date);
      setTables(rows);
    });
  }, [date, slug]);

  const items = Object.entries(qtyByProduct)
    .filter(([, qty]) => qty > 0)
    .map(([product_id, qty]) => ({ product_id, qty, note: noteByProduct[product_id]?.trim() || undefined }));

  const itemsTotal = items.reduce((sum, it) => {
    const p = products.find((prod) => prod.id === it.product_id);
    return sum + (p ? p.price * it.qty : 0);
  }, 0);

  function changeQty(productId: string, delta: number) {
    setQtyByProduct((prev) => ({ ...prev, [productId]: Math.max(0, (prev[productId] ?? 0) + delta) }));
  }

  if (state.success) {
    return (
      <p className="text-sm font-medium text-emerald-700">
        ✓ Reservasi terkirim. Tim kami akan menghubungi kamu untuk konfirmasi.
      </p>
    );
  }

  const categories = Array.from(new Set(products.map((p) => p.category ?? "Menu")));

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="tableId" value={selectedTableId} readOnly />
      <input type="hidden" name="items" value={JSON.stringify(items)} readOnly />

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">1. Tanggal &amp; Jam</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <input
            name="date"
            type="date"
            required
            value={date}
            min={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
          />
          <input
            name="time"
            type="time"
            required
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">2. Pilih Meja</p>
        {loadingTables ? (
          <p className="mt-2 text-xs text-zinc-400">Memuat ketersediaan meja...</p>
        ) : tables.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-400">Belum ada data meja untuk toko ini.</p>
        ) : (
          <>
            <div
              className="relative mt-3 overflow-hidden rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50"
              style={{ aspectRatio: "4 / 3", minHeight: 240, width: "100%" }}
            >
              <div className="absolute left-0 top-0 h-full w-2 bg-sky-100" />
              <div className="absolute left-1/2 top-1.5 -translate-x-1/2 rounded-full bg-zinc-200 px-2 py-0.5 text-[9px] font-semibold tracking-wide text-zinc-500">
                PINTU MASUK
              </div>
              <div className="absolute bottom-1.5 right-1.5 rounded bg-zinc-200 px-2 py-0.5 text-[9px] font-semibold tracking-wide text-zinc-500">
                DAPUR
              </div>
              <div className="absolute left-2 top-1/2 -translate-y-1/2 -rotate-90 text-[8px] font-semibold tracking-widest text-sky-400">
                JENDELA
              </div>

              {tables.map((t) => {
                const pos = TABLE_LAYOUT[t.table_name] ?? { x: 50, y: 50 };
                return (
                  <button
                    key={t.table_id}
                    type="button"
                    disabled={t.is_taken}
                    onClick={() => setSelectedTableId(t.table_id)}
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                    className={`absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-sm font-bold shadow-sm transition ${
                      t.is_taken
                        ? "cursor-not-allowed border-red-400 bg-red-100 text-red-500"
                        : selectedTableId === t.table_id
                          ? "scale-110 border-amber-600 bg-amber-400 text-white"
                          : "border-emerald-400 bg-emerald-50 text-emerald-700 hover:scale-105"
                    }`}
                  >
                    {t.table_name}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-zinc-500">
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Tersedia
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" /> Terpakai
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Dipilih
              </span>
            </div>
          </>
        )}
        {!selectedTableId && tables.length > 0 && (
          <p className="mt-1 text-[11px] text-zinc-400">Pilih meja yang tersedia (tidak wajib).</p>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">3. Pre-order Menu (opsional)</p>
        <div className="mt-2 space-y-4">
          {categories.map((cat) => (
            <div key={cat}>
              <p className="text-[11px] font-semibold uppercase text-zinc-400">{cat}</p>
              <div className="mt-1 space-y-1">
                {products
                  .filter((p) => (p.category ?? "Menu") === cat)
                  .map((p) => {
                    const qty = qtyByProduct[p.id] ?? 0;
                    return (
                      <div
                        key={p.id}
                        className="rounded-lg border border-zinc-100 px-3 py-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-medium text-zinc-800">{p.name}</p>
                            <p className="text-[11px] text-zinc-400">Rp{p.price.toLocaleString("id-ID")}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => changeQty(p.id, -1)}
                              className="h-6 w-6 rounded-full border border-zinc-200 text-xs"
                            >
                              -
                            </button>
                            <span className="w-4 text-center text-xs">{qty}</span>
                            <button
                              type="button"
                              onClick={() => changeQty(p.id, 1)}
                              className="h-6 w-6 rounded-full border border-zinc-200 text-xs"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        {qty > 0 && (
                          <input
                            type="text"
                            value={noteByProduct[p.id] ?? ""}
                            onChange={(e) =>
                              setNoteByProduct((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                            placeholder="Catatan menu ini (mis. pedas, tanpa bawang)"
                            className="mt-1.5 w-full rounded-md border border-zinc-200 px-2 py-1 text-[11px] focus:border-amber-600 focus:outline-none"
                          />
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
        {items.length > 0 && (
          <p className="mt-2 text-xs font-semibold text-amber-700">
            Estimasi pre-order: Rp{itemsTotal.toLocaleString("id-ID")}
          </p>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">4. Data Diri</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <input
            name="customerName"
            required
            placeholder="Nama"
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
          />
          <input
            name="phone"
            required
            placeholder="Nomor WhatsApp"
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
          />
        </div>
        <input
          name="partySize"
          type="number"
          min="1"
          required
          placeholder="Jumlah tamu"
          className="mt-3 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
        />
        <textarea
          name="note"
          placeholder="Catatan (opsional)"
          rows={2}
          className="mt-3 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {pending ? "Mengirim..." : "Kirim Reservasi"}
      </button>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
