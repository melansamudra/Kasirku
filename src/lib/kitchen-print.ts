import net from "node:net";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildKitchenTicket, type KitchenTicketItem } from "./escpos";

export type KitchenPrintJob = {
  source: string;
  label: string;
  items: (KitchenTicketItem & { category: string | null })[];
};

export type KitchenPrintResult = { printer: string; ok: boolean; error?: string };

function sendToLanPrinter(address: string, data: Buffer, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const [host, portStr] = address.split(":");
    const port = portStr ? Number(portStr) : 9100;
    const socket = new net.Socket();
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };

    const timer = setTimeout(() => finish(new Error("Timeout menghubungi printer")), timeoutMs);

    socket.once("error", (err) => finish(err));
    socket.connect(port, host, () => {
      // Success once the bytes are flushed to the OS socket buffer — most
      // thermal printers don't close their end after receiving a job, so
      // waiting for a "close" event here would misreport every print as a
      // timeout even when the ticket printed fine.
      socket.write(data, (err) => finish(err ?? undefined));
    });
  });
}

// Best-effort: printer failures must never fail the sale/order that triggered them.
export async function dispatchKitchenPrint(
  supabase: SupabaseClient,
  businessId: string,
  job: KitchenPrintJob,
): Promise<KitchenPrintResult[]> {
  if (job.items.length === 0) return [];

  const { data: printers } = await supabase
    .from("kitchen_printers")
    .select("id, name, categories, connection_type, address")
    .eq("business_id", businessId);

  const lanPrinters = (printers ?? []).filter(
    (p) => p.connection_type === "lan" && !!p.address,
  ) as { id: string; name: string; categories: string[]; connection_type: "lan"; address: string }[];

  const attempts = lanPrinters
    .map((printer) => {
      const items =
        printer.categories.length > 0
          ? job.items.filter((i) => i.category && printer.categories.includes(i.category))
          : job.items;
      return { printer, items };
    })
    .filter((a) => a.items.length > 0);

  const results = await Promise.all(
    attempts.map(async ({ printer, items }): Promise<KitchenPrintResult> => {
      try {
        const buffer = buildKitchenTicket({
          station: printer.name,
          source: job.source,
          label: job.label,
          items,
        });
        await sendToLanPrinter(printer.address, buffer);
        return { printer: printer.name, ok: true };
      } catch (err) {
        return { printer: printer.name, ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );

  return results;
}
