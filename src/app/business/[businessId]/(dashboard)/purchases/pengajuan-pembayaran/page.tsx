import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-brand-50 text-brand-700",
  rejected: "bg-red-50 text-red-700",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu Owner",
  approved: "Disetujui",
  rejected: "Ditolak",
};

type RequestRow = {
  id: string;
  purchase_id: string;
  amount: number;
  payment_method: string;
  status: string;
  requested_by_name: string;
  created_at: string;
};

export default async function PaymentRequestsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase.from("businesses").select("id, name").eq("id", businessId).single();
  if (!business) notFound();

  const [requests, purchases] = await Promise.all([
    fetchAllRows<RequestRow>((from, to) =>
      supabase
        .from("purchase_payment_requests")
        .select("id, purchase_id, amount, payment_method, status, requested_by_name, created_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .range(from, to),
    ),
    fetchAllRows<{ id: string; date: string; note: string | null; category: string; supplier_id: string | null }>(
      (from, to) =>
        supabase
          .from("purchases")
          .select("id, date, note, category, supplier_id")
          .eq("business_id", businessId)
          .range(from, to),
    ),
  ]);

  const purchaseById = new Map(purchases.map((p) => [p.id, p]));
  const supplierIds = [...new Set(purchases.map((p) => p.supplier_id).filter((id): id is string => Boolean(id)))];
  const { data: suppliers } = supplierIds.length
    ? await supabase.from("suppliers").select("id, name").in("id", supplierIds)
    : { data: [] };
  const supplierNameById = new Map((suppliers ?? []).map((s) => [s.id, s.name]));

  const pending = requests.filter((r) => r.status === "pending");
  const history = requests.filter((r) => r.status !== "pending");

  function RequestRowView({ r }: { r: RequestRow }) {
    const purchase = purchaseById.get(r.purchase_id);
    const supplierName = purchase?.supplier_id ? supplierNameById.get(purchase.supplier_id) : null;
    return (
      <Link
        key={r.id}
        href={`/business/${businessId}/purchases/pengajuan-pembayaran/${r.id}`}
        className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 hover:bg-zinc-50"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-900">
            {supplierName ?? "—"} · {purchase?.note || purchase?.category || "Pembelian"}
          </p>
          <p className="text-[11px] text-zinc-400">
            Diajukan {formatDateTime(r.created_at)} · oleh {r.requested_by_name}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold text-zinc-900">{formatRupiah(Number(r.amount))}</p>
          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[r.status]}`}>
            {STATUS_LABEL[r.status] ?? r.status}
          </span>
        </div>
      </Link>
    );
  }

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Pengajuan Pembayaran — {business.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Rencana bayar hutang dagang yang diajukan staf, menunggu persetujuan Owner sebelum dibayar.
          </p>
        </div>
        <Link
          href={`/business/${businessId}/purchases/laporan-hutang`}
          className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
        >
          Laporan Hutang →
        </Link>
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-bold text-amber-700">⏳ Menunggu Persetujuan ({pending.length})</h2>
        {pending.length > 0 ? (
          <div className="space-y-2">
            {pending.map((r) => (
              <RequestRowView key={r.id} r={r} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Tidak ada pengajuan yang menunggu.
          </p>
        )}
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-bold text-zinc-900">Riwayat</h2>
        {history.length > 0 ? (
          <div className="space-y-2">
            {history.map((r) => (
              <RequestRowView key={r.id} r={r} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada riwayat pengajuan yang diproses.
          </p>
        )}
      </div>
    </div>
  );
}
