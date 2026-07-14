"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 40; // ~2 menit

type Status = "pending" | "settlement" | "expire" | "cancel" | "deny" | "not_found";

export default function OrderStatus({ orderId }: { orderId: string }) {
  const [status, setStatus] = useState<Status>("pending");
  const [downloadToken, setDownloadToken] = useState<string | null>(null);
  const [polls, setPolls] = useState(0);

  useEffect(() => {
    if (status === "settlement" || polls >= MAX_POLLS) return;

    const timer = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .rpc("get_hpp_order_status", { p_order_id: orderId })
        .maybeSingle();
      const row = data as unknown as { status: string; download_token: string | null } | null;

      if (row) {
        setStatus((row.status as Status) ?? "not_found");
        setDownloadToken(row.download_token ?? null);
      } else {
        setStatus("not_found");
      }
      setPolls((p) => p + 1);
    }, POLL_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [status, polls, orderId]);

  if (status === "settlement" && downloadToken) {
    return (
      <div className="rounded-2xl border border-brand-200 bg-brand-50 p-6 text-center">
        <p className="text-sm font-semibold text-brand-800">✅ Pembayaran berhasil!</p>
        <a
          href={`/api/kalkulator-hpp-desktop/download?order=${orderId}&token=${downloadToken}`}
          className="mt-4 inline-block rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          ⬇️ Download Kalkulator HPP Desktop
        </a>
        <p className="mt-3 text-[11px] text-brand-700">
          Simpan link ini baik-baik — kalau butuh download ulang, buka halaman ini lagi (link
          tetap berlaku selama pembayaran sudah lunas).
        </p>
      </div>
    );
  }

  if (status === "expire" || status === "cancel" || status === "deny") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
        Pembayaran tidak berhasil ({status}). Silakan coba lagi dari halaman pembelian.
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
        Pesanan tidak ditemukan.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
      {polls >= MAX_POLLS
        ? "Konfirmasi pembayaran lebih lama dari biasanya — refresh halaman ini beberapa saat lagi, atau hubungi kami kalau sudah bayar tapi belum juga muncul link download."
        : "Menunggu konfirmasi pembayaran dari payment gateway…"}
    </div>
  );
}
