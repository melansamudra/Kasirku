"use client";

import { useActionState } from "react";
import { createBusiness, type CreateBusinessState } from "./actions";

const initialState: CreateBusinessState = { error: null };

export default function OnboardingForm() {
  const [state, formAction, pending] = useActionState(createBusiness, initialState);

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600">
          <span className="text-lg font-bold text-white">K</span>
        </div>
        <h1 className="text-xl font-bold text-zinc-900">Daftarkan Toko Kamu</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Satu langkah lagi sebelum mulai pakai KasirKu
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="name" className="mb-1 block text-xs font-medium text-zinc-600">
            Nama Toko
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="mis. Kopi Senja"
          />
        </div>

        <fieldset>
          <legend className="mb-2 block text-xs font-medium text-zinc-600">
            Jenis Bisnis
          </legend>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 p-3.5 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
              <input
                type="radio"
                name="business_type"
                value="fnb"
                required
                className="accent-brand-600"
              />
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  🍽️ Restoran / Kafe / F&amp;B
                </p>
                <p className="text-xs text-zinc-500">
                  Open bill, printer dapur, pesan dari meja
                </p>
              </div>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 p-3.5 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
              <input
                type="radio"
                name="business_type"
                value="retail"
                required
                className="accent-brand-600"
              />
              <div>
                <p className="text-sm font-medium text-zinc-900">🛒 Retail / Toko</p>
                <p className="text-xs text-zinc-500">Scan barcode, stok produk, kasir cepat</p>
              </div>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 p-3.5 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
              <input
                type="radio"
                name="business_type"
                value="tiket"
                required
                className="accent-brand-600"
              />
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  🎟️ Tempat Wisata / Kolam Renang
                </p>
                <p className="text-xs text-zinc-500">
                  Tiket masuk, kategori pengunjung, kalender libur
                </p>
              </div>
            </label>
          </div>
        </fieldset>

        {state.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Menyimpan…" : "Mulai Pakai KasirKu"}
        </button>
      </form>
    </div>
  );
}
