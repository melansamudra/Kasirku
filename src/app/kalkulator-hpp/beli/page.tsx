import type { Metadata } from "next";
import Link from "next/link";
import { DESKTOP_PRODUCTS } from "@/lib/billing/desktop-products";
import { BILLING_MANUAL_MODE, BILLING_CONTACT } from "@/lib/billing/config";
import BuyForm from "./buy-form";
import Logo from "@/components/logo";

export const metadata: Metadata = {
  title: "Beli Kalkulator HPP Desktop — Sekali Bayar | KasirKu",
  description:
    "Aplikasi desktop untuk kelola bahan baku, resep, dan HPP menu — sekali beli, data tersimpan di komputermu sendiri.",
};

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

export default function BeliKalkulatorHppPage() {
  const year = new Date().getFullYear();
  const product = DESKTOP_PRODUCTS[0];
  const message = encodeURIComponent(
    `Halo, saya mau beli ${product.name} (${formatRupiah(product.price)}).`,
  );

  return (
    <div className="flex-1">
      <header className="sticky top-0 z-10 border-b border-zinc-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="h-9 w-9" />
            <span className="text-base font-bold text-zinc-900">KasirKu</span>
          </Link>
          <Link
            href="/kalkulator-hpp"
            className="text-sm font-semibold text-zinc-600 hover:text-brand-700"
          >
            ← Kalkulator Gratis
          </Link>
        </div>
      </header>

      <section className="bg-zinc-50 px-4 py-16">
        <div className="mx-auto max-w-md text-center">
          <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            💻 Aplikasi Desktop
          </span>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-zinc-900">{product.name}</h1>
          <p className="mt-4 text-sm text-zinc-600">{product.description}</p>
        </div>
      </section>

      <section className="px-4 py-16">
        <div className="mx-auto max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-3xl font-bold text-brand-700">{formatRupiah(product.price)}</p>
          <p className="text-xs text-zinc-400">Sekali bayar, pakai selamanya. Bukan langganan.</p>

          <ul className="mt-4 space-y-1.5 text-sm text-zinc-600">
            <li>✓ Kelola bahan baku &amp; harga</li>
            <li>✓ Susun resep tiap menu</li>
            <li>✓ HPP &amp; margin terhitung otomatis</li>
            <li>✓ Data tersimpan di komputer sendiri, tanpa internet</li>
          </ul>

          <div className="mt-6">
            {BILLING_MANUAL_MODE ? (
              <div className="space-y-2">
                <p className="text-[11px] text-zinc-500">
                  Pembayaran otomatis belum aktif — hubungi kami dulu untuk beli.
                </p>
                <a
                  href={`https://wa.me/${BILLING_CONTACT.whatsapp}?text=${message}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full rounded-xl bg-brand-600 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                >
                  💬 Chat WhatsApp
                </a>
                <a
                  href={`mailto:${BILLING_CONTACT.email}?subject=${encodeURIComponent(
                    `Beli ${product.name}`,
                  )}&body=${message}`}
                  className="block w-full rounded-xl border border-zinc-200 py-2.5 text-center text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
                >
                  ✉️ Email
                </a>
              </div>
            ) : (
              <BuyForm productCode={product.code} />
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-100 px-4 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo className="h-7 w-7" />
            <span className="text-sm font-semibold text-zinc-700">KasirKu</span>
          </div>
          <p className="text-xs text-zinc-400">© {year} KasirKu. Semua hak dilindungi.</p>
        </div>
      </footer>
    </div>
  );
}
