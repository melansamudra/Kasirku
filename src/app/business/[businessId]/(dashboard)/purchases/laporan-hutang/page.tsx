import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import { todayWibDateString } from "@/lib/wib";
import DebtSelectionList from "./debt-selection-list";
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

  const [{ data: suppliers }, purchases, pendingItems] = await Promise.all([
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
    fetchAllRows<{ request_id: string; purchase_id: string; amount: number }>((from, to) =>
      supabase
        .from("purchase_payment_request_items")
        .select("request_id, purchase_id, amount, purchase_payment_requests!inner(status)")
        .eq("business_id", businessId)
        .eq("purchase_payment_requests.status", "pending")
        .range(from, to),
    ),
  ]);

  const pendingByPurchase = new Map(pendingItems.map((it) => [it.purchase_id, it]));
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
      totalSisa: rows.reduce((s, r) => s + (Number(r.amount) - Number(r.paid_amount)), 0),
      rows: rows
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => {
          const pendingReq = pendingByPurchase.get(r.id);
          return {
            id: r.id,
            date: r.date,
            dueDate: r.due_date,
            label: r.note || r.category,
            amount: Number(r.amount),
            sisa: Number(r.amount) - Number(r.paid_amount),
            bucket: agingBucketOf(r.date, today),
            pendingRequestId: pendingReq?.request_id ?? null,
            pendingAmount: pendingReq ? Number(pendingReq.amount) : null,
          };
        }),
    }))
    .sort((a, b) => b.totalSisa - a.totalSisa);

  const grandTotal = supplierGroups.reduce((s, g) => s + g.totalSisa, 0);

  return (
    <div className="w-full max-w-2xl print:max-w-none">
      <style>{"@media print { @page { size: portrait; } }"}</style>
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Laporan Hutang — {business.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Sisa hutang dagang per supplier, dirinci per tanggal pembelian. Centang hutang yang mau diajukan —
            bisa satu atau banyak sekaligus, boleh lintas supplier.
          </p>
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
        <div className="mt-4">
          <DebtSelectionList businessId={businessId} supplierGroups={supplierGroups} />
        </div>
      ) : (
        <p className="mt-6 rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-400">
          Tidak ada hutang dagang yang belum lunas.
        </p>
      )}

      <p className="mt-3 text-center text-[11px] text-zinc-400 print:hidden">
        Pembayaran baru benar-benar tercatat (mengurangi sisa hutang &amp; posting jurnal) setelah pengajuan
        disetujui Owner, bukan saat diajukan.
      </p>
    </div>
  );
}
