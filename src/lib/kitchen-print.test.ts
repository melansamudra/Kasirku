import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildKitchenPrintJobs } from "./kitchen-print";

type PrinterRow = {
  id: string;
  name: string;
  categories: string[];
  connection_type: "lan" | "bluetooth";
  address: string | null;
};

let printers: PrinterRow[] = [];

function stubSupabase(rows: PrinterRow[]): SupabaseClient {
  printers = rows;
  return {
    from: () => ({
      select: () => ({
        eq: async () => ({ data: printers, error: null }),
      }),
    }),
  } as unknown as SupabaseClient;
}

function ticketText(bytesBase64: string): string {
  return Buffer.from(bytesBase64, "base64").toString("latin1");
}

beforeEach(() => {
  printers = [];
});

// buildKitchenPrintJobs only builds ticket bytes + resolves which printer(s)
// should receive them — it deliberately never opens a socket (that's the
// print agent's job, running on the cashier's PC, not Vercel). These tests
// cover the matching/building logic only.
describe("buildKitchenPrintJobs", () => {
  it("sends only matching-category items to a printer with a category filter", async () => {
    const supabase = stubSupabase([
      { id: "1", name: "Bar", categories: ["Minuman"], connection_type: "lan", address: "bar-host:9100" },
    ]);

    const jobs = await buildKitchenPrintJobs(supabase, "biz-1", {
      source: "Kasir",
      label: "INV-1",
      items: [
        { name: "Kopi Susu", category: "Minuman", qty: 1 },
        { name: "Roti Bakar", category: "Makanan", qty: 1 },
      ],
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0].printerName).toBe("Bar");
    expect(jobs[0].address).toBe("bar-host:9100");
    const ticket = ticketText(jobs[0].bytesBase64);
    expect(ticket).toContain("Kopi Susu");
    expect(ticket).not.toContain("Roti Bakar");
  });

  it("sends every item to a printer with no category filter configured", async () => {
    const supabase = stubSupabase([
      { id: "1", name: "Dapur", categories: [], connection_type: "lan", address: "dapur-host:9100" },
    ]);

    const jobs = await buildKitchenPrintJobs(supabase, "biz-1", {
      source: "Kasir",
      label: "INV-1",
      items: [
        { name: "Kopi Susu", category: "Minuman", qty: 1 },
        { name: "Roti Bakar", category: "Makanan", qty: 1 },
      ],
    });

    const ticket = ticketText(jobs[0].bytesBase64);
    expect(ticket).toContain("Kopi Susu");
    expect(ticket).toContain("Roti Bakar");
  });

  it("skips a printer entirely when none of its categories match the order", async () => {
    const supabase = stubSupabase([
      { id: "1", name: "Bar", categories: ["Minuman"], connection_type: "lan", address: "bar-host:9100" },
    ]);

    const jobs = await buildKitchenPrintJobs(supabase, "biz-1", {
      source: "Kasir",
      label: "INV-1",
      items: [{ name: "Roti Bakar", category: "Makanan", qty: 1 }],
    });

    expect(jobs).toEqual([]);
  });

  it("ignores bluetooth printers (LAN dispatch only)", async () => {
    const supabase = stubSupabase([
      { id: "1", name: "Handheld", categories: [], connection_type: "bluetooth", address: "some-device" },
    ]);

    const jobs = await buildKitchenPrintJobs(supabase, "biz-1", {
      source: "Kasir",
      label: "INV-1",
      items: [{ name: "Kopi Susu", category: "Minuman", qty: 1 }],
    });

    expect(jobs).toEqual([]);
  });

  it("builds a job per matching printer when there are several", async () => {
    const supabase = stubSupabase([
      { id: "1", name: "Dapur", categories: [], connection_type: "lan", address: "dapur-host:9100" },
      { id: "2", name: "Bar", categories: ["Minuman"], connection_type: "lan", address: "bar-host:9100" },
    ]);

    const jobs = await buildKitchenPrintJobs(supabase, "biz-1", {
      source: "Kasir",
      label: "INV-1",
      items: [{ name: "Kopi Susu", category: "Minuman", qty: 1 }],
    });

    expect(jobs.map((j) => j.printerName).sort()).toEqual(["Bar", "Dapur"]);
  });

  it("returns an empty job list without querying printers when there are no items", async () => {
    const supabase = stubSupabase([
      { id: "1", name: "Dapur", categories: [], connection_type: "lan", address: "dapur-host:9100" },
    ]);

    const jobs = await buildKitchenPrintJobs(supabase, "biz-1", {
      source: "Kasir",
      label: "INV-1",
      items: [],
    });

    expect(jobs).toEqual([]);
  });
});
