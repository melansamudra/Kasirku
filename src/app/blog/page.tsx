import type { Metadata } from "next";
import Link from "next/link";
import FloatingWhatsApp from "@/components/floating-whatsapp";
import { ARTICLES } from "@/lib/blog/articles";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

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
  return (
    <div className="flex-1">
      <SiteHeader />

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

      <SiteFooter />

      <FloatingWhatsApp />
    </div>
  );
}
