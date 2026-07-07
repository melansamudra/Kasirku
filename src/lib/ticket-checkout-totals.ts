export type TicketCategoryPricing = {
  priceWeekday: number;
  priceHoliday: number;
  memberPrice: number;
};

// Member price selalu menang, tidak peduli hari libur atau bukan — sama
// seperti checkout_ticket_transaction di database (lihat migration
// 20260706200000_ticket_venue.sql).
export function ticketUnitPrice(
  category: TicketCategoryPricing,
  opts: { isMember: boolean; isHoliday: boolean },
): number {
  if (opts.isMember) return category.memberPrice;
  return opts.isHoliday ? category.priceHoliday : category.priceWeekday;
}

export type TicketCartLine = {
  unitPrice: number;
  qty: number;
};

export type TicketTotals = {
  subtotal: number;
  serviceAmt: number;
  taxAmt: number;
  total: number;
};

export function calculateTicketTotals(params: {
  lines: TicketCartLine[];
  serviceRate: number;
  taxRate: number;
}): TicketTotals {
  const { lines, serviceRate, taxRate } = params;

  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
  const serviceAmt = serviceRate > 0 ? Math.round((subtotal * serviceRate) / 100) : 0;
  const taxAmt = taxRate > 0 ? Math.round(((subtotal + serviceAmt) * taxRate) / 100) : 0;
  const total = subtotal + serviceAmt + taxAmt;

  return { subtotal, serviceAmt, taxAmt, total };
}
