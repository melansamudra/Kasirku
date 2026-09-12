import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SuratJalanManualForm from "../lokasi/[locationId]/dokumen-manual/surat-jalan-form";
import PermintaanBarangManualForm from "../lokasi/[locationId]/dokumen-manual/permintaan-barang-form";
import StockOpnameManualForm from "../lokasi/[locationId]/dokumen-manual/stock-opname-form";
import ManualDocHistory, { type ManualDocHistoryEntry } from "../lokasi/[locationId]/dokumen-manual/manual-doc-history";

// Versi UMUM (business-scoped, location_id kosong) dari Dokumen Manual --
// dibuat supaya toko standar yang TIDAK punya stock_locations sama sekali
// (mayoritas pendaftar baru sejak onboarding-default-2026-09) tetap bisa
// cetak/catat Surat Jalan, Permintaan Barang, dan Stock Opname manual,
// tanpa perlu setup lokasi dulu. Versi per-lokasi (untuk bisnis
// cost-control/rich_stock_ops gaya Llauk) tetap ada terpisah di
// /lokasi/[locationId]/dokumen-manual -- lihat migration
// manual_docs_optional_location untuk alasan location_id jadi nullable.

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
        {tab === "surat-jalan" && <SuratJalanTab businessId={businessId} base={base} />}
        {tab === "permintaan-barang" && <PermintaanBarangTab businessId={businessId} base={base} />}
        {tab === "stock-opname" && <StockOpnameTab businessId={businessId} base={base} />}
      </div>
    </div>
  );
}

async function SuratJalanTab({ businessId, base }: { businessId: string; base: string }) {
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

  const entries: ManualDocHistoryEntry[] = (docs ?? []).map((d) => ({
    id: d.id,
    docNumber: d.dn_number,
    contextLine: `Ke ${d.destination} — ${itemCountById.get(d.id) ?? 0} barang`,
    createdByName: d.created_by_name,
    createdAt: d.created_at,
    href: `${base}/surat-jalan/${d.id}`,
  }));

  return (
    <>
      <SuratJalanManualForm businessId={businessId} locationId={null} />
      <TabFooter cetakHref={`${base}/kosong/surat-jalan`} />
      <HistorySection title="Riwayat Surat Jalan" entries={entries} emptyText="Belum ada Surat Jalan manual yang dibuat." />
    </>
  );
}

async function PermintaanBarangTab({ businessId, base }: { businessId: string; base: string }) {
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

  const entries: ManualDocHistoryEntry[] = (docs ?? []).map((d) => ({
    id: d.id,
    docNumber: d.pr_number,
    contextLine: `${itemCountById.get(d.id) ?? 0} barang diminta`,
    createdByName: d.created_by_name,
    createdAt: d.created_at,
    href: `${base}/permintaan-barang/${d.id}`,
  }));

  return (
    <>
      <PermintaanBarangManualForm businessId={businessId} locationId={null} />
      <TabFooter cetakHref={`${base}/kosong/permintaan-barang`} />
      <HistorySection
        title="Riwayat Permintaan Barang"
        entries={entries}
        emptyText="Belum ada Permintaan Barang manual yang dibuat."
      />
    </>
  );
}

async function StockOpnameTab({ businessId, base }: { businessId: string; base: string }) {
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

  const entries: ManualDocHistoryEntry[] = (docs ?? []).map((d) => ({
    id: d.id,
    docNumber: d.opname_number,
    contextLine: `${itemCountById.get(d.id) ?? 0} barang dihitung`,
    createdByName: d.created_by_name,
    createdAt: d.created_at,
    href: `${base}/stock-opname/${d.id}`,
  }));

  return (
    <>
      <StockOpnameManualForm businessId={businessId} locationId={null} />
      <TabFooter cetakHref={`${base}/kosong/stock-opname`} />
      <HistorySection title="Riwayat Stock Opname" entries={entries} emptyText="Belum ada Stock Opname manual yang dicatat." />
    </>
  );
}

function TabFooter({ cetakHref }: { cetakHref: string }) {
  return (
    <div className="mt-3 text-right">
      <Link href={cetakHref} className="text-xs font-medium text-brand-600 hover:underline">
        🖨️ Cetak Formulir Kosong (isi tangan)
      </Link>
    </div>
  );
}

function HistorySection({
  title,
  entries,
  emptyText,
}: {
  title: string;
  entries: ManualDocHistoryEntry[];
  emptyText: string;
}) {
  return (
    <div className="mt-6">
      <h2 className="mb-2 text-sm font-semibold text-zinc-900">{title}</h2>
      <ManualDocHistory entries={entries} emptyText={emptyText} />
    </div>
  );
}
