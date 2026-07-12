import type { Metadata } from "next";
import Link from "next/link";
import { ARTICLES } from "@/lib/blog/articles";

export const metadata: Metadata = {
  title: "Artikel — KasirKu",
  description:
    "Panduan praktis mengelola usaha F&B, retail, dan tempat wisata — HPP, laporan keuangan, dan operasional harian.",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function BlogIndexPage() {
  const year = new Date().getFullYear();

  return (
    <div className="flex-1">
      <header className="sticky top-0 z-10 border-b border-zinc-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">
              K
            </div>
            <span className="text-base font-bold text-zinc-900">KasirKu</span>
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/20 transition-colors hover:bg-brand-700"
          >
            Daftar Gratis
          </Link>
        </div>
      </header>

      <section className="bg-zinc-50 px-4 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            Artikel
          </span>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-zinc-900 sm:text-4xl">
            Panduan Mengelola Usaha F&amp;B, Retail &amp; Tempat Wisata
          </h1>
          <p className="mt-4 text-sm text-zinc-600 sm:text-base">
            Tips praktis seputar HPP, laporan keuangan, dan operasional harian untuk pemilik usaha.
          </p>
        </div>
      </section>

      <section className="px-4 py-16">
        <div className="mx-auto max-w-3xl space-y-4">
          {ARTICLES.map((article) => (
            <Link
              key={article.slug}
              href={`/blog/${article.slug}`}
              className="block rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <p className="text-xs text-zinc-400">{formatDate(article.publishedAt)}</p>
              <p className="mt-1.5 text-lg font-bold text-zinc-900">{article.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">{article.description}</p>
              <span className="mt-3 inline-block text-xs font-semibold text-brand-700">
                Baca selengkapnya →
              </span>
            </Link>
          ))}
        </div>
      </section>

      <footer className="border-t border-zinc-100 px-4 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
              K
            </div>
            <span className="text-sm font-semibold text-zinc-700">KasirKu</span>
          </div>
          <p className="text-xs text-zinc-400">© {year} KasirKu. Semua hak dilindungi.</p>
        </div>
      </footer>
    </div>
  );
}
