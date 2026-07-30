"use client";

import { useState } from "react";
import { buildKitchenReprintJobs } from "../actions";
import { dispatchPrintJobs } from "@/lib/dispatch-print-jobs";

type State =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "ok"; count: number }
  | { status: "empty" }
  | { status: "error"; message: string };

export default function ReprintKitchenButton({
  businessId,
  transactionId,
}: {
  businessId: string;
  transactionId: string;
}) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function handleReprint() {
    setState({ status: "sending" });
    try {
      const built = await buildKitchenReprintJobs(businessId, transactionId);
      if (!built.success) {
        setState({ status: "error", message: built.error });
        return;
      }
      if (built.jobs.length === 0) {
        setState({ status: "empty" });
        return;
      }
      const results = await dispatchPrintJobs(businessId, built.jobs);
      const failed = results.filter((r) => !r.result.ok);
      if (failed.length > 0) {
        setState({
          status: "error",
          message: `${failed.length}/${results.length} printer gagal — masuk antrian retry otomatis di POS.`,
        });
        return;
      }
      setState({ status: "ok", count: results.length });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => void handleReprint()}
        disabled={state.status === "sending"}
        className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state.status === "sending" ? "Mengirim…" : "🍳 Cetak Ulang ke Dapur/Bar"}
      </button>
      {state.status === "ok" && (
        <p className="mt-1.5 text-xs font-medium text-green-600">
          ✅ Terkirim ke {state.count} printer.
        </p>
      )}
      {state.status === "empty" && (
        <p className="mt-1.5 text-xs text-zinc-400">
          Tidak ada printer dapur/bar yang cocok untuk item di transaksi ini.
        </p>
      )}
      {state.status === "error" && (
        <p className="mt-1.5 text-xs font-medium text-red-600">❌ {state.message}</p>
      )}
    </div>
  );
}
