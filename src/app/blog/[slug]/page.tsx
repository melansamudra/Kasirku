import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import FloatingWhatsApp from "@/components/floating-whatsapp";
import { ARTICLES, getArticle } from "@/lib/blog/articles";
import { SITE_URL } from "@/lib/site";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

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

      <SiteHeader />

      <article className="px-4 py-16">
        <div className="mx-auto max-w-2xl">
          <Link href="/blog" className="text-xs font-semibold text-brand-700 hover:underline">
            ← Semua Artikel
          </Link>
          <p className="mt-4 text-xs text-zinc-400">{formatDate(article.publishedAt)}</p>
          <h1 className="mt-1.5 text-2xl font-bold leading-tight text-zinc-900 sm:text-3xl">
            {article.title}
          </h1>

          {article.coverImage && (
            <div className="relative mt-6 aspect-[16/9] w-full overflow-hidden rounded-2xl">
              <Image src={article.coverImage} alt="" fill sizes="672px" className="object-cover" priority />
            </div>
          )}

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

      <SiteFooter />

      <FloatingWhatsApp />
    </div>
  );
}
