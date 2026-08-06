import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addGlobalModifierGroup, addGlobalModifierOption } from "./actions";
import { DeleteGroupButton, DeleteOptionButton } from "./delete-buttons";

export default async function ModifiersPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .single();
  if (!business) notFound();

  const { data: groups } = await supabase
    .from("global_modifier_groups")
    .select("id, name, required, global_modifier_options(id, name, price_adjustment)")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  const boundAdd = addGlobalModifierGroup.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
      <div>
        <h1 className="text-lg font-bold text-zinc-900">Modifier Global — {business.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Buat grup opsi satu kali, lalu pasang ke banyak produk dari halaman Produk → Opsi/Modifier.
        </p>
      </div>

      <div className="mt-6 space-y-4">
        {(!groups || groups.length === 0) && (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada modifier global. Tambahkan di bawah.
          </p>
        )}
        {(groups ?? []).map((g) => (
          <div key={g.id} className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-zinc-900">{g.name}</p>
                <p className="text-xs text-zinc-400">{g.required ? "Wajib dipilih" : "Opsional"}</p>
              </div>
              <DeleteGroupButton businessId={businessId} groupId={g.id} />
            </div>

            <div className="mt-3 space-y-1.5">
              {(g.global_modifier_options ?? []).map((opt) => (
                <div key={opt.id} className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                  <span className="text-sm text-zinc-800">{opt.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500">
                      {opt.price_adjustment > 0 ? `+Rp${Number(opt.price_adjustment).toLocaleString("id-ID")}` : "Gratis"}
                    </span>
                    <DeleteOptionButton businessId={businessId} optionId={opt.id} />
                  </div>
                </div>
              ))}
            </div>

            <form
              action={addGlobalModifierOption.bind(null, businessId, g.id)}
              className="mt-3 flex gap-2"
            >
              <input
                name="name"
                placeholder="mis. Es"
                required
                className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:border-brand-600 focus:outline-none"
              />
              <input
                name="price_adjustment"
                type="number"
                min="0"
                step="500"
                placeholder="+Rp (0=gratis)"
                className="w-32 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:border-brand-600 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                Tambah
              </button>
            </form>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">+ Tambah Grup Modifier</h2>
        <form action={boundAdd} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">Nama Grup</label>
            <input
              name="name"
              placeholder="mis. Pilih Minuman, Tingkat Kepedasan"
              required
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" name="required" defaultChecked className="h-4 w-4 rounded accent-brand-600" />
            Wajib dipilih
          </label>
          <button
            type="submit"
            className="w-full rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Tambah Grup
          </button>
        </form>
      </div>
    </div>
  );
}
