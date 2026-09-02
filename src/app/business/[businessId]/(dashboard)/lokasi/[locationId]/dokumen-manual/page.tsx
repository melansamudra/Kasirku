import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SuratJalanManualForm from "./surat-jalan-form";
import PermintaanBarangManualForm from "./permintaan-barang-form";
import StockOpnameManualForm from "./stock-opname-form";
import ManualDocHistory, { type ManualDocHistoryEntry } from "./manual-doc-history";

type Tab = "surat-jalan" | "permintaan-barang" | "stock-opname";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "surat-jalan", label: "Surat Jalan", icon: "🚚" },
  { key: "permintaan-barang", label: "Permintaan Barang", icon: "📝" },
  { key: "stock-opname", label: "Stock Opname", icon: "📋" },
];

export default async function DokumenManualPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; locationId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { businessId, locationId } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: Tab = rawTab === "permintaan-barang" || rawTab === "stock-opname" ? rawTab : "surat-jalan";

  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled, rich_stock_ops_enabled")
    .eq("id", businessId)
    .single();
  if (!business || !(business.cost_control_enabled || business.rich_stock_ops_enabled)) notFound();

  const { data: location } = await supabase
    .from("stock_locations")
    .select("id, name")
    .eq("id", locationId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!location) notFound();

  const base = `/business/${businessId}/lokasi/${locationId}/dokumen-manual`;

  return (
    <div className="w-full max-w-2xl">
      <Link href={`/business/${businessId}/lokasi/${locationId}/bahan-baku`} className="text-xs text-zinc-400 hover:text-brand-600">
        ← {location.name}
      </Link>
      <h1 className="mt-2 text-lg font-bold text-zinc-900">Dokumen Manual — {location.name}</h1>
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
        {tab === "surat-jalan" && <SuratJalanTab businessId={businessId} locationId={locationId} base={base} />}
        {tab === "permintaan-barang" && (
          <PermintaanBarangTab businessId={businessId} locationId={locationId} base={base} />
        )}
        {tab === "stock-opname" && <StockOpnameTab businessId={businessId} locationId={locationId} base={base} />}
      </div>
    </div>
  );
}

async function SuratJalanTab({
  businessId,
  locationId,
  base,
}: {
  businessId: string;
  locationId: string;
  base: string;
}) {
  const supabase = await createClient();
  const { data: docs } = await supabase
    .from("manual_delivery_notes")
    .select("id, dn_number, destination, created_by_name, created_at")
    .eq("business_id", businessId)
    .eq("location_id", locationId)
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
      <SuratJalanManualForm businessId={businessId} locationId={locationId} />
      <TabFooter cetakHref={`${base}/kosong/surat-jalan`} />
      <HistorySection title="Riwayat Surat Jalan" entries={entries} emptyText="Belum ada Surat Jalan manual yang dibuat." />
    </>
  );
}

async function PermintaanBarangTab({
  businessId,
  locationId,
  base,
}: {
  businessId: string;
  locationId: string;
  base: string;
}) {
  const supabase = await createClient();
  const { data: docs } = await supabase
    .from("manual_purchase_requests")
    .select("id, pr_number, created_by_name, created_at")
    .eq("business_id", businessId)
    .eq("location_id", locationId)
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
      <PermintaanBarangManualForm businessId={businessId} locationId={locationId} />
      <TabFooter cetakHref={`${base}/kosong/permintaan-barang`} />
      <HistorySection
        title="Riwayat Permintaan Barang"
        entries={entries}
        emptyText="Belum ada Permintaan Barang manual yang dibuat."
      />
    </>
  );
}

async function StockOpnameTab({
  businessId,
  locationId,
  base,
}: {
  businessId: string;
  locationId: string;
  base: string;
}) {
  const supabase = await createClient();
  const { data: docs } = await supabase
    .from("manual_stock_opnames")
    .select("id, opname_number, created_by_name, created_at")
    .eq("business_id", businessId)
    .eq("location_id", locationId)
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
      <StockOpnameManualForm businessId={businessId} locationId={locationId} />
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
