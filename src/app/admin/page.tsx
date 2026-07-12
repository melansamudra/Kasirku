import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/app/dashboard/logout-button";
import { activateSubscriptionManually } from "./actions";
import ActivateSubscriptionForm from "./activate-subscription-form";

type Stats = {
  total_businesses: number;
  total_owners: number;
  fnb_count: number;
  retail_count: number;
  tiket_count: number;
  tx_today: number;
  new_businesses_7d: number;
};

type BusinessRow = {
  id: string;
  name: string;
  business_type: string;
  owner_email: string;
  created_at: string;
  shift_open: boolean;
  tx_count: number;
  subscription_status: string;
  plan_code: string | null;
};

const BUSINESS_TYPE_ACCENT: Record<string, { label: string; chip: string }> = {
  fnb: { label: "🍽️ F&B", chip: "bg-amber-50 text-amber-700" },
  retail: { label: "🛒 Retail", chip: "bg-sky-50 text-sky-700" },
  tiket: { label: "🎟️ Tiket", chip: "bg-violet-50 text-violet-700" },
};

const SUBSCRIPTION_BADGE: Record<string, string> = {
  unpaid: "bg-zinc-100 text-zinc-600",
  active: "bg-brand-50 text-brand-700",
  past_due: "bg-amber-50 text-amber-700",
  expired: "bg-red-50 text-red-600",
};

const SUBSCRIPTION_LABELS: Record<string, string> = {
  unpaid: "Belum Bayar",
  active: "Aktif",
  past_due: "Jatuh Tempo",
  expired: "Kedaluwarsa",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: stats, error: statsError }, { data: businesses, error: listError }] =
    await Promise.all([
      supabase.rpc("admin_stats").single(),
      supabase.rpc("admin_list_businesses"),
    ]);

  if (statsError || listError || !stats) {
    notFound();
  }

  const s = stats as Stats;
  const rows = (businesses ?? []) as BusinessRow[];

  return (
    <div className="min-h-screen flex-1 bg-zinc-50">
      <header className="border-b border-zinc-800 bg-zinc-900 px-4 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500 text-sm font-bold text-white">
              🛡️
            </div>
            <div>
              <p className="text-sm font-bold text-white">Panel Admin</p>
              <p className="text-xs text-zinc-400">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/dashboard"
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              ← Dashboard Saya
            </a>
            <LogoutButton variant="inline" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-white shadow-sm p-5">
            <p className="text-[10px] font-semibold uppercase text-zinc-400">Total Toko</p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">{s.total_businesses}</p>
          </div>
          <div className="rounded-xl bg-white shadow-sm p-5">
            <p className="text-[10px] font-semibold uppercase text-zinc-400">Total Pemilik</p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">{s.total_owners}</p>
          </div>
          <div className="rounded-xl bg-white shadow-sm p-5">
            <p className="text-[10px] font-semibold uppercase text-zinc-400">
              Transaksi Hari Ini
            </p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">{s.tx_today}</p>
          </div>
          <div className="rounded-xl bg-white shadow-sm p-5">
            <p className="text-[10px] font-semibold uppercase text-zinc-400">
              Toko Baru (7 Hari)
            </p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">{s.new_businesses_7d}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
            🍽️ F&B: {s.fnb_count}
          </span>
          <span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700">
            🛒 Retail: {s.retail_count}
          </span>
          <span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
            🎟️ Tiket: {s.tiket_count}
          </span>
        </div>

        <div className="mt-8 overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-5 py-4">
            <p className="text-sm font-bold text-zinc-900">Semua Toko</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50">
                <tr className="text-left text-[10px] font-semibold uppercase text-zinc-500">
                  <th className="px-5 py-3">Nama Toko</th>
                  <th className="px-5 py-3">Jenis</th>
                  <th className="px-5 py-3">Pemilik</th>
                  <th className="px-5 py-3">Terdaftar</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Langganan</th>
                  <th className="px-5 py-3">Transaksi</th>
                  <th className="px-5 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => {
                  const accent = BUSINESS_TYPE_ACCENT[b.business_type] ?? {
                    label: b.business_type,
                    chip: "bg-zinc-100 text-zinc-700",
                  };
                  return (
                    <tr key={b.id} className="border-b border-zinc-50 last:border-0">
                      <td className="px-5 py-3 font-medium text-zinc-900">{b.name}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${accent.chip}`}
                        >
                          {accent.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-zinc-500">{b.owner_email}</td>
                      <td className="px-5 py-3 text-zinc-500">{formatDate(b.created_at)}</td>
                      <td className="px-5 py-3">
                        {b.shift_open ? (
                          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
                            ● Shift aktif
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            SUBSCRIPTION_BADGE[b.subscription_status] ?? "bg-zinc-100 text-zinc-600"
                          }`}
                        >
                          {SUBSCRIPTION_LABELS[b.subscription_status] ?? b.subscription_status}
                        </span>
                        {b.plan_code && (
                          <span className="ml-1.5 text-[10px] text-zinc-400">{b.plan_code}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 font-medium text-zinc-900">{b.tx_count}</td>
                      <td className="px-5 py-3">
                        <ActivateSubscriptionForm action={activateSubscriptionManually.bind(null, b.id)} />
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-sm text-zinc-400">
                      Belum ada toko terdaftar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
