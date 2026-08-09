"use client";

import { Capacitor } from "@capacitor/core";
import { printViaAgent, type PrintAgentResult } from "./print-agent-client";
import KitchenPrinter from "./kitchen-printer-plugin";
import type { KitchenPrintJobPayload } from "./kitchen-print";
import { logKitchenPrintFailures, logPrintQueueRecovered } from "@/app/business/[businessId]/pos/actions";
import {
  enqueuePrintJob,
  listPendingPrints,
  markPrintAttempt,
  markPrintSynced,
} from "@/lib/print-queue";

// Android app (android-app/) supplies KitchenPrinter natively — the browser
// on the cashier's own tablet is on the shop's LAN (or physically holding
// it, for Bluetooth), so it can dial the printer directly, no print-agent PC
// needed. Plain browsers keep using the print-agent HTTP relay for LAN jobs
// (untouched); they have no way to reach a bluetooth job at all.
async function dispatchOne(job: KitchenPrintJobPayload): Promise<PrintAgentResult> {
  if (Capacitor.isNativePlatform()) {
    const result =
      job.connectionType === "lan"
        ? await (() => {
            const [ip, portStr] = job.address.split(":");
            const port = portStr ? Number(portStr) : 9100;
            return KitchenPrinter.printLan({ ip, port, bytesBase64: job.bytesBase64 });
          })()
        : await KitchenPrinter.printBluetooth({ address: job.address, bytesBase64: job.bytesBase64 });
    return result.ok
      ? { ok: true }
      : { ok: false, reason: "printer_unreachable", error: result.error ?? "unknown_error" };
  }
  if (job.connectionType === "bluetooth") {
    return { ok: false, reason: "printer_unreachable", error: "unsupported_on_web" };
  }
  return printViaAgent(job.address, job.bytesBase64);
}

export type DispatchedPrintResult = { job: KitchenPrintJobPayload; result: PrintAgentResult };

// Fire-and-forget from the checkout/order-status callers' point of view — a
// failed kitchen print must never block or fail the sale/order that
// triggered it (same principle the old server-side dispatchKitchenPrint
// followed), so they just `void` this call. The return value exists for
// callers that DO want to know per-job success/failure inline (e.g. a
// "Tes Cetak" button) — existing fire-and-forget callers are unaffected.
export async function dispatchPrintJobs(
  businessId: string,
  jobs: KitchenPrintJobPayload[],
): Promise<DispatchedPrintResult[]> {
  if (jobs.length === 0) return [];

  const results = await Promise.all(
    jobs.map(async (job) => ({ job, result: await dispatchOne(job) })),
  );

  const failed = results.filter((r) => !r.result.ok);
  if (failed.length > 0) {
    await logKitchenPrintFailures(
      businessId,
      failed.map(({ job, result }) => ({
        printer: job.printerName,
        error: result.ok ? "" : result.error,
      })),
    ).catch(() => {});

    // Printer mati sesaat itu wajar (kertas habis, belum dinyalain) — jangan
    // biarkan tiket/struk itu hilang begitu saja. Simpan ke antrian lokal,
    // usePrintRetry (pos-screen.tsx) yang akan coba lagi berkala sampai
    // berhasil atau mentok MAX_ATTEMPTS.
    await Promise.all(failed.map(({ job }) => enqueuePrintJob(businessId, job))).catch(() => {});
  }

  return results;
}

// Dipanggil berkala oleh usePrintRetry — TIDAK memanggil
// logKitchenPrintFailures di setiap percobaan (itu akan membanjiri activity
// log tiap ~20 detik); hanya mencatat sekali saat sebuah job akhirnya
// berhasil setelah sempat gagal.
export async function retryPendingPrintJobs(businessId: string): Promise<void> {
  const pending = await listPendingPrints(businessId);
  for (const p of pending.filter((p) => p.status === "pending")) {
    const result = await dispatchOne(p.job);
    // Re-baca IDB setelah dispatch — user mungkin hapus item ini saat retry
    // sedang berjalan. Kalau sudah tidak ada, jangan upsert balik.
    const stillExists = (await listPendingPrints(businessId)).some((x) => x.id === p.id);
    if (!stillExists) continue;
    if (result.ok) {
      await markPrintSynced(p.id);
      await logPrintQueueRecovered(businessId, p.job.printerName).catch(() => {});
    } else {
      await markPrintAttempt(p, result.error);
    }
  }
}

// Receipt jobs go out first and are awaited before the kitchen jobs start —
// two reasons: the cashier's receipt printer is often the same physical
// device as a kitchen station (Bluetooth sockets don't handle concurrent
// jobs well), and the customer copy is the priority print, not the kitchen
// ticket.
export async function dispatchReceiptThenKitchenJobs(
  businessId: string,
  receiptJobs: KitchenPrintJobPayload[],
  kitchenJobs: KitchenPrintJobPayload[],
) {
  await dispatchPrintJobs(businessId, receiptJobs);
  await dispatchPrintJobs(businessId, kitchenJobs);
}
