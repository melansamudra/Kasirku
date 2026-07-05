export type DiscountType = "pct" | "amt";

export type CheckoutLineItem = {
  price: number;
  qty: number;
  disc: number;
  discType: DiscountType;
};

export function itemDiscAmount(item: CheckoutLineItem): number {
  const lineGross = item.price * item.qty;
  return item.discType === "pct"
    ? Math.round((lineGross * item.disc) / 100)
    : Math.min(item.disc * item.qty, lineGross);
}

export type CheckoutTotals = {
  subtotalRaw: number;
  totalItemDisc: number;
  afterItemDisc: number;
  orderDiscAmt: number;
  subtotal: number;
  serviceAmt: number;
  taxAmt: number;
  total: number;
};

// Urutan hitung mengikuti aplikasi lama: diskon item -> diskon order -> layanan
// dari subtotal -> PPN dari (subtotal + layanan). Server RPC menghitung ulang
// angka final secara independen; ini dipakai untuk tampilan kasir.
export function calculateCheckoutTotals(params: {
  items: CheckoutLineItem[];
  orderDisc: number;
  orderDiscType: DiscountType;
  serviceRate: number;
  taxRate: number;
}): CheckoutTotals {
  const { items, orderDisc, orderDiscType, serviceRate, taxRate } = params;

  const subtotalRaw = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const totalItemDisc = items.reduce((sum, item) => sum + itemDiscAmount(item), 0);
  const afterItemDisc = subtotalRaw - totalItemDisc;
  const orderDiscAmt =
    orderDiscType === "pct"
      ? Math.round((afterItemDisc * orderDisc) / 100)
      : Math.min(orderDisc, afterItemDisc);
  const subtotal = afterItemDisc - orderDiscAmt;
  const serviceAmt = Math.round((subtotal * serviceRate) / 100);
  const taxAmt = Math.round(((subtotal + serviceAmt) * taxRate) / 100);
  const total = subtotal + serviceAmt + taxAmt;

  return {
    subtotalRaw,
    totalItemDisc,
    afterItemDisc,
    orderDiscAmt,
    subtotal,
    serviceAmt,
    taxAmt,
    total,
  };
}
