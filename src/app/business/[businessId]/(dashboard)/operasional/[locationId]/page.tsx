import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Beaker, CalendarCheck, ArrowLeftRight, CreditCard, ClipboardList, type LucideIcon } from "lucide-react";

export default async function OperasionalLocationPage({
  params,
}: {
  params: Promise<{ businessId: string; locationId: string }>;
}) {
  const { businessId, locationId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, cost_control_enabled, rich_stock_ops_enabled")
    .eq("id", businessId)
    .single();
  if (!business || !(business.cost_control_enabled || business.rich_stock_ops_enabled)) {
    notFound();
  }

  // Cuma lokasi non-produksi & non-default-purchase yang lewat sini --
  // Dapur Produksi/Gudang Utama tetap pakai grup sidebar sendiri, jangan
  // sampai bisa diakses lewat hub Operasional ini juga.
  const { data: location } = await supabase
    .from("stock_locations")
    .select("id, name, is_production, is_default_purchase")
    .eq("id", locationId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!location || location.is_production || location.is_default_purchase) {
    notFound();
  }

  const menuItems: { key: string; href: string; label: string; icon: LucideIcon }[] = [
    { key: "bahan-baku", href: `/business/${businessId}/lokasi/${locationId}/bahan-baku`, label: "Bahan Baku", icon: Beaker },
    { key: "semi-finished", href: `/business/${businessId}/lokasi/${locationId}/semi-finished-items`, label: "Bahan Setengah Jadi", icon: Beaker },
    { key: "stock-opname", href: `/business/${businessId}/lokasi/${locationId}/stock-opname`, label: "Stok Opname", icon: CalendarCheck },
    { key: "transfer", href: `/business/${businessId}/lokasi/${locationId}/transfer`, label: "Transfer Internal", icon: ArrowLeftRight },
    { key: "kartu-stok", href: `/business/${businessId}/lokasi/${locationId}/kartu-stok`, label: "Kartu Stok", icon: CreditCard },
    { key: "permintaan-barang", href: `/business/${businessId}/permintaan-barang?lokasi=${locationId}`, label: "Permintaan Barang", icon: ClipboardList },
  ];

  return (
    <div className="w-full max-w-2xl">
      <Link
        href={`/business/${businessId}/operasional`}
        className="text-xs text-zinc-400 hover:text-brand-600"
      >
        ← Operasional
      </Link>
      <h1 className="mt-2 text-lg font-bold text-zinc-900">{location.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">Pilih menu yang mau dibuka buat lokasi ini.</p>

      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={item.href}
              className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-4 shadow-sm transition-colors hover:border-amber-300 hover:bg-amber-50/30"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-zinc-900">{item.label}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
