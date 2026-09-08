"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MieKotaReservationFlow from "./mie-kota-reservation-flow";
import type { ReservationState } from "./actions";

type StorefrontProduct = {
  id: string;
  name: string;
  price: number;
  category: string | null;
  image_url: string | null;
};

type StorefrontBusiness = {
  name: string;
  address: string | null;
  phone: string | null;
  logo_url: string | null;
  tagline: string | null;
};

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function waNumber(phone: string | null) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

const TICKER_ITEMS = [
  "Mie Segar Digiling Tiap Hari",
  "Ayam Kampung Pilihan",
  "Bakso Sapi Asli 100%",
  "Pangsit Goreng Renyah",
  "Kaldu Kental Berjam-jam",
  "Sawi Hijau Segar",
  "Bawang Goreng Kriuk",
  "Tanpa Pengawet",
];

const BASE_OPTIONS = [
  { name: "Mie Ayam Original", price: 15000, blurb: "Klasik, ringan, cocok buat semua orang" },
  { name: "Mie Ayam Bakso", price: 18000, blurb: "Original + bakso sapi kenyal" },
  { name: "Mie Ayam Pangsit", price: 20000, blurb: "Original + pangsit goreng renyah" },
  { name: "Mie Yamin Manis", price: 17000, blurb: "Manis gurih khas yamin" },
];

const DRINK_OPTIONS = [
  { name: "Tanpa Minuman", price: 0 },
  { name: "Es Teh Manis", price: 5000 },
  { name: "Es Jeruk", price: 7000 },
  { name: "Teh Panas", price: 4000 },
];

const SPICE_LEVELS = ["Tidak Pedas", "Sedang 🌶️", "Extra Pedas 🌶️🌶️🌶️"];

type GalleryVariant = "mie-ayam" | "bakso" | "pangsit" | "es-teh" | "suasana" | "kerupuk";

const GALLERY_ITEMS: { label: string; bg: string; variant: GalleryVariant }[] = [
  { label: "Mie Ayam Original", bg: "linear-gradient(160deg,#7a2f12,#4a1a0a)", variant: "mie-ayam" },
  { label: "Bakso Kuah Panas", bg: "linear-gradient(160deg,#8a3a1a,#4a1a0a)", variant: "bakso" },
  { label: "Pangsit Goreng Renyah", bg: "linear-gradient(160deg,#9a6a1a,#5a3208)", variant: "pangsit" },
  { label: "Es Teh & Es Jeruk", bg: "linear-gradient(160deg,#1a5a6a,#0a3040)", variant: "es-teh" },
  { label: "Suasana Mie Kota", bg: "linear-gradient(160deg,#3a2a1a,#1a1108)", variant: "suasana" },
  { label: "Kerupuk & Pelengkap", bg: "linear-gradient(160deg,#7a5a1a,#3a2a08)", variant: "kerupuk" },
];

