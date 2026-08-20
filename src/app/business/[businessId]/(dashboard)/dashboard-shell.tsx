"use client";

import { useEffect, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import {
  LayoutDashboard,
  BarChart3,
  Calculator,
  Ruler,
  Wallet,
  Receipt,
  Clock,
  BookOpen,
  TrendingUp,
  FileText,
  Scale,
  RefreshCw,
  Target,
  ScrollText,
  ArrowLeftRight,
  Landmark,
  Lock,
  Package,
  Beaker,
  Tag,
  UtensilsCrossed,
  Users,
  CreditCard,
  ShoppingBag,
  Store,
  Monitor,
  UserCog,
  UserCheck,
  CalendarCheck,
  CalendarClock,
  Banknote,
  Settings,
  ShieldCheck,
  Activity,
  Bell,
  ShoppingCart,
  Layers,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import LogoutButton from "@/app/dashboard/logout-button";

// `key` is a stable identifier independent of href/label — it's what gets
// stored in business_staff.permissions, so renaming a label or moving a
// route later never silently revokes/changes someone's granted access.
// `ownerOnly` items (Pengaturan, Kelola Admin) never show for staff and are
// never part of the permission checklist, regardless of what's granted.
type NavItem = { key: string; href: string; label: string; icon: LucideIcon; ownerOnly?: boolean };
type NavGroup = { title: string; items: NavItem[] };
type BusinessType = "fnb" | "retail" | "tiket";

// Nav keys visible in the Starter plan (POS + COGS + basic reports only).
const STARTER_ALLOWED_KEYS = new Set([
  "dashboard", "reports", "transactions", "shifts", "kas-harian",
  "products", "ingredients", "tables", "cashiers",
  "settings", "admins",
  // Cost Control (COGS)
  "reports-cogs", "hpp-calculator", "reports-price-trend",
  "purchases", "suppliers",
  // Lainnya
  "notifikasi", "activity",
]);

function buildNavGroups(
  businessId: string,
  businessType: BusinessType,
  isFinanceOnly: boolean,
  isStarter: boolean,
  mirroringEnabled = false,
): NavGroup[] {
  const isFnb = businessType === "fnb";
  const base = `/business/${businessId}`;

  const allGroups: NavGroup[] = [
    {
      title: "Utama",
      items: [
        { key: "dashboard", href: base, label: "Dashboard", icon: LayoutDashboard },
        { key: "reports", href: `${base}/reports`, label: "Laporan", icon: BarChart3 },
        { key: "transactions", href: `${base}/transactions`, label: "Riwayat Transaksi", icon: Receipt },
        { key: "shifts", href: `${base}/shifts`, label: "Riwayat Shift", icon: Clock },
        { key: "kas-harian", href: `${base}/kas-harian`, label: "Kas & Bank", icon: Wallet },
        { key: "products", href: `${base}/products`, label: "Kelola Produk", icon: Package },
        { key: "modifiers", href: `${base}/modifiers`, label: "Modifier Global", icon: Tag },
        ...(isFnb
          ? [
              { key: "ingredients", href: `${base}/ingredients`, label: "Bahan Baku", icon: Beaker },
              {
                key: "tables",
                href: `${base}/tables`,
                label: "Meja & Self-Order",
                icon: UtensilsCrossed,
              },
            ]
          : []),
        ...(isFinanceOnly || isStarter
          ? []
          : [
              { key: "customers", href: `${base}/customers`, label: "Pelanggan", icon: Users },
            ]),
        ...(isFinanceOnly
          ? []
          : [
              { key: "cashiers", href: `${base}/cashiers`, label: "Kelola Kasir", icon: UserCheck },
            ]),
        { key: "settings", href: `${base}/settings`, label: "Pengaturan", icon: Settings, ownerOnly: true },
        { key: "admins", href: `${base}/admins`, label: "Kelola Admin", icon: ShieldCheck, ownerOnly: true },
      ],
    },
    {
      title: isStarter ? "Kontrol Biaya (COGS)" : "Fitur Lanjutan",
      items: [
        ...(!isStarter ? [{ key: "reports-laba-rugi", href: `${base}/reports/laba-rugi`, label: "Laba Rugi", icon: TrendingUp }] : []),
        { key: "reports-cogs", href: `${base}/reports/cogs`, label: "Laporan COGS", icon: Ruler },
        { key: "hpp-calculator", href: `${base}/hpp-calculator`, label: "Kalkulator HPP", icon: Calculator },
        ...(isFnb
          ? [{ key: "reports-price-trend", href: `${base}/reports/price-trend`, label: "Tren Harga Bahan", icon: Tag }]
          : []),
        ...(!isStarter
          ? [
              { key: "accounting-daftar-akun", href: `${base}/accounting/daftar-akun`, label: "Daftar Akun", icon: BookOpen },
              { key: "accounting-laba-rugi", href: `${base}/accounting/laba-rugi`, label: "Laba Rugi (Akrual)", icon: TrendingUp },
              { key: "accounting-jurnal", href: `${base}/accounting/jurnal`, label: "Jurnal Transaksi", icon: FileText },
              { key: "accounting-neraca", href: `${base}/accounting/neraca`, label: "Neraca", icon: Scale },
              { key: "accounting-arus-kas", href: `${base}/accounting/arus-kas`, label: "Arus Kas", icon: RefreshCw },
              { key: "accounting-anggaran", href: `${base}/accounting/anggaran`, label: "Target vs Aktual", icon: Target },
              { key: "accounting-modal", href: `${base}/accounting/modal`, label: "Perubahan Modal", icon: ScrollText },
              { key: "accounting-transfer-kas", href: `${base}/accounting/transfer-kas`, label: "Transfer Kas/Bank", icon: ArrowLeftRight },
              { key: "accounting-rekonsiliasi", href: `${base}/accounting/rekonsiliasi`, label: "Rekonsiliasi Rekening", icon: Landmark },
              { key: "invoices", href: `${base}/invoices`, label: "Invoice/Nota", icon: Receipt },
              { key: "accounting-tutup-buku", href: `${base}/accounting/tutup-buku`, label: "Tutup Buku", icon: Lock },
            ]
          : []),
        ...(isFinanceOnly || isStarter
          ? []
          : [
              { key: "receivables", href: `${base}/receivables`, label: "Piutang Pelanggan", icon: CreditCard },
            ]),
        { key: "purchases", href: `${base}/purchases`, label: "Pembelian & Hutang", icon: ShoppingBag },
        { key: "suppliers", href: `${base}/suppliers`, label: "Supplier", icon: Store },
        ...(!isStarter && !isFinanceOnly
          ? [{ key: "assets", href: `${base}/assets`, label: "Aset Tetap", icon: Monitor }]
          : []),
        ...(!isStarter
          ? [
              { key: "employees", href: `${base}/employees`, label: "Karyawan", icon: UserCog },
              { key: "attendance", href: `${base}/attendance`, label: "Absensi", icon: CalendarCheck },
              { key: "jadwal-shift", href: `${base}/jadwal-shift`, label: "Jadwal Shift", icon: CalendarClock },
              { key: "payroll", href: `${base}/payroll`, label: "Payroll", icon: Banknote },
            ]
          : []),
      ],
    },
    {
      title: "Lainnya",
      items: [
        { key: "notifikasi", href: `${base}/notifikasi`, label: "Notifikasi", icon: Bell },
        { key: "activity", href: `${base}/activity`, label: "Aktivitas", icon: Activity, ownerOnly: true },
        ...(mirroringEnabled
          ? [{ key: "mirror", href: `${base}/mirror`, label: "Akun Mirror", icon: Layers, ownerOnly: true }]
          : []),
      ],
    },
  ];

  // Extra safety net: filter out any item not in the starter allowlist.
  if (isStarter) {
    return allGroups
      .map((g) => ({ ...g, items: g.items.filter((i) => STARTER_ALLOWED_KEYS.has(i.key)) }))
      .filter((g) => g.items.length > 0);
  }

  return allGroups;
}

// Dashboard itself is always reachable even for a staff member with an empty
// checklist — a completely inaccessible landing page would make no sense.
// bypassOwnerOnly exists only for the Android app's native-mode override
// below — real business_staff permission checks never pass it, so ownerOnly
// keeps its original strict meaning ("never grantable via the checklist")
// for actual staff accounts.
function isItemAllowed(
  item: NavItem,
  isOwner: boolean,
  permissions: string[],
  bypassOwnerOnly: string[] = [],
  isStarter = false,
): boolean {
  // Starter plan: enforce allowlist regardless of owner status — even the
  // owner cannot access accounting/HR routes on a Starter subscription.
  if (isStarter && !STARTER_ALLOWED_KEYS.has(item.key)) return false;
  if (isOwner) return true;
  if (item.ownerOnly && !bypassOwnerOnly.includes(item.key)) return false;
  if (item.key === "dashboard") return true;
  // Supplier page boleh diakses kalau punya permission purchases (supplier adalah sub-fitur purchases)
  if (item.key === "suppliers" && permissions.includes("purchases")) return true;
  return permissions.includes(item.key);
}

function filterGroupsForPermissions(
  groups: NavGroup[],
  isOwner: boolean,
  permissions: string[],
  bypassOwnerOnly: string[] = [],
  isStarter = false,
): NavGroup[] {
  if (isOwner && !isStarter) return groups;
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => isItemAllowed(i, isOwner, permissions, bypassOwnerOnly, isStarter)),
    }))
    .filter((g) => g.items.length > 0);
}

