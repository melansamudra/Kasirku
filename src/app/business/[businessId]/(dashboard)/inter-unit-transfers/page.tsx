import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import ShipTransferForm from "./ship-transfer-form";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type TransferRow = {
  id: string;
  transfer_number: string;
  from_business_id: string;
  to_business_id: string;
  total_amount: number;
  sent_by_name: string;
  created_at: string;
};

type PendingRequest = {
  id: string;
  pr_number: string | null;
  business_id: string;
  location_id: string | null;
  employee_name: string | null;
  note: string | null;
  created_at: string;
};
type PendingRequestItem = {
  purchase_request_id: string;
  item_name: string;
  unit: string | null;
  qty_ordered: number;
};

export default async function InterUnitTransfersPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, owner_id")
    .eq("id", businessId)
    .single();
  if (!business) notFound();

  const [{ data: siblingsRaw }, { data: myLocations }, sentRows, receivedRows] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, name")
      .eq("owner_id", business.owner_id)
      .neq("id", businessId)
      .order("name", { ascending: true }),
    supabase
      .from("stock_locations")
      .select("id, name")
      .eq("business_id", businessId)
      .order("sort_order", { ascending: true }),
    fetchAllRows<TransferRow>((from, to) =>
      supabase
        .from("inter_unit_transfers")
        .select("id, transfer_number, from_business_id, to_business_id, total_amount, sent_by_name, created_at")
        .eq("from_business_id", businessId)
        .order("created_at", { ascending: false })
        .range(from, to),
    ),
    fetchAllRows<TransferRow>((from, to) =>
      supabase
        .from("inter_unit_transfers")
        .select("id, transfer_number, from_business_id, to_business_id, total_amount, sent_by_name, created_at")
        .eq("to_business_id", businessId)
        .order("created_at", { ascending: false })
        .range(from, to),
    ),
  ]);

  const siblings = siblingsRaw ?? [];
  const siblingLocationLists = await Promise.all(
    siblings.map((s) =>
      supabase
        .from("stock_locations")
        .select("id, name")
        .eq("business_id", s.id)
        .order("sort_order", { ascending: true })
        .then((r) => ({ businessId: s.id, locations: r.data ?? [] })),
    ),
  );
  const locationsByBusiness = new Map(siblingLocationLists.map((l) => [l.businessId, l.locations]));
  const siblingsWithLocations = siblings.map((s) => ({
    id: s.id,
    name: s.name,
    locations: locationsByBusiness.get(s.id) ?? [],
  }));

  const allBusinessIds = [businessId, ...siblings.map((s) => s.id)];
  const { data: businessNames } = await supabase.from("businesses").select("id, name").in("id", allBusinessIds);
  const nameById = new Map((businessNames ?? []).map((b) => [b.id, b.name]));

  // Permintaan Barang yang masih menunggu di unit lain (owner sama) --
  // READ-ONLY, tidak menyentuh alur Permintaan Barang yang sudah aktif
  // dipakai sama sekali. Staf di sini cuma BACA, lalu proses manual lewat
  // form "Kirim ke Unit Lain" di atas -- tidak ada keterhubungan data
  // otomatis (arahan user 2026-09-07, opsi paling rendah risiko).
  let pendingRequestGroups: {
    id: string;
    prNumber: string | null;
    businessName: string;
    locationName: string;
    employeeName: string | null;
    note: string | null;
    createdAt: string;
    items: { name: string; unit: string; qty: number }[];
  }[] = [];
  if (siblings.length > 0) {
    const pendingRequests = await fetchAllRows<PendingRequest>((from, to) =>
      supabase
        .from("purchase_requests")
        .select("id, pr_number, business_id, location_id, employee_name, note, created_at")
        .in(
          "business_id",
          siblings.map((s) => s.id),
        )
        .eq("status", "baru")
        .order("created_at", { ascending: false })
        .range(from, to),
    );

    if (pendingRequests.length > 0) {
      const requestIds = pendingRequests.map((r) => r.id);
      const items = await fetchAllRows<PendingRequestItem>((from, to) =>
        supabase
          .from("purchase_request_items")
          .select("purchase_request_id, item_name, unit, qty_ordered")
          .in("purchase_request_id", requestIds)
          .range(from, to),
      );
      const itemsByRequest = new Map<string, { name: string; unit: string; qty: number }[]>();
      for (const it of items) {
        const list = itemsByRequest.get(it.purchase_request_id) ?? [];
        list.push({ name: it.item_name, unit: it.unit ?? "", qty: Number(it.qty_ordered) });
        itemsByRequest.set(it.purchase_request_id, list);
      }

      pendingRequestGroups = pendingRequests.map((r) => {
        const locName = r.location_id ? locationsByBusiness.get(r.business_id)?.find((l) => l.id === r.location_id)?.name : null;
        return {
          id: r.id,
          prNumber: r.pr_number,
          businessName: nameById.get(r.business_id) ?? "—",
          locationName: locName ?? "—",
          employeeName: r.employee_name,
          note: r.note,
          createdAt: r.created_at,
          items: itemsByRequest.get(r.id) ?? [],
        };
      });
    }
  }

  // Stok saya per lokasi -- buat item picker di form kirim. Query terpisah
  // (bukan embed ingredients(...)) karena ingredient_location_stock belum
  // terdaftar relationship-nya di tipe database.ts.
  const [stockRows, ingredientRows] = await Promise.all([
    fetchAllRows<{ location_id: string; ingredient_id: string; stock: number }>((from, to) =>
      supabase
        .from("ingredient_location_stock")
        .select("location_id, ingredient_id, stock")
        .eq("business_id", businessId)
        .gt("stock", 0)
        .range(from, to),
    ),
    fetchAllRows<{ id: string; name: string; unit: string }>((from, to) =>
      supabase
        .from("ingredients")
        .select("id, name, unit")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .range(from, to),
    ),
  ]);
  const ingredientById = new Map(ingredientRows.map((i) => [i.id, i]));
  const stockByLocation: Record<string, { ingredientId: string; name: string; unit: string; stock: number }[]> = {};
  for (const r of stockRows) {
    const ingredient = ingredientById.get(r.ingredient_id);
    const list = stockByLocation[r.location_id] ?? [];
    list.push({
      ingredientId: r.ingredient_id,
      name: ingredient?.name ?? "—",
      unit: ingredient?.unit ?? "",
      stock: Number(r.stock),
    });
    stockByLocation[r.location_id] = list;
  }
  for (const list of Object.values(stockByLocation)) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  function TransferRowView({ r, direction }: { r: TransferRow; direction: "sent" | "received" }) {
    const otherName =
      direction === "sent" ? nameById.get(r.to_business_id) ?? "—" : nameById.get(r.from_business_id) ?? "—";
    return (
      <Link
        href={`/business/${businessId}/inter-unit-transfers/${r.id}`}
        className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 hover:bg-zinc-50"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-900">
            {r.transfer_number} — {direction === "sent" ? `ke ${otherName}` : `dari ${otherName}`}
          </p>
          <p className="text-[11px] text-zinc-400">
            {formatDateTime(r.created_at)} · oleh {r.sent_by_name}
          </p>
        </div>
        <p className="shrink-0 text-sm font-bold text-zinc-900">{formatRupiah(Number(r.total_amount))}</p>
      </Link>
    );
  }

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Transfer Antar-Unit — {business.name}</h1>
      <p className="mt-0.5 text-xs text-zinc-500">
        Kirim/terima stok antar unit usaha (pemilik sama). Nilai barang otomatis jadi Piutang Antar-Unit di
        pengirim dan Hutang Antar-Unit di penerima.
      </p>

      {pendingRequestGroups.length > 0 && (
        <div className="mt-4">
          <h2 className="mb-2 text-sm font-bold text-amber-700">
            ⏳ Permintaan Menunggu dari Unit Lain ({pendingRequestGroups.length})
          </h2>
          <div className="space-y-2">
            {pendingRequestGroups.map((r) => (
              <div key={r.id} className="rounded-xl border border-amber-200 bg-amber-50/40 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-900">
                    {r.businessName} — {r.locationName}
                  </p>
                  <p className="text-[10.5px] text-zinc-400">{formatDateTime(r.createdAt)}</p>
                </div>
                <p className="text-[11px] text-zinc-500">
                  {r.prNumber ? `${r.prNumber} · ` : ""}
                  {r.employeeName ? `oleh ${r.employeeName}` : ""}
                  {r.note ? ` · ${r.note}` : ""}
                </p>
                {r.items.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-xs text-zinc-600">
                    {r.items.map((it, idx) => (
                      <li key={idx}>
                        • {it.name} — {it.qty} {it.unit}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[10.5px] text-zinc-400">
            Ini cuma tampilan baca — belum ada keterhubungan otomatis ke Permintaan Barang. Cocokkan manual
            lewat form &quot;Kirim ke Unit Lain&quot; di bawah.
          </p>
        </div>
      )}

      <div className="mt-4">
        <ShipTransferForm
          businessId={businessId}
          myLocations={myLocations ?? []}
          stockByLocation={stockByLocation}
          siblings={siblingsWithLocations}
        />
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-bold text-zinc-900">Terkirim ({sentRows.length})</h2>
        {sentRows.length > 0 ? (
          <div className="space-y-2">
            {sentRows.map((r) => (
              <TransferRowView key={r.id} r={r} direction="sent" />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum pernah mengirim ke unit lain.
          </p>
        )}
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-bold text-zinc-900">Diterima ({receivedRows.length})</h2>
        {receivedRows.length > 0 ? (
          <div className="space-y-2">
            {receivedRows.map((r) => (
              <TransferRowView key={r.id} r={r} direction="received" />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum pernah menerima dari unit lain.
          </p>
        )}
      </div>
    </div>
  );
}
