"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { VoidPurchaseState } from "./actions";

export default function VoidPurchaseButton({
  action,
}: {
  action: (reason: string) => Promise<VoidPurchaseState>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    setPending(true);
    action(reason).then((res) => {
      setPending(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] text-zinc-400 hover:text-red-600"
      >
        Batalkan
      </button>
    );
  }

  return (
    <div className="mt-2 w-full rounded-lg border border-red-200 bg-red-50 p-2.5">
      <p className="text-[11px] font-medium text-red-700">
        Batalkan pembelian ini? Stok yang sempat bertambah akan dikurangi lagi & jurnal koreksi
        otomatis dibuat.
      </p>
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Alasan pembatalan (wajib)"
        className="mt-2 w-full rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100"
      />
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={pending}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? "Memproses…" : "Ya, Batalkan"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="text-[11px] text-zinc-500 hover:text-zinc-700"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
