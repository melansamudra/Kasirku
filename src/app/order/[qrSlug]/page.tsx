import { createClient } from "@/lib/supabase/server";
import OrderScreen from "./order-screen";

type Menu = {
  table_name: string;
  business_name: string;
  self_order_banner: string | null;
  products: {
    id: string;
    name: string;
    category: string | null;
    price: number;
    emoji: string | null;
    image_url: string | null;
    featured: boolean;
    in_stock: boolean;
  }[];
};

export default async function SelfOrderPage({
  params,
}: {
  params: Promise<{ qrSlug: string }>;
}) {
  const { qrSlug } = await params;
  const supabase = await createClient();

  const [{ data }, { data: tableRow }] = await Promise.all([
    supabase.rpc("get_self_order_menu", { p_qr_slug: qrSlug }),
    supabase
      .from("tables")
      .select("businesses(self_order_enabled, name)")
      .eq("qr_slug", qrSlug)
      .single(),
  ]);

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm rounded-xl bg-white shadow-sm p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-2xl">
            🔍
          </div>
          <h1 className="text-lg font-bold text-zinc-900">Meja tidak ditemukan</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Link atau QR code ini sudah tidak berlaku. Silakan hubungi staf untuk QR yang
            baru.
          </p>
        </div>
      </div>
    );
  }

  const business = (tableRow as unknown as { businesses: { self_order_enabled: boolean; name: string } | null } | null)?.businesses;
  const selfOrderEnabled = business?.self_order_enabled !== false;

  if (!selfOrderEnabled) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm rounded-xl bg-white shadow-sm p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-3xl">
            🛑
          </div>
          <h1 className="text-lg font-bold text-zinc-900">Self-order sedang tidak tersedia</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Silahkan order langsung ke kasir atau panggil staf kami untuk membantu pesanan Anda.
          </p>
          <p className="mt-4 text-xs text-zinc-400">{business?.name}</p>
        </div>
      </div>
    );
  }

  const menu = data as Menu;

  return (
    <OrderScreen
      qrSlug={qrSlug}
      businessName={menu.business_name}
      tableName={menu.table_name}
      banner={menu.self_order_banner}
      products={menu.products}
    />
  );
}
