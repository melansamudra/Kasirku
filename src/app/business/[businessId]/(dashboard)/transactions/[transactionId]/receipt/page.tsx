import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "./print-button";

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ businessId: string; transactionId: string }>;
}) {
  const { businessId, transactionId } = await params;
  const supabase = await createClient();

  // Keempat query tidak saling bergantung (semua cuma butuh businessId/
  // transactionId dari params) — dijalankan paralel, bukan berurutan,
  // supaya struk render lebih cepat begitu dibuka dari POS.
  const [{ data: business }, { data: transaction }, { data: items }, { data: payments }, { data: printers }] =
    await Promise.all([
      supabase.from("businesses").select("name, address, phone, receipt_settings").eq("id", businessId).single(),
      supabase
        .from("transactions")
        .select(
          "id, invoice_number, receipt_code, date, subtotal_raw, subtotal, service, tax, total_item_disc, order_disc_amt, total, voided, order_label, customer_name, cashiers!transactions_cashier_id_fkey(name)",
        )
        .eq("id", transactionId)
        .eq("business_id", businessId)
        .single(),
      supabase
        .from("transaction_items")
        .select("id, name, price, qty, note")
        .eq("transaction_id", transactionId)
        .order("id", { ascending: true }),
      supabase
        .from("transaction_payments")
        .select("id, method, amount, received, change")
        .eq("transaction_id", transactionId),
      supabase
        .from("kitchen_printers")
        .select("id, name")
        .eq("business_id", businessId)
        .order("name", { ascending: true }),
    ]);

  if (!business || !transaction) {
    notFound();
  }

  const rs = (business as unknown as { receipt_settings?: Record<string, unknown> }).receipt_settings ?? {};
  const cfg = {
    showLogo: (rs.show_logo ?? false) as boolean,
    logoUrl: (rs.logo_url as string | undefined) ?? "",
    showAddress: (rs.show_address ?? false) as boolean,
    showPhone: (rs.show_phone ?? false) as boolean,
    showInvoice: (rs.show_invoice ?? true) as boolean,
    showReceiptCode: (rs.show_receipt_code ?? false) as boolean,
    showDatetime: (rs.show_datetime ?? true) as boolean,
    showCashier: (rs.show_cashier ?? true) as boolean,
    showItemNote: (rs.show_item_note ?? false) as boolean,
    showUnitPrice: (rs.show_unit_price ?? true) as boolean,
    showItemDisc: (rs.show_item_disc ?? true) as boolean,
    showService: (rs.show_service ?? true) as boolean,
    showTax: (rs.show_tax ?? true) as boolean,
    showPaymentDetail: (rs.show_payment_detail ?? true) as boolean,
    footerText: (rs.footer_text as string | undefined) ?? "Terima kasih!",
  };
  const biz = business as unknown as { name: string; address?: string | null; phone?: string | null };

  return (
    <div className="w-full max-w-xs font-mono text-xs text-zinc-900 print:max-w-none">
        <div className="print:hidden">
          <PrintButton
            businessId={businessId}
            transactionId={transactionId}
            printers={printers ?? []}
          />
        </div>

        <div className="mt-4 rounded-xl bg-white shadow-sm p-5 print:mt-0 print:rounded-none print:border-0 print:p-0">
          <div className="text-center">
            {cfg.showLogo && cfg.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cfg.logoUrl} alt="Logo" className="mx-auto mb-2 h-14 w-auto object-contain" />
            )}
            <p className="text-sm font-bold uppercase">{biz.name}</p>
            {cfg.showAddress && biz.address && (
              <p className="text-[11px] text-zinc-500">{biz.address}</p>
            )}
            {cfg.showPhone && biz.phone && (
              <p className="text-[11px] text-zinc-500">Tel: {biz.phone}</p>
            )}
            {transaction.voided && (
              <p className="mt-1 font-bold text-red-600">*** DIBATALKAN ***</p>
            )}
          </div>

          <div className="mt-3 border-t border-dashed border-zinc-300 pt-2">
            {cfg.showInvoice && (
              <div className="flex justify-between">
                <span>No.</span>
                <span>{transaction.invoice_number}</span>
              </div>
            )}
            {cfg.showReceiptCode && (transaction as unknown as { receipt_code?: string | null }).receipt_code && (
              <div className="flex justify-between">
                <span>No. Struk</span>
                <span>{(transaction as unknown as { receipt_code: string }).receipt_code}</span>
              </div>
            )}
            {cfg.showDatetime && (
              <div className="flex justify-between">
                <span>Tanggal</span>
                <span>{formatDateTime(transaction.date)}</span>
              </div>
            )}
            {cfg.showCashier && (
              <div className="flex justify-between">
                <span>Kasir</span>
                <span>
                  {(transaction.cashiers as unknown as { name: string } | null)?.name ?? "—"}
                </span>
              </div>
            )}
            {(transaction as unknown as { order_label?: string | null }).order_label && (
              <div className="flex justify-between">
                <span>Meja/Order</span>
                <span className="max-w-[60%] text-right">{(transaction as unknown as { order_label: string }).order_label}</span>
              </div>
            )}
            {(transaction as unknown as { customer_name?: string | null }).customer_name && (
              <div className="flex justify-between">
                <span>Pelanggan</span>
                <span className="max-w-[60%] text-right">{(transaction as unknown as { customer_name: string }).customer_name}</span>
              </div>
            )}
          </div>

          <div className="mt-2 space-y-1 border-t border-dashed border-zinc-300 pt-2">
            {items?.map((item) => (
              <div key={item.id}>
                <div className="flex justify-between gap-2">
                  <span className="flex-1 truncate">{item.name}</span>
                  <span className="shrink-0">
                    {formatRupiah(Number(item.price) * Number(item.qty))}
                  </span>
                </div>
                {cfg.showUnitPrice && (
                  <div className="text-zinc-400">
                    {item.qty}×{Number(item.price).toLocaleString("id-ID")}
                  </div>
                )}
                {cfg.showItemNote && (item as unknown as { note?: string | null }).note && (
                  <div className="text-zinc-400 italic">
                    * {(item as unknown as { note?: string | null }).note}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-2 space-y-1 border-t border-dashed border-zinc-300 pt-2">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatRupiah(Number(transaction.subtotal_raw))}</span>
            </div>
            {cfg.showItemDisc && Number(transaction.total_item_disc) > 0 && (
              <div className="flex justify-between">
                <span>Diskon item</span>
                <span>-{formatRupiah(Number(transaction.total_item_disc))}</span>
              </div>
            )}
            {Number(transaction.order_disc_amt) > 0 && (
              <div className="flex justify-between">
                <span>Diskon order</span>
                <span>-{formatRupiah(Number(transaction.order_disc_amt))}</span>
              </div>
            )}
            {cfg.showService && Number(transaction.service) > 0 && (
              <div className="flex justify-between">
                <span>Layanan</span>
                <span>{formatRupiah(Number(transaction.service))}</span>
              </div>
            )}
            {cfg.showTax && Number(transaction.tax) > 0 && (
              <div className="flex justify-between">
                <span>PPN</span>
                <span>{formatRupiah(Number(transaction.tax))}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-dashed border-zinc-300 pt-1 text-sm font-bold">
              <span>TOTAL</span>
              <span>{formatRupiah(Number(transaction.total))}</span>
            </div>
          </div>

          {cfg.showPaymentDetail && (
            <div className="mt-2 space-y-1 border-t border-dashed border-zinc-300 pt-2">
              {payments?.map((p) => (
                <div key={p.id}>
                  <div className="flex justify-between">
                    <span>{p.method}</span>
                    <span>{formatRupiah(Number(p.amount))}</span>
                  </div>
                  {p.received !== null && (
                    <div className="flex justify-between">
                      <span>Diterima</span>
                      <span>{formatRupiah(Number(p.received))}</span>
                    </div>
                  )}
                  {p.change !== null && Number(p.change) > 0 && (
                    <div className="flex justify-between">
                      <span>Kembalian</span>
                      <span>{formatRupiah(Number(p.change))}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="mt-4 border-t border-dashed border-zinc-300 pt-2 text-center">
            {cfg.footerText || "Terima kasih!"}
          </p>
        </div>
    </div>
  );
}
