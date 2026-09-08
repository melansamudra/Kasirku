"use client";

import { useState, useTransition } from "react";
import { regenerateHppMenuSlug } from "./actions";

export default function ShareLinkButton({ businessId, slug }: { businessId: string; slug: string | null }) {
  const [currentSlug, setCurrentSlug] = useState(slug);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const url = currentSlug ? `${window.location.origin}/hpp-menu/${currentSlug}` : null;

  function generate() {
    startTransition(async () => {
      const result = await regenerateHppMenuSlug(businessId);
      if (!result.error && result.slug) {
        setCurrentSlug(result.slug);
      }
    });
  }

  function copy() {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
      >
        🔗 Bagikan Link
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-72 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg">
            <p className="text-[11px] text-zinc-500">
              Link publik read-only (tanpa login) untuk tim Dapur/Bar cek Harga Jual, HPP, dan Margin.
            </p>
            {url ? (
              <div className="mt-2 space-y-2">
                <input
                  readOnly
                  value={url}
                  onClick={(e) => e.currentTarget.select()}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] text-zinc-700"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={copy}
                    className="flex-1 rounded-lg bg-brand-600 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-700"
                  >
                    {copied ? "Tersalin!" : "Salin Link"}
                  </button>
                  <button
                    type="button"
                    onClick={generate}
                    disabled={pending}
                    className="rounded-lg border border-zinc-200 px-2 py-1.5 text-[11px] text-zinc-500 hover:bg-zinc-50 disabled:opacity-50"
                    title="Buat link baru (link lama tidak berlaku lagi)"
                  >
                    Ganti
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={generate}
                disabled={pending}
                className="mt-2 w-full rounded-lg bg-brand-600 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {pending ? "Membuat..." : "Buat Link"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
