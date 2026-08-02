import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addKitchenPrinter, addPaymentMethod, updateBusinessType, updateTaxService } from "./actions";
import AddPaymentMethodForm from "./add-payment-method-form";
import AddPrinterForm from "./add-printer-form";
import BusinessTypeForm from "./business-type-form";
import DeletePaymentMethodButton from "./delete-payment-method-button";
import DeletePrinterButton from "./delete-printer-button";
import DiscountRulesSection from "./discount-rules-section";
import PrinterReceiptToggle from "./printer-receipt-toggle";
import TaxServiceForm from "./tax-service-form";
export default async function SettingsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, business_type, tax_enabled, tax_rate, service_enabled, service_rate")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const isFnb = business.business_type === "fnb";

  const { data: paymentMethods } = await supabase
    .from("custom_payment_methods")
    .select("id, name")
    .eq("business_id", businessId)
    .order("name", { ascending: true });

  const [{ data: discountRuleRows }, { data: productRows }] = await Promise.all([
    supabase
      .from("discount_rules")
      .select("id, type, product_id, name, value, value_type, active, valid_from, valid_until, products(name)")
      .eq("business_id", businessId)
      .order("created_at", { ascending: true }),
    supabase
      .from("products")
      .select("id, name")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
  ]);

  const discountRules = (discountRuleRows ?? []) as unknown as {
    id: string;
    type: "per_product" | "promo";
    product_id: string | null;
    name: string | null;
    value: number;
    value_type: "pct" | "amt";
    active: boolean;
    valid_from: string | null;
    valid_until: string | null;
    products?: { name: string } | null;
  }[];

  const [{ data: txRows }, { data: ticketTxRows }] = await Promise.all([
    supabase.from("transactions").select("id").eq("business_id", businessId).limit(1),
    supabase.from("ticket_transactions").select("id").eq("business_id", businessId).limit(1),
  ]);
  const hasTransactions = (txRows && txRows.length > 0) || (ticketTxRows && ticketTxRows.length > 0);

  const boundAddPaymentMethod = addPaymentMethod.bind(null, businessId);
  const boundUpdateBusinessType = updateBusinessType.bind(null, businessId);

  let printers: {
    id: string;
    name: string;
    categories: string[];
    connection_type: string;
    address: string | null;
    device_label: string | null;
    prints_receipt: boolean;
  }[] = [];
  let productCategories: string[] = [];

  if (isFnb) {
    const { data: printerRows } = await supabase
      .from("kitchen_printers")
      .select("id, name, categories, connection_type, address, device_label, prints_receipt")
      .eq("business_id", businessId)
      .order("name", { ascending: true });
    printers = printerRows ?? [];

    const { data: categoryRows } = await supabase
      .from("products")
      .select("category")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .not("category", "is", null);
    productCategories = Array.from(
      new Set((categoryRows ?? []).map((r) => r.category as string).filter(Boolean)),
    ).sort();
  }

  const boundAddKitchenPrinter = addKitchenPrinter.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
        <h1 className="text-lg font-bold text-zinc-900">Pengaturan — {business.name}</h1>

        {/* Jenis Usaha */}
        <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Jenis Usaha</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Menentukan menu &amp; alur kasir yang muncul.
          </p>
          <div className="mt-4">
            {hasTransactions ? (
              <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-4 text-xs text-zinc-500">
                🔒 Toko ini sudah punya transaksi, jadi jenis usaha tidak bisa diganti lagi.
                Hubungi kami kalau butuh bantuan.
              </p>
            ) : (
              <BusinessTypeForm
                action={boundUpdateBusinessType}
                businessType={business.business_type}
              />
            )}
          </div>
        </div>

        {/* Pajak & Biaya Layanan */}
        <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Pajak &amp; Biaya Layanan</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Ditambahkan otomatis ke setiap transaksi di kasir.
          </p>
          <div className="mt-4">
            <TaxServiceForm
              action={updateTaxService.bind(null, businessId)}
              taxEnabled={business.tax_enabled}
              taxRate={Number(business.tax_rate)}
              serviceEnabled={business.service_enabled}
              serviceRate={Number(business.service_rate)}
            />
          </div>
        </div>

        {/* Diskon & Promo */}
        <DiscountRulesSection
          businessId={businessId}
          rules={discountRules}
          products={productRows ?? []}
        />

        {/* Metode Pembayaran Custom */}
        <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Metode Pembayaran Custom</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Tambahan di luar Tunai, Kartu, QRIS — misalnya dompet digital atau transfer bank
            tertentu.
          </p>

          <div className="mt-4 space-y-2">
            {paymentMethods && paymentMethods.length > 0 ? (
              paymentMethods.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-2.5"
                >
                  <p className="text-sm font-medium text-zinc-900">{m.name}</p>
                  <DeletePaymentMethodButton businessId={businessId} methodId={m.id} />
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-4 text-center text-xs text-zinc-400">
                Belum ada metode pembayaran custom.
              </p>
            )}
          </div>

          <div className="mt-4">
            <AddPaymentMethodForm action={boundAddPaymentMethod} />
          </div>
        </div>

        {/* Printer Dapur & Bar (F&B only) */}
        {isFnb && (
          <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
            <h2 className="text-sm font-semibold text-zinc-900">Printer Dapur &amp; Bar</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Cetak order otomatis ke printer dapur/bar sesuai kategori menu — bukan ke kasir.
            </p>

            <div className="mt-4 space-y-2">
              {printers.length > 0 ? (
                printers.map((p) => (
                  <div key={p.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-zinc-900">{p.name}</p>
                      <DeletePrinterButton businessId={businessId} printerId={p.id} />
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {p.connection_type === "lan" ? "🌐 LAN/Wi-Fi" : "📶 Bluetooth"}
                      {p.address
                        ? ` · ${p.connection_type === "bluetooth" ? (p.device_label ?? p.address) : p.address}`
                        : ""}
                    </p>
                    {p.categories.length > 0 && (
                      <p className="mt-1 text-[11px] text-zinc-400">
                        Kategori: {p.categories.join(", ")}
                      </p>
                    )}
                    <PrinterReceiptToggle
                      businessId={businessId}
                      printerId={p.id}
                      printsReceipt={p.prints_receipt}
                    />
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-4 text-center text-xs text-zinc-400">
                  Belum ada printer dapur/bar. Order akan tetap dicetak di kasir saja.
                </p>
              )}
            </div>

            <div className="mt-4 border-t border-zinc-100 pt-4">
              <AddPrinterForm action={boundAddKitchenPrinter} categories={productCategories} />
            </div>
          </div>
        )}

    </div>
  );
}
