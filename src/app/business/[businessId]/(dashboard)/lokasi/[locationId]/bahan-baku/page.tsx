import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AdjustStockForm from "@/components/adjust-stock-form";
import { adjustIngredientLocationStock } from "./actions";
import ReceiveFulfillmentButton from "./receive-fulfillment-button";
import ReceiveLinkBox from "./receive-link-box";
import IngredientSearch from "../../../ingredients/ingredient-search";

export default async function LocationBahanBakuPage({
  params,
}: {
  params: Promise<{ businessId: string; locationId: string }>;
}) {
  const { businessId, locationId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled, receive_stock_slug")
    .eq("id", businessId)
    .single();

  if (!business || !business.cost_control_enabled) {
    notFound();
  }

  const { data: location } = await supabase
    .from("stock_locations")
    .select("id, name, is_default_purchase")
    .eq("id", locationId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!location) {
    notFound();
  }

  const [{ data: ingredients }, { data: stockRows }, { data: adjustments }] = await Promise.all([
    supabase
      .from("ingredients")
      .select("id, name, unit")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("ingredient_location_stock")
      .select("ingredient_id, stock")
      .eq("business_id", businessId)
      .eq("location_id", locationId),
    supabase
      .from("stock_adjustments")
      .select("id, item_name, unit, stock_before, stock_after, diff, reason, created_at")
      .eq("business_id", businessId)
      .eq("location_id", locationId)
      .not("ingredient_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const stockByIngredient = new Map((stockRows ?? []).map((r) => [r.ingredient_id, Number(r.stock)]));

  // "Ambil dari Gudang": Purchasing menandai di Permintaan Barang, lokasi
  // peminta (di sini) yang konfirmasi terima -- baru stok benar-benar pindah
  // saat itu, bukan saat ditandai ("masih harus diinput dulu distock masuk
  // mereka", arahan user 2026-08-27).
  const { data: locationRequests } = await supabase
    .from("purchase_requests")
    .select("id")
    .eq("business_id", businessId)
    .eq("location_id", locationId);
  const locationRequestIds = (locationRequests ?? []).map((r) => r.id);

  let pendingFulfillments: {
    id: string;
    qty: number;
    marked_at: string;
    item_name: string;
    unit: string | null;
  }[] = [];
  let employees: { id: string; name: string }[] = [];

  if (locationRequestIds.length > 0) {
    const [{ data: locationItems }, { data: employeeRows }] = await Promise.all([
      supabase
        .from("purchase_request_items")
        .select("id, item_name, unit")
        .in("purchase_request_id", locationRequestIds),
      supabase.from("employees").select("id, name").eq("business_id", businessId).eq("active", true).order("name"),
    ]);
    employees = employeeRows ?? [];
    const itemIds = (locationItems ?? []).map((it) => it.id);
    const itemById = new Map((locationItems ?? []).map((it) => [it.id, it]));

    if (itemIds.length > 0) {
      const { data: fulfillments } = await supabase
        .from("purchase_request_item_stock_fulfillments")
        .select("id, purchase_request_item_id, qty, marked_at")
        .eq("business_id", businessId)
        .in("purchase_request_item_id", itemIds)
        .is("received_at", null);

      pendingFulfillments = (fulfillments ?? [])
        .map((f) => {
          const item = itemById.get(f.purchase_request_item_id);
          return { id: f.id, qty: Number(f.qty), marked_at: f.marked_at, item_name: item?.item_name ?? "(barang)", unit: item?.unit ?? null };
        })
        .sort((a, b) => a.marked_at.localeCompare(b.marked_at));
    }
  }

  // Barang dari supplier fisik selalu diterima di Gudang Utama (titik
  // pembelian default) -- section GRN cuma tampil di lokasi ini, terpisah
  // dari "Ambil dari Gudang" (transfer internal antar lokasi) di atas.
  let pendingPos: { id: string; po_number: string; supplierName: string; outstandingCount: number }[] = [];
  if (location.is_default_purchase) {
    const { data: approvedPos } = await supabase
      .from("purchase_orders")
      .select("id, po_number, supplier_id")
      .eq("business_id", businessId)
      .eq("status", "approved");

    if (approvedPos && approvedPos.length > 0) {
      const approvedPoIds = approvedPos.map((p) => p.id);
      const [{ data: poItems }, { data: suppliers }, { data: grns }] = await Promise.all([
        supabase.from("purchase_order_items").select("id, purchase_order_id, qty").in("purchase_order_id", approvedPoIds),
        supabase.from("suppliers").select("id, name").eq("business_id", businessId),
        supabase.from("goods_receipt_notes").select("id, purchase_order_id").in("purchase_order_id", approvedPoIds),
      ]);

      const supplierNameById = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
      const grnIds = (grns ?? []).map((g) => g.id);
      const receivedByPoItem = new Map<string, number>();
      if (grnIds.length > 0) {
        const { data: grnItems } = await supabase
          .from("goods_receipt_note_items")
          .select("grn_id, purchase_order_item_id, qty_received")
          .in("grn_id", grnIds)
          .eq("condition", "ok");
        for (const gi of grnItems ?? []) {
          receivedByPoItem.set(
            gi.purchase_order_item_id,
            (receivedByPoItem.get(gi.purchase_order_item_id) ?? 0) + Number(gi.qty_received),
          );
        }
      }

      const outstandingCountByPo = new Map<string, number>();
      for (const it of poItems ?? []) {
        const remaining = Number(it.qty) - (receivedByPoItem.get(it.id) ?? 0);
        if (remaining > 0.001) {
          outstandingCountByPo.set(it.purchase_order_id, (outstandingCountByPo.get(it.purchase_order_id) ?? 0) + 1);
        }
      }

      pendingPos = approvedPos
        .filter((p) => outstandingCountByPo.has(p.id))
        .map((p) => ({
          id: p.id,
          po_number: p.po_number,
          supplierName: supplierNameById.get(p.supplier_id ?? "") ?? "—",
          outstandingCount: outstandingCountByPo.get(p.id) ?? 0,
        }));
    }
  }

  return (
    <div className="w-full max-w-2xl">
      <p className="text-xs text-zinc-400">
        <Link href={`/business/${businessId}/ingredients`} className="hover:text-brand-600 hover:underline">
          Bahan Baku
        </Link>{" "}
        · Stok per Lokasi
      </p>
      <h1 className="mt-1 text-lg font-bold text-zinc-900">
        Bahan Baku — {location.name}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Stok bahan baku khusus lokasi <strong>{location.name}</strong> — terpisah dari stok bahan
        baku pusat. Daftar bahannya sama (satu master untuk seluruh bisnis), cuma jumlah stoknya
        dilacak sendiri-sendiri per lokasi.
      </p>

      {business.receive_stock_slug && (
        <ReceiveLinkBox businessId={businessId} locationId={locationId} initialSlug={business.receive_stock_slug} />
      )}

      {pendingPos.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-800">🚚 PO Menunggu Diterima dari Supplier</h2>
          <p className="mt-0.5 text-[11px] text-amber-700">
            Barang dari PO ini belum dicatat penerimaannya (GRN). Buka PO-nya untuk input qty diterima
            & kondisi barang.
          </p>
          <div className="mt-3 space-y-2">
            {pendingPos.map((p) => (
              <Link
                key={p.id}
                href={`/business/${businessId}/purchase-orders/${p.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 hover:shadow-sm"
              >
                <div>
                  <p className="text-xs font-medium text-zinc-800">{p.po_number}</p>
                  <p className="text-[10px] text-zinc-400">{p.supplierName}</p>
                </div>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                  {p.outstandingCount} barang belum diterima
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {pendingFulfillments.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-800">📦 Barang dari Gudang Utama — Menunggu Diterima</h2>
          <p className="mt-0.5 text-[11px] text-amber-700">
            Purchasing sudah menandai barang ini diambil dari Gudang Utama untuk lokasi ini. Konfirmasi
            setelah barangnya benar-benar sampai fisik — stok baru pindah ke {location.name} setelah ini.
          </p>
          <div className="mt-3 space-y-2">
            {pendingFulfillments.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2">
                <p className="text-xs font-medium text-zinc-800">
                  {f.item_name} — {f.qty}
                  {f.unit ? ` ${f.unit}` : ""}
                </p>
                <ReceiveFulfillmentButton businessId={businessId} fulfillmentId={f.id} employees={employees} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        {ingredients && ingredients.length > 0 ? (
          <IngredientSearch names={ingredients.map((i) => i.name)}>
            {ingredients.map((i) => {
              const stock = stockByIngredient.get(i.id) ?? 0;
              return (
                <div
                  key={i.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{i.name}</p>
                    <p className="text-xs text-zinc-500">
                      Stok di {location.name}: {stock} {i.unit}
                    </p>
                  </div>
                  <AdjustStockForm
                    itemName={i.name}
                    currentStock={stock}
                    unit={i.unit}
                    action={adjustIngredientLocationStock.bind(null, businessId, locationId, i.id)}
                  />
                </div>
              );
            })}
          </IngredientSearch>
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada bahan baku — tambahkan dulu di halaman Bahan Baku.
          </p>
        )}
      </div>

      {adjustments && adjustments.length > 0 && (
        <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">
            Riwayat Penyesuaian Stok — {location.name}
          </h2>
          <div className="space-y-2">
            {adjustments.map((a) => (
              <div key={a.id} className="border-b border-zinc-100 pb-2 text-xs last:border-0">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-zinc-800">{a.item_name}</p>
                  <p
                    className={
                      Number(a.diff) > 0 ? "font-semibold text-brand-600" : "font-semibold text-red-500"
                    }
                  >
                    {Number(a.diff) > 0 ? "+" : ""}
                    {a.diff} {a.unit}
                  </p>
                </div>
                <p className="text-zinc-500">
                  {a.stock_before} → {a.stock_after} {a.unit} · {a.reason} ·{" "}
                  {new Date(a.created_at).toLocaleString("id-ID", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
