// Minimal ESC/POS command builder for thermal kitchen-ticket printing.
// Text is sent as latin1 bytes (matches the default CP437-ish codepage on
// most cheap 58/80mm thermal printers for the plain-ASCII characters we use).

const ESC = 0x1b;
const GS = 0x1d;

// 58mm → 26 cols, 80mm → 42 cols (Font A)
// iWare dan sejenisnya maksimum 28 cols sebelum terpotong; pakai 26 supaya
// ada margin 2 char dan padLine tidak wrap di tepi printer.
function colsForPaper(paperWidth: number) {
  return paperWidth >= 80 ? 42 : 26;
}

export type KitchenTicketItem = {
  name: string;
  qty: number;
  note?: string | null;
};

export type KitchenTicketInput = {
  station: string;
  source: string;
  label: string;
  title?: string; // header besar: "NEW ORDER" / "ADDITIONAL ORDER" / "TES CETAK"
  paperWidth?: number;
  items: KitchenTicketItem[];
  cashierName?: string;
  orderType?: string;
  customerName?: string | null;
  orderLabel?: string | null;
};

function formatQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2);
}

export function buildKitchenTicket(input: KitchenTicketInput): Buffer {
  const W = colsForPaper(input.paperWidth ?? 58);
  const chunks: Buffer[] = [];
  const push = (bytes: number[]) => chunks.push(Buffer.from(bytes));
  const text = (s: string) => chunks.push(Buffer.from(`${s}\n`, "latin1"));

  function col2(left: string, right: string): string {
    const space = Math.max(W - left.length - right.length, 1);
    return left + " ".repeat(space) + right;
  }

  push([ESC, 0x40]); // initialize

  // Judul besar — double height, bold, centered
  push([ESC, 0x61, 0x01]); // center
  push([GS, 0x21, 0x10]); // double height only (not width)
  push([ESC, 0x45, 0x01]); // bold
  text(input.title ?? "NEW ORDER");
  push([ESC, 0x45, 0x00]); // bold off
  push([GS, 0x21, 0x00]); // normal size

  // Nama stasiun (BAR / DAPUR / dll) — bold, centered
  push([ESC, 0x45, 0x01]);
  text(input.station.toUpperCase());
  push([ESC, 0x45, 0x00]);
  push([ESC, 0x61, 0x00]); // left align

  // Header info — 2 kolom seperti format Moka
  text("-".repeat(W));
  const now = new Date();
  const dateStr = now.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const tableLabel = input.orderLabel || input.label;
  text(col2(input.source, tableLabel));
  text(col2(dateStr, timeStr));
  if (input.cashierName) text(`Kasir ${input.cashierName}`);
  if (input.customerName) text(`Pelanggan: ${truncate(input.customerName, W - 11)}`);

  // Separator + tipe order
  text("-".repeat(W));
  if (input.orderType) {
    push([ESC, 0x61, 0x01]); // center
    text(input.orderType);
    push([ESC, 0x61, 0x00]); // left
  }
  text("-".repeat(W));

  // Daftar item — qty "x  Nama" bold, catatan indented di bawahnya
  for (const item of input.items) {
    push([ESC, 0x45, 0x01]); // bold on
    text(`${formatQty(item.qty)} x  ${item.name}`);
    push([ESC, 0x45, 0x00]); // bold off
    if (item.note) {
      text(`      ${item.note}`);
    }
  }

  text("");
  text("");
  push([GS, 0x56, 0x42, 0x00]); // partial cut with feed

  return Buffer.concat(chunks);
}

// 32 columns = Font A on 58mm thermal printers
const RECEIPT_WIDTH = 32;

function padLine(left: string, right: string, width = RECEIPT_WIDTH): string {
  const space = Math.max(width - left.length - right.length, 1);
  return left + " ".repeat(space) + right;
}

function truncate(s: string, width = RECEIPT_WIDTH): string {
  return s.length > width ? s.slice(0, width) : s;
}

export type ReceiptItem = {
  name: string;
  qty: number;
  price: number;
  note?: string | null;
  voided?: boolean;
};

