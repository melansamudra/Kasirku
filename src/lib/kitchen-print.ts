import type { SupabaseClient } from "@supabase/supabase-js";
import { buildKitchenTicket, type KitchenTicketItem } from "./escpos";

export type KitchenPrintJob = {
  source: string;
  label: string;
  items: (KitchenTicketItem & { category: string | null })[];
};

// Ticket-building stays server-side (uses Buffer, reads kitchen_printers via
// the caller's Supabase client) — only the actual byte-sending moves to the
// browser via the print agent, since Vercel can never reach a printer's
// private LAN IP but the cashier's browser (physically on the shop's
// network) can. See print-agent/ and src/lib/print-agent-client.ts.
export type KitchenPrintJobPayload = { printerName: string; address: string; bytesBase64: string };

export async function buildKitchenPrintJobs(
  supabase: SupabaseClient,
  businessId: string,
  job: KitchenPrintJob,
): Promise<KitchenPrintJobPayload[]> {
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

  return attempts.map(({ printer, items }) => {
    const buffer = buildKitchenTicket({
      station: printer.name,
      source: job.source,
      label: job.label,
      items,
    });
    return {
      printerName: printer.name,
      address: printer.address,
      bytesBase64: buffer.toString("base64"),
    };
  });
}
