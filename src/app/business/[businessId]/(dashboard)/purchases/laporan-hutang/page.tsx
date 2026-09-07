import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import { todayWibDateString } from "@/lib/wib";
import { createPaymentRequest } from "../pengajuan-pembayaran/actions";
import RequestPaymentForm from "./request-payment-form";
import PrintButton from "./print-button";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}
function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const AGING_BUCKETS = ["0-30 hari", "31-60 hari", "61-90 hari", "90+ hari"] as const;
type AgingBucket = (typeof AGING_BUCKETS)[number];

function agingBucketOf(dateStr: string, todayIso: string): AgingBucket {
  const days = Math.floor(
    (new Date(`${todayIso}T00:00:00Z`).getTime() - new Date(`${dateStr}T00:00:00Z`).getTime()) / 86400000,
  );
  if (days <= 30) return "0-30 hari";
  if (days <= 60) return "31-60 hari";
  if (days <= 90) return "61-90 hari";
  return "90+ hari";
}
const AGING_COLOR: Record<AgingBucket, string> = {
  "0-30 hari": "bg-zinc-100 text-zinc-500",
  "31-60 hari": "bg-amber-50 text-amber-700",
  "61-90 hari": "bg-orange-50 text-orange-700",
  "90+ hari": "bg-red-50 text-red-700",
};

type PurchaseRow = {
  id: string;
  supplier_id: string | null;
  date: string;
  due_date: string | null;
  category: string;
  note: string | null;
  amount: number;
  paid_amount: number;
};