const BUSINESS_TYPE_SUBTITLE: Record<string, string> = {
  fnb: "Restoran / Kafe / F&B",
  retail: "Retail / Toko",
  tiket: "Tempat Wisata / Tiket",
};

function findActiveItem(groups: NavGroup[], pathname: string): NavItem | null {
  const allItems = groups.flatMap((g) => g.items);
  const matches = allItems.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.href.length - a.href.length)[0];
}

function activeGroupTitleOf(groups: NavGroup[], activeHref: string | null): string | null {
  if (!activeHref) return groups[0]?.title ?? null;
  return groups.find((g) => g.items.some((i) => i.href === activeHref))?.title ?? groups[0]?.title ?? null;
}

// Feedback instan begitu link nav ditekan — tanpa ini, halaman SEBELUMNYA
// tetap nempel di layar sampai halaman baru selesai fetch data (bisa
// beberapa detik di jaringan mobile), kelihatan seperti "salah pindah
// halaman". Sengaja pakai useLinkStatus (murni client-side, tidak ada file
// baru di app/) alih-alih loading.tsx — file itu terbukti bikin SEMUA rute
// 404 di versi Next.js proyek ini (dicoba 2x, di root grup & per-halaman).
// Harus jadi child terpisah dari <Link>, useLinkStatus tidak bisa dipanggil
// di komponen yang sama dengan <Link>-nya.
function NavPendingHint() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={`ml-auto h-3 w-3 shrink-0 rounded-full border-2 border-zinc-200 border-t-brand-600 transition-opacity ${
        pending ? "animate-spin opacity-100" : "opacity-0"
      }`}
    />
  );
}

