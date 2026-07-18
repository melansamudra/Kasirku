import type { MetadataRoute } from "next";
import { ARTICLES } from "@/lib/blog/articles";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    "",
    "/kasirku",
    "/layanan",
    "/rekomendasi-alat",
    "/blog",
    "/kalkulator-hpp",
    "/sistem-akuntansi",
    "/perbandingan",
    "/panduan-akuntansi",
    "/terms",
    "/privacy",
  ].map(
    (path) => ({
      url: `${SITE_URL}${path}`,
      lastModified: new Date(),
    }),
  );

  const articlePages: MetadataRoute.Sitemap = ARTICLES.map((article) => ({
    url: `${SITE_URL}/blog/${article.slug}`,
    lastModified: new Date(article.publishedAt),
  }));

  return [...staticPages, ...articlePages];
}
