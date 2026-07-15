import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, Clock, Thermometer, UserX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ui/stat-card";
import type { AttendanceStatus } from "../actions";
import PrintButton from "./rekap-print-button";

const REPORT_TIMEZONE = "Asia/Jakarta";

function currentMonthStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: REPORT_TIMEZONE }).slice(0, 7);
}

function addMonthsStr(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function lastDayOfMonthStr(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function AttendanceRekapPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { businessId } = await params;
  const { month: monthParam } = await searchParams;
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : currentMonthStr();

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
    .select("id, name")
    .eq("business_id", businessId)
    .eq("active", true)
    .order("created_at", { ascending: true });

  const monthStart = `${month}-01`;
  const monthEnd = lastDayOfMonthStr(month);

  const { data: monthRows } = await supabase
    .from("attendance")
    .select("employee_id, status")
    .eq("business_id", businessId)
    .gte("date", monthStart)
    .lte("date", monthEnd);

  const recap = new Map<string, Record<AttendanceStatus, number>>();
  for (const e of employees ?? []) {
    recap.set(e.id, { hadir: 0, izin: 0, sakit: 0, alpa: 0 });
  }
  for (const r of monthRows ?? []) {
    const entry = recap.get(r.employee_id);
    if (entry) entry[r.status as AttendanceStatus] += 1;
  }

  const totals = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
  for (const entry of recap.values()) {
    totals.hadir += entry.hadir;
    totals.izin += entry.izin;
    totals.sakit += entry.sakit;
    totals.alpa += entry.alpa;
  }

  return (
    <div className="w-full max-w-2xl print:max-w-none">
      <div className="print:hidden">
        <h1 className="text-lg font-bold text-zinc-900">Rekap Absensi Bulanan — {business.name}</h1>
      </div>
      <p className="mt-1 hidden text-sm text-zinc-500 print:block">Rekap Absensi Bulanan — {business.name}</p>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2.5 print:hidden">
        <Link
          href={`/business/${businessId}/attendance/rekap?month=${addMonthsStr(month, -1)}`}
          className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
        >
          ←
        </Link>
        <div className="text-center">
          <p className="text-xs font-semibold text-zinc-900">{monthLabel(month)}</p>
          {month !== currentMonthStr() && (
            <Link
              href={`/business/${businessId}/attendance/rekap`}
              className="text-[11px] font-medium text-brand-600 hover:underline"
            >
              Kembali ke bulan ini
            </Link>
          )}
        </div>
        <Link
          href={`/business/${businessId}/attendance/rekap?month=${addMonthsStr(month, 1)}`}
          className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
        >
          →
        </Link>
      </div>
      <p className="mt-1 hidden text-[11px] text-zinc-400 print:block">{monthLabel(month)}</p>

      {employees && employees.length > 0 && (
        <div className="mt-4 grid grid-cols-4 gap-2.5 print:hidden">
          <StatCard label="Hadir" value={String(totals.hadir)} icon={CalendarCheck} tone="brand" />
          <StatCard label="Izin" value={String(totals.izin)} icon={Clock} tone="amber" />
          <StatCard label="Sakit" value={String(totals.sakit)} icon={Thermometer} tone="blue" />
          <StatCard label="Alpa" value={String(totals.alpa)} icon={UserX} tone="red" />
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm print:mt-4 print:rounded-none print:border-0 print:shadow-none">
        <div className="border-b border-zinc-100 px-4 py-3 print:hidden">
          <h2 className="text-sm font-bold text-zinc-900">Rekap {monthLabel(month)}</h2>
        </div>
        {employees && employees.length > 0 ? (
          <div className="divide-y divide-zinc-100">
            {employees.map((e) => {
              const r = recap.get(e.id)!;
              return (
                <div key={e.id} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-xs font-medium text-zinc-700">{e.name}</span>
                  <span className="text-[11px] text-zinc-500">
                    <span className="text-brand-700">{r.hadir} hadir</span> ·{" "}
                    <span className="text-amber-600">{r.izin} izin</span> ·{" "}
                    <span className="text-blue-600">{r.sakit} sakit</span> ·{" "}
                    <span className="text-red-600">{r.alpa} alpa</span>
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada karyawan aktif. Tambahkan dulu di halaman Karyawan.
          </p>
        )}
      </div>

      <div className="mt-4 print:hidden">
        <PrintButton businessId={businessId} />
      </div>
    </div>
  );
}
