import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addOutlet, regenerateOutletRequestSlug, updateOutlet } from "./actions";
import OutletForm from "./outlet-form";
import EditOutletForm from "./edit-outlet-form";
import OutletRequestLinkSection from "./link-section";
import ToggleActiveButton from "./toggle-active-button";

export default async function OutletsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled, outlet_request_slug")
    .eq("id", businessId)
    .single();

  if (!business || !business.cost_control_enabled) {
    notFound();
  }

  const [{ data: outlets }, { data: stockRows }, { data: semiItems }] = await Promise.all([
    supabase
      .from("outlets")
      .select("id, name, address, active")
      .eq("business_id", businessId)
      .order("name", { ascending: true }),
    supabase
      .from("outlet_stock")
      .select("outlet_id, semi_finished_item_id, stock")
      .eq("business_id", businessId),
    supabase
      .from("semi_finished_items")
      .select("id, name, unit")
      .eq("business_id", businessId),
  ]);

  const semiById = new Map((semiItems ?? []).map((i) => [i.id, i]));
  const stockByOutlet = new Map<string, { name: string; unit: string; stock: number }[]>();
  for (const row of stockRows ?? []) {
    if (Number(row.stock) <= 0) continue;
    const item = semiById.get(row.semi_finished_item_id);
    const list = stockByOutlet.get(row.outlet_id) ?? [];
    list.push({ name: item?.name ?? "(bahan dihapus)", unit: item?.unit ?? "", stock: Number(row.stock) });
    stockByOutlet.set(row.outlet_id, list);
  }

  const boundAddOutlet = addOutlet.bind(null, businessId);
  const boundRegenerateSlug = regenerateOutletRequestSlug.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Outlet — {business.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Daftar outlet/resto tujuan distribusi bahan setengah jadi. Bagikan link di bawah ke tiap
        outlet supaya mereka bisa mengajukan permintaan tanpa perlu akun Kasirku.
      </p>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Link Permintaan Resto</h2>
        <OutletRequestLinkSection
          businessId={businessId}
          initialSlug={business.outlet_request_slug ?? ""}
          regenerateAction={boundRegenerateSlug}
        />
      </div>

      <div className="mt-6 space-y-2">
        {outlets && outlets.length > 0 ? (
          outlets.map((outlet) => {
            const stock = stockByOutlet.get(outlet.id) ?? [];
            return (
              <div
                key={outlet.id}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900">{outlet.name}</p>
                    {outlet.address && <p className="text-xs text-zinc-500">{outlet.address}</p>}
                  </div>
                  <ToggleActiveButton businessId={businessId} outletId={outlet.id} active={outlet.active} />
                  <EditOutletForm
                    name={outlet.name}
                    address={outlet.address}
                    action={updateOutlet.bind(null, businessId, outlet.id)}
                  />
                </div>
                <div className="mt-2.5 border-t border-zinc-100 pt-2.5">
                  <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400">
                    Stok di outlet ini
                  </p>
                  {stock.length === 0 ? (
                    <p className="text-xs text-zinc-300">Belum ada stok terkirim</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {stock.map((s) => (
                        <span
                          key={s.name}
                          className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800"
                        >
                          {s.name}: {s.stock} {s.unit}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada outlet. Tambahkan minimal satu supaya bisa dipakai di link permintaan resto.
          </p>
        )}
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Tambah Outlet</h2>
        <OutletForm action={boundAddOutlet} submitLabel="+ Tambah Outlet" />
      </div>
    </div>
  );
}
