"use client";

import { printViaAgent } from "./print-agent-client";
import type { KitchenPrintJobPayload } from "./kitchen-print";
import { logKitchenPrintFailures } from "@/app/business/[businessId]/pos/actions";

// Fire-and-forget from the caller's point of view — a failed kitchen print
// must never block or fail the sale/order that triggered it (same principle
// the old server-side dispatchKitchenPrint followed).
export async function dispatchPrintJobs(businessId: string, jobs: KitchenPrintJobPayload[]) {
  if (jobs.length === 0) return;

  const results = await Promise.all(
    jobs.map(async (job) => ({ job, result: await printViaAgent(job.address, job.bytesBase64) })),
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
  }
}
