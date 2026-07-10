import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addPayslipAdjustment, markPayslipPaid, updatePayslipExtras } from "../actions";
import AddAdjustmentForm from "./add-adjustment-form";
import DeleteAdjustmentButton from "./delete-adjustment-button";
import LemburThrForm from "./lembur-thr-form";
import MarkPaidButton from "./mark-paid-button";
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
      "id, period_start, period_end, daily_rate, hadir_count, izin_count, sakit_count, alpa_count, base_pay, lembur_amount, thr_amount, created_at, paid_at, cashiers(name, role)",
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
  const lemburAmount = Number(payslip.lembur_amount);
  const thrAmount = Number(payslip.thr_amount);
  const totalDiterima = basePay + lemburAmount + thrAmount + totalTunjangan - totalPotongan;

  const boundAddAdjustment = addPayslipAdjustment.bind(null, businessId, payslipId);
  const boundUpdateExtras = updatePayslipExtras.bind(null, businessId, payslipId);
  const boundMarkPaid = markPayslipPaid.bind(null, businessId, payslipId);
  const isPaid = Boolean(payslip.paid_at);

  return (
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
            {lemburAmount > 0 && (
              <div className="flex justify-between text-brand-700">
                <span>+ Lembur</span>
                <span>{formatRupiah(lemburAmount)}</span>
              </div>
            )}
            {thrAmount > 0 && (
              <div className="flex justify-between text-brand-700">
                <span>+ THR</span>
                <span>{formatRupiah(thrAmount)}</span>
              </div>
            )}
            {tunjangan.map((a) => (
              <div key={a.id} className="flex justify-between text-brand-700">
                <span className="print:hidden">+ {a.label}</span>
                <span className="hidden print:inline">+ {a.label}</span>
                <span className="flex items-center gap-1.5">
                  {formatRupiah(Number(a.amount))}
                  {!isPaid && (
                    <span className="print:hidden">
                      <DeleteAdjustmentButton
                        businessId={businessId}
                        payslipId={payslipId}
                        adjustmentId={a.id}
                      />
                    </span>
                  )}
                </span>
              </div>
            ))}
            {potongan.map((a) => (
              <div key={a.id} className="flex justify-between text-red-500">
                <span>− {a.label}</span>
                <span className="flex items-center gap-1.5">
                  {formatRupiah(Number(a.amount))}
                  {!isPaid && (
                    <span className="print:hidden">
                      <DeleteAdjustmentButton
                        businessId={businessId}
                        payslipId={payslipId}
                        adjustmentId={a.id}
                      />
                    </span>
                  )}
                </span>
              </div>
            ))}
            <div className="flex justify-between border-t border-dashed border-zinc-300 pt-2 text-base font-bold text-zinc-900">
              <span>Total Diterima</span>
              <span>{formatRupiah(totalDiterima)}</span>
            </div>
            {isPaid && (
              <p className="text-right text-xs font-medium text-brand-600">
                ✓ Dibayar {formatDate(payslip.paid_at!.slice(0, 10))}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 print:hidden">
          {isPaid ? (
            <div className="rounded-xl border border-brand-200 bg-brand-50 p-3 text-center text-xs font-medium text-brand-700">
              ✓ Slip ini sudah dibayar dan tercatat di jurnal (Beban Gaji / Kas &amp; Bank).
            </div>
          ) : (
            <div className="space-y-3">
              <LemburThrForm
                action={boundUpdateExtras}
                initialLembur={lemburAmount}
                initialThr={thrAmount}
              />
              <AddAdjustmentForm action={boundAddAdjustment} />
              <MarkPaidButton action={boundMarkPaid} totalDiterima={totalDiterima} />
            </div>
          )}
        </div>
    </div>
  );
}
