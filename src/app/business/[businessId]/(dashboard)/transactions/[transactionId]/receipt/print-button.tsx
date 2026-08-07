"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { buildReceiptPrintJob } from "../../actions";
import { dispatchPrintJobs } from "@/lib/dispatch-print-jobs";

type Printer = { id: string; name: string };

type NativeState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "ok" }
  | { status: "error"; message: string };

export default function PrintButton({
  businessId,
  transactionId,
  printers,
}: {
  businessId: string;
  transactionId: string;
  printers: Printer[];
}) {
  // Struk dibuka dari POS lewat link baru (target="_blank") khusus untuk
  // dicetak — auto-buka dialog print begitu halaman selesai render, supaya
  // kasir tidak perlu klik "Cetak" lagi secara manual. Guard `printed` biar
  // tidak dobel kepanggil (mis. React StrictMode di dev me-render efek 2x).
  const printed = useRef(false);
  useEffect(() => {
    if (printed.current) return;
    printed.current = true;
    window.print();
  }, []);

  // Selalu tawarkan jalur ESC/POS kalau ada printer terkonfigurasi, baik di
  // native (pakai plugin Capacitor) maupun di browser biasa (pakai print-agent
  // untuk LAN). Bluetooth memang tidak jalan di browser, tapi dispatchPrintJobs
  // yang akan melaporkan error tersebut — lebih baik tombol kelihatan dan gagal
  // dengan pesan yang jelas, daripada tersembunyi sama sekali.
  const hasPrinterButtons = printers.length > 0;
  const [state, setState] = useState<Record<string, NativeState>>({});

  async function handlePrintToPrinter(printer: Printer) {
    setState((s) => ({ ...s, [printer.id]: { status: "sending" } }));
    try {
      const built = await buildReceiptPrintJob(businessId, transactionId, printer.id);
      if (!built.success) {
        setState((s) => ({ ...s, [printer.id]: { status: "error", message: built.error } }));
        return;
      }
      const [result] = await dispatchPrintJobs(businessId, [built.job]);
      if (result?.result.ok) {
        setState((s) => ({ ...s, [printer.id]: { status: "ok" } }));
      } else {
        setState((s) => ({
          ...s,
          [printer.id]: {
            status: "error",
            message: result && !result.result.ok ? result.result.error : "Gagal mengirim.",
          },
        }));
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        [printer.id]: { status: "error", message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Link
          href={`/business/${businessId}/transactions/${transactionId}`}
          className="flex flex-1 items-center justify-center rounded-xl border border-zinc-200 bg-white py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
        >
          ← Kembali
        </Link>
        <button
          onClick={() => window.print()}
          className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          🖨️ Cetak
        </button>
      </div>

      {hasPrinterButtons && (
        <div className="rounded-xl border border-zinc-200 bg-white p-3">
          <p className="mb-2 text-[11px] font-semibold text-zinc-500">
            Atau kirim langsung ke printer (untuk printer thermal Bluetooth/LAN):
          </p>
          <div className="space-y-1.5">
            {printers.map((p) => {
              const s = state[p.id] ?? { status: "idle" as const };
              return (
                <div key={p.id}>
                  <button
                    onClick={() => void handlePrintToPrinter(p)}
                    disabled={s.status === "sending"}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 text-xs font-medium text-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {s.status === "sending" ? "Mengirim…" : `🖨️ Cetak ke ${p.name}`}
                  </button>
                  {s.status === "ok" && (
                    <p className="mt-1 text-[11px] font-medium text-green-600">✅ Terkirim.</p>
                  )}
                  {s.status === "error" && (
                    <p className="mt-1 text-[11px] font-medium text-red-600">❌ Gagal: {s.message}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
