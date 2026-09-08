import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 15.3+ memblokir akses dev server dari origin selain localhost
  // secara default (proteksi anti DNS-rebinding) -- perlu di-whitelist biar
  // bisa dites dari HP/tablet lewat IP jaringan lokal (mis. demo Mie Kota).
  allowedDevOrigins: ["192.168.1.87"],
  async redirects() {
    return [
      {
        source: "/business/:businessId/mirror-view",
        destination: "/business/:businessId/laporan",
        permanent: true,
      },
      {
        source: "/business/:businessId/mirror-view/:path*",
        destination: "/business/:businessId/laporan/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        // Jangan sampai browser nyimpen sw.js kelamaan — update service
        // worker (public/sw.js) harus langsung kepakai di load berikutnya.
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
