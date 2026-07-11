"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CreatePayslipResult } from "./actions";

type EmployeeOption = { id: string; name: string; dailyRate: number; active: boolean };

export default function CreatePayslipForm({
  businessId,
  employees,
  defaultStart,
  defaultEnd,
  action,
}: {
  businessId: string;
  employees: EmployeeOption[];
  defaultStart: string;
  defaultEnd: string;
  action: (
    employeeId: string,
    periodStart: string,
    periodEnd: string,
  ) => Promise<CreatePayslipResult>;
}) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [periodStart, setPeriodStart] = useState(defaultStart);
  const [periodEnd, setPeriodEnd] = useState(defaultEnd);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!employeeId) {
      setError("Pilih karyawan dulu.");
      return;
    }
    setPending(true);
    const result = await action(employeeId, periodStart, periodEnd);
    setPending(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    router.push(`/business/${businessId}/payroll/${result.payslipId}`);
  }

  if (employees.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
        Belum ada karyawan. Tambahkan dulu di halaman Karyawan.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Karyawan</label>
        <select
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
              {!e.active ? " (nonaktif)" : ""} — Rp{e.dailyRate.toLocaleString("id-ID")}/hari
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Dari</label>
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Sampai</label>
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Membuat…" : "Buat Slip Gaji"}
      </button>
    </div>
  );
}
