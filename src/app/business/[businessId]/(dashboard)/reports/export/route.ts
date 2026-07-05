import { createClient } from "@/lib/supabase/server";
import { REPORT_TIMEZONE, getPeriodRange, parsePeriod } from "../period";

function csvEscape(v: string | number | null | undefined) {
  const s = String(v ?? "");
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function toCsv(rows: (string | number)[][]) {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: REPORT_TIMEZONE,
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: REPORT_TIMEZONE,
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const { businessId } = await params;
  const url = new URL(request.url);
  const type = url.searchParams.get("type") === "transactions" ? "transactions" : "menu";
  const period = parsePeriod(url.searchParams.get("period") ?? undefined);
  const { fromIso, toIsoExclusive } = getPeriodRange(
    period,
    url.searchParams.get("from") ?? undefined,
    url.searchParams.get("to") ?? undefined,
  );

  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, tax_enabled, tax_rate, service_enabled, service_rate")
    .eq("id", businessId)
    .single();

  if (!business) {
    return new Response("Not found", { status: 404 });
  }

  let txQuery = supabase
    .from("transactions")
    .select(
      "invoice_number, date, subtotal, service, tax, total, total_item_disc, order_disc_amt, is_split, transaction_items(name, category, price, cost, qty)",
    )
    .eq("business_id", businessId)
    .eq("voided", false)
    .order("date", { ascending: true });
  if (fromIso) txQuery = txQuery.gte("date", fromIso);
  if (toIsoExclusive) txQuery = txQuery.lt("date", toIsoExclusive);
  const { data: transactions } = await txQuery;
  const txList = transactions ?? [];

  let rows: (string | number)[][];
  let filename: string;
  const periodLabel =
    period === "today" ? fmtDate(new Date().toISOString()).replace(/\//g, "-") : period;

  if (type === "menu") {
    rows = [
      ["Tanggal", "Name", "Sub Cat.", "Qty.", "Menu", "Modifier", "Sales", "Item", "Bill", "Net", "Modal", "Laba Kotor"],
    ];
    for (const tx of txList) {
      const dateStr = fmtDate(tx.date);
      for (const item of tx.transaction_items) {
        const qty = Number(item.qty);
        const sales = Number(item.price) * qty;
        const cost = Number(item.cost) * qty;
        rows.push([
          dateStr,
          item.name,
          item.category ?? "",
          qty,
          Number(item.price),
          0, // Modifier
          sales,
          0, // Item charge
          0, // Bill charge
          sales, // Net
          cost, // Modal
          sales - cost, // Laba Kotor
        ]);
      }
    }
    filename = `PenjMenu_${periodLabel}.csv`;
  } else {
    rows = [
      ["No. Invoice", "Tanggal", "Time", "Sub Total", "Disc. Menu", "Disc.%", "Discount", "Serv.%", "Serv.", "Tax %", "Tax", "Tot. Menu", "Tot. Item", "Tot. Bill", "Extra Charge", "Pbltn", "Grand Tot.", "Join Tab"],
    ];
    for (const tx of txList) {
      const pbltn = tx.transaction_items.reduce((s, i) => s + Number(i.qty), 0);
      rows.push([
        tx.invoice_number,
        fmtDate(tx.date),
        fmtTime(tx.date),
        Number(tx.subtotal),
        Number(tx.total_item_disc),
        0, // Disc.%
        Number(tx.order_disc_amt),
        business.service_enabled ? Number(business.service_rate) : 0,
        Number(tx.service),
        business.tax_enabled ? Number(business.tax_rate) : 0,
        Number(tx.tax),
        Number(tx.subtotal), // Tot. Menu
        0, // Tot. Item
        Number(tx.service) + Number(tx.tax), // Tot. Bill
        0, // Extra Charge
        pbltn,
        Number(tx.total), // Grand Tot.
        tx.is_split ? "Ya" : "Tidak",
      ]);
    }
    filename = `PenjTransaksi_${periodLabel}.csv`;
  }

  // BOM (U+FEFF) supaya Excel membuka file sebagai UTF-8.
  return new Response(String.fromCharCode(0xfeff) + toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
