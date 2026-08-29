import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addEmployee, setEmployeePin } from "../../../employees/actions";
import AddEmployeeForm from "../../../employees/add-employee-form";
import SetPinButton from "./set-pin-button";
import PortalLinkBox from "./portal-link-box";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export default async function LocationStafPage({
  params,
}: {
  params: Promise<{ businessId: string; locationId: string }>;
}) {
  const { businessId, locationId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled")
    .eq("id", businessId)
    .single();
  if (!business || !business.cost_control_enabled) {
    notFound();
  }

  const { data: location } = await supabase
    .from("stock_locations")
    .select("id, name, portal_slug")
    .eq("id", locationId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!location) {
    notFound();
  }

  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, salary_type, daily_rate, monthly_rate, note, active, has_pin")
    .eq("business_id", businessId)
    .eq("location_id", locationId)
    .order("created_at", { ascending: true });

  const activeEmployees = (employees ?? []).filter((e) => e.active);
  const totalGajiBulanan = activeEmployees
    .filter((e) => e.salary_type === "bulanan")
    .reduce((sum, e) => sum + Number(e.monthly_rate), 0);

  const boundAddEmployee = addEmployee.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
      <Link
        href={`/business/${businessId}/lokasi/${locationId}/bahan-baku`}
        className="text-xs text-zinc-400 hover:text-brand-600"
      >
        ← {location.name}
      </Link>
      <h1 className="mt-2 text-lg font-bold text-zinc-900">Staf — {location.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Karyawan yang ditugaskan di lokasi ini — buat menghitung biaya tenaga kerja cost center
        ini secara terpisah. Absensi &amp; slip gaji lengkap tetap dikelola di halaman{" "}
        <Link href={`/business/${businessId}/employees`} className="text-brand-600 hover:underline">
          Karyawan
        </Link>{" "}
        (business-wide).
      </p>

      {location.portal_slug && (
        <PortalLinkBox businessId={businessId} locationId={locationId} initialSlug={location.portal_slug} />
      )}

      {totalGajiBulanan > 0 && (
        <div className="mt-4 rounded-xl bg-brand-50 px-4 py-3">
          <p className="text-[11px] font-medium text-brand-700">Total Gaji Bulanan (staf aktif, tipe bulanan)</p>
          <p className="text-lg font-bold text-brand-800">{formatRupiah(totalGajiBulanan)}</p>
          <p className="mt-0.5 text-[10.5px] text-brand-600/80">
            Staf tipe harian tidak dihitung di sini — nilainya tergantung hari hadir, lihat slip gaji aktualnya di Payroll.
          </p>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {employees && employees.length > 0 ? (
          employees.map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-900">
                  {e.name}
                  {!e.active && <span className="ml-1.5 text-xs font-normal text-zinc-400">(nonaktif)</span>}
                </p>
                <p className="text-xs text-zinc-500">
                  {e.salary_type === "bulanan"
                    ? `${formatRupiah(Number(e.monthly_rate))}/bulan`
                    : `${formatRupiah(Number(e.daily_rate))}/hari`}
                  {e.note && ` · ${e.note}`}
                </p>
                <SetPinButton
                  action={setEmployeePin.bind(null, businessId, e.id, locationId)}
                  hasPin={e.has_pin ?? false}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada staf yang ditugaskan di lokasi ini.
          </p>
        )}
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Tambah Staf di {location.name}</h2>
        <AddEmployeeForm cashiers={[]} action={boundAddEmployee} lockedLocationId={locationId} />
      </div>
    </div>
  );
}
