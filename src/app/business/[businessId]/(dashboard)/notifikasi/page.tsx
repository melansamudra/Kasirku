import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const REPORT_TIMEZONE = "Asia/Jakarta";
const NEAR_DAYS = 7; // dianggap "dekat" kalau jatuh tempo dalam rentang ini
const FAR_CUTOFF_DAYS = 30; // di luar ini tidak ditampilkan sama sekali (kecuali THR)
const THR_WINDOW_DAYS = 60; // THR butuh waktu persiapan lebih panjang

// Perkiraan kasar — GANTI ke tanggal Idul Fitri resmi tahun berjalan begitu
// diumumkan pemerintah (Idul Fitri mengikuti kalender Hijriah, bergeser
// ~10-11 hari lebih awal tiap tahun Masehi, jadi tidak bisa dihitung otomatis).
// Placeholder ini sengaja jauh di masa depan supaya tidak salah menampilkan
// pengingat THR dengan tanggal yang belum tentu benar.
const THR_REFERENCE_DATE = "2027-01-01";

function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: REPORT_TIMEZONE });
}

function daysUntil(dateStr: string, today: string) {
  return Math.floor(
    (new Date(`${dateStr}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000,
  );
}

type Severity = "lewat" | "dekat" | "mendatang";

function severityOf(days: number): Severity {
  if (days < 0) return "lewat";
  if (days <= NEAR_DAYS) return "dekat";
  return "mendatang";
}

const SEVERITY_LABEL: Record<Severity, string> = {
  lewat: "Lewat Jatuh Tempo",
  dekat: "Dekat",
  mendatang: "Mendatang",
};

const SEVERITY_BADGE: Record<Severity, string> = {
  lewat: "bg-red-50 text-red-600",
  dekat: "bg-amber-50 text-amber-700",
  mendatang: "bg-zinc-100 text-zinc-500",
};

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

type NotifItem = {
  id: string;
  title: string;
  subtitle: string;
  amount: number | null;
  severity: Severity;
  days: number;
  href: string;
};

function NotifSection({ title, items }: { title: string; items: NotifItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
      <div className="border-b border-zinc-100 px-4 py-3">
        <h2 className="text-sm font-bold text-zinc-900">{title}</h2>
      </div>
      <div className="divide-y divide-zinc-100">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-50"
          >
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-zinc-900">{item.title}</p>
              <p className="text-[11px] text-zinc-400">{item.subtitle}</p>
            </div>
            <div className="shrink-0 text-right">
              {item.amount !== null && (
                <p className="text-sm font-bold text-zinc-900">{formatRupiah(item.amount)}</p>
              )}
              <span
                className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${SEVERITY_BADGE[item.severity]}`}
              >
                {SEVERITY_LABEL[item.severity]}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function NotifikasiPage({
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

  const today = todayStr();

  const [{ data: purchases }, { data: invoices }, { data: employees }, { data: payslips }] =
    await Promise.all([
      supabase
        .from("purchases")
        .select("id, due_date, amount, paid_amount, note, supplier_id, suppliers(name)")
        .eq("business_id", businessId)
        .not("due_date", "is", null),
      supabase
        .from("invoices")
        .select("id, customer_name, due_date, subtotal, dp_amount, status")
        .eq("business_id", businessId)
        .not("due_date", "is", null)
        .neq("status", "paid"),
      supabase
        .from("employees")
        .select("id, name, contract_end")
        .eq("business_id", businessId)
        .eq("active", true)
        .not("contract_end", "is", null),
      supabase
        .from("payslips")
        .select(
          "id, period_start, period_end, base_pay, lembur_amount, thr_amount, employees(name), payslip_adjustments(type, amount)",
        )
        .eq("business_id", businessId)
        .is("paid_at", null),
    ]);

  const purchaseItems: NotifItem[] = (purchases ?? [])
    .filter((p) => Number(p.amount) - Number(p.paid_amount) > 0)
    .map((p) => {
      const days = daysUntil(p.due_date as string, today);
      const supplierName = (p.suppliers as unknown as { name: string } | null)?.name;
      return {
        id: p.id,
        title: supplierName ?? p.note ?? "Pembelian tanpa supplier",
        subtitle: `Jatuh tempo ${formatDate(p.due_date as string)}`,
        amount: Number(p.amount) - Number(p.paid_amount),
        severity: severityOf(days),
        days,
        href: `/business/${businessId}/purchases`,
      };
    })
    .filter((i) => i.days <= FAR_CUTOFF_DAYS)
    .sort((a, b) => a.days - b.days);

  const invoiceItems: NotifItem[] = (invoices ?? [])
    .map((inv) => {
      const days = daysUntil(inv.due_date as string, today);
      return {
        id: inv.id,
        title: inv.customer_name,
        subtitle: `Jatuh tempo ${formatDate(inv.due_date as string)}`,
        amount: Number(inv.subtotal) - Number(inv.dp_amount),
        severity: severityOf(days),
        days,
        href: `/business/${businessId}/invoices/${inv.id}`,
      };
    })
    .filter((i) => i.days <= FAR_CUTOFF_DAYS)
    .sort((a, b) => a.days - b.days);

  const contractItems: NotifItem[] = (employees ?? [])
    .map((e) => {
      const days = daysUntil(e.contract_end as string, today);
      return {
        id: e.id,
        title: e.name,
        subtitle: `Kontrak berakhir ${formatDate(e.contract_end as string)}`,
        amount: null,
        severity: severityOf(days),
        days,
        href: `/business/${businessId}/employees`,
      };
    })
    .filter((i) => i.days <= FAR_CUTOFF_DAYS)
    .sort((a, b) => a.days - b.days);

  const payslipItems: NotifItem[] = (payslips ?? [])
    .map((p) => {
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
      const total =
        Number(p.base_pay) + Number(p.lembur_amount) + Number(p.thr_amount) + tunjangan - potongan;
      const days = daysUntil(p.period_end as string, today);
      const employeeName =
        (p.employees as unknown as { name: string } | null)?.name ?? "Karyawan terhapus";
      return {
        id: p.id,
        title: employeeName,
        subtitle: `Periode s/d ${formatDate(p.period_end as string)}`,
        amount: total,
        severity: severityOf(days),
        days,
        href: `/business/${businessId}/payroll/${p.id}`,
      };
    })
    .sort((a, b) => a.days - b.days);

  const thrDays = daysUntil(THR_REFERENCE_DATE, today);
  const thrItems: NotifItem[] =
    thrDays >= 0 && thrDays <= THR_WINDOW_DAYS
      ? [
          {
            id: "thr-reminder",
            title: "Persiapan THR",
            subtitle: `Perkiraan Idul Fitri ${formatDate(THR_REFERENCE_DATE)} — cek tanggal resmi tahun ini`,
            amount: null,
            severity: severityOf(thrDays),
            days: thrDays,
            href: `/business/${businessId}/payroll`,
          },
        ]
      : [];

  const totalCount =
    purchaseItems.length + invoiceItems.length + contractItems.length + payslipItems.length + thrItems.length;

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Notifikasi — {business.name}</h1>
      <p className="mt-0.5 text-xs text-zinc-500">
        Rangkuman hutang, invoice, kontrak, dan payroll yang perlu perhatian.
      </p>

      {totalCount === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-300">
          Semua beres — tidak ada yang perlu perhatian saat ini.
        </p>
      ) : (
        <>
          <NotifSection title="Hutang Pembelian Jatuh Tempo" items={purchaseItems} />
          <NotifSection title="Invoice Belum Lunas" items={invoiceItems} />
          <NotifSection title="Payroll Belum Dibayar" items={payslipItems} />
          <NotifSection title="Kontrak Karyawan Mendekati Berakhir" items={contractItems} />
          <NotifSection title="Persiapan THR" items={thrItems} />
        </>
      )}
    </div>
  );
}
