import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  addOption,
  addOptionGroup,
  deleteOption,
  deleteOptionGroup,
} from "./actions";
import AddOptionGroupForm from "./add-option-group-form";
import AddOptionForm from "./add-option-form";
import DeleteButton from "./delete-button";
import ToggleGlobalModifier from "./toggle-global-modifier";

export default async function ProductOptionsPage({
  params,
}: {
  params: Promise<{ businessId: string; productId: string }>;
}) {
  const { businessId, productId } = await params;
  const supabase = await createClient();

  const { data: product } = await supabase
    .from("products")
    .select("id, name, variant_label, category")
    .eq("id", productId)
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .single();

  if (!product) notFound();

  const { data: groups } = await supabase
    .from("product_option_groups")
    .select("id, name, required, sort_order, product_options(id, name, price_adjustment, sort_order)")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });

  // Global modifiers for this business
  const { data: globalGroups } = await supabase
    .from("global_modifier_groups")
    .select("id, name, required, global_modifier_options(id, name, price_adjustment)")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  // Which global groups are already linked to this product
  const { data: links } = await supabase
    .from("product_global_modifier_links")
    .select("group_id")
    .eq("product_id", productId);
  const linkedGroupIds = new Set((links ?? []).map((l) => l.group_id));

  const displayName = product.variant_label
    ? `${product.name} (${product.variant_label})`
    : product.name;

  return (
    <div className="w-full max-w-xl">
      <div className="mb-6 flex items-center gap-2">
        <Link
          href={`/business/${businessId}/products`}
          className="text-xs text-zinc-400 hover:text-zinc-600"
        >
          ← Kelola Produk
        </Link>
      </div>

      <h1 className="text-lg font-bold text-zinc-900">Opsi / Modifier</h1>
      <p className="mt-1 text-sm text-zinc-500">
        <span className="font-medium text-zinc-700">{displayName}</span>
        {" — "}Tambahkan grup opsi yang muncul saat kasir tap produk ini di POS.
      </p>

      <div className="mt-6 space-y-4">
        {(groups ?? []).length === 0 && (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada grup opsi. Tambahkan di bawah.
          </p>
        )}

        {(groups ?? []).map((g) => {
          const options = [...(g.product_options ?? [])].sort(
            (a, b) => a.sort_order - b.sort_order,
          );
          return (
            <div key={g.id} className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-zinc-900">{g.name}</p>
                  <p className="text-xs text-zinc-400">
                    {g.required ? "Wajib dipilih" : "Opsional"}
                  </p>
                </div>
                <DeleteButton
                  label="Hapus grup"
                  action={deleteOptionGroup.bind(null, businessId, g.id)}
                />
              </div>

              <div className="mt-3 space-y-1.5">
                {options.map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2"
                  >
                    <span className="text-sm text-zinc-800">{o.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-zinc-700">
                        {Number(o.price_adjustment) === 0
                          ? "Gratis"
                          : `+Rp${Number(o.price_adjustment).toLocaleString("id-ID")}`}
                      </span>
                      <DeleteButton
                        label="×"
                        action={deleteOption.bind(null, businessId, productId, o.id)}
                        small
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 border-t border-zinc-100 pt-3">
                <p className="mb-2 text-xs font-medium text-zinc-500">+ Tambah pilihan</p>
                <AddOptionForm
                  action={addOption.bind(null, businessId, productId, g.id)}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">+ Tambah Grup Opsi Khusus</h2>
        <AddOptionGroupForm action={addOptionGroup.bind(null, businessId, productId)} />
      </div>

      {/* Global modifier picker */}
      {globalGroups && globalGroups.length > 0 && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold text-zinc-900">Modifier Global</h2>
          <p className="mb-3 text-xs text-zinc-500">
            Pilih modifier yang sudah dibuat di{" "}
            <Link href={`/business/${businessId}/modifiers`} className="text-brand-600 hover:underline">
              halaman Modifier Global
            </Link>
            . Perubahan di modifier global otomatis berlaku ke semua produk yang memakainya.
          </p>
          <div className="space-y-2">
            {globalGroups.map((g) => {
              const linked = linkedGroupIds.has(g.id);
              return (
                <div key={g.id} className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{g.name}</p>
                    <p className="text-xs text-zinc-400">
                      {g.required ? "Wajib" : "Opsional"} ·{" "}
                      {(g.global_modifier_options ?? []).map((o) => o.name).join(", ")}
                    </p>
                  </div>
                  <ToggleGlobalModifier
                    businessId={businessId}
                    productId={productId}
                    groupId={g.id}
                    linked={linked}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(!globalGroups || globalGroups.length === 0) && (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-200 px-4 py-4 text-center text-xs text-zinc-400">
          Belum ada modifier global.{" "}
          <Link href={`/business/${businessId}/modifiers`} className="text-brand-600 hover:underline">
            Buat sekarang
          </Link>
        </div>
      )}
    </div>
  );
}
