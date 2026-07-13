export type TicketCategoryPricing = {
  priceWeekday: number;
  priceHoliday: number;
  memberPrice: number;
  groupMinQty: number;
  groupPrice: number | null;
};

// Precedence mirrors checkout_ticket_transaction in the database (see
// migration 20260712160000_ticket_group_pricing.sql): member price always
// wins; otherwise, once qty in this category reaches groupMinQty, every
// ticket in that category for this cart gets groupPrice; otherwise
// weekday/holiday as usual.
export function ticketUnitPrice(
  category: TicketCategoryPricing,
  opts: { isMember: boolean; isHoliday: boolean; qty: number },
): number {
  if (opts.isMember) return category.memberPrice;
  if (category.groupMinQty > 0 && category.groupPrice != null && opts.qty >= category.groupMinQty) {
    return category.groupPrice;
  }
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
