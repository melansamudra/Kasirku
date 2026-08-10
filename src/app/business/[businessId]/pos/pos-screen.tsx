"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  addShiftCashMovement,
  checkout,
  closeShift,
  openShift,
  deleteOpenBill,
  printOpenBillToReceipt,
  getPosCatalog,
  getSelfOrders,
  getShiftTransactions,
  getTodayShifts,
  saveOpenBill,
  setSelfOrderEnabled,
  toggleSelfOrderVisibility,
  updateSelfOrderStatus,
  voidPosTransaction,
  type CheckoutResult,
  type CloseShiftSummary,
  type DiscountRule,
  type DiscountType,
  type OpenBillItemInput,
  type PosCatalog,
  type PosOptionGroup,
  type ShiftTransaction,
  type TenderInput,
  type TodayShiftRow,
} from "./actions";
import SwitchCashierButton from "./switch-cashier-button";
import OfflineStatus from "./offline-status";
import PrintQueueStatus from "./print-queue-status";
import { itemDiscAmount, calculateCheckoutTotals } from "@/lib/checkout-totals";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { usePrintRetry } from "@/hooks/use-print-retry";
import { enqueueSale, pendingStockDeltas } from "@/lib/offline-queue";
import { withTimeout } from "@/lib/with-timeout";
import { dispatchPrintJobs, dispatchReceiptThenKitchenJobs } from "@/lib/dispatch-print-jobs";
import { getCachedPosCatalog, setCachedPosCatalog } from "@/lib/pos-cache";
import ReportPrintButtons from "../report-print-buttons";
import { buildWhatsAppReceiptText } from "../wa-receipt-actions";
import { buildSettlementPrintJobs } from "../report-print-actions";
import { getPeriodRange } from "../(dashboard)/reports/period";
import { Capacitor } from "@capacitor/core";
import { todayWibDateString } from "@/lib/wib";

const EMPTY_CATALOG: PosCatalog = { products: [], openBills: [], customers: [], customPaymentMethods: [], discountRules: [], hasKitchenPrinters: false, hasReceiptPrinters: false, selfOrderEnabled: true, optionGroups: [] };

type Product = {
  id: string;
  name: string;
  category: string | null;
  price: number;
  cost: number;
  stock: number;
  emoji: string | null;
  barcode: string | null;
  sku: string | null;
  variant_label: string | null;
  image_url: string | null;
  show_in_self_order: boolean;
};

type SelectedOption = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceAdj: number;
};

type CartItem = {
  cartKey: string; // unique per line — productId for plain items, productId:opt1,opt2 for option items
  productId: string;
  name: string;
  price: number; // harga satuan sudah termasuk opsi
  basePrice: number; // harga dasar produk tanpa opsi
  qty: number;
  maxStock: number;
  disc: number;
  discType: DiscountType;
  note: string | null;
  selectedOptions: SelectedOption[];
  batch: number;
};

type Tender = {
  id: string;
  method: string;
  amount: number;
  received: string;
};

type SelfOrder = {
  id: string;
  status: "baru" | "diproses";
  createdAt: string;
  tableName: string;
  customerName: string | null;
  customerPhone: string | null;
  paymentMethod: string | null;
  items: {
    productId: string | null;
    name: string;
    qty: number;
    price: number;
    note: string | null;
  }[];
};

type OpenBill = {
  id: string;
  label: string;
  updated_at: string;
  customer_name: string | null;
  customer_id: string | null;
  items: {
    product_id: string;
    name: string;
    price: number;
    qty: number;
    disc: number;
    disc_type: DiscountType;
    note?: string | null;
    batch?: number;
  }[];
};

type Customer = {
  id: string;
  name: string;
  phone: string | null;
};

const BUILTIN_PAYMENT_METHODS = ["Tunai", "EDC", "QRIS"];

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function getCashSuggestions(amount: number): number[] {
  const steps = [1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000];
  const seen = new Set<number>();
  for (const step of steps) {
    const rounded = Math.ceil(amount / step) * step;
    if (rounded >= amount) seen.add(rounded);
    if (seen.size >= 4) break;
  }
  return Array.from(seen).sort((a, b) => a - b).slice(0, 4);
}