function SidebarContent({
  businessId,
  businessName,
  businessType,
  groups,
  activeHref,
  isFinanceOnly,
  canAccessPos,
  onNavigate,
  showLogout = true,
}: {
  businessId: string;
  businessName: string;
  businessType: BusinessType;
  groups: NavGroup[];
  activeHref: string | null;
  isFinanceOnly: boolean;
  canAccessPos: boolean;
  onNavigate?: () => void;
  showLogout?: boolean;
}) {
  const activeGroupTitle = activeGroupTitleOf(groups, activeHref);
  const [openGroup, setOpenGroup] = useState<string | null>(activeGroupTitle);

  // Setelah navigasi ke halaman baru, buka grup yang memuat halaman itu —
  // supaya sidebar selalu menunjukkan konteks tanpa perlu klik manual. Disesuaikan
  // saat render (bukan di useEffect) supaya tetap bisa di-override oleh klik manual.
  const [prevActiveGroupTitle, setPrevActiveGroupTitle] = useState(activeGroupTitle);
  if (activeGroupTitle !== prevActiveGroupTitle) {
    setPrevActiveGroupTitle(activeGroupTitle);
    setOpenGroup(activeGroupTitle);
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center gap-2.5 border-b border-zinc-100 px-5 py-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600">
          <span className="text-sm font-bold text-white">K</span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-zinc-800">{businessName}</p>
          <p className="text-[11px] text-zinc-400">{BUSINESS_TYPE_SUBTITLE[businessType]}</p>
        </div>
      </div>

      {!isFinanceOnly && canAccessPos && (
        <div className="px-3 pt-4">
          <Link
            href={`/business/${businessId}/pos`}
            onClick={onNavigate}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            Buka Kasir
          </Link>
        </div>
      )}

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => {
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
                  aria-hidden="true"
                />
              </button>
              {isOpen && (
                <div className="mt-0.5 space-y-0.5 pb-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeHref === item.href;
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
                          aria-hidden="true"
                        />
                        {item.label}
                        <NavPendingHint />
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
    <div className="sticky top-0 z-10 hidden items-center justify-between bg-white px-8 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] md:flex print:hidden">
      <div>
        <p className="text-sm font-bold text-zinc-800">{businessName}</p>
        <p className="text-[11.5px] text-zinc-400">{today}</p>
      </div>
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

function AccessDeniedPanel() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-xl bg-white p-8 text-center shadow-sm">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-2xl">
        🔒
      </div>
      <h1 className="text-lg font-bold text-zinc-900">Akses Ditolak</h1>
      <p className="mt-1 max-w-sm text-sm text-zinc-500">
        Kamu tidak punya izin untuk membuka halaman ini. Hubungi pemilik toko kalau merasa ini
        seharusnya bisa diakses.
      </p>
    </div>
  );
}

function UpgradeRequiredPanel({ businessId }: { businessId: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-xl bg-white p-8 text-center shadow-sm">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-3xl">
        🚀
      </div>
      <h1 className="text-lg font-bold text-zinc-900">Fitur Paket Full</h1>
      <p className="mt-2 max-w-sm text-sm text-zinc-500">
        Halaman ini tidak tersedia di Paket Starter. Upgrade ke Paket Full untuk mengakses
        akuntansi lengkap, SDM, payroll, dan semua fitur lanjutan.
      </p>
      <Link
        href={`/business/${businessId}/billing`}
        className="mt-5 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
      >
        Lihat Paket Full →
      </Link>
    </div>
  );
}

export default function DashboardShell({
  businessId,
  businessName,
  businessType,
  userEmail,
  billingPastDuePeriodEnd,
  trialPeriodEnd,
  isFinanceOnly = false,
  isStarter = false,
  isOwner = true,
  permissions = [],
  mirroringEnabled = false,
  children,
}: {
  businessId: string;
  businessName: string;
  businessType: BusinessType;
  userEmail: string;
  billingPastDuePeriodEnd?: string | null;
  trialPeriodEnd?: string | null;
  isFinanceOnly?: boolean;
  isStarter?: boolean;
  isOwner?: boolean;
  permissions?: string[];
  mirroringEnabled?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // null = belum tahu (SSR), false = web, true = Android native
  // Pakai state supaya tidak ada hydration mismatch antara SSR dan client.
  const [isNativeState, setIsNativeState] = useState<boolean | null>(null);
  useEffect(() => {
    // Capacitor.isNativePlatform() cuma bisa dibaca di client (beda hasil
    // dari SSR) — harus lewat effect post-mount supaya render pertama tetap
    // cocok dengan HTML server (hindari hydration mismatch).
    const native = Capacitor.isNativePlatform();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsNativeState(native);
    if (native && pathname === `/business/${businessId}`) {
      router.replace(`/business/${businessId}/transactions`);
    }
  }, [pathname, businessId, router]);

  // The Android app (android-app/) is a cashier tool, not a backoffice one —
  // mirrors Moka's own "Cashier: App Only" vs "Administrator: App & Back-
  // office" split. Whoever is logged in (owner or staff), the native app
  // only ever gets Aktivitas (transactions) + Riwayat Shift + Pengaturan
  // here; everything else in this sidebar stays desktop-browser-only.
  // Pengaturan is included specifically because Tambah Printer lives there
  // (pos/printers is view+test only, adding/editing a printer still needs
  // the full Settings form) — bypassOwnerOnly is what lets a normally
  // owner-only item through despite navIsOwner being forced false.
  const isNative = isNativeState ?? Capacitor.isNativePlatform();
  const navIsOwner = isNative ? false : isOwner;
  const nativeBase = ["transactions", "shifts", "settings"];
  const navPermissions = isNative
    ? [...new Set([...nativeBase, ...permissions])]
    : permissions;
  const navBypassOwnerOnly = isNative
    ? ["settings"]
    : permissions.includes("settings") ? ["settings"] : [];

  const allGroups = buildNavGroups(businessId, businessType, isFinanceOnly, isStarter, mirroringEnabled);
  const visibleGroups = filterGroupsForPermissions(allGroups, navIsOwner, navPermissions, navBypassOwnerOnly, isStarter);
  // Active item is resolved against the FULL (unfiltered) list — a page a
  // staff member isn't allowed to see should still be recognized so we can
  // show "Akses Ditolak" instead of silently rendering nothing/wrong content.
  const activeItem = findActiveItem(allGroups, pathname);
  const activeHref = activeItem?.href ?? null;
  const isAllowed = activeItem
    ? isItemAllowed(activeItem, navIsOwner, navPermissions, navBypassOwnerOnly, isStarter)
    : navIsOwner;

  return (
    <div className="flex min-h-screen w-full bg-[#F4F6F9] print:bg-white">
      {/* Sidebar tetap — desktop */}
      <aside className="hidden w-64 shrink-0 bg-white shadow-[1px_0_3px_rgba(0,0,0,0.04)] md:block print:hidden">
        <div className="sticky top-0 h-screen">
          <SidebarContent
            businessId={businessId}
            businessName={businessName}
            businessType={businessType}
            groups={visibleGroups}
            activeHref={activeHref}
            isFinanceOnly={isFinanceOnly}
            canAccessPos={isOwner || permissions.includes("pos")}
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
              groups={visibleGroups}
              activeHref={activeHref}
              isFinanceOnly={isFinanceOnly}
              canAccessPos={isOwner || permissions.includes("pos")}
              onNavigate={() => setMobileNavOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1 overflow-y-auto h-dvh">
        <Topbar businessName={businessName} userEmail={userEmail} />

        <div className="flex items-center gap-3 bg-white px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)] md:hidden print:hidden">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600"
            aria-label="Buka menu"
          >
            ☰
          </button>
          <p className="truncate text-sm font-bold text-zinc-800">{businessName}</p>
        </div>

        {isOwner && trialPeriodEnd && (
          <div className="flex items-center justify-between gap-3 bg-brand-50 px-4 py-2.5 text-xs font-medium text-brand-800 print:hidden md:px-8">
            <span>
              Uji coba gratis berakhir{" "}
              {Math.max(
                0,
                Math.ceil(
                  (new Date(trialPeriodEnd).getTime() - new Date().getTime()) /
                    (24 * 60 * 60 * 1000),
                ),
              )}{" "}
              hari lagi — berlangganan sekarang supaya akses tidak terputus.
            </span>
            <Link
              href={`/business/${businessId}/billing`}
              className="shrink-0 rounded-full bg-brand-600 px-3 py-1 text-white hover:bg-brand-700"
            >
              Berlangganan
            </Link>
          </div>
        )}

        {isOwner && billingPastDuePeriodEnd && (
          <div className="flex items-center justify-between gap-3 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800 print:hidden md:px-8">
            <span>
              Langganan jatuh tempo sejak{" "}
              {new Date(billingPastDuePeriodEnd).toLocaleDateString("id-ID", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
              — bayar sebelum masa tenggang habis agar akses tidak terkunci.
            </span>
            <Link
              href={`/business/${businessId}/billing`}
              className="shrink-0 rounded-full bg-amber-600 px-3 py-1 text-white hover:bg-amber-700"
            >
              Bayar Sekarang
            </Link>
          </div>
        )}

        <main className="w-full px-4 py-8 md:px-8 md:py-10 print:p-0">
          <div className="mx-auto w-full max-w-6xl print:max-w-none">
            {isNativeState && pathname === `/business/${businessId}` ? (
              <div className="flex h-40 items-center justify-center">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
              </div>
            ) : isAllowed ? children : isStarter ? <UpgradeRequiredPanel businessId={businessId} /> : <AccessDeniedPanel />}
          </div>
        </main>
      </div>
    </div>
  );
}
