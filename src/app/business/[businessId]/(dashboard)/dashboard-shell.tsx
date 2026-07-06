"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "@/app/dashboard/logout-button";

type NavItem = { href: string; label: string; icon: string };
type NavGroup = { title: string; items: NavItem[] };
type BusinessType = "fnb" | "retail" | "tiket";

function buildNavGroups(businessId: string, businessType: BusinessType): NavGroup[] {
  const isFnb = businessType === "fnb";
  const isTiket = businessType === "tiket";
  const base = `/business/${businessId}`;
  return [
    {
      title: "Keuangan",
      items: [
        { href: base, label: "Dashboard", icon: "📊" },
        ...(isTiket
          ? []
          : [
              { href: `${base}/reports`, label: "Laporan", icon: "📈" },
              { href: `${base}/reports/laba-rugi`, label: "Laba Rugi", icon: "🧮" },
              { href: `${base}/finance`, label: "Keuangan", icon: "💰" },
              { href: `${base}/transactions`, label: "Riwayat Transaksi", icon: "🧾" },
            ]),
        { href: `${base}/shifts`, label: "Riwayat Shift", icon: "⏱️" },
      ],
    },
    {
      title: "Operasional",
      items: isTiket
        ? [
            { href: `${base}/ticket-reports`, label: "Laporan Tiket", icon: "🎟️" },
            { href: `${base}/members`, label: "Anggota", icon: "👤" },
          ]
        : [
            { href: `${base}/products`, label: "Kelola Produk", icon: "📦" },
            ...(isFnb
              ? [
                  { href: `${base}/ingredients`, label: "Bahan Baku", icon: "🧂" },
                  { href: `${base}/tables`, label: "Meja & Self-Order", icon: "🪑" },
                ]
              : []),
            { href: `${base}/customers`, label: "Pelanggan", icon: "👥" },
          ],
    },
    {
      title: "SDM",
      items: [
        { href: `${base}/cashiers`, label: "Kelola Kasir", icon: "🧑‍💼" },
        { href: `${base}/attendance`, label: "Absensi", icon: "📅" },
        { href: `${base}/payroll`, label: "Payroll", icon: "💵" },
      ],
    },
    {
      title: "Lainnya",
      items: [
        { href: `${base}/settings`, label: "Pengaturan", icon: "🔧" },
        { href: `${base}/activity`, label: "Aktivitas", icon: "⚙️" },
      ],
    },
  ];
}

const BUSINESS_TYPE_SUBTITLE: Record<BusinessType, string> = {
  fnb: "Restoran / Kafe / F&B",
  retail: "Retail / Toko",
  tiket: "Tempat Wisata / Tiket",
};

function useActiveHref(groups: NavGroup[], pathname: string): string | null {
  const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href));
  const matches = allHrefs.filter((h) => pathname === h || pathname.startsWith(`${h}/`));
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.length - a.length)[0];
}

function SidebarContent({
  businessId,
  businessName,
  businessType,
  pathname,
  onNavigate,
  showLogout = true,
}: {
  businessId: string;
  businessName: string;
  businessType: BusinessType;
  pathname: string;
  onNavigate?: () => void;
  showLogout?: boolean;
}) {
  const groups = buildNavGroups(businessId, businessType);
  const activeHref = useActiveHref(groups, pathname);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b border-zinc-100 px-5 py-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600">
          <span className="text-sm font-bold text-white">K</span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-zinc-900">{businessName}</p>
          <p className="text-[11px] text-zinc-400">{BUSINESS_TYPE_SUBTITLE[businessType]}</p>
        </div>
      </div>

      <div className="px-3 pt-4">
        <Link
          href={`/business/${businessId}/pos`}
          onClick={onNavigate}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          🛎️ Buka Kasir
        </Link>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="mb-1.5 px-2 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400">
              {group.title}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
                    activeHref === item.href
                      ? "bg-brand-50 text-brand-700"
                      : "text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  <span className="text-base leading-none">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-zinc-100 px-3 py-3">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="mb-1 block rounded-lg px-2.5 py-2 text-[13px] font-medium text-zinc-500 hover:bg-zinc-50"
        >
          ← Semua Toko
        </Link>
        {showLogout && <LogoutButton />}
      </div>
    </div>
  );
}

function Topbar({ businessName, userEmail }: { businessName: string; userEmail: string }) {
  const today = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const initial = (userEmail || businessName).charAt(0).toUpperCase();

  return (
    <div className="sticky top-0 z-10 hidden items-center justify-between border-b border-zinc-200 bg-white px-8 py-4 md:flex print:hidden">
      <p className="text-sm text-zinc-500">{today}</p>
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
          {initial}
        </div>
        {userEmail && <p className="max-w-[180px] truncate text-sm text-zinc-600">{userEmail}</p>}
        <LogoutButton variant="inline" />
      </div>
    </div>
  );
}

export default function DashboardShell({
  businessId,
  businessName,
  businessType,
  userEmail,
  children,
}: {
  businessId: string;
  businessName: string;
  businessType: BusinessType;
  userEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-zinc-50 print:bg-white">
      {/* Sidebar tetap — desktop */}
      <aside className="hidden w-64 shrink-0 border-r border-zinc-200 bg-white md:block print:hidden">
        <div className="sticky top-0 h-screen">
          <SidebarContent
            businessId={businessId}
            businessName={businessName}
            businessType={businessType}
            pathname={pathname}
            showLogout={false}
          />
        </div>
      </aside>

      {/* Sidebar drawer — mobile */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
            <SidebarContent
              businessId={businessId}
              businessName={businessName}
              businessType={businessType}
              pathname={pathname}
              onNavigate={() => setMobileNavOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <Topbar businessName={businessName} userEmail={userEmail} />

        <div className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 md:hidden print:hidden">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600"
            aria-label="Buka menu"
          >
            ☰
          </button>
          <p className="truncate text-sm font-bold text-zinc-900">{businessName}</p>
        </div>

        <main className="w-full px-4 py-8 md:px-8 md:py-10 print:p-0">
          <div className="mx-auto w-full max-w-6xl print:max-w-none">{children}</div>
        </main>
      </div>
    </div>
  );
}
