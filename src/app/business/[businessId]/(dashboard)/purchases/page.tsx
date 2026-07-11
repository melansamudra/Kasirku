import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addPurchase, addPurchasePayment } from "./actions";
import AddPurchaseForm from "./add-purchase-form";
import AddPaymentForm from "./add-payment-form";

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

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

const AGING_BUCKETS = ["0-30 hari", "31-60 hari", "61-90 hari", "90+ hari"] as const;
type AgingBucket = (typeof AGING_BUCKETS)[number];

function agingBucketOf(dateStr: string, todayIso: string): AgingBucket {
  const days = Math.floor(
    (new Date(`${todayIso}T00:00:00Z`).getTime() - new Date(`${dateStr}T00:00:00Z`).getTime()) /
      86400000,
  );
  if (days <= 30) return "0-30 hari";
  if (days <= 60) return "31-60 hari";
  if (days <= 90) return "61-90 hari";
  return "90+ hari";
}

type PurchaseRow = {
  id: string;
  date: string;
  category: string;
  qty: number | null;
  note: string | null;
  amount: number;
  paid_amount: number;
  supplier_id: string | null;
  ingredient_id: string | null;
  product_id: string | null;
};

export default async function PurchasesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, business_type")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const isFnb = business.business_type === "fnb";
  const today = toDateStr(new Date());

  const [{ data: suppliers }, { data: ingredients }, { data: products }, { data: purchases }] =
    await Promise.all([
      supabase
        .from("suppliers")
        .select("id, name")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      isFnb
        ? supabase
            .from("ingredients")
            .select("id, name, unit, stock")
            .eq("business_id", businessId)
            .is("deleted_at", null)
            .order("name", { ascending: true })
        : Promise.resolve({ data: [] }),
      supabase
        .from("products")
        .select("id, name, stock")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("purchases")
        .select(
          "id, date, category, qty, note, amount, paid_amount, supplier_id, ingredient_id, product_id",
        )
        .eq("business_id", businessId)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  const supplierMap = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
  const ingredientMap = new Map((ingredients ?? []).map((i) => [i.id, i.name]));
  const productMap = new Map((products ?? []).map((p) => [p.id, p.name]));

  const rows = (purchases ?? []) as PurchaseRow[];
  const totalUtang = rows.reduce((s, r) => s + (Number(r.amount) - Number(r.paid_amount)), 0);
  const belumLunasCount = rows.filter((r) => Number(r.paid_amount) < Number(r.amount)).length;

  const agingTotals = new Map<AgingBucket, number>();
  for (const r of rows) {
    const sisa = Number(r.amount) - Number(r.paid_amount);
    if (sisa <= 0) continue;
    const bucket = agingBucketOf(r.date, today);
    agingTotals.set(bucket, (agingTotals.get(bucket) ?? 0) + sisa);
  }

  const boundAddPurchase = addPurchase.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Pembelian &amp; Hutang — {business.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Pembelian formal dari supplier, bisa dibayar tunai atau utang.
          </p>
        </div>
        <Link
          href={`/business/${businessId}/suppliers`}
          className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
        >
          Kelola Supplier →
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-amber-700">
            Total Utang Dagang
          </p>
          <p className="text-xl font-bold text-amber-700">{formatRupiah(totalUtang)}</p>
        </div>
        <div className="rounded-xl bg-white shadow-sm p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-zinc-400">
            Belum Lunas
          </p>
          <p className="text-xl font-bold text-zinc-900">{belumLunasCount} pembelian</p>
        </div>
      </div>

      {totalUtang > 0 && (
        <div className="mt-3 overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="text-xs font-bold uppercase text-zinc-500">Umur Utang</h2>
          </div>
          <div className="grid grid-cols-4 divide-x divide-zinc-100">
            {AGING_BUCKETS.map((bucket, i) => (
              <div key={bucket} className="px-2.5 py-3 text-center">
                <p
                  className={`text-sm font-bold ${
                    i === 0
                      ? "text-zinc-900"
                      : i === 1
                        ? "text-amber-600"
                        : i === 2
                          ? "text-orange-600"
                          : "text-red-600"
                  }`}
                >
                  {formatRupiah(agingTotals.get(bucket) ?? 0)}
                </p>
                <p className="mt-0.5 text-[10px] text-zinc-400">{bucket}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">+ Catat Pembelian</h2>
        <AddPurchaseForm
          action={boundAddPurchase}
          today={today}
          isFnb={isFnb}
          suppliers={suppliers ?? []}
          ingredients={ingredients ?? []}
          products={products ?? []}
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-4 py-3.5">
          <h2 className="text-sm font-bold text-zinc-900">Riwayat Pembelian</h2>
        </div>
        {rows.length > 0 ? (
          <div className="divide-y divide-zinc-100">
            {rows.map((r) => {
              const sisaUtang = Number(r.amount) - Number(r.paid_amount);
              const lunas = sisaUtang <= 0;
              const itemName = r.ingredient_id
                ? ingredientMap.get(r.ingredient_id)
                : r.product_id
                  ? productMap.get(r.product_id)
                  : null;
              return (
                <div key={r.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-zinc-900">
                        {itemName ?? r.category}
                        {r.qty ? ` · ${r.qty}` : ""}
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        {formatDate(r.date)}
                        {r.supplier_id ? ` · ${supplierMap.get(r.supplier_id) ?? "—"}` : ""}
                        {r.note ? ` · ${r.note}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-zinc-900">{formatRupiah(Number(r.amount))}</p>
                      <p
                        className={`text-[11px] font-medium ${
                          lunas ? "text-brand-700" : "text-amber-600"
                        }`}
                      >
                        {lunas ? "Lunas" : `Sisa ${formatRupiah(sisaUtang)}`}
                      </p>
                    </div>
                    {!lunas && (
                      <AddPaymentForm
                        today={today}
                        sisaUtang={sisaUtang}
                        action={addPurchasePayment.bind(null, businessId, r.id)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-zinc-300">Belum ada pembelian tercatat</p>
        )}
      </div>

      <p className="mt-3 text-center text-[11px] text-zinc-400">
        Setiap pembelian otomatis ter-posting ke jurnal (debit Persediaan, kredit Kas &amp; Bank
        dan/atau Utang Dagang sesuai jumlah dibayar).
      </p>
    </div>
  );
}
