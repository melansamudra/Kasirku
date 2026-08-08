"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Receipt,
  Wallet,
  ShoppingBag,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import LogoutButton from "@/app/dashboard/logout-button";

const BUSINESS_TYPE_SUBTITLE: Record<string, string> = {
  fnb: "Restoran / Kafe / F&B",
  retail: "Retail / Toko",
  tiket: "Tempat Wisata / Tiket",
};

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavGroup = { title: string; items: NavItem[] };

export type MirrorPerms = {
  show_transactions: boolean;
  show_purchases: boolean;
  show_kas_harian: boolean;
};

export default function MirrorSidebar({
  businessId,
  businessName,
  businessType,
  perms,
  onNavigate,
}: {
  businessId: string;
  businessName: string;
  businessType: string;
  perms: MirrorPerms;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const base = `/business/${businessId}/mirror-view`;

  const navGroups: NavGroup[] = [
    {
      title: "Utama",
      items: [
        { href: base, label: "Laporan", icon: BarChart3 },
        ...(perms.show_transactions
          ? [{ href: `${base}/transaksi`, label: "Riwayat Transaksi", icon: Receipt }]
          : []),
        ...(perms.show_kas_harian
          ? [{ href: `${base}/kas-harian`, label: "Kas Harian", icon: Wallet }]
          : []),
      ],
    },
    ...(perms.show_purchases
      ? [
          {
            title: "Fitur Lanjutan",
            items: [{ href: `${base}/pembelian`, label: "Pembelian & Hutang", icon: ShoppingBag }],
          },
        ]
      : []),
  ].filter((g) => g.items.length > 0);

  const [openGroup, setOpenGroup] = useState<string | null>(navGroups[0]?.title ?? null);

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center gap-2.5 border-b border-zinc-100 px-5 py-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600">
          <span className="text-sm font-bold text-white">
            {businessName.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-zinc-800">{businessName}</p>
          <p className="text-[11px] text-zinc-400">
            {BUSINESS_TYPE_SUBTITLE[businessType] ?? businessType}
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => {
          const isOpen = openGroup === group.title;
          return (
            <div key={group.title}>
              <button
                type="button"
                onClick={() => setOpenGroup((g) => (g === group.title ? null : group.title))}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400 transition-colors hover:bg-zinc-50 hover:text-zinc-600"
              >
                <span>{group.title}</span>
                <ChevronRight
                  className={`h-3.5 w-3.5 transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
                />
              </button>
              {isOpen && (
                <div className="mt-0.5 space-y-0.5 pb-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
                          isActive
                            ? "bg-brand-50 text-brand-700"
                            : "text-zinc-600 hover:bg-zinc-50"
                        }`}
                      >
                        <Icon
                          className={`h-[18px] w-[18px] shrink-0 ${
                            isActive ? "text-brand-600" : "text-zinc-400"
                          }`}
                          strokeWidth={isActive ? 2.25 : 1.75}
                        />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-zinc-100 px-3 py-3">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="mb-1 block rounded-lg px-2.5 py-2 text-[13px] font-medium text-zinc-500 hover:bg-zinc-50"
        >
          ← Semua Toko
        </Link>
        <LogoutButton />
      </div>
    </div>
  );
}
