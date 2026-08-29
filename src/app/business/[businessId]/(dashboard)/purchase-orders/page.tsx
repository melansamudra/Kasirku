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

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PO_STATUS_LABEL: Record<string, string> = {
  issued: "Menunggu Approval",
  approved: "Approved",
  rejected: "Ditolak",
};
const PO_STATUS_STYLE: Record<string, string> = {
  issued: "border-amber-500 bg-amber-50 text-amber-700",
  approved: "border-brand-600 bg-brand-50 text-brand-700",
  rejected: "border-red-500 bg-red-50 text-red-700",
};

const PR_STATUS_LABEL: Record<string, string> = {
  baru: "Baru masuk",
  diterima: "Diterima",
  diteruskan: "Semua diteruskan",
};
const PR_STATUS_STYLE: Record<string, string> = {
  baru: "border-amber-500 bg-amber-50 text-amber-700",
  diterima: "border-blue-500 bg-blue-50 text-blue-700",
  diteruskan: "border-brand-600 bg-brand-50 text-brand-700",
};

const CONDITION_LABEL: Record<string, string> = { ok: "OK", rejected: "Rusak / Tolak" };
const CONDITION_STYLE: Record<string, string> = {
  ok: "bg-brand-50 text-brand-700",
  rejected: "bg-red-50 text-red-600",
};

const APPROVAL_THRESHOLD = 5_000_000;

type Tab = "pr" | "po" | "grn";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "pr", label: "Permintaan Barang", icon: "📋" },
  { key: "po", label: "Purchase Order", icon: "🧾" },
  { key: "grn", label: "Penerimaan Barang", icon: "📦" },
];

export default async function PurchaseOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ lokasi?: string; tab?: string }>;
}) {
  const { businessId } = await params;
  const { lokasi: filterLocationId, tab: rawTab } = await searchParams;
  const tab: Tab = rawTab === "pr" || rawTab === "grn" ? rawTab : "po";
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled")
    .eq("id", businessId)
    .single();

  if (!business || !business.cost_control_enabled) {
    notFound();
  }

  const base = `/business/${businessId}/purchase-orders`;

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Purchase Order — {business.name}</h1>
      <p className="mt-0.5 text-xs text-zinc-500">
        Riwayat pembelian dari Permintaan Barang sampai barang diterima di Gudang Utama.
      </p>

      <div className="mt-3 flex gap-1.5 rounded-xl border border-zinc-200 bg-white p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "po" ? base : `${base}?tab=${t.key}`}
            className={`flex-1 rounded-lg py-2 text-center text-xs font-medium transition-colors ${
              tab === t.key ? "bg-brand-600 text-white" : "text-zinc-500 hover:bg-zinc-50"
            }`}
          >
            {t.icon} {t.label}
          </Link>
        ))}
      </div>

      <div className="mt-4">
        {tab === "pr" && <PermintaanBarangTab businessId={businessId} />}
        {tab === "po" && <PurchaseOrderTab businessId={businessId} filterLocationId={filterLocationId} />}
        {tab === "grn" && <PenerimaanBarangTab businessId={businessId} />}
      </div>
    </div>
  );
}

