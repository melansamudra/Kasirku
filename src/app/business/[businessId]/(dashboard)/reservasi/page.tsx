import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayWibDateString } from "@/lib/wib";
import DateFilter from "../transactions/date-filter";
import { updateReservationStatus } from "./actions";
import StatusButtons from "./status-buttons";

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu",
  confirmed: "Dikonfirmasi",
  cancelled: "Dibatalkan",
  selesai: "Selesai",
};

function formatTime(t: string) {
  return t.slice(0, 5);
}

export default async function ReservasiPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { businessId } = await params;
  const { date: dateParam } = await searchParams;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, storefront_enabled")
    .eq("id", businessId)
    .single();

  if (!business || !business.storefront_enabled) {
    notFound();
  }

  const today = todayWibDateString();
  const selectedDate = dateParam ?? today;

  const { data: reservations } = await supabase
    .from("reservations")
    .select(
      "id, customer_name, phone, party_size, reservation_time, note, status, tables(name), reservation_items(product_name, qty)",
    )
    .eq("business_id", businessId)
    .eq("reservation_date", selectedDate)
    .order("reservation_time", { ascending: true });

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-zinc-900">Reservasi</h1>
        <DateFilter currentDate={selectedDate} />
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        Reservasi yang masuk lewat halaman publik toko.
      </p>

      <div className="mt-6 space-y-2">
        {reservations && reservations.length > 0 ? (
          reservations.map((r) => (
            <div key={r.id} className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">
                    {formatTime(r.reservation_time)} · {r.customer_name}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {r.party_size} tamu · {r.phone}
                    {r.tables?.name && ` · Meja ${r.tables.name}`}
                  </p>
                  {r.note && <p className="mt-1 text-xs text-zinc-400">{r.note}</p>}
                  {r.reservation_items && r.reservation_items.length > 0 && (
                    <div className="mt-1.5 rounded-lg bg-amber-50 px-2 py-1.5">
                      <p className="text-[10px] font-semibold uppercase text-amber-700">Pre-order</p>
                      <ul className="mt-0.5 text-xs text-amber-800">
                        {r.reservation_items.map((item, i) => (
                          <li key={i}>
                            {item.qty}x {item.product_name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    r.status === "confirmed"
                      ? "bg-brand-50 text-brand-700"
                      : r.status === "cancelled"
                        ? "bg-red-50 text-red-600"
                        : r.status === "selesai"
                          ? "bg-zinc-100 text-zinc-500"
                          : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>
              <StatusButtons
                businessId={businessId}
                reservationId={r.id}
                status={r.status}
                action={updateReservationStatus}
              />
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada reservasi di tanggal ini.
          </p>
        )}
      </div>
    </div>
  );
}
