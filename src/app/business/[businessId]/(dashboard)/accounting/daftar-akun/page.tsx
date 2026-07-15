import { notFound } from "next/navigation";
import { BookOpen, Landmark, Scale3D, TrendingUp, TrendingDown } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatCard, type StatTone } from "@/components/ui/stat-card";
import { PillBadge, type PillTone } from "@/components/ui/pill-badge";
import { addAccount } from "./actions";
import AddAccountForm from "./add-account-form";
import DeleteAccountButton from "./delete-account-button";

const TYPE_ORDER = ["aset", "kewajiban", "modal", "pendapatan", "beban"] as const;

const TYPE_LABELS: Record<string, string> = {
  aset: "Aset",
  kewajiban: "Kewajiban",
  modal: "Modal",
  pendapatan: "Pendapatan",
  beban: "Beban",
};

const SALDO_PILL_TONE: Record<string, PillTone> = { debit: "blue", kredit: "amber" };

const TYPE_ICON = { aset: Landmark, kewajiban: Scale3D, pendapatan: TrendingUp, beban: TrendingDown } as const;
const TYPE_STAT_TONE: Record<string, StatTone> = {
  aset: "blue",
  kewajiban: "amber",
  pendapatan: "brand",
  beban: "red",
};

export default async function DaftarAkunPage({
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

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, code, name, type, normal_balance, is_system")
    .eq("business_id", businessId)
    .order("code", { ascending: true });

  const grouped = new Map<string, NonNullable<typeof accounts>>();
  for (const a of accounts ?? []) {
    const list = grouped.get(a.type) ?? [];
    list.push(a);
    grouped.set(a.type, list);
  }

  const boundAddAccount = addAccount.bind(null, businessId);
  const totalAkun = accounts?.length ?? 0;

  return (
    <div className="w-full max-w-3xl">
      <h1 className="text-lg font-bold text-zinc-900">Daftar Akun — {business.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Chart of Accounts yang dipakai untuk pencatatan jurnal.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total Akun" value={String(totalAkun)} icon={BookOpen} tone="zinc" />
        {(["aset", "kewajiban", "pendapatan", "beban"] as const).map((type) => (
          <StatCard
            key={type}
            label={TYPE_LABELS[type]}
            value={String(grouped.get(type)?.length ?? 0)}
            icon={TYPE_ICON[type]}
            tone={TYPE_STAT_TONE[type]}
          />
        ))}
      </div>

      <div className="mt-5 space-y-5">
        {TYPE_ORDER.map((type) => {
          const list = grouped.get(type) ?? [];
          if (list.length === 0) return null;
          return (
            <div key={type}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {TYPE_LABELS[type]}
              </h2>
              <div className="overflow-hidden rounded-xl bg-white shadow-sm">
                <div className="divide-y divide-zinc-100">
                  {list.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-2">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-[11px] font-semibold text-zinc-400">
                          {a.code}
                        </span>
                        <span className="text-sm font-medium text-zinc-900">{a.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <PillBadge tone={SALDO_PILL_TONE[a.normal_balance] ?? "zinc"}>
                          {a.normal_balance === "debit" ? "Debit" : "Kredit"}
                        </PillBadge>
                        {!a.is_system && (
                          <DeleteAccountButton
                            businessId={businessId}
                            accountId={a.id}
                            accountName={a.name}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Tambah Akun Custom</h2>
        <AddAccountForm action={boundAddAccount} />
      </div>
    </div>
  );
}