export type ReceiptSettings = {
  show_logo?: boolean;
  logo_url?: string;
  show_address?: boolean;
  show_phone?: boolean;
  show_invoice?: boolean;
  show_datetime?: boolean;
  show_cashier?: boolean;
  show_item_note?: boolean;
  show_unit_price?: boolean;
  show_item_disc?: boolean;
  show_service?: boolean;
  show_tax?: boolean;
  show_payment_detail?: boolean;
  show_order_label?: boolean;
  show_customer_name?: boolean;
  footer_text?: string;
  font_large?: boolean; // GS ! 0x10 — double-height, karakter 2× lebih tinggi, cocok untuk 80mm
};

export type ReceiptPayment = {
  method: string;
  amount: number;
  received: number | null;
  change: number | null;
};

export type ReceiptTicketInput = {
  businessName: string;
  businessAddress?: string | null;
  businessPhone?: string | null;
  invoiceNumber: string;
  date: string;
  cashierName: string;
  customerName?: string | null;
  orderLabel?: string | null;
  voided: boolean;
  preCheck?: boolean;
  items: ReceiptItem[];
  subtotal: number;
  itemDiscount: number;
  orderDiscount: number;
  orderDiscountName?: string | null;
  service: number;
  tax: number;
  total: number;
  payments: ReceiptPayment[];
  settings?: ReceiptSettings;
  paperWidth?: number;
};

