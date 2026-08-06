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
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">+ Tambah Grup Opsi</h2>
        <AddOptionGroupForm action={addOptionGroup.bind(null, businessId, productId)} />
      </div>
    </div>
  );
}
