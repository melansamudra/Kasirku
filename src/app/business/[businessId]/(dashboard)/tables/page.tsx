import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addTable } from "./actions";
import AddTableForm from "./add-table-form";
import CopyLinkButton from "./copy-link-button";
import DeleteTableButton from "./delete-table-button";
import OrderStatusButton from "./order-status-button";

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

type SelfOrder = {
  id: string;
  status: string;
  created_at: string;
  tables: { name: string } | null;
  self_order_items: { name: string; qty: number; price: number; note: string | null }[];
};

export default async function TablesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, business_type")
    .eq("id", businessId)
    .single();

  if (!business || business.business_type !== "fnb") {
    notFound();
  }

  const { data: tables } = await supabase
    .from("tables")
    .select("id, name, qr_slug")
    .eq("business_id", businessId)
    .order("name", { ascending: true });

  const { data: orderRows } = await supabase
    .from("self_orders")
    .select(
      "id, status, created_at, tables(name), self_order_items(name, qty, price, note)",
    )
    .eq("business_id", businessId)
    .neq("status", "selesai")
    .order("created_at", { ascending: true });

  const orders = (orderRows ?? []) as unknown as SelfOrder[];

  const boundAddTable = addTable.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
        <h1 className="text-lg font-bold text-zinc-900">
          Meja &amp; Self-Order — {business.name}
        </h1>

        {/* Order masuk */}
        <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Order Masuk</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Pesanan dari pelanggan yang scan QR meja. Selesaikan pembayarannya di kasir.
          </p>

          <div className="mt-4 space-y-2">
            {orders.length > 0 ? (
              orders.map((o) => {
                const total = o.self_order_items.reduce(
                  (sum, i) => sum + i.price * i.qty,
                  0,
                );
                return (
                  <div key={o.id} className="rounded-xl border border-zinc-200 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-zinc-900">
                        🪑 {o.tables?.name ?? "Meja terhapus"}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          o.status === "baru"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-sky-100 text-sky-700"
                        }`}
                      >
                        {o.status === "baru" ? "Baru" : "Diproses"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-zinc-400">
                      Masuk {formatTime(o.created_at)}
                    </p>
                    <div className="mt-2 space-y-1">
                      {o.self_order_items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs text-zinc-600">
                          <span>
                            {item.qty}× {item.name}
                            {item.note && (
                              <span className="text-zinc-400"> — {item.note}</span>
                            )}
                          </span>
                          <span className="tabular-nums">
                            {formatRupiah(item.price * item.qty)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-zinc-100 pt-2">
                      <p className="text-xs font-semibold text-zinc-900">
                        Total {formatRupiah(total)}
                      </p>
                      {o.status === "baru" ? (
                        <OrderStatusButton
                          businessId={businessId}
                          orderId={o.id}
                          nextStatus="diproses"
                          label="Proses"
                        />
                      ) : (
                        <OrderStatusButton
                          businessId={businessId}
                          orderId={o.id}
                          nextStatus="selesai"
                          label="Selesai"
                        />
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-4 text-center text-xs text-zinc-400">
                Belum ada order masuk.
              </p>
            )}
          </div>
        </div>

        {/* Daftar meja */}
        <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Daftar Meja</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Setiap meja punya link order sendiri. Salin link-nya, jadikan QR code, lalu
            tempel di meja.
          </p>

          <div className="mt-4 space-y-2">
            {tables && tables.length > 0 ? (
              tables.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 px-4 py-2.5"
                >
                  <p className="min-w-0 truncate text-sm font-medium text-zinc-900">{t.name}</p>
                  <div className="flex shrink-0 items-center gap-2">
                    <CopyLinkButton qrSlug={t.qr_slug} />
                    <Link
                      href={`/order/${t.qr_slug}`}
                      target="_blank"
                      className="rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:border-brand-300 hover:text-brand-700"
                    >
                      Buka ↗
                    </Link>
                    <DeleteTableButton businessId={businessId} tableId={t.id} />
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-4 text-center text-xs text-zinc-400">
                Belum ada meja.
              </p>
            )}
          </div>

          <div className="mt-4 border-t border-zinc-100 pt-4">
            <AddTableForm action={boundAddTable} />
          </div>
        </div>
    </div>
  );
}
