import Link from "next/link";
import Logo from "@/components/logo";

const LINKS = [
  { href: "/kasirku", label: "Aplikasi Kasir" },
  { href: "/layanan", label: "Layanan" },
  { href: "/blog", label: "Artikel" },
  { href: "/rekomendasi-alat", label: "Rekomendasi Alat" },
  { href: "/terms", label: "Syarat & Ketentuan" },
  { href: "/privacy", label: "Kebijakan Privasi" },
];

// Sama seperti SiteHeader — satu footer dipakai di semua halaman publik
// supaya tidak ada lagi footer yang berbeda-beda antar halaman.
export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-zinc-100 px-4 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
        <Link href="/" className="flex items-center gap-2">
          <Logo className="h-7 w-7" />
          <span className="text-sm font-semibold text-zinc-700">CreateImpact</span>
        </Link>
        <div className="flex flex-wrap items-center justify-center gap-4">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-xs text-zinc-400 hover:text-zinc-600 hover:underline">
              {l.label}
            </Link>
          ))}
        </div>
        <p className="text-xs text-zinc-400">© {year} CreateImpact. Semua hak dilindungi.</p>
      </div>
    </footer>
  );
}
