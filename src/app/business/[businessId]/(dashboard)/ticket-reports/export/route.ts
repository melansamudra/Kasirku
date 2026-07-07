import { createClient } from "@/lib/supabase/server";
import { REPORT_TIMEZONE, getPeriodRange, parsePeriod } from "../../reports/period";

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

const hourFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  hourCycle: "h23",
  timeZone: REPORT_TIMEZONE,
});

function wibHour(iso: string) {
  return Number(hourFormatter.format(new Date(iso)));
}

type TxRow = {
  id: string;
  invoice_number: string;
  date: string;
  subtotal: number;
  service: number;
  tax: number;
  total: number;
  payment_method: string;
  received: number | null;
  change: number;
  is_holiday: boolean;
  voided: boolean;
  cashiers: { name: string } | null;
  members: { name: string } | null;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const { businessId } = await params;
  const url = new URL(request.url);
  const typeParam = url.searchParams.get("type");
  const type = typeParam === "tickets" || typeParam === "hourly" ? typeParam : "transactions";
  const period = parsePeriod(url.searchParams.get("period") ?? undefined);
  const { fromIso, toIsoExclusive } = getPeriodRange(
    period,
    url.searchParams.get("from") ?? undefined,
    url.searchParams.get("to") ?? undefined,
  );
  const categoryFilter = url.searchParams.get("category") ?? undefined;
  const serialFrom = url.searchParams.get("serialFrom") ?? undefined;
  const serialTo = url.searchParams.get("serialTo") ?? undefined;

  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .single();

  if (!business) {
    return new Response("Not found", { status: 404 });
  }

  let txQuery = supabase
    .from("ticket_transactions")
    .select(
      "id, invoice_number, date, subtotal, service, tax, total, payment_method, received, change, is_holiday, voided, cashiers!ticket_transactions_cashier_id_fkey(name), members(name)",
    )
    .eq("business_id", businessId)
    .order("date", { ascending: true });
  if (fromIso) txQuery = txQuery.gte("date", fromIso);
  if (toIsoExclusive) txQuery = txQuery.lt("date", toIsoExclusive);
  const { data: txData } = await txQuery;
  const txList = ((txData ?? []) as unknown as TxRow[]) ?? [];

  let rows: (string | number)[][];
  let filename: string;
  const periodLabel =
    period === "today" ? fmtDate(new Date().toISOString()).replace(/\//g, "-") : period;

  if (type === "transactions") {
    rows = [
      [
        "No. Invoice",
        "Tanggal",
        "Jam",
        "Kasir",
        "Member",
        "Hari",
        "Subtotal",
        "Layanan",
        "Pajak",
        "Total",
        "Metode Bayar",
        "Diterima",
        "Kembalian",
        "Status",
      ],
    ];
    for (const tx of txList) {
      rows.push([
        tx.invoice_number,
        fmtDate(tx.date),
        fmtTime(tx.date),
        tx.cashiers?.name ?? "",
        tx.members?.name ?? "",
        tx.is_holiday ? "Libur" : "Kerja",
        Number(tx.subtotal),
        Number(tx.service),
        Number(tx.tax),
        Number(tx.total),
        tx.payment_method,
        tx.received !== null ? Number(tx.received) : "",
        Number(tx.change),
        tx.voided ? "Dibatalkan" : "Sukses",
      ]);
    }
    filename = `TiketTransaksi_${periodLabel}.csv`;
  } else {
    const txMap = new Map(txList.map((t) => [t.id, t]));
    const txIds = Array.from(txMap.keys());

    let serials: {
      id: string;
      serial_no: number;
      manual_number: string;
      price: number;
      is_member_price: boolean;
      ticket_transaction_id: string;
      ticket_categories: { name: string } | null;
    }[] = [];

    if (txIds.length > 0) {
      let serialQuery = supabase
        .from("ticket_serials")
        .select(
          "id, serial_no, manual_number, price, is_member_price, ticket_transaction_id, ticket_categories(name)",
        )
        .in("ticket_transaction_id", txIds)
        .order("serial_no", { ascending: true });
      if (categoryFilter) serialQuery = serialQuery.eq("ticket_category_id", categoryFilter);
      if (serialFrom) serialQuery = serialQuery.gte("serial_no", Number(serialFrom));
      if (serialTo) serialQuery = serialQuery.lte("serial_no", Number(serialTo));
      const { data } = await serialQuery;
      serials = (data ?? []) as unknown as typeof serials;
    }

    const ticketRows = serials
      .map((s) => ({ ...s, tx: txMap.get(s.ticket_transaction_id) }))
      .filter((s) => s.tx !== undefined) as (typeof serials[number] & { tx: TxRow })[];

    if (type === "tickets") {
      rows = [
        [
          "No. Invoice",
          "Tanggal",
          "Jam",
          "No. Seri",
          "No. Tiket Manual",
          "Kategori",
          "Harga",
          "Member?",
          "Status",
        ],
      ];
      for (const r of ticketRows) {
        rows.push([
          r.tx.invoice_number,
          fmtDate(r.tx.date),
          fmtTime(r.tx.date),
          r.serial_no,
          r.manual_number,
          r.ticket_categories?.name ?? "",
          Number(r.price),
          r.is_member_price ? "Ya" : "Tidak",
          r.tx.voided ? "Dibatalkan" : "Sukses",
        ]);
      }
      filename = `TiketPerUnit_${periodLabel}.csv`;
    } else {
      const hourly = new Map<number, { qty: number; revenue: number }>();
      for (const r of ticketRows) {
        if (r.tx.voided) continue;
        const h = wibHour(r.tx.date);
        const entry = hourly.get(h) ?? { qty: 0, revenue: 0 };
        entry.qty += 1;
        entry.revenue += Number(r.price);
        hourly.set(h, entry);
      }
      rows = [["Jam", "Jumlah Tiket", "Pendapatan"]];
      for (let h = 0; h < 24; h++) {
        const entry = hourly.get(h);
        if (!entry) continue;
        rows.push([`${String(h).padStart(2, "0")}:00`, entry.qty, entry.revenue]);
      }
      filename = `TiketPerJam_${periodLabel}.csv`;
    }
  }

  // BOM (U+FEFF) supaya Excel membuka file sebagai UTF-8.
  return new Response(String.fromCharCode(0xfeff) + toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
