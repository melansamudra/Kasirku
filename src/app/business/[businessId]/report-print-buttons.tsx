"use client";

import { useState } from "react";
import { buildSettlementPrintJobs, buildMenuSalesPrintJobs } from "./report-print-actions";
import { dispatchPrintJobs } from "@/lib/dispatch-print-jobs";

type ReportKind = "settlement" | "menu";

type State =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "ok"; count: number }
  | { status: "empty" }
  | { status: "error"; message: string };

const IDLE: State = { status: "idle" };

// Dipakai di dua tempat: Halaman Laporan (rentang tanggal bebas) dan layar
// "Shift Ditutup" di POS (pintasan untuk hari ini) — lihat
// report-print-actions.ts untuk kenapa keduanya cukup satu action per jenis
// laporan. Otomatis kirim ke printer yang ditandai "cetak struk pelanggan"
// di Pengaturan, sama seperti struk kasir — tidak ada pilihan printer
// manual di sini.
export default function ReportPrintButtons({
  businessId,
  fromIso,
  toIsoExclusive,
  periodLabel,
}: {
  businessId: string;
  fromIso: string | null;
  toIsoExclusive: string | null;
  periodLabel: string;
}) {
  const [settlementState, setSettlementState] = useState<State>(IDLE);
  const [menuState, setMenuState] = useState<State>(IDLE);

  async function handlePrint(kind: ReportKind) {
    const setState = kind === "settlement" ? setSettlementState : setMenuState;
    const buildJobs = kind === "settlement" ? buildSettlementPrintJobs : buildMenuSalesPrintJobs;

    setState({ status: "sending" });
    try {
      const built = await buildJobs(businessId, fromIso, toIsoExclusive, periodLabel);
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
    <div className="grid grid-cols-2 gap-2">
      <div>
        <button
          type="button"
          onClick={() => void handlePrint("settlement")}
          disabled={settlementState.status === "sending"}
          className="w-full rounded-xl bg-zinc-800 py-2.5 text-xs font-bold text-white transition-colors hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {settlementState.status === "sending" ? "Mengirim…" : "🖨️ Cetak Settlement"}
        </button>
        {settlementState.status === "ok" && (
          <p className="mt-1 text-[11px] font-medium text-green-600">✅ Terkirim.</p>
        )}
        {settlementState.status === "empty" && (
          <p className="mt-1 text-[11px] text-zinc-400">Belum ada printer struk diatur.</p>
        )}
        {settlementState.status === "error" && (
          <p className="mt-1 text-[11px] font-medium text-red-600">❌ {settlementState.message}</p>
        )}
      </div>
      <div>
        <button
          type="button"
          onClick={() => void handlePrint("menu")}
          disabled={menuState.status === "sending"}
          className="w-full rounded-xl border border-zinc-200 py-2.5 text-xs font-bold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {menuState.status === "sending" ? "Mengirim…" : "🖨️ Cetak Laporan Menu"}
        </button>
        {menuState.status === "ok" && (
          <p className="mt-1 text-[11px] font-medium text-green-600">✅ Terkirim.</p>
        )}
        {menuState.status === "empty" && (
          <p className="mt-1 text-[11px] text-zinc-400">Belum ada printer struk diatur.</p>
        )}
        {menuState.status === "error" && (
          <p className="mt-1 text-[11px] font-medium text-red-600">❌ {menuState.message}</p>
        )}
      </div>
    </div>
  );
}
