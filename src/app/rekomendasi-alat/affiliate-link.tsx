"use client";

import { trackEvent } from "@/lib/analytics/google-analytics";

export function AffiliateLink({
  href,
  productName,
  children,
}: {
  href: string;
  productName: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer sponsored nofollow"
      onClick={() => trackEvent("affiliate_click", { product_name: productName, link_url: href })}
      className="mt-3 inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
    >
      {children}
    </a>
  );
}
