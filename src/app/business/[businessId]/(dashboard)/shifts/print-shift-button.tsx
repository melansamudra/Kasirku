"use client";

import { useState } from "react";
import { buildSingleShiftPrintJobs } from "../../report-print-actions";
import { dispatchPrintJobs } from "@/lib/dispatch-print-jobs";

type State = "idle" | "sending" | "ok" | "error" | "empty";

export default function PrintShiftButton({
  businessId,
  shiftId,
}: {
  businessId: string;
  shiftId: string;
}) {
  const [state, setState] = useState<State>("idle");

  async function handlePrint() {
    setState("sending");
    try {
      const built = await buildSingleShiftPrintJobs(businessId, shiftId);
      if (!built.success) { setState("error"); return; }
      if (built.jobs.length === 0) { setState("empty"); return; }
      const results = await dispatchPrintJobs(businessId, built.jobs);
      const failed = results.filter((r) => !r.result.ok);
      setState(failed.length > 0 ? "error" : "ok");
    } catch {
      setState("error");
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void handlePrint()}
        disabled={state === "sending"}
        className="flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50"
      >
        {state === "sending" ? "…" : "🖨️ Cetak"}
      </button>
      {state === "ok" && <p className="mt-0.5 text-[10px] text-green-600">✅ Terkirim</p>}
      {state === "empty" && <p className="mt-0.5 text-[10px] text-zinc-400">Belum ada printer</p>}
      {state === "error" && <p className="mt-0.5 text-[10px] text-red-500">❌ Gagal</p>}
    </div>
  );
}