async function PermintaanBarangTab({ businessId }: { businessId: string }) {
  const supabase = await createClient();

  const [{ data: requests }, { data: locations }] = await Promise.all([
    supabase
      .from("purchase_requests")
      .select("id, pr_number, employee_name, location_id, status, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("stock_locations").select("id, name").eq("business_id", businessId),
  ]);

  const locationNameById = new Map((locations ?? []).map((l) => [l.id, l.name]));

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-400">
        Read-only — buat proses (alokasi, forward ke supplier) buka{" "}
        <Link href={`/business/${businessId}/permintaan-barang`} className="text-brand-600 hover:underline">
          halaman Permintaan Barang
        </Link>
        .
      </p>
      {requests && requests.length > 0 ? (
        requests.map((r) => (
          <Link
            key={r.id}
            href={`/business/${businessId}/permintaan-barang/${r.id}`}
            className="block rounded-xl border border-zinc-200 bg-white p-4 hover:shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-zinc-900">{r.pr_number ?? "(tanpa nomor)"}</p>
                <p className="text-[11px] text-zinc-400">
                  {r.employee_name} · {locationNameById.get(r.location_id ?? "") ?? "—"} · {formatDate(r.created_at)}
                </p>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${PR_STATUS_STYLE[r.status] ?? ""}`}>
                {PR_STATUS_LABEL[r.status] ?? r.status}
              </span>
            </div>
          </Link>
        ))
      ) : (
        <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
          Belum ada Permintaan Barang.
        </p>
      )}
    </div>
  );
}

async function PurchaseOrderTab({
  businessId,
  filterLocationId,
}: {
  businessId: string;
  filterLocationId?: string;
}) {
  const supabase = await createClient();
  const base = `/business/${businessId}/purchase-orders`;

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

  const approvedPoIds = pos.filter((p) => p.status === "approved").map((p) => p.id);
  let pendingReceiveCount = 0;
  if (approvedPoIds.length > 0) {
    const [{ data: poItems }, { data: grns }] = await Promise.all([
      supabase
        .from("purchase_order_items")
        .select("id, purchase_order_id, qty")
        .in("purchase_order_id", approvedPoIds),
      supabase.from("goods_receipt_notes").select("id, purchase_order_id").in("purchase_order_id", approvedPoIds),
    ]);
    const grnIds = (grns ?? []).map((g) => g.id);
    const receivedByPoItem = new Map<string, number>();
    if (grnIds.length > 0) {
      const { data: grnItems } = await supabase
        .from("goods_receipt_note_items")
        .select("grn_id, purchase_order_item_id, qty_received, condition")
        .in("grn_id", grnIds)
        .eq("condition", "ok");
      for (const gi of grnItems ?? []) {
        receivedByPoItem.set(
          gi.purchase_order_item_id,
          (receivedByPoItem.get(gi.purchase_order_item_id) ?? 0) + Number(gi.qty_received),
        );
      }
    }
    const poIdsWithOutstanding = new Set(
      (poItems ?? [])
        .filter((it) => Number(it.qty) - (receivedByPoItem.get(it.id) ?? 0) > 0.001)
        .map((it) => it.purchase_order_id),
    );
    pendingReceiveCount = poIdsWithOutstanding.size;
  }

  const activeLocationName = filterLocationId
    ? (locations ?? []).find((l) => l.id === filterLocationId)?.name
    : null;

  return (
    <div>
      {filterLocationId ? (
        <div className="mb-3">
          <p className="text-xs font-medium text-zinc-600">{activeLocationName}</p>
          <Link href={base} className="text-xs font-medium text-zinc-400 hover:text-brand-600 hover:underline">
            ← Lihat semua lokasi
          </Link>
        </div>
      ) : (
        (locations ?? []).length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            <Link href={base} className="rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white">
              Semua Lokasi
            </Link>
            {(locations ?? []).map((l) => (
              <Link
                key={l.id}
                href={`${base}?lokasi=${l.id}`}
                className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
              >
                {l.name}
              </Link>
            ))}
          </div>
        )
      )}

      {pendingCount > 0 && <p className="mb-1 text-xs font-medium text-amber-600">⏳ {pendingCount} PO menunggu approval</p>}
      {pendingReceiveCount > 0 && (
        <p className="mb-1 text-xs font-medium text-amber-600">📦 {pendingReceiveCount} PO menunggu diterima</p>
      )}

      <div className="mt-3 space-y-2">
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
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${PO_STATUS_STYLE[po.status]}`}>
                    {PO_STATUS_LABEL[po.status] ?? po.status}
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

async function PenerimaanBarangTab({ businessId }: { businessId: string }) {
  const supabase = await createClient();

  const { data: grns } = await supabase
    .from("goods_receipt_notes")
    .select("id, grn_number, purchase_order_id, received_by, note, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(60);

  if (!grns || grns.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
        Belum ada barang yang diterima (GRN).
      </p>
    );
  }

  const poIds = [...new Set(grns.map((g) => g.purchase_order_id))];
  const grnIds = grns.map((g) => g.id);

  const [{ data: pos }, { data: grnItems }] = await Promise.all([
    supabase.from("purchase_orders").select("id, po_number").in("id", poIds),
    supabase
      .from("goods_receipt_note_items")
      .select("grn_id, purchase_order_item_id, qty_received, condition, condition_note")
      .in("grn_id", grnIds),
  ]);

  const poNumberById = new Map((pos ?? []).map((p) => [p.id, p.po_number]));
  const poItemIds = [...new Set((grnItems ?? []).map((it) => it.purchase_order_item_id))];
  const { data: poItemDetails } = poItemIds.length
    ? await supabase.from("purchase_order_items").select("id, item_name, unit").in("id", poItemIds)
    : { data: [] as { id: string; item_name: string; unit: string }[] };
  const poItemById = new Map((poItemDetails ?? []).map((it) => [it.id, it]));

  const itemsByGrn = new Map<string, typeof grnItems>();
  for (const it of grnItems ?? []) {
    const list = itemsByGrn.get(it.grn_id) ?? [];
    list.push(it);
    itemsByGrn.set(it.grn_id, list);
  }

  return (
    <div className="space-y-2">
      {grns.map((g) => (
        <div key={g.id} className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-zinc-900">{g.grn_number}</p>
              <p className="text-[11px] text-zinc-400">
                PO {poNumberById.get(g.purchase_order_id) ?? "—"} · {g.received_by} · {formatDateTime(g.created_at)}
              </p>
            </div>
            <Link
              href={`/business/${businessId}/purchase-orders/${g.purchase_order_id}`}
              className="text-[11px] font-medium text-brand-600 hover:underline"
            >
              Buka PO →
            </Link>
          </div>
          <div className="mt-2 space-y-1">
            {(itemsByGrn.get(g.id) ?? []).map((it, idx) => {
              const detail = poItemById.get(it.purchase_order_item_id);
              return (
                <div key={idx} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-zinc-700">{detail?.item_name ?? "(barang)"}</span>
                    <span className="shrink-0 text-zinc-500">
                      {Number(it.qty_received)} {detail?.unit ?? ""}
                    </span>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${CONDITION_STYLE[it.condition] ?? ""}`}>
                      {CONDITION_LABEL[it.condition] ?? it.condition}
                    </span>
                  </div>
                  {it.condition === "rejected" && it.condition_note && (
                    <p className="mt-0.5 pl-0.5 text-[10px] text-red-500">↳ {it.condition_note}</p>
                  )}
                </div>
              );
            })}
          </div>
          {g.note && <p className="mt-2 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-[11px] text-zinc-500">{g.note}</p>}
        </div>
      ))}
    </div>
  );
}