function GalleryIcon({ variant }: { variant: GalleryVariant }) {
  switch (variant) {
    case "mie-ayam":
      return (
        <svg viewBox="0 0 120 90" className="h-24 w-32">
          <ellipse cx="60" cy="66" rx="48" ry="16" fill="#7a1f0f" />
          <ellipse cx="60" cy="60" rx="44" ry="12" fill="#e8a33d" />
          <path d="M22 56 Q40 44 58 56 T94 56" stroke="#fff3d6" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M26 48 Q42 38 58 48 T90 48" stroke="#fff3d6" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.8" />
          <circle cx="48" cy="52" r="5" fill="#8a4a2a" />
          <circle cx="68" cy="50" r="5" fill="#8a4a2a" />
          <rect x="56" y="14" width="4" height="20" rx="2" fill="#fff" opacity="0.5" />
          <rect x="66" y="10" width="4" height="24" rx="2" fill="#fff" opacity="0.4" />
        </svg>
      );
    case "bakso":
      return (
        <svg viewBox="0 0 120 90" className="h-24 w-32">
          <ellipse cx="60" cy="66" rx="48" ry="16" fill="#5a1f0a" />
          <ellipse cx="60" cy="58" rx="44" ry="14" fill="#c2653a" />
          <circle cx="42" cy="52" r="10" fill="#8a4a2a" />
          <circle cx="66" cy="48" r="11" fill="#95542f" />
          <circle cx="82" cy="56" r="8" fill="#8a4a2a" />
          <path d="M30 44 Q60 30 90 44" stroke="#e8c98a" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.6" />
        </svg>
      );
    case "pangsit":
      return (
        <svg viewBox="0 0 120 90" className="h-24 w-32">
          <ellipse cx="60" cy="72" rx="46" ry="10" fill="#5a3a12" opacity="0.5" />
          <path d="M30 60 L45 30 L60 55 L75 28 L90 60 Z" fill="#e0a336" />
          <path d="M30 60 L45 30 L60 55 L75 28 L90 60" fill="none" stroke="#a86a1a" strokeWidth="2" />
          <path d="M40 55 L48 40" stroke="#f3c96a" strokeWidth="2" strokeLinecap="round" />
          <path d="M65 52 L72 38" stroke="#f3c96a" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "es-teh":
      return (
        <svg viewBox="0 0 120 90" className="h-24 w-32">
          <path d="M42 20 h36 l-6 56 a4 4 0 0 1 -4 4 h-16 a4 4 0 0 1 -4 -4 Z" fill="#c98a3a" opacity="0.85" />
          <rect x="46" y="30" width="10" height="10" rx="2" fill="#fff" opacity="0.8" />
          <rect x="60" y="40" width="10" height="10" rx="2" fill="#fff" opacity="0.7" />
          <rect x="50" y="52" width="10" height="10" rx="2" fill="#fff" opacity="0.6" />
          <rect x="58" y="10" width="3" height="18" fill="#fff" />
        </svg>
      );
    case "kerupuk":
      return (
        <svg viewBox="0 0 120 90" className="h-24 w-32">
          <ellipse cx="60" cy="60" rx="50" ry="18" fill="#8a5a1a" opacity="0.4" />
          <circle cx="46" cy="52" r="20" fill="#f0d99a" />
          <circle cx="46" cy="52" r="20" fill="none" stroke="#c9a35a" strokeWidth="2" strokeDasharray="3 4" />
          <circle cx="78" cy="46" r="14" fill="#e8a33d" />
          <circle cx="78" cy="46" r="14" fill="none" stroke="#a86a1a" strokeWidth="2" strokeDasharray="3 4" />
        </svg>
      );
    case "suasana":
    default:
      return (
        <svg viewBox="0 0 120 90" className="h-24 w-32">
          <rect x="20" y="55" width="30" height="4" fill="#3a2a1a" />
          <rect x="24" y="40" width="4" height="15" fill="#3a2a1a" />
          <rect x="42" y="40" width="4" height="15" fill="#3a2a1a" />
          <circle cx="34" cy="30" r="10" fill="#e8a33d" opacity="0.8" />
          <path d="M34 20 v-6" stroke="#e8a33d" strokeWidth="2" />
          <rect x="70" y="58" width="26" height="4" fill="#3a2a1a" />
          <rect x="74" y="46" width="3" height="12" fill="#3a2a1a" />
          <rect x="90" y="46" width="3" height="12" fill="#3a2a1a" />
          <circle cx="84" cy="38" r="4" fill="#fff3d6" />
        </svg>
      );
  }
}

export default function MieKotaLanding({
  slug,
  business,
  products,
  submitReservation,
}: {
  slug: string;
  business: StorefrontBusiness;
  products: StorefrontProduct[];
  submitReservation: (state: ReservationState, formData: FormData) => Promise<ReservationState>;
}) {
  const heroRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showReservation, setShowReservation] = useState(false);

  useEffect(() => {
    function onScroll() {
      const el = heroRef.current;
      if (!el) return;
      const height = el.offsetHeight || 1;
      const progress = Math.min(1, Math.max(0, window.scrollY / height));
      setScrollProgress(progress);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const [baseIdx, setBaseIdx] = useState(0);
  const [drinkIdx, setDrinkIdx] = useState(0);
  const [spiceIdx, setSpiceIdx] = useState(0);

  const base = BASE_OPTIONS[baseIdx];
  const drink = DRINK_OPTIONS[drinkIdx];
  const total = base.price + drink.price;

  const wa = waNumber(business.phone);
  const orderText = useMemo(() => {
    const lines = [
      `Halo ${business.name}, saya mau pesan:`,
      `- ${base.name} (${SPICE_LEVELS[spiceIdx]})`,
      drink.price > 0 ? `- ${drink.name}` : null,
      `Total: ${formatRupiah(total)}`,
    ].filter(Boolean);
    return lines.join("\n");
  }, [base, drink, spiceIdx, total, business.name]);

  const categories = Array.from(new Set(products.map((p) => p.category ?? "Menu")));
  const boundSubmit = submitReservation;

  return (
    <div className="min-h-screen bg-[#1a1108] text-white">
      <style>{`
        @keyframes mk-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @keyframes mk-steam {
          0% { transform: translateY(0) scaleX(1); opacity: 0.35; }
          50% { transform: translateY(-24px) scaleX(1.15); opacity: 0.6; }
          100% { transform: translateY(-48px) scaleX(1); opacity: 0; }
        }
        .mk-marquee-track { animation: mk-marquee 22s linear infinite; }
        .mk-steam { animation: mk-steam 3.2s ease-in-out infinite; }
        .mk-no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .mk-no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>

      {/* HERO */}
      <div ref={heroRef} className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#3a1d0c] via-[#241206] to-[#1a1108] px-4 text-center">
        {/* steam wisps */}
        <div className="pointer-events-none absolute left-1/2 top-[18%] -translate-x-1/2">
          <div className="mk-steam h-16 w-3 rounded-full bg-white/40 blur-sm" style={{ animationDelay: "0s" }} />
        </div>
        <div className="pointer-events-none absolute left-[calc(50%-18px)] top-[22%]">
          <div className="mk-steam h-12 w-2 rounded-full bg-white/30 blur-sm" style={{ animationDelay: "1s" }} />
        </div>
        <div className="pointer-events-none absolute left-[calc(50%+16px)] top-[22%]">
          <div className="mk-steam h-12 w-2 rounded-full bg-white/30 blur-sm" style={{ animationDelay: "2s" }} />
        </div>

        {/* bowl illustration */}
        <svg
          viewBox="0 0 240 160"
          className="h-40 w-60 sm:h-52 sm:w-80"
          style={{ transform: `translateY(${(1 - scrollProgress) * 12}px)` }}
        >
          <ellipse cx="120" cy="120" rx="100" ry="28" fill="#7a1f0f" />
          <ellipse cx="120" cy="112" rx="92" ry="22" fill="#c0431c" />
          <path
            d="M40 105 C70 130, 170 130, 200 105 C195 95, 175 118, 120 118 C65 118, 45 95, 40 105 Z"
            fill="#e8a33d"
          />
          <path d="M55 100 Q75 80 95 100 T135 100 T175 100" stroke="#fff3d6" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.9" />
          <path d="M60 92 Q80 74 100 92 T140 92 T180 92" stroke="#fff3d6" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.7" />
          <circle cx="95" cy="98" r="7" fill="#8a4a2a" />
          <circle cx="130" cy="94" r="7" fill="#8a4a2a" />
          <circle cx="150" cy="100" r="6" fill="#8a4a2a" />
        </svg>

        {/* floating ingredient chips, revealed on scroll */}
        <div
          className="pointer-events-none absolute left-[8%] top-[30%] text-3xl sm:text-4xl"
          style={{
            transform: `translate(${(1 - scrollProgress) * -60}px, ${(1 - scrollProgress) * 20}px) rotate(${(1 - scrollProgress) * -30}deg)`,
            opacity: scrollProgress,
          }}
        >
          🍢
        </div>
        <div
          className="pointer-events-none absolute right-[10%] top-[34%] text-3xl sm:text-4xl"
          style={{
            transform: `translate(${(1 - scrollProgress) * 60}px, ${(1 - scrollProgress) * 20}px) rotate(${(1 - scrollProgress) * 30}deg)`,
            opacity: scrollProgress,
          }}
        >
          🥟
        </div>
        <div
          className="pointer-events-none absolute left-[14%] bottom-[22%] text-2xl sm:text-3xl"
          style={{
            transform: `translateY(${(1 - scrollProgress) * 40}px)`,
            opacity: scrollProgress,
          }}
        >
          🥬
        </div>
        <div
          className="pointer-events-none absolute right-[16%] bottom-[24%] text-2xl sm:text-3xl"
          style={{
            transform: `translateY(${(1 - scrollProgress) * 40}px)`,
            opacity: scrollProgress,
          }}
        >
          🧅
        </div>

        <h1 className="mt-8 text-4xl font-extrabold tracking-tight sm:text-6xl">{business.name}</h1>
        {business.tagline && (
          <p className="mx-auto mt-3 max-w-md text-sm text-amber-100/80 sm:text-base">{business.tagline}</p>
        )}
        <p className="mt-4 text-xs text-amber-200/50">
          {[business.address, business.phone].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-8 animate-bounce text-amber-200/60">↓ scroll</div>
      </div>

      {/* TICKER */}
      <div className="overflow-hidden border-y border-amber-900/40 bg-[#241206] py-3">
        <div className="mk-marquee-track flex w-max gap-10 whitespace-nowrap text-sm font-medium uppercase tracking-wide text-amber-300/80">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} className="flex items-center gap-10">
              {item}
              <span className="text-amber-600">•</span>
            </span>
          ))}
        </div>
      </div>

      {/* CONFIGURATOR */}
      <section className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">Racik Mie Kota-mu</h2>
        <p className="mx-auto mt-2 max-w-md text-center text-sm text-amber-100/60">
          Pilih mie dasar, minuman pendamping, dan level pedasnya — total harga langsung ke-update.
        </p>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">1. Mie Dasar</p>
            <div className="mt-3 space-y-2">
              {BASE_OPTIONS.map((opt, i) => (
                <button
                  key={opt.name}
                  onClick={() => setBaseIdx(i)}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                    i === baseIdx
                      ? "border-amber-500 bg-amber-500/10"
                      : "border-white/10 bg-white/5 hover:border-white/20"
                  }`}
                >
                  <span>
                    <span className="block text-sm font-semibold">{opt.name}</span>
                    <span className="block text-xs text-amber-100/50">{opt.blurb}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-amber-300">{formatRupiah(opt.price)}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">2. Minuman</p>
            <div className="mt-3 space-y-2">
              {DRINK_OPTIONS.map((opt, i) => (
                <button
                  key={opt.name}
                  onClick={() => setDrinkIdx(i)}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                    i === drinkIdx
                      ? "border-amber-500 bg-amber-500/10"
                      : "border-white/10 bg-white/5 hover:border-white/20"
                  }`}
                >
                  <span className="text-sm font-semibold">{opt.name}</span>
                  <span className="shrink-0 text-sm font-semibold text-amber-300">
                    {opt.price > 0 ? formatRupiah(opt.price) : "-"}
                  </span>
                </button>
              ))}
            </div>

            <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-amber-400">3. Level Pedas</p>
            <div className="mt-3 flex gap-2">
              {SPICE_LEVELS.map((label, i) => (
                <button
                  key={label}
                  onClick={() => setSpiceIdx(i)}
                  className={`flex-1 rounded-xl border px-2 py-2 text-xs font-medium transition ${
                    i === spiceIdx
                      ? "border-amber-500 bg-amber-500/10"
                      : "border-white/10 bg-white/5 hover:border-white/20"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 sm:flex-row">
          <div>
            <p className="text-xs text-amber-100/60">Racikanmu</p>
            <p className="text-sm font-semibold">
              {base.name} · {SPICE_LEVELS[spiceIdx]}
              {drink.price > 0 ? ` · ${drink.name}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-xl font-extrabold text-amber-300">{formatRupiah(total)}</p>
            {wa ? (
              <a
                href={`https://wa.me/${wa}?text=${encodeURIComponent(orderText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-[#241206] hover:bg-amber-400"
              >
                Pesan via WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      </section>

      {/* FULL MENU */}
      <section className="mx-auto max-w-3xl px-4 pb-16">
        <h2 className="text-lg font-bold">Menu Lengkap</h2>
        <div className="mt-4 space-y-8">
          {categories.map((category) => (
            <div key={category}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-400/70">{category}</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {products
                  .filter((p) => (p.category ?? "Menu") === category)
                  .map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-white/5 p-3"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/10 text-lg">
                        🍜
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <p className="text-sm font-semibold text-amber-300">{formatRupiah(Number(p.price))}</p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* GALERI: geser horizontal -- ilustrasi orisinal (bukan foto asli),
          gampang diganti foto sungguhan nanti tinggal tukar tag <img>. */}
      <section className="pb-16">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-lg font-bold">Galeri</h2>
          <p className="mt-1 text-sm text-amber-100/60">Geser untuk lihat lebih banyak →</p>
        </div>
        <div className="mk-no-scrollbar mt-4 flex gap-4 overflow-x-auto px-4 pb-2 snap-x snap-mandatory">
          {GALLERY_ITEMS.map((item) => (
            <div
              key={item.label}
              className="w-[70%] shrink-0 snap-center overflow-hidden rounded-2xl border border-white/10 sm:w-[45%]"
              style={{ background: item.bg }}
            >
              <div className="flex h-40 items-center justify-center">
                <GalleryIcon variant={item.variant} />
              </div>
              <p className="border-t border-white/10 bg-black/20 px-3 py-2 text-sm font-medium">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* LOKASI & SOSIAL MEDIA */}
      <section className="mx-auto max-w-3xl px-4 pb-16">
        <h2 className="text-lg font-bold">Lokasi &amp; Sosial Media</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <iframe
              title="Lokasi Mie Kota Pusat"
              src={`https://www.google.com/maps?q=${encodeURIComponent(business.address ?? business.name)}&output=embed`}
              className="h-48 w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.address ?? business.name)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-white/5 px-3 py-2 text-xs font-medium text-amber-300 hover:text-amber-200"
            >
              📍 Buka di Google Maps
            </a>
          </div>

          <div className="flex flex-col justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-5">
            <a
              href="https://instagram.com/miekota.pusat"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm font-medium hover:text-amber-300"
            >
              📸 @miekota.pusat
            </a>
            {wa && (
              <a
                href={`https://wa.me/${wa}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm font-medium hover:text-amber-300"
              >
                💬 Chat WhatsApp
              </a>
            )}
            <p className="text-xs text-amber-100/50">
              {[business.address, business.phone].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
      </section>

      {/* RESERVASI: cuma tombol -- form muncul di modal saat diklik, biar
          tidak bikin halaman kepanjangan buat pengunjung yang cuma mau
          lihat menu. */}
      <section className="mx-auto max-w-3xl px-4 pb-20 text-center">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
          <h2 className="text-lg font-bold">Mau Reservasi?</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-amber-100/60">
            Pilih meja, pre-order menu, dan kirim reservasi dalam satu langkah.
          </p>
          <button
            onClick={() => setShowReservation(true)}
            className="mt-4 rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-semibold text-[#241206] hover:bg-amber-400"
          >
            Buat Reservasi
          </button>
        </div>
      </section>

      {showReservation && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setShowReservation(false)}
        >
          <div
            className="max-h-[92svh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 text-zinc-900 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Reservasi</h3>
                <p className="text-xs text-zinc-500">Tim kami akan menghubungi untuk konfirmasi.</p>
              </div>
              <button
                onClick={() => setShowReservation(false)}
                aria-label="Tutup"
                className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                ✕
              </button>
            </div>
            <div className="mt-4">
              <MieKotaReservationFlow slug={slug} products={products} action={boundSubmit} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
