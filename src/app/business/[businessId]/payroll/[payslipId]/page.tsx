import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addPayslipAdjustment } from "../actions";
import AddAdjustmentForm from "./add-adjustment-form";
import DeleteAdjustmentButton from "./delete-adjustment-button";
import PrintButton from "./print-button";

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

export default async function PayslipDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; payslipId: string }>;
}) {
  const { businessId, payslipId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("name")
    .eq("id", businessId)
    .single();

  const { data: payslip } = await supabase
    .from("payslips")
    .select(
      "id, period_start, period_end, daily_rate, hadir_count, izin_count, sakit_count, alpa_count, base_pay, created_at, cashiers(name, role)",
    )
    .eq("id", payslipId)
    .eq("business_id", businessId)
    .single();

  if (!business || !payslip) {
    notFound();
  }

  const { data: adjustments } = await supabase
    .from("payslip_adjustments")
    .select("id, type, label, amount")
    .eq("payslip_id", payslipId)
    .order("created_at", { ascending: true });

  const cashier = payslip.cashiers as unknown as { name: string; role: string } | null;
  const tunjangan = (adjustments ?? []).filter((a) => a.type === "tunjangan");
  const potongan = (adjustments ?? []).filter((a) => a.type === "potongan");
  const totalTunjangan = tunjangan.reduce((s, a) => s + Number(a.amount), 0);
  const totalPotongan = potongan.reduce((s, a) => s + Number(a.amount), 0);
  const basePay = Number(payslip.base_pay);
  const totalDiterima = basePay + totalTunjangan - totalPotongan;

  const boundAddAdjustment = addPayslipAdjustment.bind(null, businessId, payslipId);

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 print:bg-white print:py-0">
      <div className="w-full max-w-sm print:max-w-none">
        <div className="print:hidden">
          <PrintButton businessId={businessId} />
        </div>

        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 print:mt-0 print:rounded-none print:border-0 print:p-0">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase text-zinc-400">{business.name}</p>
            <h1 className="mt-1 text-lg font-bold text-zinc-900">Slip Gaji</h1>
          </div>

          <div className="mt-4 space-y-1 border-t border-dashed border-zinc-300 pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">Nama</span>
              <span className="font-medium text-zinc-900">{cashier?.name ?? "Kasir terhapus"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Peran</span>
              <span className="font-medium text-zinc-900">
                {cashier?.role === "manajer" ? "Manajer" : "Kasir"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Periode</span>
              <span className="font-medium text-zinc-900">
                {formatDate(payslip.period_start)} – {formatDate(payslip.period_end)}
              </span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-1.5 border-t border-dashed border-zinc-300 pt-3 text-center">
            <div>
              <p className="text-sm font-bold text-brand-700">{payslip.hadir_count}</p>
              <p className="text-[10px] text-zinc-400">Hadir</p>
            </div>
            <div>
              <p className="text-sm font-bold text-amber-600">{payslip.izin_count}</p>
              <p className="text-[10px] text-zinc-400">Izin</p>
            </div>
            <div>
              <p className="text-sm font-bold text-blue-600">{payslip.sakit_count}</p>
              <p className="text-[10px] text-zinc-400">Sakit</p>
            </div>
            <div>
              <p className="text-sm font-bold text-red-600">{payslip.alpa_count}</p>
              <p className="text-[10px] text-zinc-400">Alpa</p>
            </div>
          </div>

          <div className="mt-3 space-y-1.5 border-t border-dashed border-zinc-300 pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-600">
                Gaji Pokok ({payslip.hadir_count} hari x {formatRupiah(Number(payslip.daily_rate))})
              </span>
              <span className="font-semibold text-zinc-900">{formatRupiah(basePay)}</span>
            </div>
            {tunjangan.map((a) => (
              <div key={a.id} className="flex justify-between text-brand-700">
                <span className="print:hidden">+ {a.label}</span>
                <span className="hidden print:inline">+ {a.label}</span>
                <span className="flex items-center gap-1.5">
                  {formatRupiah(Number(a.amount))}
                  <span className="print:hidden">
                    <DeleteAdjustmentButton
                      businessId={businessId}
                      payslipId={payslipId}
                      adjustmentId={a.id}
                    />
                  </span>
                </span>
              </div>
            ))}
            {potongan.map((a) => (
              <div key={a.id} className="flex justify-between text-red-500">
                <span>− {a.label}</span>
                <span className="flex items-center gap-1.5">
                  {formatRupiah(Number(a.amount))}
                  <span className="print:hidden">
                    <DeleteAdjustmentButton
                      businessId={businessId}
                      payslipId={payslipId}
                      adjustmentId={a.id}
                    />
                  </span>
                </span>
              </div>
            ))}
            <div className="flex justify-between border-t border-dashed border-zinc-300 pt-2 text-base font-bold text-zinc-900">
              <span>Total Diterima</span>
              <span>{formatRupiah(totalDiterima)}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 print:hidden">
          <AddAdjustmentForm action={boundAddAdjustment} />
        </div>
      </div>
    </div>
  );
}
