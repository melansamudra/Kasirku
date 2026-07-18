import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import FloatingWhatsApp from "@/components/floating-whatsapp";
import { ARTICLES, getArticle } from "@/lib/blog/articles";
import { SITE_URL } from "@/lib/site";
import Logo from "@/components/logo";

export function generateStaticParams() {
  return ARTICLES.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return {};

  return {
    title: `${article.title} — KasirKu`,
    description: article.description,
  };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getArticle(slug);

  if (!article) {
    notFound();
  }

  const year = new Date().getFullYear();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    datePublished: article.publishedAt,
    author: { "@type": "Organization", name: "KasirKu" },
    mainEntityOfPage: `${SITE_URL}/blog/${article.slug}`,
  };

  return (
    <div className="flex-1">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="sticky top-0 z-10 border-b border-zinc-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="h-9 w-9" />
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

      <article className="px-4 py-16">
        <div className="mx-auto max-w-2xl">
          <Link href="/blog" className="text-xs font-semibold text-brand-700 hover:underline">
            ← Semua Artikel
          </Link>
          <p className="mt-4 text-xs text-zinc-400">{formatDate(article.publishedAt)}</p>
          <h1 className="mt-1.5 text-2xl font-bold leading-tight text-zinc-900 sm:text-3xl">
            {article.title}
          </h1>

          <div className="mt-8">
            {article.content.map((block, i) => {
              if (block.type === "heading") {
                return (
                  <h2 key={i} className="mt-8 text-xl font-bold text-zinc-900 first:mt-0">
                    {block.text}
                  </h2>
                );
              }
              if (block.type === "list") {
                return (
                  <ul key={i} className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-600">
                    {block.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                );
              }
              return (
                <p key={i} className="mt-3 text-sm leading-relaxed text-zinc-600">
                  {block.text}
                </p>
              );
            })}
          </div>

          <div className="mt-12 rounded-2xl border border-brand-100 bg-brand-50 p-6">
            <p className="text-sm font-bold text-zinc-900">Kelola usahamu lebih rapi dengan KasirKu</p>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-600">
              Kasir, stok, resep, sampai laporan laba rugi otomatis — semua dalam satu aplikasi.
            </p>
            <Link
              href="/signup"
              className="mt-4 inline-block rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              Coba Gratis →
            </Link>
          </div>
        </div>
      </article>

      <footer className="border-t border-zinc-100 px-4 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo className="h-7 w-7" />
            <span className="text-sm font-semibold text-zinc-700">KasirKu</span>
          </div>
          <p className="text-xs text-zinc-400">© {year} KasirKu. Semua hak dilindungi.</p>
        </div>
      </footer>

      <FloatingWhatsApp />
    </div>
  );
}
