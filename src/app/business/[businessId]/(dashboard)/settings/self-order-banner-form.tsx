"use client";

import { useActionState } from "react";
import type { BannerState } from "./actions";

const init: BannerState = { error: null };

export default function SelfOrderBannerForm({
  currentBanner,
  action,
}: {
  currentBanner: string | null;
  action: (state: BannerState, formData: FormData) => Promise<BannerState>;
}) {
  const [state, formAction, pending] = useActionState(action, init);

  return (
    <form action={formAction} className="space-y-3">
      <textarea
        name="banner"
        defaultValue={currentBanner ?? ""}
        rows={3}
        maxLength={300}
        placeholder="Contoh: Promo spesial hari ini! Beli 2 gratis 1 untuk semua minuman. ☕"
        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100 resize-none"
      />
      <p className="text-[11px] text-zinc-400">
        Ditampilkan di atas halaman order pelanggan. Kosongkan untuk menyembunyikan.
      </p>
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>
      )}
      {state.saved && !state.error && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">Banner disimpan.</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "Simpan Banner"}
      </button>
    </form>
  );
}
