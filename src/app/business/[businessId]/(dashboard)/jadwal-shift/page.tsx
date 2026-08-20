import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  addShiftTemplate,
  deleteShiftTemplate,
  assignShift,
  applyShiftToRange,
  regenerateAttendanceSlug,
} from "./actions";
import AddShiftTemplateForm from "./add-shift-template-form";
import DeleteShiftTemplateButton from "./delete-shift-template-button";
import ShiftAssignRow from "./shift-assign-row";
import AttendanceLinkSection from "./attendance-link-section";

const REPORT_TIMEZONE = "Asia/Jakarta";

function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: REPORT_TIMEZONE });
}

function addDaysStr(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function JadwalShiftPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { businessId } = await params;
  const { date: dateParam } = await searchParams;
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayStr();

  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, attendance_qr_slug")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const [{ data: shiftTemplates }, { data: employees }, { data: assignments }] = await Promise.all([
    supabase
      .from("shift_templates")
      .select("id, name, start_time, end_time")
      .eq("business_id", businessId)
      .order("start_time", { ascending: true }),
    supabase
      .from("employees")
      .select("id, name")
      .eq("business_id", businessId)
      .eq("active", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("employee_shift_assignments")
      .select("employee_id, shift_template_id")
      .eq("business_id", businessId)
      .eq("date", date),
  ]);

  const shiftByEmployee = new Map((assignments ?? []).map((a) => [a.employee_id, a.shift_template_id]));
  const shiftOptions = (shiftTemplates ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    startTime: s.start_time.slice(0, 5),
    endTime: s.end_time.slice(0, 5),
  }));

  const boundAddShiftTemplate = addShiftTemplate.bind(null, businessId);
  const boundRegenerateSlug = regenerateAttendanceSlug.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Jadwal Shift — {business.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Atur jam shift lalu tetapkan ke karyawan per hari — dipakai buat hitung telat & lembur
        otomatis dari absen selfie.
      </p>

      <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Link Absen Selfie</h2>
        <p className="mt-1 mb-3 text-xs text-zinc-500">
          Karyawan buka link ini di HP masing-masing untuk absen masuk/pulang pakai selfie — tidak
          perlu akun kasir.
        </p>
        <AttendanceLinkSection
          businessId={businessId}
          initialSlug={business.attendance_qr_slug ?? ""}
          regenerateAction={boundRegenerateSlug}
        />
      </div>

      <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Template Shift</h2>
        {shiftTemplates && shiftTemplates.length > 0 ? (
          <div className="mb-4 space-y-2">
            {shiftTemplates.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2"
              >
                <p className="text-sm font-medium text-zinc-900">
                  {s.name}{" "}
                  <span className="font-normal text-zinc-400">
                    ({s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)})
                  </span>
                </p>
                <DeleteShiftTemplateButton action={deleteShiftTemplate.bind(null, businessId, s.id)} />
              </div>
            ))}
          </div>
        ) : (
          <p className="mb-4 rounded-lg border border-dashed border-zinc-200 px-3 py-4 text-center text-xs text-zinc-400">
            Belum ada template shift.
          </p>
        )}
        <AddShiftTemplateForm action={boundAddShiftTemplate} />
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
        <Link
          href={`/business/${businessId}/jadwal-shift?date=${addDaysStr(date, -1)}`}
          className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
        >
          ←
        </Link>
        <div className="text-center">
          <p className="text-xs font-semibold text-zinc-900">{formatDateLabel(date)}</p>
          {date !== todayStr() && (
            <Link
              href={`/business/${businessId}/jadwal-shift`}
              className="text-[11px] font-medium text-brand-600 hover:underline"
            >
              Kembali ke hari ini
            </Link>
          )}
        </div>
        <Link
          href={`/business/${businessId}/jadwal-shift?date=${addDaysStr(date, 1)}`}
          className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
        >
          →
        </Link>
      </div>

      <div className="mt-4 space-y-2">
        <h2 className="text-sm font-semibold text-zinc-900">Jadwal {formatDateLabel(date)}</h2>
        {!shiftTemplates || shiftTemplates.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Buat template shift dulu di atas sebelum bisa menjadwalkan karyawan.
          </p>
        ) : employees && employees.length > 0 ? (
          employees.map((e) => (
            <ShiftAssignRow
              key={e.id}
              employeeName={e.name}
              currentShiftId={shiftByEmployee.get(e.id) ?? null}
              shifts={shiftOptions}
              date={date}
              assignAction={assignShift.bind(null, businessId, e.id, date)}
              applyRangeAction={applyShiftToRange.bind(null, businessId, e.id, date)}
            />
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada karyawan aktif. Tambahkan dulu di halaman Karyawan.
          </p>
        )}
      </div>
    </div>
  );
}
