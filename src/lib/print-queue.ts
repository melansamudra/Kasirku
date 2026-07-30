import {
  idbDeletePendingPrint,
  idbGetAllPendingPrintsByBusiness,
  idbPutPendingPrint,
} from "@/lib/offline-db";
import type { KitchenPrintJobPayload } from "@/lib/kitchen-print";

export type PendingPrintStatus = "pending" | "error";

export type PendingPrintJob = {
  id: string;
  businessId: string;
  createdAt: string;
  attempts: number;
  status: PendingPrintStatus;
  errorMessage?: string;
  job: KitchenPrintJobPayload;
};

// Setelah percobaan ini banyak, printer kemungkinan bukan sekadar mati
// sebentar — hentikan retry otomatis (±5 menit di interval 20 detik) dan
// biarkan kasir cetak ulang manual (tombol di halaman transaksi) daripada
// mencoba selamanya diam-diam.
const MAX_ATTEMPTS = 15;

export async function enqueuePrintJob(
  businessId: string,
  job: KitchenPrintJobPayload,
): Promise<void> {
  const pending: PendingPrintJob = {
    id: crypto.randomUUID(),
    businessId,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: "pending",
    job,
  };
  await idbPutPendingPrint(pending);
}

export async function listPendingPrints(businessId: string): Promise<PendingPrintJob[]> {
  const rows = await idbGetAllPendingPrintsByBusiness<PendingPrintJob>(businessId);
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function markPrintSynced(id: string): Promise<void> {
  await idbDeletePendingPrint(id);
}

export async function markPrintAttempt(
  pending: PendingPrintJob,
  errorMessage: string,
): Promise<PendingPrintJob> {
  const attempts = pending.attempts + 1;
  const updated: PendingPrintJob = {
    ...pending,
    attempts,
    errorMessage,
    status: attempts >= MAX_ATTEMPTS ? "error" : "pending",
  };
  await idbPutPendingPrint(updated);
  return updated;
}

export async function discardPendingPrint(id: string): Promise<void> {
  await idbDeletePendingPrint(id);
}
