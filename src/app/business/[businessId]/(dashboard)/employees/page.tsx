import { notFound } from "next/navigation";
import { Users, UserCheck, UserX, FileWarning } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ui/stat-card";
import { PillBadge } from "@/components/ui/pill-badge";
import { addEmployee, editEmployee } from "./actions";
import AddEmployeeForm from "./add-employee-form";
import EditEmployeeForm from "./edit-employee-form";
import ToggleActiveButton from "./toggle-active-button";
import DeleteEmployeeButton from "./delete-employee-button";
import PersonalLoanButton from "./personal-loan-button";
import RecurringAllowancesButton from "./recurring-allowances-button";

export default async function EmployeesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, personal_loan_enabled")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const { data: employees } = await supabase
    .from("employees")
    .select(
      "id, name, salary_type, daily_rate, monthly_rate, lembur_rate_per_hour, daily_meal_allowance, daily_attendance_allowance, active, note, cashier_id, contract_end, location_id, cashiers(name)",
    )
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const { data: cashiers } = await supabase
    .from("cashiers")
    .select("id, name")
    .eq("business_id", businessId)
    .order("name", { ascending: true });

  // Sisa Pinjaman Pribadi = total pinjaman yang pernah dicatat dikurangi
  // personal_loan_deduction dari slip-slip yang SUDAH dibayar -- sama pola
  // kayak getOutstandingKasbon/getOutstandingPersonalLoan di payroll/actions.ts.
  const [{ data: personalLoans }, { data: paidSlipsLoans }] = await Promise.all([
    supabase.from("employee_personal_loans").select("employee_id, amount").eq("business_id", businessId),
    supabase
      .from("payslips")
      .select("employee_id, personal_loan_deduction")
      .eq("business_id", businessId)
      .not("paid_at", "is", null),
  ]);

  const personalLoanGivenByEmployee = new Map<string, number>();
  for (const l of personalLoans ?? []) {
    personalLoanGivenByEmployee.set(
      l.employee_id,
      (personalLoanGivenByEmployee.get(l.employee_id) ?? 0) + Number(l.amount),
    );
  }
  const personalLoanSettledByEmployee = new Map<string, number>();
  for (const s of paidSlipsLoans ?? []) {
    personalLoanSettledByEmployee.set(
      s.employee_id,
      (personalLoanSettledByEmployee.get(s.employee_id) ?? 0) + Number(s.personal_loan_deduction),
    );
  }

  const { data: recurringAllowances } = await supabase
    .from("employee_recurring_allowances")
    .select("id, employee_id, label, amount, active")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  const recurringAllowancesByEmployee = new Map<
    string,
    { id: string; label: string; amount: number; active: boolean }[]
  >();
  for (const a of recurringAllowances ?? []) {
    const list = recurringAllowancesByEmployee.get(a.employee_id) ?? [];
    list.push({ id: a.id, label: a.label, amount: Number(a.amount), active: a.active });
    recurringAllowancesByEmployee.set(a.employee_id, list);
  }

  const linkedCashierIds = new Set((employees ?? []).map((e) => e.cashier_id).filter(Boolean));

  const boundAddEmployee = addEmployee.bind(null, businessId);

  const totalKaryawan = employees?.length ?? 0;
  const aktifCount = (employees ?? []).filter((e) => e.active).length;
  const nonaktifCount = totalKaryawan - aktifCount;
  const today = new Date();
  const kontrakSegeraCount = (employees ?? []).filter((e) => {
    if (!e.contract_end) return false;
    const days = Math.ceil((new Date(`${e.contract_end}T00:00:00Z`).getTime() - today.getTime()) / 86400000);
    return days >= 0 && days <= 30;
  }).length;

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Karyawan — {business.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Semua staf yang absensi & gajinya dicatat di sini — termasuk yang tidak pernah pegang
        kasir (mis. masak, cleaning service).
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Karyawan" value={String(totalKaryawan)} icon={Users} tone="zinc" />
        <StatCard label="Aktif" value={String(aktifCount)} icon={UserCheck} tone="brand" />
        <StatCard label="Nonaktif" value={String(nonaktifCount)} icon={UserX} tone="zinc" />
        <StatCard
          label="Kontrak Segera Habis"
          value={String(kontrakSegeraCount)}
          icon={FileWarning}
          tone={kontrakSegeraCount > 0 ? "amber" : "brand"}
        />
      </div>

      <div className="mt-5 space-y-2">
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
                    {e.salary_type === "bulanan"
                      ? Number(e.monthly_rate) > 0
                        ? `Rp${Number(e.monthly_rate).toLocaleString("id-ID")}/bulan`
                        : "Gaji bulanan belum diisi"
                      : Number(e.daily_rate) > 0
                        ? `Rp${Number(e.daily_rate).toLocaleString("id-ID")}/hari`
                        : "Gaji harian belum diisi"}
                    {Number(e.daily_meal_allowance) > 0 &&
                      ` · Uang makan Rp${Number(e.daily_meal_allowance).toLocaleString("id-ID")}/hari`}
                    {Number(e.daily_attendance_allowance) > 0 &&
                      ` · Tunj. kehadiran Rp${Number(e.daily_attendance_allowance).toLocaleString("id-ID")}/hari`}
                    {linkedCashierName && <> · akun kasir: {linkedCashierName}</>}
                  </p>
                  {e.note && <p className="text-xs text-zinc-400">{e.note}</p>}
                  {e.contract_end && (
                    <p className="text-xs text-amber-600">
                      Kontrak berakhir{" "}
                      {new Date(`${e.contract_end}T00:00:00Z`).toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                        timeZone: "UTC",
                      })}
                    </p>
                  )}
                  <div className="mt-1.5 space-y-1.5">
                    <RecurringAllowancesButton
                      businessId={businessId}
                      employeeId={e.id}
                      allowances={recurringAllowancesByEmployee.get(e.id) ?? []}
                    />
                    {business.personal_loan_enabled && (
                      <PersonalLoanButton
                        businessId={businessId}
                        employeeId={e.id}
                        outstanding={Math.max(
                          0,
                          (personalLoanGivenByEmployee.get(e.id) ?? 0) -
                            (personalLoanSettledByEmployee.get(e.id) ?? 0),
                        )}
                      />
                    )}
                  </div>
                </div>
                {!e.active && (
                  <div className="shrink-0">
                    <PillBadge tone="zinc">Nonaktif</PillBadge>
                  </div>
                )}
                <EditEmployeeForm
                  name={e.name}
                  salaryType={e.salary_type === "bulanan" ? "bulanan" : "harian"}
                  dailyRate={Number(e.daily_rate)}
                  monthlyRate={Number(e.monthly_rate)}
                  lemburRatePerHour={e.lembur_rate_per_hour === null ? null : Number(e.lembur_rate_per_hour)}
                  dailyMealAllowance={Number(e.daily_meal_allowance)}
                  dailyAttendanceAllowance={Number(e.daily_attendance_allowance)}
                  note={e.note}
                  cashierId={e.cashier_id}
                  contractEnd={e.contract_end}
                  locationId={e.location_id}
                  cashiers={(cashiers ?? []).filter(
                    (c) => c.id === e.cashier_id || !linkedCashierIds.has(c.id),
                  )}
                  action={editEmployee.bind(null, businessId, e.id)}
                />
                <ToggleActiveButton businessId={businessId} employeeId={e.id} active={e.active} />
                <DeleteEmployeeButton businessId={businessId} employeeId={e.id} employeeName={e.name} />
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
