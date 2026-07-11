import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addSupplier, editSupplier } from "./actions";
import AddSupplierForm from "./add-supplier-form";
import EditSupplierForm from "./edit-supplier-form";
import DeleteSupplierButton from "./delete-supplier-button";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export default async function SuppliersPage({
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

  if (!business) {
    notFound();
  }

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name, phone, address, notes")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const { data: purchases } = await supabase
    .from("purchases")
    .select("supplier_id, amount, paid_amount")
    .eq("business_id", businessId);

  const utangBySupplier = new Map<string, number>();
  for (const p of purchases ?? []) {
    if (!p.supplier_id) continue;
    const sisa = Number(p.amount) - Number(p.paid_amount);
    utangBySupplier.set(p.supplier_id, (utangBySupplier.get(p.supplier_id) ?? 0) + sisa);
  }

  const boundAddSupplier = addSupplier.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Supplier — {business.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Daftar supplier/pemasok. Sisa utang dihitung dari{" "}
        <Link href={`/business/${businessId}/purchases`} className="text-brand-600 hover:underline">
          Pembelian
        </Link>{" "}
        yang belum lunas.
      </p>

      <div className="mt-6 space-y-2">
        {suppliers && suppliers.length > 0 ? (
          suppliers.map((s) => {
            const sisaUtang = utangBySupplier.get(s.id) ?? 0;
            return (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900">{s.name}</p>
                  <p className="text-xs text-zinc-500">
                    {[s.phone, s.address].filter(Boolean).join(" · ") || "—"}
                  </p>
                  {s.notes && <p className="mt-0.5 text-xs text-zinc-400">{s.notes}</p>}
                </div>
                {sisaUtang > 0 && (
                  <p className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                    Utang {formatRupiah(sisaUtang)}
                  </p>
                )}
                <EditSupplierForm
                  name={s.name}
                  phone={s.phone}
                  address={s.address}
                  notes={s.notes}
                  action={editSupplier.bind(null, businessId, s.id)}
                />
                <DeleteSupplierButton
                  businessId={businessId}
                  supplierId={s.id}
                  supplierName={s.name}
                />
              </div>
            );
          })
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada supplier. Tambahkan minimal satu supaya bisa dipakai saat mencatat pembelian.
          </p>
        )}
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Tambah Supplier</h2>
        <AddSupplierForm action={boundAddSupplier} />
      </div>
    </div>
  );
}
