import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentActor } from "@/lib/current-actor";
import ApproveForm from "./approve-form";
import PrintButton from "./print-button";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}
function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu Persetujuan Owner",
  approved: "Disetujui & Dibayar",
  rejected: "Ditolak",
};

type ItemRow = {
  id: string;
  amount: number;
  purchase_id: string;
  purchases: {
    date: string;
    due_date: string | null;
    category: string;
    note: string | null;
    amount: number;
    paid_amount: number;
    supplier_id: string | null;
    suppliers: {
      name: string;
      phone: string | null;
      bank_name: string | null;
      bank_account_number: string | null;
      bank_account_holder: string | null;
    } | null;
  } | null;
};

export default async function PaymentRequestDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; requestId: string }>;
}) {
  const { businessId, requestId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase.from("businesses").select("name").eq("id", businessId).single();
  if (!business) notFound();

  const { data: request } = await supabase
    .from("purchase_payment_requests")
    .select(
      "id, amount, payment_method, note, status, requested_by_name, approved_by_name, approved_at, reject_reason, created_at",
    )
    .eq("id", requestId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!request) notFound();

  const { data: itemRows } = await supabase
    .from("purchase_payment_request_items")
    .select(
      "id, amount, purchase_id, purchases(date, due_date, category, note, amount, paid_amount, supplier_id, suppliers(name, phone, bank_name, bank_account_number, bank_account_holder))",
    )
    .eq("request_id", requestId)
    .eq("business_id", businessId);

  const items = (itemRows ?? []) as unknown as ItemRow[];

  const bySupplier = new Map<
    string,
    { name: string; phone: string | null; bank: string | null; rows: ItemRow[]; subtotal: number }
  >();
  for (const it of items) {
    const supplier = it.purchases?.suppliers;
    const key = it.purchases?.supplier_id ?? "__tanpa_supplier__";
    const entry = bySupplier.get(key) ?? {
      name: supplier?.name ?? "Tanpa Supplier",
      phone: supplier?.phone ?? null,
      bank: supplier?.bank_account_number
        ? `${supplier?.bank_name ? `${supplier.bank_name} — ` : ""}${supplier.bank_account_number}${
            supplier?.bank_account_holder ? ` a.n. ${supplier.bank_account_holder}` : ""
          }`
        : null,
      rows: [],
      subtotal: 0,
    };
    entry.rows.push(it);
    entry.subtotal += Number(it.amount);
    bySupplier.set(key, entry);
  }
  const supplierGroups = [...bySupplier.values()];

  const actor = await getCurrentActor(supabase, businessId);

  return (
    <div className="w-full max-w-2xl print:max-w-none">
      <div className="print:hidden">
        <p className="text-xs font-medium text-zinc-400">{business.name}</p>
      </div>

      <div className="mt-4 rounded-xl bg-white shadow-sm p-5 print:mt-0 print:rounded-none print:border-0 print:p-0">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-zinc-900">PENGAJUAN PEMBAYARAN HUTANG</h1>
            <p className="text-xs text-zinc-400">{business.name}</p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              request.status === "approved"
                ? "bg-brand-50 text-brand-700"
                : request.status === "rejected"
                  ? "bg-red-50 text-red-700"
                  : "bg-amber-50 text-amber-700"
            }`}
          >
            {STATUS_LABEL[request.status] ?? request.status}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-zinc-400">Jumlah Supplier</p>
            <p className="mt-0.5 font-semibold text-zinc-900">{supplierGroups.length} supplier · {items.length} hutang</p>
          </div>
          <div className="text-right">
            <p className="text-zinc-400">Tanggal Pengajuan</p>
            <p className="mt-0.5 font-semibold text-zinc-900">{formatDateTime(request.created_at)}</p>
            <p className="mt-1 text-zinc-400">Diajukan oleh</p>
            <p className="mt-0.5 font-semibold text-zinc-900">{request.requested_by_name}</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {supplierGroups.map((g, idx) => (
            <div key={idx} className="overflow-hidden rounded-lg border border-zinc-100">
              <div className="flex items-center justify-between bg-zinc-50 px-3 py-2">
                <div>
                  <p className="text-xs font-semibold text-zinc-800">{g.name}</p>
                  {g.bank && <p className="text-[10.5px] text-zinc-500">🏦 {g.bank}</p>}
                  {!g.bank && g.phone && <p className="text-[10.5px] text-zinc-500">{g.phone}</p>}
                </div>
                <p className="text-xs font-bold text-brand-700">{formatRupiah(g.subtotal)}</p>
              </div>
              <div className="divide-y divide-zinc-100">
                {g.rows.map((it) => {
                  const p = it.purchases;
                  if (!p) return null;
                  const sisaSebelum = Number(p.amount) - Number(p.paid_amount);
                  return (
                    <div key={it.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                      <div className="min-w-0">
                        <p className="truncate text-zinc-700">{p.note || p.category}</p>
                        <p className="text-[10.5px] text-zinc-400">
                          {formatDate(p.date)}
                          {p.due_date ? ` · Jatuh tempo ${formatDate(p.due_date)}` : ""} · Sisa hutang saat ini{" "}
                          {formatRupiah(sisaSebelum)}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold text-zinc-800">{formatRupiah(Number(it.amount))}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 ml-auto w-full max-w-[260px] space-y-1 text-xs">
          <div className="flex justify-between border-t border-zinc-100 pt-1 text-sm font-bold">
            <span className="text-zinc-900">Total Diajukan</span>
            <span className="text-brand-700">{formatRupiah(Number(request.amount))}</span>
          </div>
          <div className="flex justify-between text-zinc-500">
            <span>Metode</span>
            <span className="font-medium text-zinc-700">
              {request.payment_method === "transfer" ? "Transfer" : "Tunai"}
            </span>
          </div>
        </div>

        {request.note && (
          <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">Catatan: {request.note}</p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-zinc-400">Diajukan oleh</p>
            <p className="mt-8 border-t border-zinc-300 pt-1 font-medium text-zinc-700">{request.requested_by_name}</p>
          </div>
          <div>
            <p className="text-zinc-400">Persetujuan Owner</p>
            <p className="mt-8 border-t border-zinc-300 pt-1 font-medium text-zinc-700">
              {request.approved_by_name ?? "________________"}
            </p>
            {request.approved_at && <p className="text-[10px] text-zinc-400">{formatDateTime(request.approved_at)}</p>}
          </div>
        </div>

        {request.status === "rejected" && request.reject_reason && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            Alasan penolakan: {request.reject_reason}
          </p>
        )}
      </div>

      {request.status === "pending" && (
        <ApproveForm businessId={businessId} requestId={request.id} isOwner={actor?.isOwner ?? false} />
      )}

      <div className="mt-4">
        <PrintButton businessId={businessId} requestId={request.id} />
      </div>
    </div>
  );
}
