import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Receipt, ShoppingBag, Wallet } from "lucide-react";
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

function formatDayLong() {
  return new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const service = createServiceClient();

  const { data: mirrorAccount } = await service
    .from("mirror_accounts")
    .select("id, status, permissions")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!mirrorAccount) notFound();

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

  const BUSINESS_TYPE_LABEL: Record<string, string> = {
    fnb: "Restoran / Kafe / F&B",
    retail: "Toko Retail",
    tiket: "Venue / Tiket",
  };

  const [txResult, purchaseResult, kasVisibleResult] = await Promise.all([
    perms.show_transactions
      ? service
          .from("mirror_visible_transactions")
          .select(
            "transaction_id, transactions!mirror_visible_transactions_transaction_id_fkey(id, invoice_number, date, total, cashiers!transactions_cashier_id_fkey(name), customers!transactions_customer_id_fkey(name))",
          )
          .eq("business_id", businessId)
          .order("transaction_id", { ascending: false })
      : Promise.resolve({ data: null }),

    perms.show_purchases
      ? service
          .from("purchases")
          .select("id, date, category, note, amount, paid_amount, suppliers(name)")
          .eq("business_id", businessId)
          .order("date", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: null }),

    perms.show_kas_harian
      ? service
          .from("mirror_visible_kas")
          .select(
            "journal_line_id, journal_lines!mirror_visible_kas_journal_line_id_fkey(id, debit, credit, journal_entries!inner(id, date, description, source))",
          )
          .eq("business_id", businessId)
          .order("journal_line_id", { ascending: false })
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

  type KasRow = {
    id: string;
    date: string;
    description: string;
    source: string;
    masuk: number;
    keluar: number;
  };

  const kasEntries: KasRow[] = (kasVisibleResult.data ?? [])
    .map((row) => {
      const line = row.journal_lines as unknown as {
        id: string;
        debit: number;
        credit: number;
        journal_entries: { id: string; date: string; description: string; source: string } | null;
      } | null;
      if (!line || !line.journal_entries) return null;
      return {
        id: line.id,
        date: line.journal_entries.date,
        description: line.journal_entries.description,
        source: line.journal_entries.source,
        masuk: Number(line.debit),
        keluar: Number(line.credit),
      };
    })
    .filter(Boolean) as KasRow[];

  kasEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalTx = transactions.reduce((s, t) => s + t.total, 0);
  const totalPurchase = purchases.reduce((s, p) => s + p.amount, 0);
  const totalKasMasuk = kasEntries.reduce((s, k) => s + k.masuk, 0);
  const totalKasKeluar = kasEntries.reduce((s, k) => s + k.keluar, 0);

  const hasAnyData = perms.show_transactions || perms.show_purchases || perms.show_kas_harian;

  const navItems = [
    perms.show_transactions && {
      id: "transaksi",
      label: "Transaksi",
      count: transactions.length,
      icon: Receipt,
    },
    perms.show_purchases && {
      id: "pembelian",
      label: "Pembelian",
      count: purchases.length,
      icon: ShoppingBag,
    },
    perms.show_kas_harian && {
      id: "kas-harian",
      label: "Kas Harian",
      count: kasEntries.length,
      icon: Wallet,
    },
  ].filter(Boolean) as { id: string; label: string; count: number; icon: React.ElementType }[];

  const businessInitial = business.name.charAt(0).toUpperCase();

  return (
    <div className="flex min-h-screen bg-zinc-50">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex md:w-56 flex-col fixed inset-y-0 border-r border-zinc-200 bg-white z-20">
        {/* Business info */}
        <div className="px-4 pt-5 pb-4 border-b border-zinc-100">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">
              {businessInitial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-zinc-900">{business.name}</p>
              <p className="truncate text-[10px] text-zinc-400">
                {BUSINESS_TYPE_LABEL[business.business_type] ?? business.business_type}
              </p>
            </div>
          </div>
          <div className="mt-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold text-indigo-600">
              👁 Akun Mirror
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {navItems.length > 0 && (
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Data
            </p>
          )}
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500">
                  {item.count}
                </span>
              </a>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="border-t border-zinc-100 px-3 py-3 space-y-1">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800"
          >
            ← Semua Toko
          </Link>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 md:ml-56 flex flex-col min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
          <div className="flex items-center justify-between px-5 py-3">
            <div>
              <p className="text-sm font-bold text-zinc-900">{business.name}</p>
              <p className="text-xs text-zinc-400">{formatDayLong()}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                  {user.email?.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs text-zinc-500">{user.email}</span>
              </div>
              <LogoutButton variant="inline" />
            </div>
          </div>

          {/* Mobile nav tabs */}
          {navItems.length > 1 && (
            <div className="flex md:hidden gap-0 overflow-x-auto border-t border-zinc-100 px-4">
              {navItems.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="shrink-0 border-b-2 border-transparent px-4 py-2.5 text-xs font-medium text-zinc-500 hover:border-brand-400 hover:text-zinc-900"
                >
                  {item.label}
                  <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500">
                    {item.count}
                  </span>
                </a>
              ))}
            </div>
          )}
        </header>

        {/* Content */}
        <main className="flex-1 px-5 py-6 space-y-6 max-w-4xl">

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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {perms.show_transactions && (
                <div className="rounded-xl bg-brand-600 px-5 py-4 text-white shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                    Total Transaksi Dipilih
                  </p>
                  <p className="mt-1 text-2xl font-bold">{formatRupiah(totalTx)}</p>
                  <p className="mt-0.5 text-xs opacity-70">{transactions.length} transaksi</p>
                </div>
              )}
              {perms.show_purchases && (
                <div className="rounded-xl bg-white border border-zinc-100 px-5 py-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Total Pembelian
                  </p>
                  <p className="mt-1 text-2xl font-bold text-red-600">{formatRupiah(totalPurchase)}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">{purchases.length} entri</p>
                </div>
              )}
              {perms.show_kas_harian && (
                <div className="rounded-xl bg-white border border-zinc-100 px-5 py-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Kas Masuk / Keluar
                  </p>
                  <p className="mt-1 text-2xl font-bold text-brand-700">{formatRupiah(totalKasMasuk)}</p>
                  <p className="mt-0.5 text-xs text-red-500">keluar {formatRupiah(totalKasKeluar)}</p>
                </div>
              )}
            </div>
          )}

          {/* Transaksi */}
          {perms.show_transactions && (
            <section id="transaksi">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Laporan Transaksi
                  </p>
                  <h2 className="text-lg font-bold text-zinc-900">
                    Transaksi ({transactions.length})
                  </h2>
                </div>
              </div>

              {transactions.length === 0 ? (
                <div className="rounded-xl bg-white border border-zinc-200 px-5 py-8 text-center text-sm text-zinc-400">
                  Belum ada transaksi dipilih oleh pemilik toko.
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 border-b border-zinc-100">
                      <tr className="text-left text-[10px] font-semibold uppercase text-zinc-400">
                        <th className="px-4 py-3">Invoice</th>
                        <th className="px-4 py-3">Tanggal</th>
                        {perms.show_cashier && <th className="px-4 py-3">Kasir</th>}
                        {perms.show_customer && <th className="px-4 py-3">Pelanggan</th>}
                        {perms.show_amount && (
                          <th className="px-4 py-3 text-right">Total</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((t, i) => (
                        <tr
                          key={t.id}
                          className={`border-b border-zinc-50 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}
                        >
                          <td className="px-4 py-3 font-semibold text-zinc-900 text-xs">
                            {t.invoice_number}
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-500">{formatDate(t.date)}</td>
                          {perms.show_cashier && (
                            <td className="px-4 py-3 text-xs text-zinc-500">
                              {t.cashier_name ?? "—"}
                            </td>
                          )}
                          {perms.show_customer && (
                            <td className="px-4 py-3 text-xs text-zinc-500">
                              {t.customer_name ?? "—"}
                            </td>
                          )}
                          {perms.show_amount && (
                            <td className="px-4 py-3 text-right text-xs font-semibold text-zinc-900">
                              {formatRupiah(t.total)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    {perms.show_amount && transactions.length > 1 && (
                      <tfoot className="border-t border-zinc-200 bg-zinc-50">
                        <tr>
                          <td
                            colSpan={
                              2 +
                              (perms.show_cashier ? 1 : 0) +
                              (perms.show_customer ? 1 : 0)
                            }
                            className="px-4 py-3 text-xs font-semibold text-zinc-500"
                          >
                            Total
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-zinc-900">
                            {formatRupiah(totalTx)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Pembelian & Hutang */}
          {perms.show_purchases && (
            <section id="pembelian">
              <div className="mb-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Pembelian & Hutang
                </p>
                <h2 className="text-lg font-bold text-zinc-900">
                  Pembelian ({purchases.length})
                </h2>
              </div>

              {purchases.length === 0 ? (
                <div className="rounded-xl bg-white border border-zinc-200 px-5 py-8 text-center text-sm text-zinc-400">
                  Belum ada data pembelian.
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 border-b border-zinc-100">
                      <tr className="text-left text-[10px] font-semibold uppercase text-zinc-400">
                        <th className="px-4 py-3">Supplier / Keterangan</th>
                        <th className="px-4 py-3">Tanggal</th>
                        {perms.show_amount && (
                          <>
                            <th className="px-4 py-3 text-right">Total</th>
                            <th className="px-4 py-3 text-right">Sisa Hutang</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {purchases.map((p, i) => {
                        const hutang = p.amount - p.paid_amount;
                        return (
                          <tr
                            key={p.id}
                            className={`border-b border-zinc-50 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}
                          >
                            <td className="px-4 py-3">
                              <p className="text-xs font-semibold text-zinc-900">
                                {p.supplier_name ?? p.category}
                              </p>
                              {p.note && (
                                <p className="text-[11px] text-zinc-400">{p.note}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-zinc-500">
                              {formatDateOnly(p.date)}
                            </td>
                            {perms.show_amount && (
                              <>
                                <td className="px-4 py-3 text-right text-xs font-semibold text-zinc-900">
                                  {formatRupiah(p.amount)}
                                </td>
                                <td className="px-4 py-3 text-right text-xs font-medium">
                                  {hutang > 0 ? (
                                    <span className="text-red-500">{formatRupiah(hutang)}</span>
                                  ) : (
                                    <span className="text-brand-600">Lunas</span>
                                  )}
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                    {perms.show_amount && purchases.length > 1 && (
                      <tfoot className="border-t border-zinc-200 bg-zinc-50">
                        <tr>
                          <td colSpan={2} className="px-4 py-3 text-xs font-semibold text-zinc-500">
                            Total
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-zinc-900">
                            {formatRupiah(totalPurchase)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-red-500">
                            {formatRupiah(
                              purchases.reduce((s, p) => s + Math.max(0, p.amount - p.paid_amount), 0),
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Kas Harian */}
          {perms.show_kas_harian && (
            <section id="kas-harian">
              <div className="mb-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Kas Harian
                </p>
                <h2 className="text-lg font-bold text-zinc-900">
                  Kas Harian ({kasEntries.length})
                </h2>
              </div>

              {kasEntries.length === 0 ? (
                <div className="rounded-xl bg-white border border-zinc-200 px-5 py-8 text-center text-sm text-zinc-400">
                  Belum ada data kas yang dibagikan.
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 border-b border-zinc-100">
                      <tr className="text-left text-[10px] font-semibold uppercase text-zinc-400">
                        <th className="px-4 py-3">Keterangan</th>
                        <th className="px-4 py-3">Tanggal</th>
                        {perms.show_amount && (
                          <>
                            <th className="px-4 py-3 text-right">Masuk</th>
                            <th className="px-4 py-3 text-right">Keluar</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {kasEntries.map((k, i) => (
                        <tr
                          key={k.id}
                          className={`border-b border-zinc-50 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}
                        >
                          <td className="px-4 py-3 text-xs font-medium text-zinc-900">
                            {k.description}
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-500">
                            {formatDateOnly(k.date)}
                          </td>
                          {perms.show_amount && (
                            <>
                              <td className="px-4 py-3 text-right text-xs font-semibold text-brand-700">
                                {k.masuk > 0 ? formatRupiah(k.masuk) : "—"}
                              </td>
                              <td className="px-4 py-3 text-right text-xs font-semibold text-red-500">
                                {k.keluar > 0 ? formatRupiah(k.keluar) : "—"}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    {perms.show_amount && kasEntries.length > 1 && (
                      <tfoot className="border-t border-zinc-200 bg-zinc-50">
                        <tr>
                          <td colSpan={2} className="px-4 py-3 text-xs font-semibold text-zinc-500">
                            Total
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-brand-700">
                            {formatRupiah(totalKasMasuk)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-red-500">
                            {formatRupiah(totalKasKeluar)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </section>
          )}

          <p className="text-center text-[11px] text-zinc-300 pb-4">
            Tampilan baca-saja · Data ditentukan oleh pemilik toko
          </p>
        </main>
      </div>
    </div>
  );
}
