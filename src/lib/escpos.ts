// Minimal ESC/POS command builder for thermal kitchen-ticket printing.
// Text is sent as latin1 bytes (matches the default CP437-ish codepage on
// most cheap 58/80mm thermal printers for the plain-ASCII characters we use).

const ESC = 0x1b;
const GS = 0x1d;

export type KitchenTicketItem = {
  name: string;
  qty: number;
  note?: string | null;
};

export type KitchenTicketInput = {
  station: string;
  source: string;
  label: string;
  items: KitchenTicketItem[];
};

function formatQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2);
}

export function buildKitchenTicket(input: KitchenTicketInput): Buffer {
  const chunks: Buffer[] = [];
  const push = (bytes: number[]) => chunks.push(Buffer.from(bytes));
  const text = (s: string) => chunks.push(Buffer.from(`${s}\n`, "latin1"));

  push([ESC, 0x40]); // initialize

  push([ESC, 0x61, 0x01]); // center align
  push([GS, 0x21, 0x11]); // double width + height
  text(input.station.toUpperCase());
  push([GS, 0x21, 0x00]); // back to normal size

  push([ESC, 0x61, 0x00]); // left align
  text(`${input.source} - ${input.label}`);
  text(new Date().toLocaleString("id-ID"));
  text("--------------------------------");

  for (const item of input.items) {
    push([ESC, 0x45, 0x01]); // bold on
    text(`${formatQty(item.qty)}x ${item.name}`);
    push([ESC, 0x45, 0x00]); // bold off
    if (item.note) {
      text(`   Catatan: ${item.note}`);
    }
  }

  text("");
  text("");
  push([GS, 0x56, 0x42, 0x00]); // partial cut with feed

  return Buffer.concat(chunks);
}

// 32 columns matches Font A on the 58mm thermal printers this app targets
// (RPP02N and similar) — used to right-align prices/totals in plain text
// since ESC/POS has no flex layout.
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
};

export type ReceiptPayment = {
  method: string;
  amount: number;
  received: number | null;
  change: number | null;
};

export type ReceiptTicketInput = {
  businessName: string;
  invoiceNumber: string;
  date: string;
  cashierName: string;
  voided: boolean;
  items: ReceiptItem[];
  subtotal: number;
  itemDiscount: number;
  orderDiscount: number;
  service: number;
  tax: number;
  total: number;
  payments: ReceiptPayment[];
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
  const chunks: Buffer[] = [];
  const push = (bytes: number[]) => chunks.push(Buffer.from(bytes));
  const text = (s: string) => chunks.push(Buffer.from(`${s}\n`, "latin1"));
  const divider = () => text("-".repeat(RECEIPT_WIDTH));

  push([ESC, 0x40]); // initialize

  push([ESC, 0x61, 0x01]); // center align
  text(input.businessName.toUpperCase());
  if (input.voided) {
    push([ESC, 0x45, 0x01]);
    text("*** DIBATALKAN ***");
    push([ESC, 0x45, 0x00]);
  }
  push([ESC, 0x61, 0x00]); // left align

  divider();
  text(padLine("No.", input.invoiceNumber));
  text(padLine("Tanggal", input.date));
  text(padLine("Kasir", input.cashierName));

  divider();
  for (const item of input.items) {
    text(truncate(item.name));
    text(padLine(`  ${formatQty(item.qty)}x${formatRp(item.price)}`, formatRp(item.price * item.qty)));
  }

  divider();
  text(padLine("Subtotal", formatRp(input.subtotal)));
  if (input.itemDiscount > 0) text(padLine("Diskon item", `-${formatRp(input.itemDiscount)}`));
  if (input.orderDiscount > 0) text(padLine("Diskon order", `-${formatRp(input.orderDiscount)}`));
  if (input.service > 0) text(padLine("Layanan", formatRp(input.service)));
  if (input.tax > 0) text(padLine("PPN", formatRp(input.tax)));
  push([ESC, 0x45, 0x01]);
  text(padLine("TOTAL", formatRp(input.total)));
  push([ESC, 0x45, 0x00]);

  divider();
  for (const p of input.payments) {
    text(padLine(p.method, formatRp(p.amount)));
    if (p.received !== null) text(padLine("Diterima", formatRp(p.received)));
    if (p.change !== null && p.change > 0) text(padLine("Kembalian", formatRp(p.change)));
  }

  push([ESC, 0x61, 0x01]); // center align
  text("");
  text("Terima kasih!");
  text("");
  text("");
  push([GS, 0x56, 0x42, 0x00]); // partial cut with feed

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
