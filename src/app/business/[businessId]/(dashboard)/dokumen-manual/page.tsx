import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SuratJalanTabClient, { type HistoryEntry } from "./surat-jalan-tab-client";
import PermintaanBarangTabClient from "./permintaan-barang-tab-client";
import StockOpnameTabClient from "./stock-opname-tab-client";

// Versi UMUM (business-scoped, location_id kosong) dari Dokumen Manual --
// dibuat supaya toko standar yang TIDAK punya stock_locations sama sekali
// (mayoritas pendaftar baru sejak onboarding-default-2026-09) tetap bisa
// cetak/catat Surat Jalan, Permintaan Barang, dan Stock Opname manual,
// tanpa perlu setup lokasi dulu. Versi per-lokasi (untuk bisnis
// cost-control/rich_stock_ops gaya Llauk) tetap ada terpisah di
// /lokasi/[locationId]/dokumen-manual.
//
// Preview & cetak dokumen (baru disimpan maupun dari riwayat) dirender
// INLINE lewat modal (lihat doc-preview-modal.tsx), bukan navigasi ke
// halaman /surat-jalan/[docId] dst -- itu sempat 404 terus-menerus di
// production tanpa sebab yang jelas (data & kode sudah dicek benar,
// deploy juga sukses), jadi alurnya dipindah supaya tidak bergantung ke
// routing yang bermasalah itu sama sekali.

type Tab = "surat-jalan" | "permintaan-barang" | "stock-opname";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "surat-jalan", label: "Surat Jalan", icon: "🚚" },
  { key: "permintaan-barang", label: "Permintaan Barang", icon: "📝" },
  { key: "stock-opname", label: "Stock Opname", icon: "📋" },
];

export default async function DokumenManualGlobalPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { businessId } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: Tab = rawTab === "permintaan-barang" || rawTab === "stock-opname" ? rawTab : "surat-jalan";

  const supabase = await createClient();
  const { data: business } = await supabase.from("businesses").select("id, name").eq("id", businessId).maybeSingle();
  if (!business) notFound();

  const base = `/business/${businessId}/dokumen-manual`;

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Dokumen Manual</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Surat Jalan, Permintaan Barang, dan Stock Opname versi bebas isi sendiri — jalur cadangan
        selama alur digitalnya belum terbukti jalan mulus untuk operasional harian.
      </p>

      <div className="mt-3 flex gap-1.5 rounded-xl border border-zinc-200 bg-white p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "surat-jalan" ? base : `${base}?tab=${t.key}`}
            className={`flex-1 rounded-lg py-2 text-center text-xs font-medium transition-colors ${
              tab === t.key ? "bg-brand-600 text-white" : "text-zinc-500 hover:bg-zinc-50"
            }`}
          >
            {t.icon} {t.label}
          </Link>
        ))}
      </div>

      <div className="mt-4">
        {tab === "surat-jalan" && (
          <SuratJalanTabClient businessId={businessId} businessName={business.name} history={await getSuratJalanHistory(businessId)} />
        )}
        {tab === "permintaan-barang" && (
          <PermintaanBarangTabClient
            businessId={businessId}
            businessName={business.name}
            history={await getPermintaanBarangHistory(businessId)}
          />
        )}
        {tab === "stock-opname" && (
          <StockOpnameTabClient
            businessId={businessId}
            businessName={business.name}
            history={await getStockOpnameHistory(businessId)}
          />
        )}
      </div>
    </div>
  );
}

async function getSuratJalanHistory(businessId: string): Promise<HistoryEntry[]> {
  const supabase = await createClient();
  const { data: docs } = await supabase
    .from("manual_delivery_notes")
    .select("id, dn_number, destination, created_by_name, created_at")
    .eq("business_id", businessId)
    .is("location_id", null)
    .order("created_at", { ascending: false })
    .limit(100);

  const docIds = (docs ?? []).map((d) => d.id);
  const itemCountById = new Map<string, number>();
  if (docIds.length > 0) {
    const { data: items } = await supabase
      .from("manual_delivery_note_items")
      .select("manual_delivery_note_id")
      .in("manual_delivery_note_id", docIds);
    for (const it of items ?? []) {
      itemCountById.set(it.manual_delivery_note_id, (itemCountById.get(it.manual_delivery_note_id) ?? 0) + 1);
    }
  }

  return (docs ?? []).map((d) => ({
    id: d.id,
    docNumber: d.dn_number,
    contextLine: `Ke ${d.destination} — ${itemCountById.get(d.id) ?? 0} barang`,
    createdByName: d.created_by_name,
    createdAt: d.created_at,
  }));
}

async function getPermintaanBarangHistory(businessId: string): Promise<HistoryEntry[]> {
  const supabase = await createClient();
  const { data: docs } = await supabase
    .from("manual_purchase_requests")
    .select("id, pr_number, created_by_name, created_at")
    .eq("business_id", businessId)
    .is("location_id", null)
    .order("created_at", { ascending: false })
    .limit(100);

  const docIds = (docs ?? []).map((d) => d.id);
  const itemCountById = new Map<string, number>();
  if (docIds.length > 0) {
    const { data: items } = await supabase
      .from("manual_purchase_request_items")
      .select("manual_purchase_request_id")
      .in("manual_purchase_request_id", docIds);
    for (const it of items ?? []) {
      itemCountById.set(it.manual_purchase_request_id, (itemCountById.get(it.manual_purchase_request_id) ?? 0) + 1);
    }
  }

  return (docs ?? []).map((d) => ({
    id: d.id,
    docNumber: d.pr_number,
    contextLine: `${itemCountById.get(d.id) ?? 0} barang diminta`,
    createdByName: d.created_by_name,
    createdAt: d.created_at,
  }));
}

async function getStockOpnameHistory(businessId: string): Promise<HistoryEntry[]> {
  const supabase = await createClient();
  const { data: docs } = await supabase
    .from("manual_stock_opnames")
    .select("id, opname_number, created_by_name, created_at")
    .eq("business_id", businessId)
    .is("location_id", null)
    .order("created_at", { ascending: false })
    .limit(100);

  const docIds = (docs ?? []).map((d) => d.id);
  const itemCountById = new Map<string, number>();
  if (docIds.length > 0) {
    const { data: items } = await supabase
      .from("manual_stock_opname_items")
      .select("manual_stock_opname_id")
      .in("manual_stock_opname_id", docIds);
    for (const it of items ?? []) {
      itemCountById.set(it.manual_stock_opname_id, (itemCountById.get(it.manual_stock_opname_id) ?? 0) + 1);
    }
  }

  return (docs ?? []).map((d) => ({
    id: d.id,
    docNumber: d.opname_number,
    contextLine: `${itemCountById.get(d.id) ?? 0} barang dihitung`,
    createdByName: d.created_by_name,
    createdAt: d.created_at,
  }));
}
