"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "", label: "Ringkasan" },
  { href: "/tren", label: "Tren Penjualan" },
  { href: "/harian", label: "Laporan Harian" },
  { href: "/per-transaksi", label: "Per Transaksi" },
  { href: "/per-menu", label: "Per Menu" },
  { href: "/per-jam", label: "Per Jam" },
  { href: "/metode-bayar", label: "Metode Bayar" },
  { href: "/kategori", label: "Kategori Menu" },
];

export default function ReportsSubnav({ businessId }: { businessId: string }) {
  const pathname = usePathname();
  const base = `/business/${businessId}/reports`;

  return (
    <div className="mb-5 flex overflow-x-auto border-b border-zinc-200 bg-white print:hidden">
      {NAV_ITEMS.map((item) => {
        const href = `${base}${item.href}`;
        const isActive = item.href === ""
          ? pathname === base
          : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors ${
              isActive
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
