import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createPayslip } from "./actions";
import CreatePayslipForm from "./create-payslip-form";
import DeletePayslipButton from "./delete-payslip-button";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

export default async function PayrollPage({
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

  const { data: cashiers } = await supabase
    .from("cashiers")
    .select("id, name, daily_rate, active")
    .eq("business_id", businessId)
    .order("name", { ascending: true });

  const { data: payslips } = await supabase
    .from("payslips")
    .select(
      "id, period_start, period_end, base_pay, hadir_count, created_at, paid_at, cashiers(name), payslip_adjustments(type, amount)",
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(50);

  const today = todayStr();
  const defaultStart = `${today.slice(0, 7)}-01`;

  const boundCreatePayslip = createPayslip.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
        <h1 className="text-lg font-bold text-zinc-900">Payroll — {business.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Buat slip gaji dari data absensi, tambah tunjangan/potongan di halaman slip.
        </p>

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">+ Buat Slip Gaji</h2>
          <CreatePayslipForm
            businessId={businessId}
            cashiers={(cashiers ?? []).map((c) => ({
              id: c.id,
              name: c.name,
              dailyRate: Number(c.daily_rate),
              active: c.active,
            }))}
            defaultStart={defaultStart}
            defaultEnd={today}
            action={boundCreatePayslip}
          />
        </div>

        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold text-zinc-900">Riwayat Slip Gaji</h2>
          {payslips && payslips.length > 0 ? (
            payslips.map((p) => {
              const adjustments = (p.payslip_adjustments ?? []) as unknown as {
                type: "tunjangan" | "potongan";
                amount: number;
              }[];
              const tunjangan = adjustments
                .filter((a) => a.type === "tunjangan")
                .reduce((s, a) => s + Number(a.amount), 0);
              const potongan = adjustments
                .filter((a) => a.type === "potongan")
                .reduce((s, a) => s + Number(a.amount), 0);
              const total = Number(p.base_pay) + tunjangan - potongan;
              const cashierName =
                (p.cashiers as unknown as { name: string } | null)?.name ?? "Kasir terhapus";

              return (
                <Link
                  key={p.id}
                  href={`/business/${businessId}/payroll/${p.id}`}
                  className="block rounded-xl border border-zinc-200 bg-white px-4 py-3 transition-colors hover:border-brand-300"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-zinc-900">{cashierName}</p>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-900">
                        {formatRupiah(total)}
                      </span>
                      <DeletePayslipButton businessId={businessId} payslipId={p.id} />
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatDate(p.period_start)} – {formatDate(p.period_end)} · {p.hadir_count} hari
                    kerja
                    {p.paid_at && <span className="ml-1.5 font-medium text-brand-600">· ✓ Dibayar</span>}
                  </p>
                </Link>
              );
            })
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Belum ada slip gaji dibuat.
            </p>
          )}
        </div>
    </div>
  );
}
