import { createClient } from "@/lib/supabase/server";
import OrderScreen from "./order-screen";

type Menu = {
  table_name: string;
  business_name: string;
  products: {
    id: string;
    name: string;
    category: string | null;
    price: number;
    emoji: string | null;
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

  const { data } = await supabase.rpc("get_self_order_menu", {
    p_qr_slug: qrSlug,
  });

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

  const menu = data as Menu;

  return (
    <OrderScreen
      qrSlug={qrSlug}
      businessName={menu.business_name}
      tableName={menu.table_name}
      products={menu.products}
    />
  );
}