export default function PosScreen({
  businessId,
  businessName,
  cashierId,
  cashierName,
  cashierRole,
  shiftId,
  shiftOpenedAt,
  isStaleShift,
  taxRate,
  serviceRate,
  isFnb,
}: {
  businessId: string;
  businessName: string;
  cashierId: string;
  cashierName: string;
  cashierRole: "kasir" | "manajer" | "pelayan";
  shiftId: string | null;
  shiftOpenedAt: string | null;
  isStaleShift: boolean;
  taxRate: number;
  serviceRate: number;
  isFnb: boolean;
}) {
  const router = useRouter();

  const [staleBannerDismissed, setStaleBannerDismissed] = useState(false);

  // Katalog (produk/open bill/customer/metode bayar) tidak lagi datang dari
  // props server — render instan dari cache IndexedDB dulu (pembukaan
  // berikutnya, ~puluhan ms), lalu segarkan dari server di background lewat
  // getPosCatalog(). catalogLoaded cuma false di pembukaan pertama kali
  // sebelum ada cache sama sekali (satu kali biaya, bukan tiap navigasi).
  const [catalog, setCatalog] = useState<PosCatalog>(EMPTY_CATALOG);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const { products, openBills, customers, customPaymentMethods, discountRules, hasKitchenPrinters, hasReceiptPrinters, selfOrderEnabled: catalogSelfOrderEnabled } = catalog;
  const [selfOrderEnabled, setSelfOrderEnabledLocal] = useState(catalogSelfOrderEnabled);
  // Sync ketika catalog refresh
  useEffect(() => { setSelfOrderEnabledLocal(catalogSelfOrderEnabled); }, [catalogSelfOrderEnabled]);

  // Toggle cetak struk otomatis — disimpan di localStorage, per-device
  const [autoReceiptPrint, setAutoReceiptPrintState] = useState(true);
  useEffect(() => {
    setAutoReceiptPrintState(localStorage.getItem("pos_auto_receipt") !== "off");
  }, []);
  function setAutoReceiptPrint(val: boolean) {
    setAutoReceiptPrintState(val);
    localStorage.setItem("pos_auto_receipt", val ? "on" : "off");
  }

  const refreshCatalog = useCallback(async () => {
    const fresh = await getPosCatalog(businessId).catch(() => null);
    if (!fresh) return;
    setCatalog(fresh);
    setCatalogLoaded(true);
    void setCachedPosCatalog(businessId, fresh);
  }, [businessId]);

  useEffect(() => {
    let cancelled = false;
    void getCachedPosCatalog(businessId).then((cached) => {
      if (cancelled || !cached) return;
      setCatalog(cached);
      setCatalogLoaded(true);
    });
    void refreshCatalog();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  const paymentMethods = useMemo(
    () => [...BUILTIN_PAYMENT_METHODS, ...customPaymentMethods],
    [customPaymentMethods],
  );
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"kecil" | "sedang" | "besar" | "list">("sedang");
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOrderIds, setCartOrderIds] = useState<string[]>([]);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxNotice, setInboxNotice] = useState<string | null>(null);
  const [selfOrderMenuOpen, setSelfOrderMenuOpen] = useState(false);
  const [selfOrderProducts, setSelfOrderProducts] = useState<{ id: string; name: string; category: string | null; show: boolean }[]>([]);
  const [orderBusyId, setOrderBusyId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [orderDisc, setOrderDisc] = useState(0);
  const [orderDiscType, setOrderDiscType] = useState<DiscountType>("pct");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [billsOpen, setBillsOpen] = useState(false);
  const [posMenuOpen, setPosMenuOpen] = useState(false);
  // Laporan lives in the full backoffice sidebar, which the native app never
  // exposes (see dashboard-shell.tsx) — hide the link here too so it's not a
  // dead end that lands on "Akses Ditolak".
  const isNative = Capacitor.isNativePlatform();
  const [billBusyId, setBillBusyId] = useState<string | null>(null);
  const [billPrintingId, setBillPrintingId] = useState<string | null>(null);
  const [activeBill, setActiveBill] = useState<{ id: string; label: string; customer_id?: string | null } | null>(null);
  const [saveBonOpen, setSaveBonOpen] = useState(false);
  const [bonLabel, setBonLabel] = useState("");
  const [bonCustomerName, setBonCustomerName] = useState("");
  const [bonError, setBonError] = useState<string | null>(null);
  const [bonSaving, setBonSaving] = useState(false);

  function openSelfOrderMenu() {
    setSelfOrderProducts(
      products.map((p) => ({ id: p.id, name: p.name, category: p.category, show: p.show_in_self_order })),
    );
    setSelfOrderMenuOpen(true);
  }

  async function handleSelfOrderToggle(productId: string, show: boolean) {
    setSelfOrderProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, show } : p)));
    await toggleSelfOrderVisibility(businessId, productId, show);
  }

  async function handleSelfOrderEnabled(enabled: boolean) {
    setSelfOrderEnabledLocal(enabled);
    await setSelfOrderEnabled(businessId, enabled);
  }

  // Tidak lagi datang dari props server (page.tsx tidak fetch ini lagi) —
  // diambil sendiri di sini, sama seperti catalog di atas.
  const [selfOrders, setSelfOrders] = useState<SelfOrder[]>([]);

  const newOrderCount = selfOrders.filter((o) => o.status === "baru").length;

  // Track ID order yang sudah diketahui agar bisa deteksi order benar-benar baru
  const knownOrderIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);

  function playOrderNotification() {
    try {
      const ctx = new AudioContext();
      // Dua nada chime: C6 → E6
      const notes = [{ freq: 1046.5, t: 0 }, { freq: 1318.5, t: 0.18 }];
      for (const { freq, t } of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime + t);
        gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.5);
        osc.start(ctx.currentTime + t);
        osc.stop(ctx.currentTime + t + 0.5);
      }
    } catch {
      // Browser tidak support AudioContext — abaikan
    }
  }

  // Order self-order masuk dari perangkat pelanggan; poll supaya badge kasir
  // ikut terbarui tanpa reload manual. Dulu ini panggil router.refresh() tiap
  // 15 detik — me-refresh SELURUH halaman (produk, open bill, customer, dst
  // ikut di-fetch ulang), salah satu penyebab utama app terasa lemot. Sekarang
  // cuma ambil self_orders sendirian lewat getSelfOrders(), dipanggil sekali
  // segera saat mount (bukan cuma nunggu interval pertama 15 detik).
  useEffect(() => {
    if (!isFnb) return;
    void getSelfOrders(businessId).then(setSelfOrders).catch(() => {});
    const interval = setInterval(() => {
      void getSelfOrders(businessId).then(setSelfOrders).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [isFnb, businessId]);

  // Deteksi order baru dan bunyikan notifikasi
  useEffect(() => {
    if (!isFnb) return;
    const newIds = selfOrders
      .filter((o) => o.status === "baru")
      .map((o) => o.id)
      .filter((id) => !knownOrderIds.current.has(id));

    // Update set ID yang diketahui
    for (const o of selfOrders) knownOrderIds.current.add(o.id);

    // Jangan bunyi saat pertama load — hanya untuk order yang benar-benar baru datang
    if (!isFirstLoad.current && newIds.length > 0) {
      playOrderNotification();
    }
    isFirstLoad.current = false;
  }, [selfOrders, isFnb]);
  const [paying, setPaying] = useState(false);
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [orderType, setOrderType] = useState<"DINE IN" | "TAKEAWAY" | null>(null);
  const [pisahBillMode, setPisahBillMode] = useState(false);
  const [pisahSelected, setPisahSelected] = useState<Set<string>>(new Set());
  const [pisahPaying, setPisahPaying] = useState(false);
  const [pisahTenders, setPisahTenders] = useState<Tender[]>([]);
  const [pisahBillCount, setPisahBillCount] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInvoice, setSuccessInvoice] = useState<string | null>(null);
  const [successTransactionId, setSuccessTransactionId] = useState<string | null>(null);
  const [successOffline, setSuccessOffline] = useState(false);
  const [waLoading, setWaLoading] = useState(false);

  // Dihitung langsung tiap render (fungsi murni, murah) — bukan useMemo
  // dengan deps kosong, supaya kalau layar ini dibiarkan terbuka lewat
  // tengah malam WIB, batas "hari ini" ikut geser juga.
  const todayRange = getPeriodRange("today");

  const { isOnline, pending, syncNow, discard } = useOfflineSync(businessId);
  const {
    pending: pendingPrints,
    retryNow: retryPrintsNow,
    discard: discardPrint,
  } = usePrintRetry(businessId);
  const effectiveProducts = useMemo(() => {
    const deltas = pendingStockDeltas(pending);
    if (Object.keys(deltas).length === 0) return products;
    return products.map((p) =>
      deltas[p.id] ? { ...p, stock: Math.max(0, p.stock - deltas[p.id]) } : p,
    );
  }, [products, pending]);

  // Semua promo yang valid hari ini (active + dalam rentang tanggal).
  const availablePromos = useMemo<DiscountRule[]>(() => {
    const today = todayWibDateString();
    return discountRules.filter(
      (r) =>
        r.type === "promo" &&
        r.active &&
        (!r.valid_from || r.valid_from <= today) &&
        (!r.valid_until || r.valid_until >= today),
    );
  }, [discountRules]);

  const [selectedPromoId, setSelectedPromoId] = useState<string | null>(null);
  const [promoPickerOpen, setPromoPickerOpen] = useState(false);

  // Promo yang sedang dipilih kasir untuk transaksi ini.
  const selectedPromo = useMemo(
    () => availablePromos.find((r) => r.id === selectedPromoId) ?? null,
    [availablePromos, selectedPromoId],
  );

  // Sinkronkan orderDisc/orderDiscType dengan promo yang dipilih kasir.
  useEffect(() => {
    if (selectedPromo) {
      setOrderDisc(selectedPromo.value);
      setOrderDiscType(selectedPromo.value_type);
    } else {
      setOrderDisc(0);
      setOrderDiscType("pct");
    }
  }, [selectedPromo]);

  const [currentShiftId, setCurrentShiftId] = useState<string | null>(shiftId);
  const [currentShiftOpenedAt, setCurrentShiftOpenedAt] = useState<string | null>(shiftOpenedAt);

  // Sync state saat server refresh (router.refresh) menghasilkan prop baru
  useEffect(() => { setCurrentShiftId(shiftId); }, [shiftId]);
  useEffect(() => { setCurrentShiftOpenedAt(shiftOpenedAt); }, [shiftOpenedAt]);

  const [openShiftModalOpen, setOpenShiftModalOpen] = useState(false);
  const [openingCashInput, setOpeningCashInput] = useState("");
  const [openShiftNotes, setOpenShiftNotes] = useState("");
  const [openShiftSubmitting, setOpenShiftSubmitting] = useState(false);
  const [openShiftError, setOpenShiftError] = useState<string | null>(null);

  const [closingShift, setClosingShift] = useState(false);
  const [closingCash, setClosingCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [closedSummary, setClosedSummary] = useState<CloseShiftSummary | null>(null);
  const [todayShifts, setTodayShifts] = useState<TodayShiftRow[]>([]);

  const [cashMoveOpen, setCashMoveOpen] = useState(false);
  const [cashMoveDirection, setCashMoveDirection] = useState<"in" | "out">("out");
  const [cashMoveAmount, setCashMoveAmount] = useState("");
  const [cashMoveDesc, setCashMoveDesc] = useState("");
  const [cashMoveError, setCashMoveError] = useState<string | null>(null);
  const [cashMoveSubmitting, setCashMoveSubmitting] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  const [voidOpen, setVoidOpen] = useState(false);
  const [voidTxs, setVoidTxs] = useState<ShiftTransaction[]>([]);
  const [voidLoading, setVoidLoading] = useState(false);
  const [voidSelectedTx, setVoidSelectedTx] = useState<ShiftTransaction | null>(null);
  const [voidPin, setVoidPin] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [voidSubmitting, setVoidSubmitting] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [voidSuccess, setVoidSuccess] = useState<string | null>(null);

  // Sorted once per product list change, not per keystroke — cheap enough
  // that memoizing separately from filteredProducts keeps the tab row from
  // re-deriving every time someone types in the search box.
  const categoryTabs = useMemo(() => {
    return Array.from(
      new Set(effectiveProducts.map((p) => p.category).filter((c): c is string => !!c)),
    ).sort((a, b) => a.localeCompare(b, "id"));
  }, [effectiveProducts]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byCategory = selectedCategory
      ? effectiveProducts.filter((p) => p.category === selectedCategory)
      : effectiveProducts;
    if (!q) return byCategory;
    return byCategory.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase() === q ||
        p.sku?.toLowerCase() === q,
    );
  }, [search, selectedCategory, effectiveProducts]);

  // Variants are just extra product rows sharing the same name — group them
  // here purely for display, no schema relationship involved.
  const productGroups = useMemo(() => {
    const groups: { name: string; variants: Product[] }[] = [];
    for (const p of filteredProducts) {
      const existing = groups.find((g) => g.name === p.name);
      if (existing) {
        existing.variants.push(p);
      } else {
        groups.push({ name: p.name, variants: [p] });
      }
    }
    return groups;
  }, [filteredProducts]);

  const [variantPickerGroup, setVariantPickerGroup] = useState<{
    name: string;
    variants: Product[];
  } | null>(null);
  const [optionPickerProduct, setOptionPickerProduct] = useState<Product | null>(null);
  const [pendingOptions, setPendingOptions] = useState<SelectedOption[]>([]);

  function openOptionPickerOrAddToCart(product: Product) {
    const pOptionGroups = catalog.optionGroups.filter((g) => g.product_id === product.id);
    if (pOptionGroups.length > 0) {
      setOptionPickerProduct(product);
      // Pre-select opsi pertama dari setiap grup agar user tinggal mengubah yang tidak sesuai
      // Hanya pre-select grup wajib; grup opsional dibiarkan kosong
      setPendingOptions(
        pOptionGroups
          .filter((g) => g.required && g.options.length > 0)
          .map((g) => ({
            groupId: g.id,
            groupName: g.name,
            optionId: g.options[0].id,
            optionName: g.options[0].name,
            priceAdj: g.options[0].price_adjustment,
          })),
      );
    } else {
      addToCart(product);
    }
  }

  function handleProductClick(group: { name: string; variants: Product[] }) {
    if (group.variants.length === 1) {
      openOptionPickerOrAddToCart(group.variants[0]);
    } else {
      setVariantPickerGroup(group);
    }
  }

  // Barcode scanners act like a keyboard: they type the code then send
  // Enter. On Enter, an exact barcode/SKU match jumps straight into the cart
  // instead of just filtering the grid.
  useEffect(() => {
    if (!scanFeedback) return;
    const timer = setTimeout(() => setScanFeedback(null), 2500);
    return () => clearTimeout(timer);
  }, [scanFeedback]);

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const q = search.trim();
    if (!q) return;
    const match = effectiveProducts.find((p) => p.barcode === q || p.sku === q);
    if (match) {
      addToCart(match);
      setSearch("");
      setScanFeedback(null);
    } else if (effectiveProducts.some((p) => p.barcode || p.sku)) {
      setScanFeedback(`"${q}" tidak ditemukan.`);
    }
  }

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q),
    );
  }, [customerSearch, customers]);

  const { subtotalRaw, totalItemDisc, afterItemDisc, orderDiscAmt, serviceAmt, taxAmt, total } =
    calculateCheckoutTotals({
      items: cart,
      orderDisc,
      orderDiscType,
      serviceRate,
      taxRate,
    });
  const tenderedTotal = tenders.reduce((s, t) => s + t.amount, 0);
  const remaining = total - tenderedTotal;
  const totalChange = tenders.reduce((s, t) => {
    if (t.method !== "Tunai") return s;
    const rcv = Number(t.received) || 0;
    return s + Math.max(0, rcv - t.amount);
  }, 0);

  const pisahCart = pisahBillMode ? cart.filter((i) => pisahSelected.has(i.cartKey)) : [];
  const pisahTotals = calculateCheckoutTotals({
    items: pisahCart,
    orderDisc: 0,
    orderDiscType: "pct",
    serviceRate,
    taxRate,
  });
  const pisahTenderedTotal = pisahTenders.reduce((s, t) => s + t.amount, 0);
  const pisahRemaining = pisahTotals.total - pisahTenderedTotal;
  const pisahTotalChange = pisahTenders.reduce((s, t) => {
    if (t.method !== "Tunai") return s;
    const rcv = Number(t.received) || 0;
    return s + Math.max(0, rcv - t.amount);
  }, 0);

  function addToCart(product: Product, selectedOptions: SelectedOption[] = []) {
    const optionPriceAdj = selectedOptions.reduce((s, o) => s + o.priceAdj, 0);
    const unitPrice = product.price + optionPriceAdj;
    const cartKey = selectedOptions.length > 0
      ? `${product.id}:${selectedOptions.map((o) => o.optionId).join(",")}`
      : product.id;

    setCart((prev) => {
      // Kalau ada bon aktif, hanya merge dengan item batch 1 (tambahan baru).
      // Item bon lama (batch 0) tidak boleh dimerge — harus jadi baris baru di batch 1.
      const mergeBatch = activeBill ? 1 : 0;
      const existing = prev.find((i) => i.cartKey === cartKey && i.batch === mergeBatch);
      if (existing) {
        return prev.map((i) => (i.cartKey === cartKey && i.batch === mergeBatch) ? { ...i, qty: i.qty + 1 } : i);
      }
      const rule = discountRules.find(
        (r) => r.type === "per_product" && r.product_id === product.id && r.active,
      );
      // Item baru yang ditambahkan setelah bon dimuat = tambahan (batch 1)
      const nextBatch = activeBill && prev.length > 0 ? 1 : 0;
      return [
        ...prev,
        {
          cartKey,
          productId: product.id,
          name: product.variant_label ? `${product.name} (${product.variant_label})` : product.name,
          price: unitPrice,
          basePrice: product.price,
          qty: 1,
          maxStock: product.stock,
          disc: rule ? rule.value : 0,
          discType: rule ? rule.value_type : ("pct" as DiscountType),
          note: null,
          selectedOptions,
          batch: nextBatch,
        },
      ];
    });
  }

  function setItemNote(cartKey: string, batch: number, note: string | null) {
    setCart((prev) =>
      prev.map((i) => (i.cartKey === cartKey && i.batch === batch ? { ...i, note: note || null } : i)),
    );
  }

  function toggleFreeItem(cartKey: string, batch: number) {
    setCart((prev) =>
      prev.map((i) => {
        if (i.cartKey !== cartKey || i.batch !== batch) return i;
        const isAlreadyFree = i.disc === 100 && i.discType === "pct";
        if (isAlreadyFree) {
          const rule = discountRules.find(
            (r) => r.type === "per_product" && r.product_id === i.productId && r.active,
          );
          return { ...i, disc: rule?.value ?? 0, discType: rule?.value_type ?? "pct" };
        }
        return { ...i, disc: 100, discType: "pct" };
      }),
    );
  }

  function changeQty(cartKey: string, batch: number, delta: number) {
    setCart((prev) =>
      prev
        .map((i) => (i.cartKey === cartKey && i.batch === batch ? { ...i, qty: Math.max(0, i.qty + delta) } : i))
        .filter((i) => i.qty > 0),
    );
  }

  function removeFromCart(cartKey: string, batch: number) {
    setCart((prev) => prev.filter((i) => !(i.cartKey === cartKey && i.batch === batch)));
  }

  async function handleOpenVoid() {
    setPosMenuOpen(false);
    setVoidOpen(true);
    setVoidSelectedTx(null);
    setVoidPin("");
    setVoidReason("");
    setVoidError(null);
    setVoidSuccess(null);
    setVoidLoading(true);
    const txs = await getShiftTransactions(businessId, currentShiftId ?? "");
    setVoidTxs(txs);
    setVoidLoading(false);
  }

  async function handleVoidConfirm() {
    if (!voidSelectedTx || voidSubmitting) return;
    setVoidSubmitting(true);
    setVoidError(null);
    const result = await voidPosTransaction(businessId, voidSelectedTx.id, voidPin, voidReason);
    setVoidSubmitting(false);
    if (!result.success) {
      setVoidError(result.error);
      return;
    }
    setVoidSuccess(`${voidSelectedTx.invoice_number} berhasil dibatalkan.`);
    void refreshCatalog();
  }

  async function handleSaveBon() {
    setBonError(null);
    setBonSaving(true);
    const result = await saveOpenBill(
      businessId,
      activeBill?.id ?? null,
      bonLabel,
      cart.map((i) => ({
        product_id: i.productId,
        name: i.name,
        price: i.price,
        qty: i.qty,
        disc: i.disc,
        disc_type: i.discType,
        note: [...i.selectedOptions.map((o) => o.optionName), i.note ?? null].filter((x): x is string => !!x).join(" | ") || null,
        batch: i.batch,
      })),
      cashierId,
      bonCustomerName || null,
    );
    setBonSaving(false);

    if (!result.success) {
      setBonError(result.error);
      return;
    }

    if (result.printJobs.length > 0) {
      void dispatchPrintJobs(businessId, result.printJobs);
    }

    setCart([]);
    setCartOrderIds([]);
    setOrderDisc(0);
    setOrderDiscType("pct");
    setSelectedPromoId(null);
    setActiveBill(null);
    setSaveBonOpen(false);
    setBonLabel("");
    setBonCustomerName("");
    void refreshCatalog();
  }

  function handleLoadBill(bill: OpenBill) {
    if (
      cart.length > 0 &&
      !window.confirm(`Keranjang aktif akan digabung dengan "${bill.label}". Lanjutkan?`)
    ) {
      return;
    }

    const next = cart.map((c) => ({ ...c }));
    const skipped: string[] = [];

    for (const item of bill.items) {
      const product = effectiveProducts.find((p) => p.id === item.product_id);
      if (!product) {
        skipped.push(item.name);
        continue;
      }
      const existing = next.find((c) => c.productId === product.id);
      const addQty = item.qty;
      if (existing) {
        existing.qty += addQty;
        existing.maxStock = Math.max(existing.maxStock, existing.qty);
      } else {
        next.push({
          cartKey: product.id,
          productId: product.id,
          name: item.name,
          price: item.price,
          basePrice: product.price,
          qty: addQty,
          maxStock: Math.max(product.stock, addQty),
          disc: item.disc,
          discType: item.disc_type,
          note: item.note ?? null,
          selectedOptions: [],
          batch: item.batch ?? 0,
        });
      }
    }

    setCart(next);
    setActiveBill({ id: bill.id, label: bill.label, customer_id: bill.customer_id ?? null });

    // Auto-pilih customer jika bon punya customer_id yang tersimpan
    if (bill.customer_id) {
      const linked = customers.find((c) => c.id === bill.customer_id);
      if (linked) setSelectedCustomer(linked);
      else setSelectedCustomer(null);
    } else {
      setSelectedCustomer(null);
    }

    setInboxNotice(
      skipped.length > 0
        ? `Tidak masuk keranjang (stok habis / produk terhapus): ${skipped.join(", ")}`
        : null,
    );
    setBillsOpen(false);
  }

  async function handleDeleteBill(bill: OpenBill) {
    if (!window.confirm(`Hapus open bill "${bill.label}"?`)) return;
    setBillBusyId(bill.id);
    await deleteOpenBill(businessId, bill.id);
    setBillBusyId(null);
    if (activeBill?.id === bill.id) setActiveBill(null);
    void refreshCatalog();
  }

  async function handlePrintBill(bill: OpenBill) {
    setBillPrintingId(bill.id);
    const result = await printOpenBillToReceipt(businessId, bill, serviceRate, taxRate, cashierName, selectedCustomer?.name ?? undefined);
    setBillPrintingId(null);
    if (!result.success) {
      alert(`Gagal cetak: ${result.error}`);
      return;
    }
    if (result.jobs.length > 0) {
      dispatchPrintJobs(businessId, result.jobs).then((results) => {
        const failed = results.filter((r) => !r.result.ok);
        setInboxNotice(
          failed.length === 0
            ? "🖨️ Bill berhasil dikirim ke printer."
            : `⚠️ Bill gagal: ${failed.map((r) => r.job.printerName).join(", ")} — cek antrian cetak.`,
        );
      }).catch(() => {});
    }
  }

  async function handleOrderStatus(orderId: string, status: "diproses" | "selesai") {
    setOrderBusyId(orderId);
    const result = await updateSelfOrderStatus(businessId, orderId, status);
    setOrderBusyId(null);
    if (result.printJobs) void dispatchPrintJobs(businessId, result.printJobs);
    void getSelfOrders(businessId).then(setSelfOrders).catch(() => {});
  }

  async function handleAddOrderToCart(order: SelfOrder) {
    const next = cart.map((c) => ({ ...c }));
    const skipped: string[] = [];

    for (const item of order.items) {
      const product = item.productId
        ? effectiveProducts.find((p) => p.id === item.productId)
        : undefined;
      if (!product) {
        skipped.push(item.name);
        continue;
      }
      const existing = next.find((c) => c.productId === product.id);
      const addQty = item.qty;
      if (existing) {
        existing.qty += addQty;
      } else {
        const rule = discountRules.find(
          (r) => r.type === "per_product" && r.product_id === product.id && r.active,
        );
        next.push({
          cartKey: product.id,
          productId: product.id,
          name: product.name,
          price: product.price,
          basePrice: product.price,
          qty: addQty,
          maxStock: Math.max(product.stock, addQty),
          disc: rule ? rule.value : 0,
          discType: rule ? rule.value_type : ("pct" as DiscountType),
          note: item.note,
          selectedOptions: [],
          batch: 0,
        });
      }
    }

    setCart(next);
    setCartOrderIds((prev) => (prev.includes(order.id) ? prev : [...prev, order.id]));
    setInboxNotice(
      skipped.length > 0
        ? `Tidak masuk keranjang (stok habis / produk terhapus): ${skipped.join(", ")}`
        : null,
    );
    setInboxOpen(false);
    await handleOrderStatus(order.id, "diproses");
  }

  async function handleAddAllOrdersForTable(tableName: string) {
    const tableOrders = selfOrders.filter((o) => o.tableName === tableName);
    const next = cart.map((c) => ({ ...c }));
    const skipped: string[] = [];
    const orderIds: string[] = [];

    for (const order of tableOrders) {
      for (const item of order.items) {
        const product = item.productId
          ? effectiveProducts.find((p) => p.id === item.productId)
          : undefined;
        if (!product) { skipped.push(item.name); continue; }
        const existing = next.find((c) => c.productId === product.id);
        const addQty = item.qty;
        if (existing) {
          existing.qty += addQty;
        } else {
          const rule = discountRules.find(
            (r) => r.type === "per_product" && r.product_id === product.id && r.active,
          );
          next.push({
            cartKey: product.id,
            productId: product.id,
            name: product.name,
            price: product.price,
            basePrice: product.price,
            qty: addQty,
            maxStock: Math.max(product.stock, addQty),
            disc: rule ? rule.value : 0,
            discType: rule ? rule.value_type : ("pct" as DiscountType),
            note: item.note,
            selectedOptions: [],
            batch: 0,
          });
        }
      }
      orderIds.push(order.id);
    }

    setCart(next);
    setCartOrderIds((prev) => {
      const next = [...prev];
      for (const id of orderIds) if (!next.includes(id)) next.push(id);
      return next;
    });
    setInboxNotice(
      skipped.length > 0
        ? `Tidak masuk keranjang: ${skipped.join(", ")}`
        : null,
    );
    setInboxOpen(false);

    // Tandai semua order meja ini sebagai diproses
    for (const order of tableOrders) {
      if (order.status === "baru") {
        await handleOrderStatus(order.id, "diproses");
      }
    }
  }

  async function handleAddAndPay(order: SelfOrder) {
    await handleAddOrderToCart(order);
    handleOpenPayment();
  }

  async function handleAddAndSave(order: SelfOrder) {
    setOrderBusyId(order.id);
    const label = order.customerName
      ? `${order.tableName} - ${order.customerName}`
      : order.tableName;
    const newItems: OpenBillItemInput[] = order.items
      .filter((item) => item.productId != null)
      .map((item) => ({
        product_id: item.productId as string,
        name: item.name,
        price: item.price,
        qty: item.qty,
        disc: 0,
        disc_type: "pct" as DiscountType,
      }));
    if (newItems.length > 0) {
      // Cari bon yang sudah ada untuk meja ini (tambahan order dari meja yang sama)
      const existingBon = openBills.find(
        (b) => b.label === label || b.label === order.tableName || b.label.startsWith(order.tableName + " - "),
      );
      if (existingBon) {
        const merged = existingBon.items.map((i) => ({ ...i }));
        for (const ni of newItems) {
          const found = merged.find((i) => i.product_id === ni.product_id);
          if (found) { found.qty += ni.qty; } else { merged.push(ni); }
        }
        await saveOpenBill(businessId, existingBon.id, existingBon.label, merged);
      } else {
        await saveOpenBill(businessId, null, label, newItems);
      }
    }
    setInboxOpen(false);
    if (order.status === "baru") await handleOrderStatus(order.id, "diproses");
    await handleOrderStatus(order.id, "selesai");
    void refreshCatalog();
    setOrderBusyId(null);
  }

  async function handleAddAllAndPay(tableName: string) {
    await handleAddAllOrdersForTable(tableName);
    handleOpenPayment();
  }

  async function handleAddAllAndSave(tableName: string) {
    const tableOrders = selfOrders.filter((o) => o.tableName === tableName);
    const firstOrder = tableOrders[0];
    const label = firstOrder?.customerName
      ? `${tableName} - ${firstOrder.customerName}`
      : tableName;
    // Gabungkan semua item dari semua order meja ini
    const bonItemMap = new Map<string, { product_id: string; name: string; price: number; qty: number; disc: number; disc_type: DiscountType }>();
    for (const order of tableOrders) {
      for (const item of order.items) {
        if (!item.productId) continue;
        const existing = bonItemMap.get(item.productId);
        if (existing) {
          existing.qty += item.qty;
        } else {
          bonItemMap.set(item.productId, {
            product_id: item.productId,
            name: item.name,
            price: item.price,
            qty: item.qty,
            disc: 0,
            disc_type: "pct",
          });
        }
      }
    }
    const newItems = Array.from(bonItemMap.values());
    if (newItems.length > 0) {
      const existingBon = openBills.find(
        (b) => b.label === label || b.label === tableName || b.label.startsWith(tableName + " - "),
      );
      if (existingBon) {
        const merged = existingBon.items.map((i) => ({ ...i }));
        for (const ni of newItems) {
          const found = merged.find((i) => i.product_id === ni.product_id);
          if (found) { found.qty += ni.qty; } else { merged.push(ni); }
        }
        await saveOpenBill(businessId, existingBon.id, existingBon.label, merged);
      } else {
        await saveOpenBill(businessId, null, label, newItems);
      }
    }
    setInboxOpen(false);
    for (const order of tableOrders) {
      if (order.status === "baru") {
        await handleOrderStatus(order.id, "diproses");
      }
      await handleOrderStatus(order.id, "selesai");
    }
    void refreshCatalog();
  }

  function handleOpenPayment() {
    setTenders([{ id: crypto.randomUUID(), method: BUILTIN_PAYMENT_METHODS[0], amount: total, received: "" }]);
    setPaying(true);
  }

  function updateTender(id: string, patch: Partial<Omit<Tender, "id">>) {
    setTenders((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function removeTender(id: string) {
    setTenders((prev) => prev.filter((t) => t.id !== id));
  }

  function handleAddTender() {
    const rem = Math.max(0, remaining);
    setTenders((prev) => [
      ...prev,
      { id: crypto.randomUUID(), method: BUILTIN_PAYMENT_METHODS[0], amount: rem, received: "" },
    ]);
  }


  function handleEnterPisahBill() {
    setPisahBillMode(true);
    setPisahSelected(new Set());
    setPisahBillCount(1);
    setPaying(false);
    setTenders([]);
  }

  function handleExitPisahBill() {
    setPisahBillMode(false);
    setPisahSelected(new Set());
    setPisahPaying(false);
    setPisahTenders([]);
  }

  function togglePisahItem(cartKey: string) {
    setPisahSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cartKey)) next.delete(cartKey);
      else next.add(cartKey);
      return next;
    });
  }

  function handlePisahOpenPayment() {
    if (pisahSelected.size === 0) return;
    setPisahTenders([{
      id: crypto.randomUUID(),
      method: BUILTIN_PAYMENT_METHODS[0],
      amount: pisahTotals.total,
      received: "",
    }]);
    setPisahPaying(true);
  }

  function updatePisahTender(id: string, patch: Partial<Omit<Tender, "id">>) {
    setPisahTenders((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  async function handlePisahConfirmPayment() {
    setError(null);
    if (!currentShiftId) {
      setOpenShiftModalOpen(true);
      return;
    }
    if (pisahRemaining > 0) {
      setError("Pembayaran kurang dari total tagihan ini.");
      return;
    }
    for (const t of pisahTenders) {
      if (t.method === "Tunai" && t.amount > 0 && (Number(t.received) || 0) < t.amount) {
        setError("Uang diterima untuk pembayaran tunai kurang.");
        return;
      }
    }
    setSubmitting(true);

    const itemsPayload = pisahCart.map((i) => ({
      productId: i.productId,
      qty: i.qty,
      disc: i.disc,
      discType: i.discType,
      note: i.note,
      unitPrice: i.price !== i.basePrice ? i.price : undefined,
      optionNames: i.selectedOptions.length > 0 ? i.selectedOptions.map((o) => o.optionName) : undefined,
      batch: i.batch,
    }));
    const paymentsPayload: TenderInput[] = pisahTenders.map((t) => ({
      method: t.method,
      amount: t.amount,
      received: t.method === "Tunai" ? (Number(t.received) || t.amount) : t.amount,
    }));
    const clientRef = crypto.randomUUID();
    const billLabel = activeBill?.label
      ? `${activeBill.label} - T${pisahBillCount}`
      : `Tagihan ${pisahBillCount}`;
    const paidKeys = new Set(pisahCart.map((i) => i.cartKey));

    let result: CheckoutResult;
    try {
      result = await withTimeout(
        checkout(
          businessId,
          cashierId,
          itemsPayload,
          paymentsPayload,
          0,
          "pct",
          selectedCustomer?.id ?? null,
          [],
          clientRef,
          false,
          hasReceiptPrinters && autoReceiptPrint,
          billLabel,
          selectedCustomer?.name ?? null,
          null,
          orderType ?? null,
        ),
        10000,
      );
    } catch {
      await enqueueSale({
        clientRef,
        businessId,
        kind: "retail",
        createdAt: new Date().toISOString(),
        status: "pending",
        payload: {
          cashierId,
          items: itemsPayload,
          payments: paymentsPayload,
          orderDisc: 0,
          orderDiscType: "pct",
          customerId: selectedCustomer?.id ?? null,
          selfOrderIds: [],
          orderLabel: billLabel,
          customerName: selectedCustomer?.name ?? null,
          orderDiscName: null,
          orderType: orderType ?? null,
        },
      });
      setSubmitting(false);
      const newCart = cart.filter((i) => !paidKeys.has(i.cartKey));
      setCart(newCart);
      setPisahSelected(new Set());
      setPisahPaying(false);
      setPisahTenders([]);
      setPisahBillCount((prev) => prev + 1);
      if (newCart.length === 0) {
        setPisahBillMode(false);
        setSuccessOffline(true);
        setSuccessInvoice(`OFFLINE-${clientRef.slice(0, 8).toUpperCase()}`);
        setSuccessTransactionId(null);
      }
      void syncNow();
      return;
    }

    setSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }

    if (result.receiptPrintJobs.length > 0) {
      dispatchPrintJobs(businessId, result.receiptPrintJobs).then((results) => {
        const failed = results.filter((r) => !r.result.ok);
        setInboxNotice(
          failed.length === 0
            ? "🖨️ Struk berhasil dikirim ke printer."
            : `⚠️ Struk gagal: ${failed.map((r) => r.job.printerName).join(", ")} — cek antrian cetak.`,
        );
      }).catch(() => {});
    }
    void dispatchPrintJobs(businessId, result.printJobs);

    const newCart = cart.filter((i) => !paidKeys.has(i.cartKey));
    setCart(newCart);
    setPisahSelected(new Set());
    setPisahPaying(false);
    setPisahTenders([]);
    setPisahBillCount((prev) => prev + 1);

    if (newCart.length === 0) {
      setPisahBillMode(false);
      setSuccessOffline(false);
      setSuccessInvoice(result.invoiceNumber);
      setSuccessTransactionId(result.transactionId);
      if (activeBill && isOnline) {
        void deleteOpenBill(businessId, activeBill.id);
        setActiveBill(null);
      }
      setSelectedCustomer(null);
      setCustomerPickerOpen(false);
      setCustomerSearch("");
      setSelectedPromoId(null);
    }
  }

  async function handleConfirmPayment() {
    setError(null);

    if (!currentShiftId) {
      setOpenShiftModalOpen(true);
      return;
    }

    if (remaining > 0) {
      setError("Pembayaran kurang dari total belanja.");
      return;
    }
    for (const t of tenders) {
      if (t.method === "Tunai" && t.amount > 0 && (Number(t.received) || 0) < t.amount) {
        setError("Uang diterima untuk pembayaran tunai kurang.");
        return;
      }
    }

    setSubmitting(true);

    const itemsPayload = cart.map((i) => ({
      productId: i.productId,
      qty: i.qty,
      disc: i.disc,
      discType: i.discType,
      note: i.note,
      unitPrice: i.price !== i.basePrice ? i.price : undefined,
      optionNames: i.selectedOptions.length > 0 ? i.selectedOptions.map((o) => o.optionName) : undefined,
      batch: i.batch,
    }));
    const paymentsPayload: TenderInput[] = tenders.map((t) => ({
      method: t.method,
      amount: t.amount,
      received: t.method === "Tunai" ? (Number(t.received) || t.amount) : t.amount,
    }));
    const clientRef = crypto.randomUUID();

    let result: CheckoutResult;
    try {
      result = await withTimeout(
        checkout(
          businessId,
          cashierId,
          itemsPayload,
          paymentsPayload,
          orderDisc,
          orderDiscType,
          selectedCustomer?.id ?? null,
          cartOrderIds,
          clientRef,
          hasKitchenPrinters && !activeBill,
          hasReceiptPrinters && autoReceiptPrint,
          activeBill?.label || bonLabel || null,
          selectedCustomer?.name || null,
          selectedPromo?.name ?? null,
          orderType ?? null,
        ),
        10000,
      );
    } catch {
      // Jaringan bermasalah (fetch gagal total / macet >10 detik) — simpan
      // ke antrian offline dan tetap tampilkan sukses ke kasir. clientRef
      // yang sama menjamin retry lewat antrian tidak membuat transaksi
      // duplikat kalaupun request asli ternyata belakangan tetap sukses.
      await enqueueSale({
        clientRef,
        businessId,
        kind: "retail",
        createdAt: new Date().toISOString(),
        status: "pending",
        payload: {
          cashierId,
          items: itemsPayload,
          payments: paymentsPayload,
          orderDisc,
          orderDiscType,
          customerId: selectedCustomer?.id ?? null,
          selfOrderIds: cartOrderIds,
          orderLabel: activeBill?.label || bonLabel || null,
          customerName: selectedCustomer?.name || null,
          orderDiscName: selectedPromo?.name ?? null,
          orderType: orderType ?? null,
        },
      });

      setSubmitting(false);
      setSuccessOffline(true);
      setSuccessInvoice(`OFFLINE-${clientRef.slice(0, 8).toUpperCase()}`);
      setSuccessTransactionId(null);
      setCart([]);
      setCartOrderIds([]);
      setActiveBill(null);
      setPaying(false);
      setTenders([]);
      setEditingNoteId(null);
      setSelectedCustomer(null);
      setCustomerPickerOpen(false);
      setCustomerSearch("");
      setSelectedPromoId(null);
      void syncNow();
      return;
    }
    setSubmitting(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    // Struk dikirim dulu (prioritas), dapur menyusul. Await hasil struk supaya
    // kasir dapat notifikasi; dapur tetap fire-and-forget (masuk retry queue kalau gagal).
    if (result.receiptPrintJobs.length > 0) {
      dispatchPrintJobs(businessId, result.receiptPrintJobs).then((results) => {
        const failed = results.filter((r) => !r.result.ok);
        setInboxNotice(
          failed.length === 0
            ? "🖨️ Struk berhasil dikirim ke printer."
            : `⚠️ Struk gagal: ${failed.map((r) => r.job.printerName).join(", ")} — cek antrian cetak.`,
        );
      }).catch(() => {});
    }
    void dispatchPrintJobs(businessId, result.printJobs);

    // Bon yang dimuat sudah dibayar — bereskan dari daftar. Fire-and-forget
    // supaya tidak menahan layar sukses; bon hilang saat refreshCatalog
    // berikutnya kalau delete gagal karena jaringan.
    if (activeBill && isOnline) {
      void deleteOpenBill(businessId, activeBill.id);
      setActiveBill(null);
    }

    setSuccessOffline(false);
    setSuccessInvoice(result.invoiceNumber);
    setSuccessTransactionId(result.transactionId);
    setCart([]);
    setCartOrderIds([]);
    setPaying(false);
    setTenders([]);
    setEditingNoteId(null);
    setSelectedCustomer(null);
    setCustomerPickerOpen(false);
    setCustomerSearch("");
    setSelectedPromoId(null);
  }

  async function handleConfirmCloseShift() {
    setCloseError(null);

    const amount = Number(closingCash);
    if (!closingCash || Number.isNaN(amount) || amount < 0) {
      setCloseError("Jumlah kas harus angka dan tidak boleh negatif.");
      return;
    }

    setCloseSubmitting(true);
    const result = await closeShift(businessId, currentShiftId ?? "", amount, closeNotes);
    setCloseSubmitting(false);

    if (!result.success) {
      setCloseError(result.error);
      return;
    }

    const [shifts, settlementJobs] = await Promise.all([
      getTodayShifts(businessId),
      buildSettlementPrintJobs(businessId, todayRange.fromIso, todayRange.toIsoExclusive, "Hari Ini"),
    ]);
    setTodayShifts(shifts);

    if (settlementJobs.success && settlementJobs.jobs.length > 0) {
      void dispatchPrintJobs(businessId, settlementJobs.jobs);
    }

    setClosedSummary(result.summary);
  }

  async function handleOpenShiftSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOpenShiftError(null);

    const amount = Number(openingCashInput);
    if (!openingCashInput || Number.isNaN(amount) || amount < 0) {
      setOpenShiftError("Modal awal harus angka dan tidak boleh negatif.");
      return;
    }

    setOpenShiftSubmitting(true);
    const result = await openShift(businessId, cashierId, amount, openShiftNotes);
    setOpenShiftSubmitting(false);

    if (!result.success) {
      setOpenShiftError(result.error);
      return;
    }

    setCurrentShiftId(result.shiftId);
    setCurrentShiftOpenedAt(result.openedAt);
    setOpeningCashInput("");
    setOpenShiftNotes("");
    setOpenShiftModalOpen(false);
  }

  async function handleConfirmCashMove() {
    setCashMoveError(null);

    const amount = Number(cashMoveAmount);
    if (!cashMoveAmount || Number.isNaN(amount) || amount <= 0) {
      setCashMoveError("Jumlah harus angka lebih dari 0.");
      return;
    }
    if (!cashMoveDesc.trim()) {
      setCashMoveError("Keterangan wajib diisi.");
      return;
    }

    setCashMoveSubmitting(true);
    const result = await addShiftCashMovement(
      businessId,
      currentShiftId ?? "",
      cashMoveDirection,
      amount,
      cashMoveDesc.trim(),
    );
    setCashMoveSubmitting(false);

    if (!result.success) {
      setCashMoveError(result.error);
      return;
    }

    setCashMoveOpen(false);
    setCashMoveAmount("");
    setCashMoveDesc("");
    setCashMoveDirection("out");
  }

  if (successInvoice) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-2xl">
            ✅
          </div>
          <h1 className="text-lg font-bold text-zinc-900">Transaksi berhasil</h1>
          <p className="mt-1 text-sm text-zinc-500">No. Struk: {successInvoice}</p>
          {successOffline && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Tersimpan offline — nomor struk final & cetak struk baru tersedia setelah
              tersinkron otomatis ke server.
            </p>
          )}
          {successTransactionId && (
            <Link
              href={`/business/${businessId}/transactions/${successTransactionId}/receipt`}
              target="_blank"
              className="mt-6 block w-full rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              🖨️ Cetak Struk
            </Link>
          )}
          {successTransactionId && (
            <button
              type="button"
              disabled={waLoading}
              onClick={async () => {
                setWaLoading(true);
                try {
                  const text = await buildWhatsAppReceiptText(businessId, successTransactionId);
                  if (text) window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
                } finally {
                  setWaLoading(false);
                }
              }}
              className="mt-2 block w-full rounded-xl border border-green-200 py-2.5 text-sm font-semibold text-green-600 transition-colors hover:bg-green-50 disabled:opacity-50"
            >
              {waLoading ? "Menyiapkan…" : "📱 Kirim via WhatsApp"}
            </button>
          )}
          <button
            onClick={() => {
              setSuccessInvoice(null);
              setSuccessTransactionId(null);
              setSuccessOffline(false);
              void refreshCatalog();
            }}
            className="mt-3 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Transaksi Baru
          </button>
        </div>
      </div>
    );
  }

  if (closedSummary) {
    const diff = closedSummary.difference;
    const fmtTime = (iso: string) =>
      new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
    const totalHariIni = todayShifts.reduce(
      (acc, s) => ({
        sales: acc.sales + s.totalSales,
        tx: acc.tx + s.txCount,
      }),
      { sales: 0, tx: 0 },
    );
    return (
      <div className="flex flex-1 items-center justify-center overflow-y-auto bg-zinc-50 px-4 py-6">
        <div className="w-full max-w-sm space-y-4">
          {/* Ringkasan shift yang baru ditutup */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h1 className="text-center text-lg font-bold text-zinc-900">Shift Ditutup</h1>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between text-zinc-600">
                <span>Total Penjualan</span>
                <span className="font-medium text-zinc-900">
                  {formatRupiah(closedSummary.total_sales)}
                </span>
              </div>
              <div className="flex justify-between text-zinc-600">
                <span>Penjualan Tunai</span>
                <span className="font-medium text-zinc-900">
                  {formatRupiah(closedSummary.cash_sales)}
                </span>
              </div>
              <div className="flex justify-between text-zinc-600">
                <span>Penjualan Non-Tunai</span>
                <span className="font-medium text-zinc-900">
                  {formatRupiah(closedSummary.non_cash_sales)}
                </span>
              </div>
              <div className="flex justify-between text-zinc-600">
                <span>Jumlah Transaksi</span>
                <span className="font-medium text-zinc-900">{closedSummary.tx_count}</span>
              </div>
              <div className="flex justify-between border-t border-zinc-100 pt-2 text-zinc-600">
                <span>Kas Diharapkan</span>
                <span className="font-medium text-zinc-900">
                  {formatRupiah(closedSummary.expected_cash)}
                </span>
              </div>
              <div className="flex justify-between font-semibold">
                <span className={diff === 0 ? "text-zinc-900" : diff > 0 ? "text-brand-700" : "text-red-600"}>
                  Selisih
                </span>
                <span className={diff === 0 ? "text-zinc-900" : diff > 0 ? "text-brand-700" : "text-red-600"}>
                  {diff === 0 ? "Pas" : `${diff > 0 ? "+" : ""}${formatRupiah(diff)}`}
                </span>
              </div>
            </div>
          </div>

          {/* Ringkasan semua shift hari ini */}
          {todayShifts.length > 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-zinc-900">Shift Hari Ini</h2>
                <span className="text-xs text-zinc-400">{todayShifts.length} shift</span>
              </div>

              <div className="mt-3 space-y-2">
                {todayShifts.map((s, i) => {
                  const d = s.difference;
                  return (
                    <div key={s.id} className="rounded-xl bg-zinc-50 px-3 py-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-zinc-800">
                          Shift {i + 1} — {s.cashierName}
                        </span>
                        <span className="text-zinc-500">
                          {fmtTime(s.openedAt)}
                          {s.closedAt ? ` – ${fmtTime(s.closedAt)}` : " (aktif)"}
                        </span>
                      </div>
                      <div className="mt-1.5 flex gap-4 text-zinc-600">
                        <span>Penjualan <strong className="text-zinc-900">{formatRupiah(s.totalSales)}</strong></span>
                        <span>Transaksi <strong className="text-zinc-900">{s.txCount}</strong></span>
                        {d !== null && (
                          <span>
                            Selisih{" "}
                            <strong className={d === 0 ? "text-zinc-900" : d > 0 ? "text-brand-700" : "text-red-600"}>
                              {d === 0 ? "Pas" : `${d > 0 ? "+" : ""}${formatRupiah(d)}`}
                            </strong>
                          </span>
                        )}
                      </div>
                      {s.closeNotes && (
                        <p className="mt-1 text-zinc-400">Catatan: {s.closeNotes}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {todayShifts.length > 1 && (
                <div className="mt-3 flex justify-between border-t border-zinc-100 pt-3 text-xs font-semibold text-zinc-900">
                  <span>Total Semua Shift</span>
                  <span>{formatRupiah(totalHariIni.sales)} · {totalHariIni.tx} transaksi</span>
                </div>
              )}
            </div>
          )}

          {/* Cetak & selesai */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="mb-2 text-xs font-medium text-zinc-500">
              Cetak laporan hari ini (semua shift):
            </p>
            <ReportPrintButtons
              businessId={businessId}
              fromIso={todayRange.fromIso}
              toIsoExclusive={todayRange.toIsoExclusive}
              periodLabel="Hari Ini"
            />
            <button
              onClick={() => {
                setClosedSummary(null);
                setClosingShift(false);
                setCurrentShiftId(null);
                setCurrentShiftOpenedAt(null);
                router.refresh();
              }}
              className="mt-3 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              Selesai
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (closingShift) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6">
          <h1 className="text-lg font-bold text-zinc-900">Tutup Shift</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Hitung uang tunai di laci, lalu masukkan jumlahnya.
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="closingCash" className="mb-1 block text-xs font-medium text-zinc-600">
                Kas di Laci Sekarang (Rp)
              </label>
              <input
                id="closingCash"
                type="number"
                min="0"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                placeholder="mis. 750000"
              />
            </div>
            <div>
              <label htmlFor="closeNotes" className="mb-1 block text-xs font-medium text-zinc-600">
                Catatan (opsional)
              </label>
              <input
                id="closeNotes"
                type="text"
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>

            {closeError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{closeError}</p>
            )}

            <button
              onClick={handleConfirmCloseShift}
              disabled={closeSubmitting}
              className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {closeSubmitting ? "Memproses…" : "Tutup Shift"}
            </button>
            <button
              onClick={() => {
                setClosingShift(false);
                setCloseError(null);
              }}
              className="w-full py-1 text-center text-xs font-medium text-zinc-400 hover:text-zinc-600"
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (cashMoveOpen) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6">
          <h1 className="text-lg font-bold text-zinc-900">Kas Masuk / Keluar</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Catat uang yang masuk/keluar dari laci selama shift ini berjalan.
          </p>

          <div className="mt-4 space-y-4">
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setCashMoveDirection("in")}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
                  cashMoveDirection === "in"
                    ? "bg-brand-600 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                ↓ Kas Masuk
              </button>
              <button
                type="button"
                onClick={() => setCashMoveDirection("out")}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
                  cashMoveDirection === "out"
                    ? "bg-red-600 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                ↑ Kas Keluar
              </button>
            </div>

            <div>
              <label htmlFor="cashMoveAmount" className="mb-1 block text-xs font-medium text-zinc-600">
                Jumlah (Rp)
              </label>
              <input
                id="cashMoveAmount"
                type="number"
                min="0"
                value={cashMoveAmount}
                onChange={(e) => setCashMoveAmount(e.target.value)}
                placeholder="mis. 50000"
                className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div>
              <label htmlFor="cashMoveDesc" className="mb-1 block text-xs font-medium text-zinc-600">
                Keterangan
              </label>
              <input
                id="cashMoveDesc"
                type="text"
                value={cashMoveDesc}
                onChange={(e) => setCashMoveDesc(e.target.value)}
                placeholder={cashMoveDirection === "in" ? "mis. Tambahan modal kas" : "mis. Beli galon & kopi kantor"}
                className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>

            {cashMoveError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{cashMoveError}</p>
            )}

            <button
              onClick={handleConfirmCashMove}
              disabled={cashMoveSubmitting}
              className={`w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                cashMoveDirection === "in" ? "bg-brand-600 hover:bg-brand-700" : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {cashMoveSubmitting ? "Menyimpan…" : cashMoveDirection === "in" ? "+ Catat Kas Masuk" : "+ Catat Kas Keluar"}
            </button>
            <button
              onClick={() => {
                setCashMoveOpen(false);
                setCashMoveError(null);
              }}
              className="w-full py-1 text-center text-xs font-medium text-zinc-400 hover:text-zinc-600"
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-zinc-50">
      {!currentShiftId && (
        <div className="shrink-0 flex items-center gap-3 bg-zinc-700 px-4 py-2 text-sm text-white shadow-md">
          <span className="text-base">🔓</span>
          <span className="flex-1">Shift belum dibuka. Tekan <strong>Bayar</strong> saat siap berjualan.</span>
          <button
            onClick={() => setOpenShiftModalOpen(true)}
            className="shrink-0 rounded bg-white px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
          >
            Buka Shift
          </button>
        </div>
      )}
      {isStaleShift && !staleBannerDismissed && (
        <div className="shrink-0 flex items-center gap-3 bg-amber-500 px-4 py-2 text-sm text-white shadow-md">
          <span className="text-base">⚠️</span>
          <span className="flex-1">
            Shift dari{" "}
            <strong>
              {new Date(currentShiftOpenedAt!).toLocaleDateString("id-ID", {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: "Asia/Jakarta",
              })}
            </strong>
            {" "}belum ditutup.
          </span>
          <button
            onClick={() => {
              setStaleBannerDismissed(true);
              setClosingShift(true);
            }}
            className="shrink-0 rounded bg-white px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
          >
            Tutup Shift Lama
          </button>
          <button
            onClick={() => setStaleBannerDismissed(true)}
            className="shrink-0 text-xs text-amber-200 hover:text-white"
          >
            Abaikan
          </button>
        </div>
      )}

      {/* Catalog + Cart wrapper */}
      <div className="flex flex-1 flex-col sm:flex-row overflow-hidden min-h-0">

      {/* Catalog */}
      <div className="flex flex-1 flex-col overflow-hidden min-h-0">
        <div className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Cari produk atau scan barcode…"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            {scanFeedback && (
              <p className="absolute left-0 top-full mt-1 text-xs text-red-600">{scanFeedback}</p>
            )}
          </div>
          <button
            onClick={() => setBillsOpen(true)}
            className="relative flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            🧾 <span className="hidden sm:inline">Bon</span>
            {openBills.length > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                {openBills.length}
              </span>
            )}
          </button>
          {isFnb && (
            <button
              onClick={() => setInboxOpen(true)}
              className="relative flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
            >
              🛎️ <span className="hidden sm:inline">Order</span>
              {newOrderCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {newOrderCount}
                </span>
              )}
            </button>
          )}
          <button
            onClick={() => setPosMenuOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            ☰ <span className="hidden sm:inline">Menu</span>
          </button>
          <OfflineStatus isOnline={isOnline} pending={pending} onSyncNow={() => void syncNow()} onDiscard={discard} />
          <PrintQueueStatus
            pending={pendingPrints}
            onRetryNow={() => void retryPrintsNow()}
            onDiscard={discardPrint}
          />
          <Link href={`/business/${businessId}`} className="text-right hover:opacity-70 transition-opacity">
            <p className="text-xs font-semibold text-zinc-700">{cashierName}</p>
            <p className="text-[10px] text-zinc-400">{businessName}</p>
          </Link>
        </div>

        {categoryTabs.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto border-b border-zinc-200 bg-white px-4 py-2.5">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedCategory === null
                  ? "bg-brand-600 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              Semua
            </button>
            {categoryTabs.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedCategory(c)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedCategory === c
                    ? "bg-brand-600 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {!catalogLoaded ? (
            <p className="mt-10 text-center text-sm text-zinc-400">Memuat produk…</p>
          ) : selectedCategory === null && !search.trim() && categoryTabs.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {categoryTabs.map((c) => {
                const inCat = effectiveProducts.filter((p) => p.category === c);
                const emoji = inCat.find((p) => p.emoji)?.emoji ?? "🍽️";
                return (
                  <button
                    key={c}
                    onClick={() => setSelectedCategory(c)}
                    className="flex flex-col items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white p-5 text-center shadow-sm transition-colors hover:border-brand-400 hover:bg-brand-50"
                  >
                    <span className="text-3xl">{emoji}</span>
                    <span className="text-sm font-semibold text-zinc-800">{c}</span>
                    <span className="text-xs text-zinc-400">{inCat.length} menu</span>
                  </button>
                );
              })}
            </div>
          ) : filteredProducts.length === 0 ? (
            <p className="mt-10 text-center text-sm text-zinc-400">
              {effectiveProducts.length === 0
                ? "Belum ada produk. Tambahkan dulu di halaman Kelola Produk."
                : "Produk tidak ditemukan."}
            </p>
          ) : (
            <div className={
                viewMode === "kecil" ? "grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6" :
                viewMode === "sedang" ? "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" :
                viewMode === "besar" ? "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" :
                "flex flex-col gap-2"
              }>
              {productGroups.map((g) => {
                const isVariantGroup = g.variants.length > 1;
                const single = g.variants[0];
                const inCart = g.variants.reduce(
                  (sum, v) => sum + (cart.find((i) => i.productId === v.id)?.qty ?? 0),
                  0,
                );
                const price = isVariantGroup
                  ? `${formatRupiah(Math.min(...g.variants.map((v) => v.price)))}${new Set(g.variants.map((v) => v.price)).size > 1 ? "+" : ""}`
                  : formatRupiah(single.price);
                const thumb = single.image_url ? (
                  <img src={single.image_url} alt={g.name} className="h-full w-full object-cover" />
                ) : (
                  <span className={viewMode === "kecil" ? "text-base" : "text-lg"}>{single.emoji || "📦"}</span>
                );

                if (viewMode === "list") {
                  return (
                    <button
                      key={g.name}
                      onClick={() => handleProductClick(g)}
                      className="relative flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-brand-300"
                    >
                      {inCart > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                          {inCart}
                        </span>
                      )}
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-lg overflow-hidden">
                        {thumb}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-900">{g.name}</p>
                        <p className="text-xs text-zinc-500">
                          {isVariantGroup ? `${g.variants.length} varian` : `Stok ${single.stock}`}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-zinc-900">{price}</p>
                    </button>
                  );
                }

                return (
                  <button
                    key={g.name}
                    onClick={() => handleProductClick(g)}
                    className="relative rounded-xl border border-zinc-200 bg-white p-3 text-left transition-colors hover:border-brand-300"
                  >
                    {inCart > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                        {inCart}
                      </span>
                    )}
                    <div className={`mb-2 flex items-center justify-center rounded-lg bg-zinc-100 overflow-hidden ${viewMode === "kecil" ? "h-8 w-8 text-base" : viewMode === "besar" ? "h-16 w-16 text-3xl" : "h-9 w-9 text-lg"}`}>
                      {thumb}
                    </div>
                    <p className={`truncate font-medium text-zinc-900 ${viewMode === "kecil" ? "text-xs" : "text-sm"}`}>{g.name}</p>
                    {viewMode !== "kecil" && (
                      <p className="text-xs text-zinc-500">
                        {isVariantGroup ? `${g.variants.length} varian` : `Stok ${single.stock}`}
                      </p>
                    )}
                    <p className={`mt-1 font-semibold text-zinc-900 ${viewMode === "kecil" ? "text-xs" : "text-sm"}`}>{price}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {variantPickerGroup && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900">Pilih Varian — {variantPickerGroup.name}</h3>
              <button
                onClick={() => setVariantPickerGroup(null)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2">
              {variantPickerGroup.variants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    setVariantPickerGroup(null);
                    openOptionPickerOrAddToCart(v);
                  }}
                  className="flex w-full items-center justify-between rounded-xl border border-zinc-200 px-4 py-3 text-left transition-colors hover:border-brand-300"
                >
                  <span>
                    <span className="block text-sm font-medium text-zinc-900">
                      {v.variant_label || "Varian"}
                    </span>
                    <span className="text-xs text-zinc-500">Stok {v.stock}</span>
                  </span>
                  <span className="text-sm font-semibold text-zinc-900">
                    {formatRupiah(v.price)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {optionPickerProduct && (() => {
        const pGroups = catalog.optionGroups.filter((g) => g.product_id === optionPickerProduct.id);
        const optionPriceAdj = pendingOptions.reduce((s, o) => s + o.priceAdj, 0);
        const allRequired = pGroups.filter((g) => g.required);
        const allRequiredFilled = allRequired.every((g) =>
          pendingOptions.some((o) => o.groupId === g.id),
        );
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
            <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">{optionPickerProduct.name}</h3>
                  {optionPickerProduct.variant_label && (
                    <p className="text-xs text-zinc-500">{optionPickerProduct.variant_label}</p>
                  )}
                </div>
                <button onClick={() => setOptionPickerProduct(null)} className="text-zinc-400 hover:text-zinc-600">✕</button>
              </div>
              <div className="space-y-4">
                {pGroups.map((group) => {
                  const selected = pendingOptions.find((o) => o.groupId === group.id);
                  return (
                    <div key={group.id}>
                      <p className="mb-1.5 text-xs font-semibold text-zinc-700">
                        {group.name}
                        {group.required && <span className="ml-1 text-red-500">*</span>}
                      </p>
                      <div className="space-y-1.5">
                        {group.options.map((opt) => {
                          const isSelected = selected?.optionId === opt.id;
                          return (
                            <button
                              key={opt.id}
                              onClick={() => {
                                if (isSelected) {
                                  // Grup opsional: bisa deselect; grup wajib: tidak bisa
                                  if (!group.required) {
                                    setPendingOptions((prev) => prev.filter((o) => o.groupId !== group.id));
                                  }
                                  return;
                                }
                                setPendingOptions((prev) => [
                                  ...prev.filter((o) => o.groupId !== group.id),
                                  {
                                    groupId: group.id,
                                    groupName: group.name,
                                    optionId: opt.id,
                                    optionName: opt.name,
                                    priceAdj: opt.price_adjustment,
                                  },
                                ]);
                              }}
                              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors ${
                                isSelected
                                  ? "border-brand-500 bg-brand-50"
                                  : "border-zinc-200 hover:border-brand-300"
                              }`}
                            >
                              <span className="flex items-center gap-2">
                                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${isSelected ? "border-brand-500 bg-brand-500 text-white" : "border-zinc-300"}`}>
                                  {isSelected && "✓"}
                                </span>
                                <span className="text-sm text-zinc-900">{opt.name}</span>
                              </span>
                              {opt.price_adjustment > 0 && (
                                <span className="text-xs font-medium text-brand-700">+{formatRupiah(opt.price_adjustment)}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 border-t border-zinc-100 pt-4">
                {optionPriceAdj > 0 && (
                  <p className="mb-2 text-right text-xs text-zinc-500">
                    Harga: {formatRupiah(optionPickerProduct.price)} + {formatRupiah(optionPriceAdj)} = <span className="font-semibold text-zinc-900">{formatRupiah(optionPickerProduct.price + optionPriceAdj)}</span>
                  </p>
                )}
                <button
                  onClick={() => {
                    addToCart(optionPickerProduct, pendingOptions);
                    setOptionPickerProduct(null);
                    setPendingOptions([]);
                  }}
                  disabled={!allRequiredFilled}
                  className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Tambah ke Keranjang
                </button>
                {!allRequiredFilled && (
                  <p className="mt-1.5 text-center text-xs text-red-500">Pilih semua opsi wajib (*)</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bottom bar portrait — hanya muncul di HP portrait, menggantikan panel kanan */}
      <div className="sm:hidden shrink-0 border-t border-zinc-200 bg-white px-3 py-2.5 flex items-center gap-2">
        <button
          onClick={() => setMobileCartOpen(true)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">
            {cart.reduce((s, i) => s + i.qty, 0)}
          </span>
          <span className="text-sm font-semibold text-zinc-900 tabular-nums">{formatRupiah(total)}</span>
          {activeBill && (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
              🧾 {activeBill.label}
            </span>
          )}
        </button>
        <button
          onClick={handleOpenPayment}
          disabled={cart.length === 0}
          className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          Bayar
        </button>
      </div>

      {/* Backdrop portrait cart drawer */}
      {mobileCartOpen && (
        <div
          className="sm:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setMobileCartOpen(false)}
        />
      )}

      {/* Cart — drawer dari bawah di portrait, panel kanan di landscape */}
      <div className={`
        fixed sm:relative inset-x-0 bottom-0 sm:inset-auto z-50 sm:z-auto
        flex flex-col
        w-full sm:w-72
        max-h-[92dvh] sm:max-h-none sm:h-auto
        rounded-t-2xl sm:rounded-none
        border-t sm:border-t-0 sm:border-l border-zinc-200
        bg-white shrink-0
        transition-transform sm:transition-none duration-300
        ${mobileCartOpen ? 'translate-y-0' : 'translate-y-full sm:translate-y-0'}
      `}>
        {/* Drag handle + tutup — hanya portrait */}
        <div className="sm:hidden flex items-center justify-between px-4 pt-3 pb-1 shrink-0">
          <div className="mx-auto h-1 w-10 rounded-full bg-zinc-200" />
        </div>
        <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Keranjang</h2>
            {activeBill && (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                🧾 {activeBill.label}
              </span>
            )}
          </div>

          {isFnb && (
            <div className="mb-3 flex gap-1.5">
              {(["DINE IN", "TAKEAWAY"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setOrderType(orderType === t ? null : t)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                    orderType === t
                      ? t === "DINE IN"
                        ? "bg-brand-600 text-white"
                        : "bg-amber-500 text-white"
                      : "border border-zinc-200 text-zinc-400 hover:border-zinc-400 hover:text-zinc-600"
                  }`}
                >
                  {t === "DINE IN" ? "🍽️ Dine In" : "🛍️ Takeaway"}
                </button>
              ))}
            </div>
          )}
          {inboxNotice && (
            <div className="mb-3 flex items-start justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <span>{inboxNotice}</span>
              <button
                onClick={() => setInboxNotice(null)}
                className="shrink-0 font-bold hover:text-amber-900"
              >
                ✕
              </button>
            </div>
          )}
          {cart.length === 0 ? (
            <p className="text-xs text-zinc-400">Belum ada item. Klik produk untuk menambah.</p>
          ) : (
            <div className="space-y-2">
              {cart.map((item, index) => {
                const discAmt = itemDiscAmount(item);
                const noteOpen = editingNoteId === item.cartKey;
                const currBatch = item.batch ?? 0;
                const prevBatch = index > 0 ? (cart[index - 1]?.batch ?? 0) : 0;
                const showTambahanDivider = currBatch > 0 && prevBatch === 0 && index > 0;
                return (
                  <div key={item.cartKey}>
                  {showTambahanDivider && (
                    <div className="flex items-center gap-2 pb-2">
                      <div className="h-px flex-1 bg-zinc-200" />
                      <span className="text-[10px] font-semibold tracking-wide text-zinc-400">TAMBAHAN</span>
                      <div className="h-px flex-1 bg-zinc-200" />
                    </div>
                  )}
                  <div
                    className={`rounded-xl border p-2.5 transition-colors ${
                      pisahBillMode
                        ? pisahSelected.has(item.cartKey)
                          ? "border-brand-400 bg-brand-50 cursor-pointer"
                          : "border-zinc-200 bg-white cursor-pointer opacity-60"
                        : "border-zinc-100"
                    }`}
                    onClick={pisahBillMode ? () => togglePisahItem(item.cartKey) : undefined}
                  >
                    <div className="flex items-start justify-between gap-2">
                      {pisahBillMode && (
                        <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 text-[10px] font-bold ${
                          pisahSelected.has(item.cartKey)
                            ? "border-brand-600 bg-brand-600 text-white"
                            : "border-zinc-300 bg-white"
                        }`}>
                          {pisahSelected.has(item.cartKey) && "✓"}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-zinc-900">{item.name}</p>
                        {item.selectedOptions.length > 0 && (
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {item.selectedOptions.map((o) => (
                              <span key={o.optionId} className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-700">
                                {o.optionName}{o.priceAdj > 0 ? ` +${formatRupiah(o.priceAdj)}` : ""}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {!pisahBillMode && (
                        <button
                          onClick={() => removeFromCart(item.cartKey, item.batch)}
                          className="text-xs text-zinc-400 hover:text-red-500"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => changeQty(item.cartKey, item.batch, -1)}
                          className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-100 text-xs font-bold text-zinc-600 hover:bg-zinc-200"
                        >
                          −
                        </button>
                        <span className="w-4 text-center text-xs tabular-nums">{item.qty}</span>
                        <button
                          onClick={() => changeQty(item.cartKey, item.batch, 1)}
                          className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-100 text-xs font-bold text-zinc-600 hover:bg-zinc-200"
                        >
                          +
                        </button>
                      </div>
                      {discAmt > 0 ? (
                        <div className="text-right">
                          <p className="text-[10px] text-zinc-400 line-through tabular-nums">
                            {formatRupiah(item.price * item.qty)}
                          </p>
                          <p className="text-xs font-semibold text-brand-700 tabular-nums">
                            {formatRupiah(item.price * item.qty - discAmt)}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs font-semibold text-zinc-900 tabular-nums">
                          {formatRupiah(item.price * item.qty)}
                        </p>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {discAmt > 0 && (
                        <span className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
                          {item.disc === 100 && item.discType === "pct" ? "🎂 Gratis" : `Diskon ${item.discType === "pct" ? `${item.disc}%` : formatRupiah(item.disc)}`}
                        </span>
                      )}
                      <button
                        onClick={() => toggleFreeItem(item.cartKey, item.batch)}
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                          item.disc === 100 && item.discType === "pct"
                            ? "border-pink-300 bg-pink-50 text-pink-700 hover:bg-pink-100"
                            : "border-zinc-200 text-zinc-400 hover:border-zinc-400 hover:text-zinc-600"
                        }`}
                      >
                        🎂 Gratis
                      </button>
                      {isFnb && (
                        <button
                          onClick={() => setEditingNoteId(noteOpen ? null : item.cartKey)}
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                            item.note
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-zinc-200 text-zinc-400 hover:border-zinc-400 hover:text-zinc-600"
                          }`}
                        >
                          {item.note ? `📝 ${item.note.length > 18 ? item.note.slice(0, 18) + "…" : item.note}` : "📝 Catatan"}
                        </button>
                      )}
                    </div>
                    {noteOpen && (
                      <div className="mt-2 flex items-center gap-1.5 border-t border-zinc-100 pt-2">
                        <input
                          type="text"
                          value={item.note ?? ""}
                          onChange={(e) => setItemNote(item.cartKey, item.batch, e.target.value)}
                          placeholder="mis. pedas level 3, tanpa es"
                          className="flex-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs focus:border-brand-600 focus:outline-none"
                        />
                        <button
                          onClick={() => setEditingNoteId(null)}
                          className="shrink-0 rounded-lg bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-600 hover:bg-zinc-200"
                        >
                          OK
                        </button>
                      </div>
                    )}
                  </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Customer picker — scrolls with items */}
        {!paying && (
          <div className="px-4 pb-3">
            <button
              onClick={() => setCustomerPickerOpen((v) => !v)}
              className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                selectedCustomer
                  ? "border-brand-200 bg-brand-50 text-brand-700"
                  : "border-zinc-200 text-zinc-400 hover:border-brand-300 hover:text-brand-700"
              }`}
            >
              <span>👤 {selectedCustomer ? selectedCustomer.name : "Tanpa Pelanggan"}</span>
              {selectedCustomer && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCustomer(null);
                  }}
                  className="text-zinc-400 hover:text-red-500"
                >
                  ✕
                </span>
              )}
            </button>
            {customerPickerOpen && (
              <div className="mt-1.5 rounded-lg border border-zinc-200 bg-white p-2">
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Cari nama / no. telepon…"
                  className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
                />
                <div className="mt-1.5 max-h-40 overflow-y-auto">
                  <button
                    onClick={() => {
                      setSelectedCustomer(null);
                      setCustomerPickerOpen(false);
                      setCustomerSearch("");
                    }}
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-zinc-500 hover:bg-zinc-50"
                  >
                    Tanpa pelanggan
                  </button>
                  {filteredCustomers.length === 0 ? (
                    <p className="px-2 py-1.5 text-xs text-zinc-400">Tidak ditemukan.</p>
                  ) : (
                    filteredCustomers.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomer(c);
                          setCustomerPickerOpen(false);
                          setCustomerSearch("");
                        }}
                        className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-50"
                      >
                        {c.name}
                        {c.phone && <span className="text-zinc-400"> · {c.phone}</span>}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Promo picker — scrolls with items */}
        {!paying && availablePromos.length > 0 && (
          <div className="px-4 pb-3">
            <button
              onClick={() => setPromoPickerOpen((v) => !v)}
              className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                selectedPromo
                  ? "border-brand-200 bg-brand-50 text-brand-700"
                  : "border-zinc-200 text-zinc-400 hover:border-brand-300 hover:text-brand-700"
              }`}
            >
              <span>
                🏷️{" "}
                {selectedPromo
                  ? `${selectedPromo.name} (${selectedPromo.value_type === "pct" ? `${selectedPromo.value}%` : `Rp${selectedPromo.value.toLocaleString("id-ID")}`})`
                  : "Tanpa Promo"}
              </span>
              {selectedPromo && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPromoId(null);
                  }}
                  className="text-zinc-400 hover:text-red-500"
                >
                  ✕
                </span>
              )}
            </button>
            {promoPickerOpen && (
              <div className="mt-1.5 rounded-lg border border-zinc-200 bg-white p-2">
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  <button
                    onClick={() => {
                      setSelectedPromoId(null);
                      setPromoPickerOpen(false);
                    }}
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-zinc-500 hover:bg-zinc-50"
                  >
                    Tanpa Promo
                  </button>
                  {availablePromos.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedPromoId(p.id);
                        setPromoPickerOpen(false);
                      }}
                      className={`block w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-zinc-50 ${
                        selectedPromoId === p.id ? "font-semibold text-brand-700" : "text-zinc-700"
                      }`}
                    >
                      {p.name}
                      <span className="ml-1.5 text-zinc-400">
                        {p.value_type === "pct" ? `${p.value}%` : `Rp${p.value.toLocaleString("id-ID")}`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Totals breakdown — scrolls with items */}
        {!paying && (totalItemDisc > 0 || orderDiscAmt > 0 || serviceAmt > 0 || taxAmt > 0) && (
          <div className="px-4 pb-3 space-y-1 border-t border-zinc-100 pt-2">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatRupiah(subtotalRaw)}</span>
            </div>
            {totalItemDisc > 0 && (
              <div className="flex items-center justify-between text-xs text-brand-700">
                <span>Diskon item</span>
                <span className="tabular-nums">− {formatRupiah(totalItemDisc)}</span>
              </div>
            )}
            {selectedPromo && orderDiscAmt > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
                  🎉 {selectedPromo.name}
                </span>
                <span className="tabular-nums text-brand-700">
                  − {formatRupiah(orderDiscAmt)}
                </span>
              </div>
            )}
            {serviceAmt > 0 && (
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>Layanan ({serviceRate}%)</span>
                <span className="tabular-nums">{formatRupiah(serviceAmt)}</span>
              </div>
            )}
            {taxAmt > 0 && (
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>PPN ({taxRate}%)</span>
                <span className="tabular-nums">{formatRupiah(taxAmt)}</span>
              </div>
            )}
          </div>
        )}

        {/* Payment tenders — scrollable */}
        {paying && (
          <div className="px-4 pb-4 space-y-3">
            {/* Tender rows */}
            <div className="space-y-2">
              {tenders.map((t) => (
                <div key={t.id} className="rounded-xl border border-zinc-200 p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={t.method}
                      onChange={(e) => updateTender(t.id, { method: e.target.value })}
                      className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs shrink-0 focus:border-brand-600 focus:outline-none bg-white"
                    >
                      {paymentMethods.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    {t.method === "Tunai" ? (
                      <input
                        type="number"
                        min="0"
                        value={t.amount || ""}
                        onChange={(e) => updateTender(t.id, { amount: Number(e.target.value) || 0 })}
                        className="flex-1 min-w-0 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs text-right focus:border-brand-600 focus:outline-none"
                        placeholder="0"
                      />
                    ) : (
                      <div className="flex-1 min-w-0 rounded-lg bg-zinc-100 px-2 py-1.5 text-xs text-right font-medium text-zinc-700 tabular-nums">
                        {formatRupiah(t.amount)}
                      </div>
                    )}
                    {tenders.length > 1 && (
                      <button
                        onClick={() => removeTender(t.id)}
                        className="shrink-0 text-zinc-300 hover:text-red-400 text-base leading-none px-0.5"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {t.method === "Tunai" && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex flex-wrap gap-1">
                        {getCashSuggestions(t.amount || total).map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => updateTender(t.id, { received: String(v) })}
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors ${String(v) === t.received ? "bg-brand-600 text-white border-brand-600" : "border-zinc-300 text-zinc-600 hover:border-brand-400 hover:text-brand-600"}`}
                          >
                            {formatRupiah(v)}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-zinc-500 shrink-0">Terima:</span>
                        <input
                          type="number"
                          min={t.amount}
                          value={t.received}
                          onChange={(e) => updateTender(t.id, { received: e.target.value })}
                          className="flex-1 min-w-0 rounded-lg border border-zinc-200 px-2 py-1 text-xs text-right focus:border-brand-600 focus:outline-none"
                          placeholder={String(t.amount || total)}
                        />
                        {Number(t.received) >= t.amount && t.received !== "" && (
                          <span className="text-[11px] text-zinc-500 shrink-0">
                            ↩ <b>{formatRupiah(Number(t.received) - t.amount)}</b>
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Tambah cara bayar */}
            {remaining > 0 && (
              <button
                onClick={handleAddTender}
                className="w-full rounded-xl border border-dashed border-zinc-300 py-2 text-xs text-zinc-500 hover:border-brand-400 hover:text-brand-600"
              >
                + Tambah Cara Bayar
              </button>
            )}

            {/* Ringkasan pembayaran */}
            <div className="rounded-xl bg-zinc-50 px-3 py-2 text-xs space-y-0.5">
              {remaining > 0 ? (
                <div className="flex justify-between text-amber-700 font-medium">
                  <span>Sisa belum dibayar</span>
                  <span>{formatRupiah(remaining)}</span>
                </div>
              ) : totalChange > 0 ? (
                <div className="flex justify-between text-zinc-700">
                  <span>Total kembalian</span>
                  <span className="font-bold text-zinc-900">{formatRupiah(totalChange)}</span>
                </div>
              ) : (
                <p className="text-center text-zinc-500">Pembayaran pas ✓</p>
              )}
            </div>
          </div>
        )}
        </div>{/* end flex-1 scrollable */}

        {/* Fixed footer — Total + action buttons always visible */}
        <div className="border-t border-zinc-200 px-3 pt-2.5 pb-3 shrink-0">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold text-zinc-900">Total</span>
            <span className="text-sm font-bold text-zinc-900 tabular-nums">{formatRupiah(total)}</span>
          </div>

          {pisahBillMode ? (
            /* ── Mode Pisah Bill ── */
            pisahPaying ? (
              /* Layar bayar tagihan ini */
              <div className="space-y-2">
                <p className="text-center text-xs font-semibold text-brand-700">
                  Tagihan {pisahBillCount} — {pisahCart.length} item
                </p>
                <div className="space-y-2">
                  {pisahTenders.map((t) => (
                    <div key={t.id} className="rounded-xl border border-zinc-200 p-2.5 space-y-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={t.method}
                          onChange={(e) => updatePisahTender(t.id, { method: e.target.value })}
                          className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs shrink-0 focus:border-brand-600 focus:outline-none bg-white"
                        >
                          {paymentMethods.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        {t.method === "Tunai" ? (
                          <input
                            type="number"
                            min="0"
                            value={t.amount || ""}
                            onChange={(e) => updatePisahTender(t.id, { amount: Number(e.target.value) || 0 })}
                            className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
                          />
                        ) : (
                          <div className="w-full rounded-lg bg-zinc-100 px-2 py-1.5 text-xs font-medium text-zinc-700 tabular-nums">
                            {formatRupiah(t.amount)}
                          </div>
                        )}
                      </div>
                      {t.method === "Tunai" && (
                        <div className="space-y-1.5">
                          {t.amount > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {getCashSuggestions(t.amount).map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() => updatePisahTender(t.id, { received: String(v) })}
                                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors ${String(v) === String(t.received) ? "bg-brand-600 text-white border-brand-600" : "border-zinc-300 text-zinc-600 hover:border-brand-400 hover:text-brand-600"}`}
                                >
                                  {formatRupiah(v)}
                                </button>
                              ))}
                            </div>
                          )}
                          <input
                            type="number"
                            min="0"
                            value={t.received || ""}
                            onChange={(e) => updatePisahTender(t.id, { received: e.target.value })}
                            placeholder="Uang diterima"
                            className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {pisahTotalChange > 0 && (
                  <p className="text-center text-xs font-semibold text-brand-700">
                    Kembalian {formatRupiah(pisahTotalChange)}
                  </p>
                )}
                {error && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setPisahPaying(false); setPisahTenders([]); setError(null); }}
                    className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handlePisahConfirmPayment}
                    disabled={submitting || pisahRemaining > 0}
                    className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? "Memproses…" : pisahRemaining > 0 ? `Kurang ${formatRupiah(pisahRemaining)}` : "Konfirmasi"}
                  </button>
                </div>
              </div>
            ) : (
              /* Pilih item */
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">
                    Tagihan {pisahBillCount} · {pisahSelected.size} item dipilih
                  </span>
                  {pisahTotals.total > 0 && (
                    <span className="font-bold text-zinc-900">{formatRupiah(pisahTotals.total)}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleExitPisahBill}
                    className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
                  >
                    Batal Pisah
                  </button>
                  <button
                    onClick={handlePisahOpenPayment}
                    disabled={pisahSelected.size === 0}
                    className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Bayar {pisahSelected.size > 0 ? formatRupiah(pisahTotals.total) : ""}
                  </button>
                </div>
              </div>
            )
          ) : !paying ? (
            !saveBonOpen ? (
              <div className="space-y-2">
                <div className={`grid gap-2 ${cashierRole === "pelayan" ? "grid-cols-1" : "grid-cols-2"}`}>
                  <button
                    onClick={() => {
                      const activeBillFull = activeBill?.id
                        ? openBills.find((b) => b.id === activeBill.id)
                        : null;
                      setBonLabel(activeBill?.label ?? `Bon ${openBills.length + 1}`);
                      setBonCustomerName(activeBillFull?.customer_name ?? "");
                      setBonError(null);
                      setSaveBonOpen(true);
                    }}
                    disabled={cart.length === 0}
                    className="rounded-xl border border-brand-200 py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    🧾 Simpan Bon
                  </button>
                  {cashierRole !== "pelayan" && (
                    <button
                      onClick={handleOpenPayment}
                      disabled={cart.length === 0}
                      className="rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Bayar
                    </button>
                  )}
                </div>
                {cashierRole !== "pelayan" && cart.length >= 2 && (
                  <button
                    onClick={handleEnterPisahBill}
                    className="w-full rounded-xl border border-zinc-200 py-2 text-xs font-semibold text-zinc-500 hover:border-brand-300 hover:text-brand-600 transition-colors"
                  >
                    ✂️ Pisah Bill
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50/50 p-3">
                <div>
                  <label htmlFor="bonLabel" className="block text-xs font-medium text-zinc-600">
                    No Meja / Label <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="bonLabel"
                    type="text"
                    value={bonLabel}
                    onChange={(e) => setBonLabel(e.target.value)}
                    placeholder="mis. Meja 5 / Bon 1"
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                </div>
                <div>
                  <label htmlFor="bonCustomerName" className="block text-xs font-medium text-zinc-600">
                    Nama Pelanggan <span className="text-zinc-400">(opsional)</span>
                  </label>
                  <input
                    id="bonCustomerName"
                    type="text"
                    value={bonCustomerName}
                    onChange={(e) => setBonCustomerName(e.target.value)}
                    placeholder="mis. Pak Budi"
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                </div>
                {bonError && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{bonError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setSaveBonOpen(false); setBonCustomerName(""); }}
                    className="flex-1 rounded-xl border border-zinc-200 bg-white py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSaveBon}
                    disabled={bonSaving}
                    className="flex-1 rounded-xl bg-brand-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
                  >
                    {bonSaving ? "Menyimpan…" : "Simpan"}
                  </button>
                </div>
              </div>
            )
          ) : (
            <>
              {error && (
                <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setPaying(false);
                    setTenders([]);
                                  setError(null);
                  }}
                  className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
                >
                  Batal
                </button>
                <button
                  onClick={handleConfirmPayment}
                  disabled={submitting || remaining > 0}
                  className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Memproses…" : remaining > 0 ? `Kurang ${formatRupiah(remaining)}` : "Konfirmasi"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      </div>{/* end Catalog + Cart wrapper */}

      {/* Open bills */}
      {posMenuOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setPosMenuOpen(false)}
          />
          <div className="relative flex max-h-[90dvh] w-full max-w-sm flex-col rounded-t-2xl bg-white sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-5 py-4">
              <h2 className="text-sm font-bold text-zinc-900">☰ Menu</h2>
              <button
                onClick={() => setPosMenuOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-xs text-zinc-500 hover:bg-zinc-200"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              {/* Tampilan grid produk */}
              <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Tampilan Produk
              </p>
              <div className="mb-4 flex items-center rounded-xl border border-zinc-200 bg-white overflow-hidden">
                {([
                  { mode: "kecil", icon: "⊞", label: "Kecil" },
                  { mode: "sedang", icon: "⊟", label: "Sedang" },
                  { mode: "besar", icon: "▦", label: "Besar" },
                  { mode: "list", icon: "☰", label: "List" },
                ] as const).map(({ mode, icon, label }) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors ${viewMode === mode ? "bg-brand-600 text-white" : "text-zinc-500 hover:bg-zinc-50"}`}
                  >
                    <span>{icon}</span>
                    <span className="text-[10px]">{label}</span>
                  </button>
                ))}
              </div>

              {/* Self-order menu (FnB saja) */}
              {isFnb && (
                <>
                  <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                    Self-Order
                  </p>
                  <div className="mb-4 space-y-1.5">
                    <button
                      onClick={() => {
                        setPosMenuOpen(false);
                        openSelfOrderMenu();
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl border border-zinc-200 px-3.5 py-3 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                    >
                      📋 Kelola Menu Self-Order
                    </button>
                  </div>
                </>
              )}

              {/* Aksi shift — dipakai selama ngasir */}
              <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Shift
              </p>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => void handleOpenVoid()}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-zinc-200 px-3.5 py-3 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                >
                  ↩️ Void Transaksi
                </button>
                {currentShiftId ? (
                  <button
                    onClick={() => {
                      setPosMenuOpen(false);
                      setClosingShift(true);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-red-200 px-3.5 py-3 text-left text-sm font-medium text-red-500 transition-colors hover:bg-red-50"
                  >
                    🔒 Tutup Shift
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setPosMenuOpen(false);
                      setOpenShiftModalOpen(true);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-brand-200 px-3.5 py-3 text-left text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50"
                  >
                    🟢 Buka Shift
                  </button>
                )}
                <SwitchCashierButton
                  className="flex w-full items-center gap-2.5 rounded-xl border border-zinc-200 px-3.5 py-3 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                  onBeforeSwitch={() => setPosMenuOpen(false)}
                />
              </div>

              {/* Lihat & Cetak — buka di tab baru */}
              <p className="mb-1.5 mt-4 px-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Lihat &amp; Cetak
              </p>
              <div className="space-y-1.5">
                <a
                  href={`/business/${businessId}/pos/reports`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setPosMenuOpen(false)}
                  className="flex items-center gap-2.5 rounded-xl border border-zinc-200 px-3.5 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                >
                  🖨️ Cetak Settlement/Menu
                </a>
                {!isNative && (
                  <a
                    href={`/business/${businessId}/reports`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setPosMenuOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl border border-zinc-200 px-3.5 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                  >
                    📊 Laporan
                  </a>
                )}
                {hasReceiptPrinters && (
                  <div className="flex items-center justify-between rounded-xl border border-zinc-200 px-3.5 py-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-700">🖨️ Cetak struk otomatis</p>
                      <p className="text-[11px] text-zinc-400">
                        {autoReceiptPrint ? "Struk dicetak setiap bayar" : "Struk tidak dicetak otomatis"}
                      </p>
                    </div>
                    <label className="relative shrink-0 cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={autoReceiptPrint}
                        onChange={(e) => setAutoReceiptPrint(e.target.checked)}
                      />
                      <div className="h-6 w-11 rounded-full bg-zinc-200 peer-checked:bg-brand-600 transition-colors" />
                      <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                    </label>
                  </div>
                )}
                <a
                  href={`/business/${businessId}/pos/printers`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setPosMenuOpen(false)}
                  className="flex items-center gap-2.5 rounded-xl border border-zinc-200 px-3.5 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                >
                  🖨️ Uji Cetak Printer
                </a>
                <p className="px-1 pt-0.5 text-[11px] text-zinc-400">
                  Dibuka di tab baru — keranjang belanja tidak hilang.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {billsOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setBillsOpen(false)}
          />
          <div className="relative flex max-h-[80vh] w-full max-w-md flex-col rounded-t-2xl bg-white sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
              <h2 className="text-sm font-bold text-zinc-900">🧾 Open Bill</h2>
              <button
                onClick={() => setBillsOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-xs text-zinc-500 hover:bg-zinc-200"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {openBills.length === 0 ? (
                <p className="py-12 text-center text-xs text-zinc-400">
                  Belum ada bon tersimpan. Isi keranjang lalu klik Simpan Bon.
                </p>
              ) : (
                openBills.map((bill) => {
                  const billAfterDisc = bill.items.reduce((sum, i) => {
                    const gross = i.price * i.qty;
                    const disc =
                      i.disc_type === "pct"
                        ? Math.round((gross * i.disc) / 100)
                        : Math.min(i.disc * i.qty, gross);
                    return sum + gross - disc;
                  }, 0);
                  const billService = Math.round((billAfterDisc * serviceRate) / 100);
                  const billTax = Math.round(
                    ((billAfterDisc + billService) * taxRate) / 100,
                  );
                  const billTotal = billAfterDisc + billService + billTax;
                  const itemCount = bill.items.reduce((s, i) => s + i.qty, 0);
                  const preview =
                    bill.items
                      .slice(0, 2)
                      .map((i) => i.name)
                      .join(", ") +
                    (bill.items.length > 2 ? ` +${bill.items.length - 2}` : "");
                  const busy = billBusyId === bill.id;
                  const isLoaded = activeBill?.id === bill.id;
                  return (
                    <div
                      key={bill.id}
                      className={`rounded-xl border-2 p-3.5 ${
                        isLoaded ? "border-brand-300 bg-brand-50" : "border-brand-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-bold text-zinc-800">
                            🧾 {bill.label}
                            {isLoaded && (
                              <span className="ml-1.5 text-[10px] font-semibold text-brand-700">
                                · sedang dimuat
                              </span>
                            )}
                          </p>
                          {bill.customer_name && (
                            <p className="text-[11px] font-medium text-brand-700">
                              👤 {bill.customer_name}
                            </p>
                          )}
                          <p className="text-[11px] text-zinc-400">
                            {new Date(bill.updated_at).toLocaleTimeString("id-ID", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}{" "}
                            · {itemCount} item
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-bold text-brand-700 tabular-nums">
                          {formatRupiah(billTotal)}
                        </p>
                      </div>
                      <p className="mt-1 truncate text-xs text-zinc-500">{preview}</p>
                      <div className="mt-2 flex justify-end gap-1.5 border-t border-zinc-100 pt-2">
                        <button
                          onClick={() => handleDeleteBill(bill)}
                          disabled={busy}
                          className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-red-500 ring-1 ring-red-200 transition-colors hover:bg-red-50 disabled:opacity-50"
                        >
                          Hapus
                        </button>
                        {hasReceiptPrinters && (
                          <button
                            onClick={() => void handlePrintBill(bill)}
                            disabled={busy || billPrintingId === bill.id}
                            className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-zinc-600 ring-1 ring-zinc-200 transition-colors hover:bg-zinc-50 disabled:opacity-50"
                          >
                            {billPrintingId === bill.id ? "Mencetak…" : "🖨️ Cetak"}
                          </button>
                        )}
                        <button
                          onClick={() => handleLoadBill(bill)}
                          disabled={busy || isLoaded}
                          className="rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                        >
                          {isLoaded ? "Dimuat" : "Muat ke Keranjang"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Panel Kelola Menu Self-Order */}
      {selfOrderMenuOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelfOrderMenuOpen(false)} />
          <div className="relative flex max-h-[80vh] w-full max-w-md flex-col rounded-t-2xl bg-white sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
              <h2 className="text-sm font-bold text-zinc-900">📋 Menu Self-Order</h2>
              <button onClick={() => setSelfOrderMenuOpen(false)} className="text-zinc-400 hover:text-zinc-700">✕</button>
            </div>
            {/* Master toggle */}
            <div className="mx-4 mt-3 flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-zinc-900">Self-order aktif</p>
                <p className="text-xs text-zinc-500">
                  {selfOrderEnabled ? "Pelanggan bisa scan QR & pesan" : "QR meja tidak bisa digunakan"}
                </p>
              </div>
              <label className="relative shrink-0 cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={selfOrderEnabled}
                  onChange={(e) => void handleSelfOrderEnabled(e.target.checked)}
                />
                <div className="h-6 w-11 rounded-full bg-zinc-200 peer-checked:bg-brand-600 transition-colors" />
                <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
              </label>
            </div>
            <p className="px-5 pt-3 text-xs text-zinc-500">
              Centang produk yang boleh dipesan pelanggan lewat QR meja.
            </p>
            <div className="flex-1 overflow-y-auto p-4">
              {(() => {
                const categories = Array.from(new Set(selfOrderProducts.map((p) => p.category ?? "Lainnya")));
                return categories.map((cat) => (
                  <div key={cat} className="mb-4">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{cat}</p>
                    <div className="space-y-1">
                      {selfOrderProducts
                        .filter((p) => (p.category ?? "Lainnya") === cat)
                        .map((p) => (
                          <label
                            key={p.id}
                            className="flex cursor-pointer items-center justify-between rounded-xl border border-zinc-200 px-4 py-2.5 transition-colors hover:bg-zinc-50"
                          >
                            <span className={`text-sm ${p.show ? "text-zinc-900" : "text-zinc-400"}`}>{p.name}</span>
                            <div className="relative ml-3 shrink-0">
                              <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={p.show}
                                onChange={(e) => void handleSelfOrderToggle(p.id, e.target.checked)}
                              />
                              <div className="h-5 w-9 rounded-full bg-zinc-200 peer-checked:bg-brand-600 transition-colors" />
                              <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                            </div>
                          </label>
                        ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Self-order inbox */}
      {inboxOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setInboxOpen(false)}
          />
          <div className="relative flex max-h-[80vh] w-full max-w-md flex-col rounded-t-2xl bg-white sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
              <h2 className="text-sm font-bold text-zinc-900">🛎️ Order Masuk</h2>
              <button
                onClick={() => setInboxOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-xs text-zinc-500 hover:bg-zinc-200"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {selfOrders.length === 0 ? (
                <p className="py-12 text-center text-xs text-zinc-400">
                  Belum ada order dari meja.
                </p>
              ) : (() => {
                // Group by table
                const tableGroups: { tableName: string; orders: typeof selfOrders }[] = [];
                for (const o of selfOrders) {
                  const g = tableGroups.find((g) => g.tableName === o.tableName);
                  if (g) g.orders.push(o);
                  else tableGroups.push({ tableName: o.tableName, orders: [o] });
                }
                return tableGroups.map(({ tableName, orders: tableOrders }) => {
                  const tableTotal = tableOrders.reduce(
                    (sum, o) => sum + o.items.reduce((s, i) => s + i.price * i.qty, 0), 0,
                  );
                  const hasNew = tableOrders.some((o) => o.status === "baru");
                  const busyTable = tableOrders.some((o) => orderBusyId === o.id);
                  return (
                    <div key={tableName} className="rounded-xl border-2 border-zinc-200 overflow-hidden">
                      {/* Header meja */}
                      <div className={`flex items-center justify-between px-3.5 py-2.5 ${hasNew ? "bg-amber-50" : "bg-sky-50"}`}>
                        <div>
                          <p className="text-sm font-bold text-zinc-900">🪑 {tableName}</p>
                          <p className="text-[11px] text-zinc-500">
                            {tableOrders.length} pesanan · Total {formatRupiah(tableTotal)}
                          </p>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleAddAllAndSave(tableName)}
                            disabled={busyTable}
                            className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50"
                          >
                            💾 Simpan
                          </button>
                          <button
                            onClick={() => handleAddAllAndPay(tableName)}
                            disabled={busyTable}
                            className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                          >
                            💳 Bayar Semua
                          </button>
                        </div>
                      </div>

                      {/* Daftar order per meja */}
                      <div className="divide-y divide-zinc-100">
                        {tableOrders.map((o) => {
                          const orderTotal = o.items.reduce((sum, i) => sum + i.price * i.qty, 0);
                          const busy = orderBusyId === o.id;
                          const isNew = o.status === "baru";
                          return (
                            <div key={o.id} className="px-3.5 py-2.5">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] text-zinc-400">
                                  Masuk {new Date(o.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isNew ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"}`}>
                                  {isNew ? "Baru" : "Diproses"}
                                </span>
                              </div>
                              {o.customerName && (
                                <div className="mb-1.5 flex items-center gap-2 text-[11px] text-zinc-500">
                                  <span>👤 {o.customerName}</span>
                                  {o.customerPhone && <span>· {o.customerPhone}</span>}
                                  {o.paymentMethod === "kasir" && (
                                    <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">💵 Kasir</span>
                                  )}
                                </div>
                              )}
                              <div className="space-y-0.5">
                                {o.items.map((item, idx) => (
                                  <div key={idx} className="text-xs text-zinc-700">
                                    <div className="flex justify-between">
                                      <span><span className="font-bold">{item.qty}×</span> {item.name}</span>
                                      <span className="tabular-nums text-zinc-500">{formatRupiah(item.price * item.qty)}</span>
                                    </div>
                                    {item.note && (
                                      <p className="pl-4 text-[11px] font-medium text-amber-600">📝 {item.note}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                              <div className="mt-2 flex items-center justify-between">
                                <p className="text-xs font-semibold text-zinc-700 tabular-nums">{formatRupiah(orderTotal)}</p>
                                <div className="flex gap-1.5">
                                  {isNew ? (
                                    <>
                                      <button
                                        onClick={() => handleOrderStatus(o.id, "diproses")}
                                        disabled={busy}
                                        className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50 disabled:opacity-50"
                                      >
                                        ✓ Proses
                                      </button>
                                      <button
                                        onClick={() => handleAddAndPay(o)}
                                        disabled={busy}
                                        className="rounded-lg bg-brand-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-brand-700 disabled:opacity-50"
                                      >
                                        💳 Bayar
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        onClick={() => handleAddAndSave(o)}
                                        disabled={busy}
                                        className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50 disabled:opacity-50"
                                      >
                                        💾 Simpan
                                      </button>
                                      <button
                                        onClick={() => handleAddAndPay(o)}
                                        disabled={busy}
                                        className="rounded-lg bg-brand-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-brand-700 disabled:opacity-50"
                                      >
                                        💳 Bayar
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Void Transaksi */}
      {voidOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => { if (!voidSubmitting) setVoidOpen(false); }}
          />
          <div className="relative flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-white sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
              <h2 className="text-sm font-bold text-zinc-900">↩️ Void Transaksi</h2>
              <button
                type="button"
                onClick={() => setVoidOpen(false)}
                disabled={voidSubmitting}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-xs text-zinc-500 hover:bg-zinc-200 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {voidSuccess ? (
                <div className="p-6 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-2xl">
                    ✅
                  </div>
                  <p className="text-sm font-semibold text-zinc-900">{voidSuccess}</p>
                  <p className="mt-1 text-xs text-zinc-400">Stok produk sudah dikembalikan.</p>
                  <button
                    type="button"
                    onClick={() => setVoidOpen(false)}
                    className="mt-4 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    Selesai
                  </button>
                </div>
              ) : (
                <>
                  <div className="p-4">
                    <p className="mb-3 text-xs text-zinc-500">
                      Pilih transaksi dari shift ini. Membutuhkan PIN manajer. Stok akan dikembalikan otomatis.
                    </p>
                    {voidLoading ? (
                      <p className="py-8 text-center text-sm text-zinc-400">Memuat transaksi…</p>
                    ) : voidTxs.length === 0 ? (
                      <p className="py-8 text-center text-sm text-zinc-400">
                        Belum ada transaksi di shift ini.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {voidTxs.map((tx) => {
                          const isSelected = voidSelectedTx?.id === tx.id;
                          const itemLabel =
                            tx.items
                              .slice(0, 2)
                              .map((i) => `${i.name} ×${i.qty}`)
                              .join(", ") +
                            (tx.items.length > 2 ? `, +${tx.items.length - 2} lagi` : "");
                          return (
                            <button
                              key={tx.id}
                              type="button"
                              onClick={() => setVoidSelectedTx(isSelected ? null : tx)}
                              className={`w-full rounded-xl border p-3 text-left transition-colors ${
                                isSelected
                                  ? "border-red-300 bg-red-50"
                                  : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span
                                  className={`text-sm font-bold ${isSelected ? "text-red-700" : "text-zinc-900"}`}
                                >
                                  {tx.invoice_number}
                                </span>
                                <span
                                  className={`text-sm font-semibold ${isSelected ? "text-red-600" : "text-zinc-700"}`}
                                >
                                  {formatRupiah(tx.total)}
                                </span>
                              </div>
                              <div className="mt-0.5 flex items-center justify-between">
                                <span className="text-xs text-zinc-400">
                                  {new Date(tx.created_at).toLocaleTimeString("id-ID", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                                <span className="ml-2 truncate text-right text-xs text-zinc-500">
                                  {itemLabel}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {voidSelectedTx && (
                    <div className="space-y-3 border-t border-zinc-100 p-4">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-zinc-600">
                          PIN Manajer <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="password"
                          inputMode="numeric"
                          placeholder="Masukkan PIN manajer"
                          value={voidPin}
                          onChange={(e) =>
                            setVoidPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                          }
                          disabled={voidSubmitting}
                          className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm text-zinc-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-zinc-600">
                          Alasan (opsional)
                        </label>
                        <input
                          type="text"
                          placeholder="mis. salah input, pelanggan cancel…"
                          value={voidReason}
                          onChange={(e) => setVoidReason(e.target.value)}
                          disabled={voidSubmitting}
                          className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm text-zinc-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                        />
                      </div>
                      {voidError && (
                        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                          {voidError}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleVoidConfirm()}
                        disabled={!voidPin || voidSubmitting}
                        className="w-full rounded-xl bg-red-600 py-3 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                      >
                        {voidSubmitting
                          ? "Memproses…"
                          : `Void ${voidSelectedTx.invoice_number}`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Buka Shift */}
      {openShiftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => { if (!openShiftSubmitting) setOpenShiftModalOpen(false); }}
          />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600">
                <span className="text-lg font-bold text-white">🟢</span>
              </div>
              <h2 className="text-lg font-bold text-zinc-900">Buka Shift</h2>
              <p className="mt-1 text-sm text-zinc-500">
                {cashierName} — {businessName}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Catat modal awal di laci sebelum mulai jualan.
              </p>
            </div>

            <form onSubmit={(e) => void handleOpenShiftSubmit(e)} className="space-y-4">
              <div>
                <label htmlFor="openingCashModal" className="mb-1 block text-xs font-medium text-zinc-600">
                  Modal Awal (Rp)
                </label>
                <input
                  id="openingCashModal"
                  type="number"
                  min="0"
                  value={openingCashInput}
                  onChange={(e) => setOpeningCashInput(e.target.value)}
                  required
                  autoFocus
                  className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  placeholder="mis. 300000"
                />
              </div>
              <div>
                <label htmlFor="openShiftNotesModal" className="mb-1 block text-xs font-medium text-zinc-600">
                  Catatan (opsional)
                </label>
                <input
                  id="openShiftNotesModal"
                  type="text"
                  value={openShiftNotes}
                  onChange={(e) => setOpenShiftNotes(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  placeholder="mis. Shift pagi"
                />
              </div>

              {openShiftError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{openShiftError}</p>
              )}

              <button
                type="submit"
                disabled={openShiftSubmitting}
                className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {openShiftSubmitting ? "Memproses…" : "Mulai Shift"}
              </button>
              <button
                type="button"
                onClick={() => setOpenShiftModalOpen(false)}
                disabled={openShiftSubmitting}
                className="w-full py-1 text-center text-xs font-medium text-zinc-400 hover:text-zinc-600"
              >
                Nanti dulu
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
