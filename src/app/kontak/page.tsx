import type { Metadata } from "next";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Kontak — CreateImpact",
  description: "Hubungi tim CreateImpact untuk pertanyaan, dukungan, atau kerjasama.",
};

export default function KontakPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="mb-2 text-3xl font-bold text-zinc-900">Hubungi Kami</h1>
        <p className="mb-10 text-zinc-500">
          Ada pertanyaan atau butuh bantuan? Tim kami siap membantu kamu.
        </p>

        <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
          <div className="flex items-start gap-4 p-6">
            <span className="text-2xl">📧</span>
            <div>
              <p className="text-sm font-semibold text-zinc-500">Email</p>
              <a
                href="mailto:create2impact.id@gmail.com"
                className="text-base font-medium text-brand-600 hover:underline"
              >
                create2impact.id@gmail.com
              </a>
            </div>
          </div>
          <div className="flex items-start gap-4 p-6">
            <span className="text-2xl">📱</span>
            <div>
              <p className="text-sm font-semibold text-zinc-500">Nomor Telepon / WhatsApp</p>
              <a
                href="https://wa.me/6281234556757"
                className="text-base font-medium text-brand-600 hover:underline"
              >
                081234556757
              </a>
            </div>
          </div>
          <div className="flex items-start gap-4 p-6">
            <span className="text-2xl">📍</span>
            <div>
              <p className="text-sm font-semibold text-zinc-500">Alamat Usaha</p>
              <p className="text-base font-medium text-zinc-800">
                Jl. Waru Timur No. 17, Banyumanik, Semarang
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4 p-6">
            <span className="text-2xl">🌐</span>
            <div>
              <p className="text-sm font-semibold text-zinc-500">Website</p>
              <a
                href="https://createimpact.id"
                className="text-base font-medium text-brand-600 hover:underline"
              >
                createimpact.id
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-2xl bg-brand-50 p-6">
          <p className="text-sm font-semibold text-zinc-700">Jam Operasional</p>
          <p className="mt-1 text-sm text-zinc-500">
            Senin – Jumat: 08.00 – 17.00 WIB
            <br />
            Sabtu: 08.00 – 13.00 WIB
            <br />
            Minggu & Hari Libur: Tutup
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
