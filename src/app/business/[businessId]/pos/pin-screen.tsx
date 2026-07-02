"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { verifyPin } from "./actions";

type Cashier = { id: string; name: string; role: string };

export default function PinScreen({
  businessId,
  businessName,
  cashiers,
}: {
  businessId: string;
  businessName: string;
  cashiers: Cashier[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Cashier | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function pressKey(key: string) {
    if (isPending || !selected) return;
    setError(null);

    if (key === "back") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (pin.length >= 4) return;

    const next = pin + key;
    setPin(next);

    if (next.length === 4) {
      startTransition(async () => {
        const result = await verifyPin(businessId, selected.id, next);
        if (!result.success) {
          setError(result.error ?? "PIN salah, coba lagi");
          setPin("");
          return;
        }
        router.refresh();
      });
    }
  }

  if (!selected) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-900 px-6">
        <div className="w-full max-w-xs">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600">
              <span className="text-lg font-bold text-white">K</span>
            </div>
            <h1 className="text-lg font-bold text-white">{businessName}</h1>
            <p className="mt-1 text-sm text-zinc-400">Pilih kasir untuk mulai</p>
          </div>

          <div className="space-y-2">
            {cashiers.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-700 px-4 py-6 text-center text-xs text-zinc-500">
                Belum ada kasir aktif. Tambahkan dulu di halaman Kelola Kasir.
              </p>
            ) : (
              cashiers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className="flex w-full items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-left transition-colors hover:border-brand-500"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{c.name}</p>
                    <p className="text-xs text-zinc-400">
                      {c.role === "manajer" ? "Manajer" : "Kasir"}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-900 px-6">
      <div className="w-full max-w-xs">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-xl font-bold text-white">
            {selected.name.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-lg font-bold text-white">{selected.name}</h1>
          <p className="mt-1 text-sm text-zinc-400">Masukkan PIN untuk melanjutkan</p>
        </div>

        <div className="mb-6 flex justify-center gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-3.5 w-3.5 rounded-full border-2 border-zinc-500 ${
                i < pin.length ? "bg-brand-600 border-brand-600" : ""
              }`}
            />
          ))}
        </div>

        {error && <p className="mb-3 text-center text-xs text-red-400">{error}</p>}

        <div className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
            <button
              key={n}
              onClick={() => pressKey(n)}
              disabled={isPending}
              className="h-14 rounded-xl bg-zinc-700 text-xl font-bold text-white transition-colors hover:bg-zinc-600 active:bg-zinc-500 disabled:opacity-50"
            >
              {n}
            </button>
          ))}
          <div />
          <button
            onClick={() => pressKey("0")}
            disabled={isPending}
            className="h-14 rounded-xl bg-zinc-700 text-xl font-bold text-white transition-colors hover:bg-zinc-600 active:bg-zinc-500 disabled:opacity-50"
          >
            0
          </button>
          <button
            onClick={() => pressKey("back")}
            disabled={isPending}
            className="h-14 rounded-xl bg-zinc-700 text-xl font-bold text-white transition-colors hover:bg-zinc-600 active:bg-zinc-500 disabled:opacity-50"
          >
            ⌫
          </button>
        </div>

        <button
          onClick={() => {
            setSelected(null);
            setPin("");
            setError(null);
          }}
          className="mt-6 w-full text-center text-xs font-medium text-zinc-400 hover:text-zinc-300"
        >
          Bukan {selected.name}? Ganti kasir
        </button>
      </div>
    </div>
  );
}
