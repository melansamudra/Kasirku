"use client";

import { useActionState, useState, useEffect, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import KitchenPrinter from "@/lib/kitchen-printer-plugin";
import type { KitchenPrinterState } from "./actions";

type BtDevice = { name: string; address: string };

type Printer = {
  id: string;
  name: string;
  connection_type: string;
  address: string | null;
  device_label: string | null;
  categories: string[];
  prints_receipt: boolean;
  paper_width: number;
};

const initialState: KitchenPrinterState = { error: null };

export default function EditPrinterForm({
  printer,
  action,
  categories,
  onCancel,
}: {
  printer: Printer;
  action: (state: KitchenPrinterState, formData: FormData) => Promise<KitchenPrinterState>;
  categories: string[];
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [connectionType, setConnectionType] = useState<"bluetooth" | "lan">(
    printer.connection_type === "lan" ? "lan" : "bluetooth",
  );
  const [manualAddress, setManualAddress] = useState(printer.address ?? "");

  const isNative = Capacitor.isNativePlatform();
  const [btEnabled, setBtEnabled] = useState<boolean | null>(null);
  const [btDevices, setBtDevices] = useState<BtDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<BtDevice | null>(
    printer.address
      ? { address: printer.address, name: printer.device_label ?? printer.address }
      : null,
  );

  const refreshDevices = useCallback(async () => {
    if (!isNative) return;
    setLoadingDevices(true);
    try {
      const status = await KitchenPrinter.isBluetoothEnabled();
      setBtEnabled(status.enabled);
      if (status.enabled) {
        const { devices } = await KitchenPrinter.listPairedBluetoothDevices();
        setBtDevices(devices);
      } else {
        setBtDevices([]);
      }
    } finally {
      setLoadingDevices(false);
    }
  }, [isNative]);

  useEffect(() => {
    if (connectionType === "bluetooth" && isNative) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void refreshDevices();
    }
  }, [connectionType, isNative, refreshDevices]);

  // Tutup form otomatis setelah berhasil disimpan
  const [prevPending, setPrevPending] = useState(pending);
  if (pending !== prevPending) {
    setPrevPending(pending);
    if (prevPending && !pending && !state.error) {
      onCancel();
    }
  }

  return (
    <form action={formAction} className="mt-3 space-y-3 border-t border-zinc-100 pt-3">
      <div>
        <label
          htmlFor={`edit-name-${printer.id}`}
          className="mb-1 block text-xs font-medium text-zinc-600"
        >
          Nama Stasiun
        </label>
        <input
          id={`edit-name-${printer.id}`}
          name="name"
          type="text"
          required
          defaultValue={printer.name}
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

      {connectionType === "bluetooth" && isNative ? (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-medium text-zinc-600">Perangkat Bluetooth</p>
            <button
              type="button"
              onClick={() => void refreshDevices()}
              disabled={loadingDevices}
              className="text-[11px] font-medium text-brand-600 hover:underline disabled:opacity-50"
            >
              {loadingDevices ? "Memuat…" : "↻ Muat ulang"}
            </button>
          </div>

          {btEnabled === false && (
            <p className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-700">
              Bluetooth belum aktif. Nyalakan dulu lalu tekan &quot;Muat ulang&quot;.
            </p>
          )}

          {btEnabled && btDevices.length === 0 && !loadingDevices && (
            <p className="rounded-xl border border-dashed border-zinc-200 px-3.5 py-2.5 text-xs text-zinc-500">
              Belum ada printer terpasangkan. Pasangkan dulu lewat Pengaturan Bluetooth Android.
            </p>
          )}

          {btDevices.length > 0 && (
            <div className="space-y-1.5">
              {btDevices.map((d) => (
                <label
                  key={d.address}
                  className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm has-checked:border-brand-500 has-checked:bg-brand-50"
                >
                  <input
                    type="radio"
                    name="_btDevicePicker"
                    className="h-3.5 w-3.5"
                    checked={selectedDevice?.address === d.address}
                    onChange={() => setSelectedDevice(d)}
                  />
                  <span className="font-medium text-zinc-900">{d.name}</span>
                  <span className="ml-auto font-mono text-[11px] text-zinc-400">{d.address}</span>
                </label>
              ))}
            </div>
          )}

          <input type="hidden" name="address" value={selectedDevice?.address ?? ""} />
          <input type="hidden" name="deviceLabel" value={selectedDevice?.name ?? ""} />
        </div>
      ) : (
        <div>
          <label
            htmlFor={`edit-addr-${printer.id}`}
            className="mb-1 block text-xs font-medium text-zinc-600"
          >
            {connectionType === "lan" ? "IP Address Printer" : "Nama Perangkat Bluetooth"}
          </label>
          <input
            id={`edit-addr-${printer.id}`}
            name="address"
            type="text"
            value={manualAddress}
            onChange={(e) => setManualAddress(e.target.value)}
            placeholder={connectionType === "lan" ? "192.168.1.101" : "Contoh: KITCHEN-80"}
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm font-mono focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {connectionType === "bluetooth" && (
            <p className="mt-1 text-[11px] text-zinc-400">
              Buka lewat aplikasi Android untuk memilih dari daftar perangkat yang sudah dipasangkan.
            </p>
          )}
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-medium text-zinc-600">Ukuran Kertas</p>
        <div className="grid grid-cols-2 gap-2">
          {([58, 80] as const).map((mm) => (
            <label
              key={mm}
              className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-zinc-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-zinc-700 has-checked:border-brand-500 has-checked:bg-brand-50"
            >
              <input
                type="radio"
                name="paperWidth"
                value={mm}
                defaultChecked={mm === printer.paper_width}
                className="h-3.5 w-3.5"
              />
              {mm}mm {mm === 58 ? "(standar)" : "(lebar)"}
            </label>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-700 has-checked:border-brand-500 has-checked:bg-brand-50">
        <input
          type="checkbox"
          name="printsReceipt"
          defaultChecked={printer.prints_receipt}
          className="h-3.5 w-3.5"
        />
        <span>
          Cetak <b>struk pelanggan</b> otomatis setiap transaksi ke sini
        </span>
      </label>

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
                <input
                  type="checkbox"
                  name="categories"
                  value={c}
                  defaultChecked={printer.categories.includes(c)}
                  className="h-3 w-3"
                />
                {c}
              </label>
            ))}
          </div>
        </div>
      )}

      {state.error && <p className="text-xs text-red-600">{state.error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </form>
  );
}
