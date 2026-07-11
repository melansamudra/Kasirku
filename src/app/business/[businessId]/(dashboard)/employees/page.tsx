import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addEmployee, editEmployee } from "./actions";
import AddEmployeeForm from "./add-employee-form";
import EditEmployeeForm from "./edit-employee-form";
import ToggleActiveButton from "./toggle-active-button";

export default async function EmployeesPage({
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

  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, daily_rate, active, note, cashier_id, cashiers(name)")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  const { data: cashiers } = await supabase
    .from("cashiers")
    .select("id, name")
    .eq("business_id", businessId)
    .order("name", { ascending: true });

  const linkedCashierIds = new Set((employees ?? []).map((e) => e.cashier_id).filter(Boolean));

  const boundAddEmployee = addEmployee.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Karyawan — {business.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Semua staf yang absensi & gajinya dicatat di sini — termasuk yang tidak pernah pegang
        kasir (mis. masak, cleaning service).
      </p>

      <div className="mt-6 space-y-2">
        {employees && employees.length > 0 ? (
          employees.map((e) => {
            const linkedCashierName = (e.cashiers as unknown as { name: string } | null)?.name;
            return (
              <div
                key={e.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900">{e.name}</p>
                  <p className="text-xs text-zinc-500">
                    {Number(e.daily_rate) > 0
                      ? `Rp${Number(e.daily_rate).toLocaleString("id-ID")}/hari`
                      : "Gaji harian belum diisi"}
                    {linkedCashierName && <> · akun kasir: {linkedCashierName}</>}
                  </p>
                  {e.note && <p className="text-xs text-zinc-400">{e.note}</p>}
                </div>
                {!e.active && (
                  <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                    Nonaktif
                  </span>
                )}
                <EditEmployeeForm
                  name={e.name}
                  dailyRate={Number(e.daily_rate)}
                  note={e.note}
                  cashierId={e.cashier_id}
                  cashiers={(cashiers ?? []).filter(
                    (c) => c.id === e.cashier_id || !linkedCashierIds.has(c.id),
                  )}
                  action={editEmployee.bind(null, businessId, e.id)}
                />
                <ToggleActiveButton businessId={businessId} employeeId={e.id} active={e.active} />
              </div>
            );
          })
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada karyawan. Tambahkan supaya bisa dicatat absensi & gajinya.
          </p>
        )}
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Tambah Karyawan</h2>
        <AddEmployeeForm
          cashiers={(cashiers ?? []).filter((c) => !linkedCashierIds.has(c.id))}
          action={boundAddEmployee}
        />
      </div>
    </div>
  );
}
