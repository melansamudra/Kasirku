"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Capacitor } from "@capacitor/core";
import { buildTestPrintJob } from "../actions";
import { dispatchPrintJobs } from "@/lib/dispatch-print-jobs";

type Printer = {
  id: string;
  name: string;
  categories: string[];
  connection_type: string;
  address: string | null;
  device_label: string | null;
  paper_width: number | null;
};

type LocalPrinterConfig = {
  address: string;
  name: string;
  paperWidth: number;
  connectionType: "lan" | "bluetooth";
};

type TestState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "ok" }
  | { status: "error"; message: string };

function friendlyError(raw: string, connectionType: string): { msg: string; hint: string } {
  if (raw === "print_agent_not_running") {
    return {
      msg: "Print Agent tidak aktif di PC ini.",
      hint: "Instal dan jalankan aplikasi Print Agent di PC yang terhubung ke printer, lalu coba lagi.",
    };
  }
  if (raw === "unsupported_on_web") {
    return {
      msg: "Bluetooth tidak bisa dipakai lewat browser.",
      hint: "Buka KasirKu dari aplikasi Android untuk tes printer Bluetooth.",
    };
  }
  if (connectionType === "bluetooth") {
    return {
      msg: "Printer Bluetooth tidak merespons.",
      hint: `Pastikan: (1) printer menyala, (2) sudah dipasangkan di Pengaturan Bluetooth Android, (3) tidak sedang dipakai perangkat lain. (${raw})`,
    };
  }
  return {
    msg: "Printer tidak merespons.",
    hint: `Pastikan: (1) printer menyala, (2) IP address benar (${raw.includes("ECONNREFUSED") || raw.includes("ETIMEDOUT") ? "tidak bisa terhubung" : raw}), (3) printer dan perangkat di jaringan Wi-Fi yang sama.`,
  };
}

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
  const isNative = Capacitor.isNativePlatform();
  const [localPrinter, setLocalPrinterState] = useState<LocalPrinterConfig | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("pos_local_printer_v1");
      if (raw) setLocalPrinterState(JSON.parse(raw) as LocalPrinterConfig);
    } catch {}
  }, []);

  function setLocalPrinter(p: Printer | null) {
    if (!p) {
      localStorage.removeItem("pos_local_printer_v1");
      setLocalPrinterState(null);
      return;
    }
    const cfg: LocalPrinterConfig = {
      address: p.address!,
      name: p.name,
      paperWidth: p.paper_width ?? 58,
      connectionType: p.connection_type as "lan" | "bluetooth",
    };
    localStorage.setItem("pos_local_printer_v1", JSON.stringify(cfg));
    setLocalPrinterState(cfg);
  }

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
                {state.status === "error" && (() => {
                  const { msg, hint } = friendlyError(state.message, p.connection_type);
                  return (
                    <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs">
                      <p className="font-semibold text-red-600">❌ {msg}</p>
                      <p className="mt-0.5 text-red-500">{hint}</p>
                    </div>
                  );
                })()}
                {/* Tombol printer lokal — hanya di app Android */}
                {isNative && p.address && (
                  <div className="mt-2 border-t border-zinc-100 pt-2">
                    {localPrinter?.address === p.address ? (
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold text-brand-600">✓ Printer bill device ini</p>
                        <button
                          onClick={() => setLocalPrinter(null)}
                          className="text-[11px] font-semibold text-red-500"
                        >
                          Hapus
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setLocalPrinter(p)}
                        className="text-[11px] font-semibold text-zinc-500 hover:text-brand-600"
                      >
                        📌 Pakai di device ini untuk cetak bill
                      </button>
                    )}
                  </div>
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
