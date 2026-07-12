import Script from "next/script";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

// Fire a custom GA4 event (e.g. affiliate link clicks) — no-op if analytics
// is disabled (no measurement ID) or the gtag script hasn't loaded yet.
export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window !== "undefined") {
    window.gtag?.("event", name, params);
  }
}

// Set NEXT_PUBLIC_GA_MEASUREMENT_ID (e.g. G-XXXXXXXXXX) to enable — renders
// nothing until that env var is present, so local/dev without an ID is a no-op.
export function GoogleAnalytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  if (!measurementId) {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${measurementId}');
        `}
      </Script>
    </>
  );
}
