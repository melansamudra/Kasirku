import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchKitchenPrint } from "./kitchen-print";

type Write = { host: string; buffer: Buffer };
let writes: Write[] = [];
let unreachableHosts = new Set<string>();

// vi.mock factories can't reference imports from outer scope (e.g. node's
// EventEmitter), so this fakes just the bit of the emitter API kitchen-print
// actually uses: a single `once("error", ...)` subscription.
vi.mock("node:net", () => {
  class FakeSocket {
    private host = "";
    private errorHandler: ((err: Error) => void) | null = null;

    once(event: string, cb: (err: Error) => void) {
      if (event === "error") this.errorHandler = cb;
      return this;
    }

    connect(_port: number, host: string, cb: () => void) {
      this.host = host;
      if (unreachableHosts.has(host)) {
        queueMicrotask(() => this.errorHandler?.(new Error(`connect ECONNREFUSED ${host}`)));
      } else {
        queueMicrotask(cb);
      }
      return this;
    }

    write(data: Buffer, cb: (err?: Error) => void) {
      writes.push({ host: this.host, buffer: Buffer.from(data) });
      queueMicrotask(() => cb());
      return true;
    }

    destroy() {}
  }

  return { default: { Socket: FakeSocket }, Socket: FakeSocket };
});

type PrinterRow = {
  id: string;
  name: string;
  categories: string[];
  connection_type: "lan" | "bluetooth";
  address: string | null;
};

function stubSupabase(printers: PrinterRow[]): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: async () => ({ data: printers, error: null }),
      }),
    }),
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  writes = [];
  unreachableHosts = new Set();
});

describe("dispatchKitchenPrint", () => {
  it("sends only matching-category items to a printer with a category filter", async () => {
    const supabase = stubSupabase([
      { id: "1", name: "Bar", categories: ["Minuman"], connection_type: "lan", address: "bar-host:9100" },
    ]);

    const results = await dispatchKitchenPrint(supabase, "biz-1", {
      source: "Kasir",
      label: "INV-1",
      items: [
        { name: "Kopi Susu", category: "Minuman", qty: 1 },
        { name: "Roti Bakar", category: "Makanan", qty: 1 },
      ],
    });

    expect(results).toEqual([{ printer: "Bar", ok: true }]);
    expect(writes).toHaveLength(1);
    const ticket = writes[0].buffer.toString("latin1");
    expect(ticket).toContain("Kopi Susu");
    expect(ticket).not.toContain("Roti Bakar");
  });

  it("sends every item to a printer with no category filter configured", async () => {
    const supabase = stubSupabase([
      { id: "1", name: "Dapur", categories: [], connection_type: "lan", address: "dapur-host:9100" },
    ]);

    await dispatchKitchenPrint(supabase, "biz-1", {
      source: "Kasir",
      label: "INV-1",
      items: [
        { name: "Kopi Susu", category: "Minuman", qty: 1 },
        { name: "Roti Bakar", category: "Makanan", qty: 1 },
      ],
    });

    const ticket = writes[0].buffer.toString("latin1");
    expect(ticket).toContain("Kopi Susu");
    expect(ticket).toContain("Roti Bakar");
  });

  it("skips a printer entirely when none of its categories match the order", async () => {
    const supabase = stubSupabase([
      { id: "1", name: "Bar", categories: ["Minuman"], connection_type: "lan", address: "bar-host:9100" },
    ]);

    const results = await dispatchKitchenPrint(supabase, "biz-1", {
      source: "Kasir",
      label: "INV-1",
      items: [{ name: "Roti Bakar", category: "Makanan", qty: 1 }],
    });

    expect(results).toEqual([]);
    expect(writes).toHaveLength(0);
  });

  it("ignores bluetooth printers (LAN dispatch only)", async () => {
    const supabase = stubSupabase([
      { id: "1", name: "Handheld", categories: [], connection_type: "bluetooth", address: "some-device" },
    ]);

    const results = await dispatchKitchenPrint(supabase, "biz-1", {
      source: "Kasir",
      label: "INV-1",
      items: [{ name: "Kopi Susu", category: "Minuman", qty: 1 }],
    });

    expect(results).toEqual([]);
    expect(writes).toHaveLength(0);
  });

  it("reports one printer as failed without blocking a working printer", async () => {
    unreachableHosts.add("offline-host");
    const supabase = stubSupabase([
      { id: "1", name: "Dapur", categories: [], connection_type: "lan", address: "dapur-host:9100" },
      { id: "2", name: "Bar", categories: [], connection_type: "lan", address: "offline-host:9100" },
    ]);

    const results = await dispatchKitchenPrint(supabase, "biz-1", {
      source: "Kasir",
      label: "INV-1",
      items: [{ name: "Kopi Susu", category: "Minuman", qty: 1 }],
    });

    const byName = Object.fromEntries(results.map((r) => [r.printer, r]));
    expect(byName.Dapur.ok).toBe(true);
    expect(byName.Bar.ok).toBe(false);
    expect(byName.Bar.error).toContain("ECONNREFUSED");
    expect(writes).toHaveLength(1);
    expect(writes[0].host).toBe("dapur-host");
  });

  it("returns an empty result set without touching the network when there are no items", async () => {
    const supabase = stubSupabase([
      { id: "1", name: "Dapur", categories: [], connection_type: "lan", address: "dapur-host:9100" },
    ]);

    const results = await dispatchKitchenPrint(supabase, "biz-1", {
      source: "Kasir",
      label: "INV-1",
      items: [],
    });

    expect(results).toEqual([]);
    expect(writes).toHaveLength(0);
  });
});
