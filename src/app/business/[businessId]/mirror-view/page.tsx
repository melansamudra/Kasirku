import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import LogoutButton from "@/app/dashboard/logout-button";

function formatRupiah(v: number) {
  return `Rp${Math.round(v).toLocaleString("id-ID")}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnly(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type MirrorPermissions = {
  show_transactions: boolean;
  show_purchases: boolean;
  show_kas_harian: boolean;
  show_amount: boolean;
  show_customer: boolean;
  show_cashier: boolean;
};

export default async function MirrorViewPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;

  // Verify current user is a mirror account for this business
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const service = createServiceClient();

  const { data: mirrorAccount } = await service
    .from("mirror_accounts")
    .select("id, status, permissions")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!mirrorAccount) notFound();

  // Auto-aktivasi: jika user sudah login dan terdaftar sebagai mirror → set active
  if (mirrorAccount.status === "pending") {
    await service
      .from("mirror_accounts")
      .update({ status: "active" })
      .eq("id", mirrorAccount.id);
  }

  const p = (mirrorAccount.permissions ?? {}) as Partial<MirrorPermissions>;
  const perms: MirrorPermissions = {
    show_transactions: p.show_transactions ?? false,
    show_purchases: p.show_purchases ?? false,
    show_kas_harian: p.show_kas_harian ?? false,
    show_amount: p.show_amount ?? false,
    show_customer: p.show_customer ?? false,
    show_cashier: p.show_cashier ?? false,
  };

  const { data: business } = await service
    .from("businesses")
    .select("id, name, business_type")
    .eq("id", businessId)
    .single();

  if (!business) notFound();

  // Fetch data based on permissions
  const [txResult, purchaseResult, expenseResult] = await Promise.all([
    // Transactions: only those selected for this mirror account
    perms.show_transactions
      ? service
          .from("mirror_selections")
          .select(
            "transaction_id, transactions!mirror_selections_transaction_id_fkey(id, invoice_number, date, total, cashiers!transactions_cashier_id_fkey(name), customers!transactions_customer_id_fkey(name))",
          )
          .eq("mirror_account_id", mirrorAccount.id)
          .eq("business_id", businessId)
          .order("transaction_id", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: null }),

    // Purchases (pembelian & hutang)
    perms.show_purchases
      ? service
          .from("purchases")
          .select("id, date, category, note, amount, paid_amount, suppliers(name)")
          .eq("business_id", businessId)
          .order("date", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: null }),

    // Kas Harian: simple expenses list
    perms.show_kas_harian
      ? service
          .from("expenses")
          .select("id, date, category, amount, note")
          .eq("business_id", businessId)
          .order("date", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: null }),
  ]);

  type TxRow = {
    id: string;
    invoice_number: string;
    date: string;
    total: number;
    cashier_name: string | null;
    customer_name: string | null;
  };

  const transactions: TxRow[] = (txResult.data ?? [])
    .map((row) => {
      const t = row.transactions as unknown as {
        id: string;
        invoice_number: string;
        date: string;
        total: number;
        cashiers: { name: string } | null;
        customers: { name: string } | null;
      } | null;
      if (!t) return null;
      return {
        id: t.id,
        invoice_number: t.invoice_number,
        date: t.date,
        total: t.total,
        cashier_name: (t.cashiers as { name: string } | null)?.name ?? null,
        customer_name: (t.customers as { name: string } | null)?.name ?? null,
      };
    })
    .filter(Boolean) as TxRow[];

  type PurchaseRow = {
    id: string;
    date: string;
    category: string;
    note: string | null;
    amount: number;
    paid_amount: number;
    supplier_name: string | null;
  };

  const purchases: PurchaseRow[] = (purchaseResult.data ?? []).map((p) => ({
    id: p.id,
    date: p.date,
    category: p.category,
    note: p.note,
    amount: Number(p.amount),
    paid_amount: Number(p.paid_amount),
    supplier_name: (p.suppliers as unknown as { name: string } | null)?.name ?? null,
  }));

  type ExpenseRow = {
    id: string;
    date: string;
    category: string;
    amount: number;
    note: string | null;
  };

  const expenses: ExpenseRow[] = (expenseResult.data ?? []).map((e) => ({
    id: e.id,
    date: e.date,
    category: e.category,
    amount: Number(e.amount),
    note: e.note,
  }));

  const totalTx = transactions.reduce((s, t) => s + t.total, 0);
  const totalPurchase = purchases.reduce((s, p) => s + p.amount, 0);
  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);

  const hasAnyData = perms.show_transactions || perms.show_purchases || perms.show_kas_harian;

  // Seksi nav: hanya tampilkan yang punya permission
  const sections = [
    perms.show_transactions && { id: "transaksi", label: "Transaksi", count: transactions.length },
    perms.show_purchases && { id: "pembelian", label: "Pembelian", count: purchases.length },
    perms.show_kas_harian && { id: "kas-harian", label: "Kas Harian", count: expenses.length },
  ].filter(Boolean) as { id: string; label: string; count: number }[];

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Topbar */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between px-5 py-3.5">
          <div>
            <p className="text-sm font-bold text-zinc-900">{business.name}</p>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
              Akun Mirror
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-xs font-medium text-zinc-500 hover:text-zinc-800"
            >
              ← Beranda
            </Link>
            <LogoutButton variant="inline" />
          </div>
        </div>

        {/* Seksi nav — hanya tampil jika ada lebih dari 1 seksi */}
        {sections.length > 1 && (
          <div className="flex gap-0 overflow-x-auto border-t border-zinc-100 px-4">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="shrink-0 border-b-2 border-transparent px-4 py-2.5 text-xs font-medium text-zinc-500 transition-colors hover:border-brand-400 hover:text-zinc-900"
              >
                {s.label}
                <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500">
                  {s.count}
                </span>
              </a>
            ))}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 space-y-6">

        {!hasAnyData && (
          <div className="rounded-xl bg-white border border-zinc-200 px-6 py-10 text-center">
            <p className="text-2xl mb-2">👁</p>
            <p className="text-sm font-medium text-zinc-700">Belum ada data yang dibagikan</p>
            <p className="mt-1 text-xs text-zinc-400">
              Pemilik toko belum mengaktifkan data apa pun untuk akun mirror Anda.
            </p>
          </div>
        )}

        {/* Ringkasan */}
        {hasAnyData && perms.show_amount && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {perms.show_transactions && (
              <div className="rounded-xl bg-white border border-zinc-100 shadow-sm p-4">
                <p className="text-xs text-zinc-400">Total Transaksi Dipilih</p>
                <p className="mt-1 text-xl font-bold text-zinc-900">{formatRupiah(totalTx)}</p>
                <p className="mt-0.5 text-[11px] text-zinc-400">{transactions.length} transaksi</p>
              </div>
            )}
            {perms.show_purchases && (
              <div className="rounded-xl bg-white border border-zinc-100 shadow-sm p-4">
                <p className="text-xs text-zinc-400">Total Pembelian</p>
                <p className="mt-1 text-xl font-bold text-red-600">{formatRupiah(totalPurchase)}</p>
                <p className="mt-0.5 text-[11px] text-zinc-400">{purchases.length} entri</p>
              </div>
            )}
            {perms.show_kas_harian && (
              <div className="rounded-xl bg-white border border-zinc-100 shadow-sm p-4">
                <p className="text-xs text-zinc-400">Total Pengeluaran</p>
                <p className="mt-1 text-xl font-bold text-amber-600">{formatRupiah(totalExpense)}</p>
                <p className="mt-0.5 text-[11px] text-zinc-400">{expenses.length} entri</p>
              </div>
            )}
          </div>
        )}

        {/* Transaksi */}
        {perms.show_transactions && (
          <section id="transaksi">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Transaksi ({transactions.length})
            </h2>
            {transactions.length === 0 ? (
              <div className="rounded-xl bg-white border border-zinc-200 px-5 py-6 text-center text-sm text-zinc-400">
                Belum ada transaksi dipilih oleh pemilik toko.
              </div>
            ) : (
              <div className="space-y-1.5">
                {transactions.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-zinc-900">{t.invoice_number}</p>
                      {perms.show_amount ? (
                        <p className="text-xs font-semibold text-zinc-900">{formatRupiah(t.total)}</p>
                      ) : (
                        <p className="text-xs font-medium text-zinc-400">— tersembunyi —</p>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                      <span>{formatDate(t.date)}</span>
                      {perms.show_cashier && t.cashier_name && (
                        <span>· {t.cashier_name}</span>
                      )}
                      {perms.show_customer && t.customer_name && (
                        <span>· {t.customer_name}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Pembelian & Hutang */}
        {perms.show_purchases && (
          <section id="pembelian">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Pembelian & Hutang ({purchases.length})
            </h2>
            {purchases.length === 0 ? (
              <div className="rounded-xl bg-white border border-zinc-200 px-5 py-6 text-center text-sm text-zinc-400">
                Belum ada data pembelian.
              </div>
            ) : (
              <div className="space-y-1.5">
                {purchases.map((p) => {
                  const hutang = p.amount - p.paid_amount;
                  return (
                    <div key={p.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-zinc-900">
                            {p.supplier_name ?? p.category}
                          </p>
                          {p.note && (
                            <p className="text-[11px] text-zinc-400">{p.note}</p>
                          )}
                          <p className="text-[11px] text-zinc-400">{formatDateOnly(p.date)}</p>
                        </div>
                        {perms.show_amount ? (
                          <div className="text-right shrink-0">
                            <p className="text-xs font-semibold text-zinc-900">{formatRupiah(p.amount)}</p>
                            {hutang > 0 && (
                              <p className="text-[11px] font-medium text-red-500">
                                Hutang {formatRupiah(hutang)}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-zinc-400">— tersembunyi —</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Kas Harian (Pengeluaran) */}
        {perms.show_kas_harian && (
          <section id="kas-harian">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Pengeluaran Kas Harian ({expenses.length})
            </h2>
            {expenses.length === 0 ? (
              <div className="rounded-xl bg-white border border-zinc-200 px-5 py-6 text-center text-sm text-zinc-400">
                Belum ada data pengeluaran.
              </div>
            ) : (
              <div className="space-y-1.5">
                {expenses.map((e) => (
                  <div key={e.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-zinc-900">{e.category}</p>
                        {e.note && (
                          <p className="text-[11px] text-zinc-400">{e.note}</p>
                        )}
                        <p className="text-[11px] text-zinc-400">{formatDateOnly(e.date)}</p>
                      </div>
                      {perms.show_amount ? (
                        <p className="shrink-0 text-xs font-semibold text-amber-600">
                          {formatRupiah(e.amount)}
                        </p>
                      ) : (
                        <p className="text-xs text-zinc-400">— tersembunyi —</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <p className="text-center text-[11px] text-zinc-300 pb-4">
          Tampilan baca-saja · Data ditentukan oleh pemilik toko
        </p>
      </main>
    </div>
  );
}
