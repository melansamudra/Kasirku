import type { SupabaseClient } from "@supabase/supabase-js";
import { buildKitchenTicket, type KitchenTicketItem } from "./escpos";

export type KitchenPrintJob = {
  source: string;
  label: string;
  title?: string;
  items: (KitchenTicketItem & { category: string | null })[];
  cashierName?: string;
  orderType?: string;
};

// Ticket-building stays server-side (uses Buffer, reads kitchen_printers via
// the caller's Supabase client) — only the actual byte-sending moves to the
// client, since Vercel can never reach a printer's private LAN IP or a
// Bluetooth device, but the cashier's browser/app (physically on the shop's
// network, or physically holding the tablet) can. connectionType tells the
// client which transport to use: print-agent/native-LAN for "lan", the
// native Bluetooth plugin for "bluetooth" (browsers without the plugin can't
// do anything with a bluetooth job — see dispatch-print-jobs.ts).
export type KitchenPrintJobPayload = {
  printerName: string;
  address: string;
  connectionType: "lan" | "bluetooth";
  bytesBase64: string;
};

export async function buildKitchenPrintJobs(
  supabase: SupabaseClient,
  businessId: string,
  job: KitchenPrintJob,
): Promise<KitchenPrintJobPayload[]> {
  if (job.items.length === 0) return [];

  const { data: printers } = await supabase
    .from("kitchen_printers")
    .select("id, name, categories, connection_type, address, prints_receipt, paper_width")
    .eq("business_id", businessId);

  // A printer marked prints_receipt is the cashier's receipt printer, not a
  // kitchen/bar station — it gets the priced customer receipt automatically
  // instead (see checkout()), so it's excluded here even if its categories
  // would otherwise match every item.
  const addressedPrinters = (printers ?? []).filter(
    (p) => !!p.address && !p.prints_receipt,
  ) as {
    id: string;
    name: string;
    categories: string[];
    connection_type: "lan" | "bluetooth";
    address: string;
    paper_width: number;
  }[];

  const attempts = addressedPrinters
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
      title: job.title,
      items,
      cashierName: job.cashierName,
      orderType: job.orderType,
      paperWidth: printer.paper_width ?? 58,
    });
    return {
      printerName: printer.name,
      address: printer.address,
      connectionType: printer.connection_type,
      bytesBase64: buffer.toString("base64"),
    };
  });
}
