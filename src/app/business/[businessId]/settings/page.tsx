import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addKitchenPrinter, addPaymentMethod, updateTaxService } from "./actions";
import AddPaymentMethodForm from "./add-payment-method-form";
import AddPrinterForm from "./add-printer-form";
import DeletePaymentMethodButton from "./delete-payment-method-button";
import DeletePrinterButton from "./delete-printer-button";
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

  const boundAddPaymentMethod = addPaymentMethod.bind(null, businessId);

  let printers: { id: string; name: string; categories: string[]; connection_type: string; address: string | null }[] = [];
  let productCategories: string[] = [];

  if (isFnb) {
    const { data: printerRows } = await supabase
      .from("kitchen_printers")
      .select("id, name, categories, connection_type, address")
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
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/dashboard" className="text-xs font-medium text-zinc-500 hover:underline">
          ← Kembali ke dashboard
        </Link>

        <h1 className="mt-3 text-lg font-bold text-zinc-900">Pengaturan — {business.name}</h1>

        {/* Pajak & Biaya Layanan */}
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
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

        {/* Metode Pembayaran Custom */}
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
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
          <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
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
                      {p.address ? ` · ${p.address}` : ""}
                    </p>
                    {p.categories.length > 0 && (
                      <p className="mt-1 text-[11px] text-zinc-400">
                        Kategori: {p.categories.join(", ")}
                      </p>
                    )}
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
    </div>
  );
}