export default async function LaporanHutangPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase.from("businesses").select("id, name").eq("id", businessId).single();
  if (!business) notFound();

  const today = todayWibDateString();

  const [{ data: suppliers }, purchases, pendingRequests] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name, phone")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    // fetchAllRows WAJIB -- laporan ini harus mencakup SEMUA hutang belum
    // lunas, bukan cuma 1000 baris pertama (lihat komentar sama di
    // purchases/page.tsx soal bug berulang kalau ini dilanggar).
    fetchAllRows<PurchaseRow>((from, to) =>
      supabase
        .from("purchases")
        .select("id, supplier_id, date, due_date, category, note, amount, paid_amount")
        .eq("business_id", businessId)
        .eq("voided", false)
        .order("date", { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<{ id: string; purchase_id: string; amount: number }>((from, to) =>
      supabase
        .from("purchase_payment_requests")
        .select("id, purchase_id, amount")
        .eq("business_id", businessId)
        .eq("status", "pending")
        .range(from, to),
    ),
  ]);

  const pendingByPurchase = new Map(pendingRequests.map((r) => [r.purchase_id, r]));
  const supplierMap = new Map((suppliers ?? []).map((s) => [s.id, s.name]));

  const unpaid = purchases.filter((p) => Number(p.amount) - Number(p.paid_amount) > 0);

  const agingTotals = new Map<AgingBucket, number>();
  for (const p of unpaid) {
    const sisa = Number(p.amount) - Number(p.paid_amount);
    const bucket = agingBucketOf(p.date, today);
    agingTotals.set(bucket, (agingTotals.get(bucket) ?? 0) + sisa);
  }

  const bySupplier = new Map<string, PurchaseRow[]>();
  for (const p of unpaid) {
    const key = p.supplier_id ?? "__tanpa_supplier__";
    const list = bySupplier.get(key) ?? [];
    list.push(p);
    bySupplier.set(key, list);
  }

  const supplierGroups = [...bySupplier.entries()]
    .map(([supplierId, rows]) => ({
      supplierId,
      supplierName: supplierId === "__tanpa_supplier__" ? "Tanpa Supplier" : supplierMap.get(supplierId) ?? "—",
      rows: rows.sort((a, b) => a.date.localeCompare(b.date)),
      totalSisa: rows.reduce((s, r) => s + (Number(r.amount) - Number(r.paid_amount)), 0),
    }))
    .sort((a, b) => b.totalSisa - a.totalSisa);

  const grandTotal = supplierGroups.reduce((s, g) => s + g.totalSisa, 0);

  return (
    <div className="w-full max-w-2xl print:max-w-none">
      <style>{"@media print { @page { size: portrait; } }"}</style>
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Laporan Hutang — {business.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">Sisa hutang dagang per supplier, dirinci per tanggal pembelian.</p>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton />
          <Link
            href={`/business/${businessId}/purchases/pengajuan-pembayaran`}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
          >
            Pengajuan Pembayaran →
          </Link>
        </div>
      </div>
      <h1 className="hidden text-lg font-bold text-zinc-900 print:block">Laporan Hutang — {business.name}</h1>
      <p className="hidden text-xs text-zinc-500 print:block">Per {formatDate(today)}</p>

      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 print:mt-3 print:rounded-none">
        <p className="text-[10.5px] font-semibold uppercase text-amber-700">Total Sisa Hutang (Semua Supplier)</p>
        <p className="text-xl font-bold text-amber-700">{formatRupiah(grandTotal)}</p>
      </div>

      {grandTotal > 0 && (
        <div className="mt-3 overflow-hidden rounded-xl bg-white shadow-sm print:rounded-none print:border print:border-zinc-200 print:shadow-none">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="text-xs font-bold uppercase text-zinc-500">Umur Utang</h2>
          </div>
          <div className="grid grid-cols-4 divide-x divide-zinc-100">
            {AGING_BUCKETS.map((bucket) => (
              <div key={bucket} className="px-2.5 py-3 text-center">
                <p className="text-sm font-bold text-zinc-900">{formatRupiah(agingTotals.get(bucket) ?? 0)}</p>
                <p className="mt-0.5 text-[10px] text-zinc-400">{bucket}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {supplierGroups.length > 0 ? (
        <div className="mt-4 space-y-4">
          {supplierGroups.map((g) => (
            <div
              key={g.supplierId}
              className="overflow-hidden rounded-xl bg-white shadow-sm print:rounded-none print:border print:border-zinc-200 print:shadow-none"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
                <h2 className="text-sm font-bold text-zinc-900">{g.supplierName}</h2>
                <p className="text-sm font-bold text-amber-700">{formatRupiah(g.totalSisa)}</p>
              </div>
              <div className="divide-y divide-zinc-100">
                {g.rows.map((r) => {
                  const sisa = Number(r.amount) - Number(r.paid_amount);
                  const bucket = agingBucketOf(r.date, today);
                  const pendingReq = pendingByPurchase.get(r.id);
                  return (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-zinc-800">{r.note || r.category}</p>
                        <p className="text-[10.5px] text-zinc-400">
                          {formatDate(r.date)}
                          {r.due_date ? ` · Jatuh tempo ${formatDate(r.due_date)}` : ""} · Total{" "}
                          {formatRupiah(Number(r.amount))}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${AGING_COLOR[bucket]}`}>
                        {bucket}
                      </span>
                      <p className="shrink-0 text-sm font-bold text-amber-700">{formatRupiah(sisa)}</p>
                      <div className="shrink-0 basis-full sm:basis-auto">
                        {pendingReq ? (
                          <Link
                            href={`/business/${businessId}/purchases/pengajuan-pembayaran/${pendingReq.id}`}
                            className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                          >
                            ⏳ Diajukan {formatRupiah(Number(pendingReq.amount))}
                          </Link>
                        ) : (
                          <RequestPaymentForm
                            businessId={businessId}
                            sisaUtang={sisa}
                            action={createPaymentRequest.bind(null, businessId, r.id)}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-6 rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-400">
          Tidak ada hutang dagang yang belum lunas.
        </p>
      )}

      <p className="mt-3 text-center text-[11px] text-zinc-400 print:hidden">
        Klik &quot;Ajukan Pembayaran&quot; untuk mengirim rencana bayar ke Owner untuk disetujui — pembayaran
        baru benar-benar tercatat (mengurangi sisa hutang &amp; posting jurnal) setelah disetujui, bukan saat
        diajukan.
      </p>
    </div>
  );
}
