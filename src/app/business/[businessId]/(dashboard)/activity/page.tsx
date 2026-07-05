import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const TYPE_ICONS: Record<string, string> = {
  transaksi: "🧾",
  produk: "📦",
  sistem: "⚙️",
  pengaturan: "🔧",
};

const STATUS_STYLES: Record<string, string> = {
  sukses: "bg-brand-50 text-brand-700",
  warning: "bg-amber-100 text-amber-700",
  info: "bg-zinc-100 text-zinc-600",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ActivityPage({
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

  const { data: entries } = await supabase
    .from("activity_log")
    .select("id, type, status, title, detail, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="w-full max-w-2xl">
        <h1 className="text-lg font-bold text-zinc-900">Aktivitas — {business.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Catatan otomatis dari transaksi, shift, dan perubahan data. Menampilkan 100
          terakhir.
        </p>

        <div className="mt-6 space-y-2">
          {entries && entries.length > 0 ? (
            entries.map((e) => (
              <div key={e.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-base">
                    {TYPE_ICONS[e.type] ?? "•"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-zinc-900">{e.title}</p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          STATUS_STYLES[e.status] ?? STATUS_STYLES.info
                        }`}
                      >
                        {e.status}
                      </span>
                    </div>
                    {e.detail && <p className="mt-0.5 text-xs text-zinc-500">{e.detail}</p>}
                    <p className="mt-0.5 text-[11px] text-zinc-400">
                      {formatDateTime(e.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Belum ada aktivitas tercatat.
            </p>
          )}
        </div>
    </div>
  );
}
