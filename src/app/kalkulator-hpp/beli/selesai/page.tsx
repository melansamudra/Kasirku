import Link from "next/link";
import OrderStatus from "./order-status";

export default async function BeliSelesaiPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>;
}) {
  const { order_id: orderId } = await searchParams;

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">
              K
            </div>
            <span className="text-base font-bold text-zinc-900">KasirKu</span>
          </Link>
          <h1 className="mt-4 text-lg font-bold text-zinc-900">Kalkulator HPP Desktop</h1>
        </div>

        {orderId ? (
          <OrderStatus orderId={orderId} />
        ) : (
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
            Nomor pesanan tidak ditemukan di URL.
          </div>
        )}
      </div>
    </div>
  );
}
