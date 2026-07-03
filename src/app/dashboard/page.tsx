import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "./logout-button";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, name, business_type")
    .order("created_at", { ascending: true });

  if (!businesses || businesses.length === 0) {
    redirect("/onboarding");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-bold text-zinc-900">Toko kamu</h1>
          <p className="mt-1 text-sm text-zinc-500">{user?.email}</p>
        </div>

        <div className="space-y-3">
          {businesses.map((b) => (
            <div key={b.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
              <p className="font-semibold text-zinc-900">{b.name}</p>
              <p className="text-xs text-zinc-500">
                {b.business_type === "fnb" ? "🍽️ Restoran / Kafe / F&B" : "🛒 Retail / Toko"}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                <Link
                  href={`/business/${b.id}/pos`}
                  className="text-xs font-medium text-brand-600 hover:underline"
                >
                  Buka Kasir →
                </Link>
                <Link
                  href={`/business/${b.id}/transactions`}
                  className="text-xs font-medium text-zinc-500 hover:underline"
                >
                  Riwayat Transaksi
                </Link>
                <Link
                  href={`/business/${b.id}/products`}
                  className="text-xs font-medium text-zinc-500 hover:underline"
                >
                  Kelola Produk
                </Link>
                {b.business_type === "fnb" && (
                  <>
                    <Link
                      href={`/business/${b.id}/ingredients`}
                      className="text-xs font-medium text-zinc-500 hover:underline"
                    >
                      Bahan Baku
                    </Link>
                    <Link
                      href={`/business/${b.id}/tables`}
                      className="text-xs font-medium text-zinc-500 hover:underline"
                    >
                      Meja & Self-Order
                    </Link>
                  </>
                )}
                <Link
                  href={`/business/${b.id}/cashiers`}
                  className="text-xs font-medium text-zinc-500 hover:underline"
                >
                  Kelola Kasir
                </Link>
                <Link
                  href={`/business/${b.id}/reports`}
                  className="text-xs font-medium text-zinc-500 hover:underline"
                >
                  Laporan
                </Link>
                <Link
                  href={`/business/${b.id}/finance`}
                  className="text-xs font-medium text-zinc-500 hover:underline"
                >
                  Keuangan
                </Link>
                <Link
                  href={`/business/${b.id}/settings`}
                  className="text-xs font-medium text-zinc-500 hover:underline"
                >
                  Pengaturan
                </Link>
                <Link
                  href={`/business/${b.id}/activity`}
                  className="text-xs font-medium text-zinc-500 hover:underline"
                >
                  Aktivitas
                </Link>
              </div>
            </div>
          ))}
        </div>

        <LogoutButton />
      </div>
    </div>
  );
}
