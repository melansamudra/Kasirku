import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addCashier, editCashier, resetCashierPin } from "./actions";
import AddCashierForm from "./add-cashier-form";
import EditCashierForm from "./edit-cashier-form";
import ResetPinForm from "./reset-pin-form";
import ToggleActiveButton from "./toggle-active-button";

export default async function CashiersPage({
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

  // Explicit column list — pin_hash must never be requested from the client.
  const { data: cashiers } = await supabase
    .from("cashiers")
    .select("id, name, role, active, daily_rate")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  const boundAddCashier = addCashier.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
        <h1 className="text-lg font-bold text-zinc-900">Kasir — {business.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Daftar kasir yang bisa masuk ke layar kasir toko ini.
        </p>

        <div className="mt-6 space-y-2">
          {cashiers && cashiers.length > 0 ? (
            cashiers.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900">{c.name}</p>
                  <p className="text-xs text-zinc-500">
                    {c.role === "manajer" ? "Manajer" : "Kasir"}
                    {Number(c.daily_rate) > 0 && (
                      <> · Rp{Number(c.daily_rate).toLocaleString("id-ID")}/hari</>
                    )}
                  </p>
                </div>
                {!c.active && (
                  <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                    Nonaktif
                  </span>
                )}
                <EditCashierForm
                  name={c.name}
                  role={c.role}
                  dailyRate={Number(c.daily_rate)}
                  action={editCashier.bind(null, businessId, c.id)}
                />
                <ResetPinForm
                  cashierName={c.name}
                  action={resetCashierPin.bind(null, businessId, c.id)}
                />
                <ToggleActiveButton businessId={businessId} cashierId={c.id} active={c.active} />
              </div>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Belum ada kasir. Tambahkan minimal satu supaya bisa mulai jualan.
            </p>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Tambah Kasir</h2>
          <AddCashierForm action={boundAddCashier} />
        </div>
    </div>
  );
}
