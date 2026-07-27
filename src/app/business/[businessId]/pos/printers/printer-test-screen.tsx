"use client";

import { useState } from "react";
import Link from "next/link";
import { buildTestPrintJob } from "../actions";
import { dispatchPrintJobs } from "@/lib/dispatch-print-jobs";

type Printer = {
  id: string;
  name: string;
  categories: string[];
  connection_type: string;
  address: string | null;
  device_label: string | null;
};

type TestState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "ok" }
  | { status: "error"; message: string };

export default function PrinterTestScreen({
  businessId,
  businessName,
  printers,
}: {
  businessId: string;
  businessName: string;
  printers: Printer[];
}) {
  const [testState, setTestState] = useState<Record<string, TestState>>({});

  async function handleTestPrint(printer: Printer) {
    setTestState((s) => ({ ...s, [printer.id]: { status: "sending" } }));

    try {
      const built = await buildTestPrintJob(businessId, printer.id);
      if (!built.success) {
        setTestState((s) => ({ ...s, [printer.id]: { status: "error", message: built.error } }));
        return;
      }

      const [result] = await dispatchPrintJobs(businessId, [built.job]);
      if (result?.result.ok) {
        setTestState((s) => ({ ...s, [printer.id]: { status: "ok" } }));
      } else {
        setTestState((s) => ({
          ...s,
          [printer.id]: {
            status: "error",
            message: result && !result.result.ok ? result.result.error : "Gagal mengirim.",
          },
        }));
      }
    } catch (err) {
      // Tanpa ini, error apa pun sebelum sempat memanggil printer (mis. Server
      // Action gagal terhubung) membuat tombol macet diam di "Mengirim…" tanpa
      // pesan sama sekali — sulit didiagnosis dari jarak jauh.
      setTestState((s) => ({
        ...s,
        [printer.id]: {
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        },
      }));
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6">
      <div className="mb-5 flex items-center gap-3">
        <Link
          href={`/business/${businessId}/pos`}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-sm text-zinc-500 hover:bg-zinc-200"
        >
          ←
        </Link>
        <div>
          <h1 className="text-sm font-bold text-zinc-900">Printer Dapur &amp; Bar</h1>
          <p className="text-xs text-zinc-500">{businessName}</p>
        </div>
      </div>

      <div className="space-y-2.5">
        {printers.length > 0 ? (
          printers.map((p) => {
            const state = testState[p.id] ?? { status: "idle" as const };
            return (
              <div key={p.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900">{p.name}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {p.connection_type === "lan" ? "🌐 LAN/Wi-Fi" : "📶 Bluetooth"}
                      {p.address
                        ? ` · ${p.connection_type === "bluetooth" ? (p.device_label ?? p.address) : p.address}`
                        : ""}
                    </p>
                    {p.categories.length > 0 && (
                      <p className="mt-1 text-[11px] text-zinc-400">
                        Kategori: {p.categories.join(", ")}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => void handleTestPrint(p)}
                    disabled={state.status === "sending"}
                    className="shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {state.status === "sending" ? "Mengirim…" : "Tes Cetak"}
                  </button>
                </div>
                {state.status === "ok" && (
                  <p className="mt-2 text-xs font-medium text-green-600">✅ Terkirim.</p>
                )}
                {state.status === "error" && (
                  <p className="mt-2 text-xs font-medium text-red-600">❌ Gagal: {state.message}</p>
                )}
              </div>
            );
          })
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-4 text-center text-xs text-zinc-400">
            Belum ada printer dapur/bar diatur. Tambahkan lewat Pengaturan.
          </p>
        )}
      </div>

      <p className="mt-4 text-[11px] text-zinc-400">
        Untuk menambah, mengganti, atau menghapus printer, buka halaman Pengaturan dari menu utama.
      </p>
    </div>
  );
}
