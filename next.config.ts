import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
