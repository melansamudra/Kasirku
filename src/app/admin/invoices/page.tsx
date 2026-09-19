import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

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

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  unpaid: "Belum Dibayar",
  partial: "Sebagian",
  paid: "Lunas",
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-500",
  unpaid: "bg-amber-50 text-amber-700",
  partial: "bg-blue-50 text-blue-700",
  paid: "bg-brand-50 text-brand-700",
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  date: string;
  due_date: string | null;
  subtotal: number;
  dp_amount: number;
  status: string;
  businesses: { name: string } | null;
};

export default async function AdminInvoicesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const service = createServiceClient();
  const { data: adminRow } = await service
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminRow) notFound();

  const { data: invoices } = await service
    .from("admin_invoices")
    .select("id, invoice_number, date, due_date, subtotal, dp_amount, status, businesses(name)")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (invoices ?? []) as unknown as InvoiceRow[];

  return (
    <div className="min-h-screen flex-1 bg-zinc-50">
      <header className="border-b border-zinc-800 bg-zinc-900 px-4 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-white">Invoice Langganan</p>
            <p className="text-xs text-zinc-400">{user.email}</p>
          </div>
          <Link
            href="/admin"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            ← Panel Admin
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-zinc-900">Invoice Langganan</h1>
            <p className="mt-0.5 text-xs text-zinc-500">
              Tagihan manual ke bisnis (transfer bank) selama pembayaran otomatis belum aktif.
            </p>
          </div>
          <Link
            href="/admin/invoices/baru"
            className="rounded-full bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            + Buat Invoice
          </Link>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl bg-white shadow-sm">
          {rows.length > 0 ? (
            <div className="divide-y divide-zinc-100">
              {rows.map((r) => {
                const sisa = r.subtotal - r.dp_amount;
                return (
                  <Link
                    key={r.id}
                    href={`/admin/invoices/${r.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-zinc-900">
                        {r.businesses?.name ?? "(bisnis tidak ditemukan)"}
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        {r.invoice_number} · {formatDate(r.date)}
                        {r.due_date && ` · Jatuh tempo ${formatDate(r.due_date)}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-zinc-900">{formatRupiah(r.subtotal)}</p>
                      <span
                        className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[r.status] ?? "bg-zinc-100 text-zinc-500"}`}
                      >
                        {r.status === "paid"
                          ? STATUS_LABELS.paid
                          : `${STATUS_LABELS[r.status] ?? r.status} · Sisa ${formatRupiah(sisa)}`}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-zinc-300">Belum ada invoice dibuat</p>
          )}
        </div>
      </main>
    </div>
  );
}
