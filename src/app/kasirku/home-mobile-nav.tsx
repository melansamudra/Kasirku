"use client";

import { useState } from "react";
import Link from "next/link";

const LINKS = [
  { href: "/kalkulator-hpp", label: "Kalkulator HPP" },
  { href: "/sistem-akuntansi", label: "Sistem Akuntansi" },
  { href: "#harga", label: "Harga" },
  { href: "/perbandingan", label: "Perbandingan" },
  { href: "/panduan-akuntansi", label: "Panduan" },
  { href: "/blog", label: "Artikel" },
  { href: "/rekomendasi-alat", label: "Rekomendasi Alat" },
];

// Produk/konten links yang di layar besar tampil langsung di header (lihat
// page.tsx) tapi tidak muat di layar HP — dipindah ke dropdown ini supaya
// tetap kelihatan di sebelah Masuk/Daftar Gratis, bukan cuma di footer.
export default function HomeMobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Buka menu produk"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600"
      >
        {open ? "✕" : "☰"}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-2 w-48 rounded-xl border border-zinc-200 bg-white py-1.5 shadow-lg">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
