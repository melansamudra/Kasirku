"use client";

import { useActionState, useRef, useState, useEffect } from "react";
import type { KitchenPrinterState } from "./actions";

const initialState: KitchenPrinterState = { error: null };

export default function AddPrinterForm({
  action,
  categories,
}: {
  action: (state: KitchenPrinterState, formData: FormData) => Promise<KitchenPrinterState>;
  categories: string[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [connectionType, setConnectionType] = useState<"bluetooth" | "lan">("bluetooth");

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div>
        <label htmlFor="printer-name" className="mb-1 block text-xs font-medium text-zinc-600">
          Nama Stasiun
        </label>
        <input
          id="printer-name"
          name="name"
          type="text"
          required
          placeholder="Contoh: Dapur, Bar, Bakery…"
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-zinc-600">Jenis Koneksi</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setConnectionType("bluetooth")}
            className={`rounded-xl border-2 p-2.5 text-left text-xs font-semibold transition-colors ${
              connectionType === "bluetooth"
                ? "border-brand-500 bg-brand-50 text-zinc-900"
                : "border-zinc-200 bg-white text-zinc-600"
            }`}
          >
            📶 Bluetooth
          </button>
          <button
            type="button"
            onClick={() => setConnectionType("lan")}
            className={`rounded-xl border-2 p-2.5 text-left text-xs font-semibold transition-colors ${
              connectionType === "lan"
                ? "border-brand-500 bg-brand-50 text-zinc-900"
                : "border-zinc-200 bg-white text-zinc-600"
            }`}
          >
            🌐 LAN / Wi-Fi
          </button>
        </div>
        <input type="hidden" name="connectionType" value={connectionType} />
      </div>

      <div>
        <label htmlFor="printer-address" className="mb-1 block text-xs font-medium text-zinc-600">
          {connectionType === "lan" ? "IP Address Printer" : "Nama Perangkat Bluetooth"}
        </label>
        <input
          id="printer-address"
          name="address"
          type="text"
          placeholder={connectionType === "lan" ? "192.168.1.101" : "Contoh: KITCHEN-80"}
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm font-mono focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {categories.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-zinc-600">
            Kategori Menu yang Dicetak ke Stasiun Ini
          </p>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <label
                key={c}
                className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 has-checked:border-brand-500 has-checked:bg-brand-50"
              >
                <input type="checkbox" name="categories" value={c} className="h-3 w-3" />
                {c}
              </label>
            ))}
          </div>
        </div>
      )}

      {state.error && <p className="text-xs text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "+ Tambah Printer"}
      </button>
    </form>
  );
}
