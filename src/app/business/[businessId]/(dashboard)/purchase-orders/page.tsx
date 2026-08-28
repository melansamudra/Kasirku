import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const STATUS_LABEL: Record<string, string> = {
  issued: "Menunggu Approval",
  approved: "Approved",
  rejected: "Ditolak",
};
const STATUS_STYLE: Record<string, string> = {
  issued: "border-amber-500 bg-amber-50 text-amber-700",
  approved: "border-brand-600 bg-brand-50 text-brand-700",
  rejected: "border-red-500 bg-red-50 text-red-700",
};

const APPROVAL_THRESHOLD = 5_000_000;

export default async function PurchaseOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ lokasi?: string }>;
}) {
  const { businessId } = await params;
  const { lokasi: filterLocationId } = await searchParams;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled")
    .eq("id", businessId)
    .single();

  if (!business || !business.cost_control_enabled) {
    notFound();
  }

  const [{ data: allPos }, { data: suppliers }, { data: purchaseRequests }, { data: locations }] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("id, po_number, supplier_id, purchase_request_id, status, total_amount, issued_by, approved_by, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("suppliers").select("id, name").eq("business_id", businessId),
    supabase.from("purchase_requests").select("id, location_id").eq("business_id", businessId),
    supabase.from("stock_locations").select("id, name").eq("business_id", businessId).order("sort_order"),
  ]);

  const supplierNameById = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
  const locationIdByRequest = new Map((purchaseRequests ?? []).map((r) => [r.id, r.location_id]));
  const pos = filterLocationId
    ? (allPos ?? []).filter((p) => locationIdByRequest.get(p.purchase_request_id ?? "") === filterLocationId)
    : (allPos ?? []);
  const pendingCount = pos.filter((p) => p.status === "issued").length;
  const activeLocationName = filterLocationId
    ? (locations ?? []).find((l) => l.id === filterLocationId)?.name
    : null;

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">
        Purchase Order{activeLocationName ? ` — ${activeLocationName}` : ""} — {business.name}
      </h1>
      <p className="mt-0.5 text-xs text-zinc-500">
        PO diterbitkan otomatis saat Permintaan Barang diteruskan ke supplier.
      </p>

      {(locations ?? []).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Link
            href={`/business/${businessId}/purchase-orders`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              !filterLocationId ? "bg-brand-600 text-white" : "bg-white text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            Semua Lokasi
          </Link>
          {(locations ?? []).map((l) => (
            <Link
              key={l.id}
              href={`/business/${businessId}/purchase-orders?lokasi=${l.id}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filterLocationId === l.id ? "bg-brand-600 text-white" : "bg-white text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {l.name}
            </Link>
          ))}
        </div>
      )}

      {pendingCount > 0 && (
        <p className="mt-2 text-xs font-medium text-amber-600">⏳ {pendingCount} PO menunggu approval</p>
      )}

      <div className="mt-4 space-y-2">
        {pos.length > 0 ? (
          pos.map((po) => (
            <Link
              key={po.id}
              href={`/business/${businessId}/purchase-orders/${po.id}`}
              className="block rounded-xl border border-zinc-200 bg-white p-4 hover:shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">{po.po_number}</p>
                  <p className="text-[11px] text-zinc-400">
                    {supplierNameById.get(po.supplier_id ?? "") ?? "—"} · {formatDate(po.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {po.status === "issued" && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                      {Number(po.total_amount) >= APPROVAL_THRESHOLD
                        ? "Perlu: Operations Supervisor/Owner"
                        : "Perlu: Finance/Cost Control"}
                    </span>
                  )}
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLE[po.status]}`}>
                    {STATUS_LABEL[po.status] ?? po.status}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-right text-sm font-bold text-zinc-900">{formatRupiah(Number(po.total_amount))}</p>
            </Link>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada PO diterbitkan.
          </p>
        )}
      </div>
    </div>
  );
}
