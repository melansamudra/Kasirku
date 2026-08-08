import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SelectTransactionsForm from "./select-transactions-form";

export default async function MirrorTransactionSelectPage({
  params,
}: {
  params: Promise<{ businessId: string; mirrorAccountId: string }>;
}) {
  const { businessId, mirrorAccountId } = await params;
  const supabase = await createClient();

  const [{ data: business }, { data: userData }] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, name, owner_id, mirroring_enabled")
      .eq("id", businessId)
      .single(),
    supabase.auth.getUser(),
  ]);

  if (!business) notFound();
  if (business.owner_id !== userData.user?.id) redirect(`/business/${businessId}`);
  if (!business.mirroring_enabled) redirect(`/business/${businessId}/mirror`);

  const { data: mirrorAccount } = await supabase
    .from("mirror_accounts")
    .select("id, invited_email, status")
    .eq("id", mirrorAccountId)
    .eq("business_id", businessId)
    .single();

  if (!mirrorAccount) notFound();

  const [{ data: transactions }, { data: selections }] = await Promise.all([
    supabase
      .from("transactions")
      .select(
        "id, invoice_number, date, total, cashiers!transactions_cashier_id_fkey(name)",
      )
      .eq("business_id", businessId)
      .eq("voided", false)
      .order("date", { ascending: false })
      .limit(100),
    supabase
      .from("mirror_selections")
      .select("transaction_id")
      .eq("mirror_account_id", mirrorAccountId)
      .eq("business_id", businessId),
  ]);

  const selectedIds = new Set((selections ?? []).map((s) => s.transaction_id as string));

  const txList = (transactions ?? []).map((t) => ({
    id: t.id,
    invoice_number: t.invoice_number,
    date: t.date,
    total: t.total,
    cashier_name: (t.cashiers as unknown as { name: string } | null)?.name ?? null,
  }));

  return (
    <div className="w-full max-w-2xl">
      <div className="mb-1">
        <Link
          href={`/business/${businessId}/mirror`}
          className="text-xs text-brand-600 hover:underline"
        >
          ← Kembali ke Akun Mirror
        </Link>
      </div>

      <h1 className="text-lg font-bold text-zinc-900">Pilih Transaksi</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Akun mirror{" "}
        <span className="font-medium text-zinc-700">{mirrorAccount.invited_email}</span>{" "}
        hanya bisa melihat transaksi yang dipilih di bawah.
        Menampilkan 100 transaksi terbaru (tidak termasuk yang dibatalkan).
      </p>

      {txList.length === 0 ? (
        <div className="mt-8 rounded-xl border border-zinc-200 bg-white px-6 py-8 text-center text-sm text-zinc-400">
          Belum ada transaksi di toko ini.
        </div>
      ) : (
        <SelectTransactionsForm
          businessId={businessId}
          mirrorAccountId={mirrorAccountId}
          transactions={txList}
          initialSelected={selectedIds}
        />
      )}
    </div>
  );
}