function formatRp(value: number): string {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

// Full priced customer receipt (struk kasir) — distinct from
// buildKitchenTicket, which deliberately omits prices for the kitchen/bar
// copy. Sent through the same native LAN/Bluetooth plugin as kitchen
// tickets, since Android's OS-level print framework generally can't drive
// cheap ESC/POS thermal printers (see dispatch-print-jobs.ts).
export function buildReceiptTicket(input: ReceiptTicketInput): Buffer {
  const W = colsForPaper(input.paperWidth ?? 58);
  const s = input.settings ?? {};
  const cfg = {
    showAddress: s.show_address ?? false,
    showPhone: s.show_phone ?? false,
    showInvoice: s.show_invoice ?? true,
    showDatetime: s.show_datetime ?? true,
    showCashier: s.show_cashier ?? true,
    showItemNote: s.show_item_note ?? true,
    showUnitPrice: s.show_unit_price ?? true,
    showItemDisc: s.show_item_disc ?? true,
    showService: s.show_service ?? true,
    showTax: s.show_tax ?? true,
    showPaymentDetail: s.show_payment_detail ?? true,
    showOrderLabel: s.show_order_label ?? true,
    showCustomerName: s.show_customer_name ?? true,
    footerText: s.footer_text ?? "Terima kasih!",
    fontLarge: s.font_large ?? false,
  };

  const chunks: Buffer[] = [];
  const push = (bytes: number[]) => chunks.push(Buffer.from(bytes));
  const text = (str: string) => chunks.push(Buffer.from(`${str}\n`, "latin1"));
  const divider = () => text("-".repeat(W));
  const pl = (left: string, right: string) => padLine(left, right, W);
  const tr = (str: string, w = W) => truncate(str, w);

  push([ESC, 0x40]); // initialize
  if (cfg.fontLarge) push([GS, 0x21, 0x10]); // double-height seluruh struk

  // Header — nama bisnis bold centered, tanpa perubahan ukuran karakter
  push([ESC, 0x61, 0x01]); // center align
  push([ESC, 0x45, 0x01]); // bold
  text(tr(input.businessName.toUpperCase()));
  push([ESC, 0x45, 0x00]);
  if (cfg.showAddress && input.businessAddress) text(tr(input.businessAddress));
  if (cfg.showPhone && input.businessPhone) text(`Tel: ${input.businessPhone}`);
  if (input.voided) {
    push([ESC, 0x45, 0x01]);
    text("*** DIBATALKAN ***");
    push([ESC, 0x45, 0x00]);
  }
  if (input.preCheck) {
    push([ESC, 0x45, 0x01]);
    text("*** BELUM DIBAYAR ***");
    push([ESC, 0x45, 0x00]);
  }
  push([ESC, 0x61, 0x00]); // left align

  divider();
  if (cfg.showInvoice) text(pl("No.", input.invoiceNumber));
  if (cfg.showDatetime) {
    const sepIdx = input.date.lastIndexOf(", ");
    if (sepIdx !== -1) {
      text(pl("Tanggal", input.date.slice(0, sepIdx)));
      text(pl("Jam", input.date.slice(sepIdx + 2)));
    } else {
      text(pl("Tanggal", input.date));
    }
  }
  if (cfg.showCashier && input.cashierName) text(pl("Kasir", input.cashierName));
  if (cfg.showOrderLabel && input.orderLabel) text(pl("Meja/Order", tr(input.orderLabel, W - 11)));
  if (cfg.showCustomerName && input.customerName) text(pl("Pelanggan", tr(input.customerName, W - 10)));

  divider();
  for (const item of input.items) {
    push([ESC, 0x45, 0x01]); // bold
    text(tr(item.voided ? `[VOID] ${item.name}` : item.name));
    push([ESC, 0x45, 0x00]);
    const lineTotal = formatRp(item.price * item.qty);
    if (item.voided) {
      if (cfg.showUnitPrice) {
        text(pl(`  ${formatQty(item.qty)}x${formatRp(item.price)}`, `(${lineTotal})`));
      } else {
        text(pl(`  ${formatQty(item.qty)}x`, `(${lineTotal})`));
      }
    } else {
      if (cfg.showUnitPrice) {
        text(pl(`  ${formatQty(item.qty)}x${formatRp(item.price)}`, lineTotal));
      } else {
        text(pl(`  ${formatQty(item.qty)}x`, lineTotal));
      }
    }
    if (cfg.showItemNote && item.note) text(`  * ${tr(item.note, W - 4)}`);
  }

  divider();
  text(pl("Subtotal", formatRp(input.subtotal)));
  const voidedItemsTotal = input.items.filter((i) => i.voided).reduce((s, i) => s + i.price * i.qty, 0);
  if (voidedItemsTotal > 0) text(pl("Dikurangi (void)", `-${formatRp(voidedItemsTotal)}`));
  if (cfg.showItemDisc && input.itemDiscount > 0) text(pl("Diskon item", `-${formatRp(input.itemDiscount)}`));
  if (input.orderDiscount > 0) text(pl(input.orderDiscountName ?? "Diskon order", `-${formatRp(input.orderDiscount)}`));
  if (cfg.showService && input.service > 0) text(pl("Layanan", formatRp(input.service)));
  // Void items reduce the taxable base proportionally. Derive the tax rate from
  // the original figures so we don't need to pass taxRate as a separate field.
  const taxableBase = input.subtotal - input.itemDiscount - input.orderDiscount + input.service;
  const voidedTax = input.tax > 0 && taxableBase > 0
    ? Math.round(voidedItemsTotal / taxableBase * input.tax)
    : 0;
  const adjustedTax = input.tax - voidedTax;
  if (cfg.showTax && adjustedTax > 0) text(pl("PPN", formatRp(adjustedTax)));
  push([ESC, 0x45, 0x01]); // bold
  text(pl("TOTAL", formatRp(input.total - voidedItemsTotal - voidedTax)));
  push([ESC, 0x45, 0x00]);

  if (cfg.showPaymentDetail) {
    divider();
    for (const p of input.payments) {
      text(pl(p.method, formatRp(p.amount)));
      if (p.received !== null) text(pl("Diterima", formatRp(p.received)));
      if (p.change !== null && p.change > 0) text(pl("Kembalian", formatRp(p.change)));
    }
  }

  push([ESC, 0x61, 0x01]); // center align
  text("");
  text(cfg.footerText || "Terima kasih!");
  text("");
  text("");
  text("");
  text("");
  push([GS, 0x56, 0x42, 0x05]); // partial cut — feed 5 lines dulu supaya footer tidak terpotong

  return Buffer.concat(chunks);
}

export type SettlementByMethod = { method: string; amount: number };

export type SettlementTicketInput = {
  businessName: string;
  periodLabel: string;
  byMethod: SettlementByMethod[];
  totalSales: number;
  txCount: number;
  voidCount: number;
};

// Ringkasan penjualan per metode bayar (Tunai/QRIS/EDC/dst) — dicetak dari
// Halaman Laporan atau langsung setelah tutup shift. Beda dari
// buildReceiptTicket: ini rekap banyak transaksi dalam satu rentang
// tanggal, bukan satu struk.
export function buildSettlementTicket(input: SettlementTicketInput): Buffer {
  const chunks: Buffer[] = [];
  const push = (bytes: number[]) => chunks.push(Buffer.from(bytes));
  const text = (s: string) => chunks.push(Buffer.from(`${s}\n`, "latin1"));
  const divider = () => text("-".repeat(RECEIPT_WIDTH));

  push([ESC, 0x40]); // initialize

  push([ESC, 0x61, 0x01]); // center align
  text(input.businessName.toUpperCase());
  text("LAPORAN SETTLEMENT");
  push([ESC, 0x61, 0x00]); // left align

  divider();
  text(padLine("Periode", input.periodLabel));
  text(padLine("Dicetak", new Date().toLocaleString("id-ID")));

  divider();
  if (input.byMethod.length === 0) {
    text("Tidak ada transaksi.");
  } else {
    for (const m of input.byMethod) {
      text(padLine(m.method, formatRp(m.amount)));
    }
  }
  push([ESC, 0x45, 0x01]);
  text(padLine("TOTAL", formatRp(input.totalSales)));
  push([ESC, 0x45, 0x00]);

  divider();
  text(padLine("Jumlah Transaksi", String(input.txCount)));
  if (input.voidCount > 0) text(padLine("Dibatalkan", String(input.voidCount)));

  text("");
  text("");
  push([GS, 0x56, 0x42, 0x00]); // partial cut with feed

  return Buffer.concat(chunks);
}

export type MenuSalesItem = { name: string; qty: number; amount: number };

export type MenuSalesTicketInput = {
  businessName: string;
  periodLabel: string;
  items: MenuSalesItem[];
  totalQty: number;
  totalAmount: number;
};

// Rekap menu terjual (nama/qty/omzet) untuk rentang tanggal — urutan sudah
// diasumsikan sesuai keinginan pemanggil (mis. by omzet desc, sama seperti
// "Menu Terlaris" di Halaman Laporan).
export function buildMenuSalesTicket(input: MenuSalesTicketInput): Buffer {
  const chunks: Buffer[] = [];
  const push = (bytes: number[]) => chunks.push(Buffer.from(bytes));
  const text = (s: string) => chunks.push(Buffer.from(`${s}\n`, "latin1"));
  const divider = () => text("-".repeat(RECEIPT_WIDTH));

  push([ESC, 0x40]); // initialize

  push([ESC, 0x61, 0x01]); // center align
  text(input.businessName.toUpperCase());
  text("LAPORAN PENJUALAN MENU");
  push([ESC, 0x61, 0x00]); // left align

  divider();
  text(padLine("Periode", input.periodLabel));
  text(padLine("Dicetak", new Date().toLocaleString("id-ID")));

  divider();
  if (input.items.length === 0) {
    text("Tidak ada transaksi.");
  } else {
    for (const item of input.items) {
      text(truncate(item.name));
      text(padLine(`  ${formatQty(item.qty)}x`, formatRp(item.amount)));
    }
  }

  divider();
  text(padLine("Total Qty", formatQty(input.totalQty)));
  push([ESC, 0x45, 0x01]);
  text(padLine("TOTAL", formatRp(input.totalAmount)));
  push([ESC, 0x45, 0x00]);

  text("");
  text("");
  push([GS, 0x56, 0x42, 0x00]); // partial cut with feed

  return Buffer.concat(chunks);
}
