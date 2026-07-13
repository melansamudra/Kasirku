import { describe, expect, it } from "vitest";
import { calculateTicketTotals, ticketUnitPrice } from "./ticket-checkout-totals";

const category = {
  priceWeekday: 25000,
  priceHoliday: 35000,
  memberPrice: 0,
  groupMinQty: 0,
  groupPrice: null,
};

const categoryWithGroup = { ...category, groupMinQty: 10, groupPrice: 20000 };

describe("ticketUnitPrice", () => {
  it("uses the weekday price on a regular day", () => {
    expect(ticketUnitPrice(category, { isMember: false, isHoliday: false, qty: 1 })).toBe(25000);
  });

  it("uses the holiday price on a holiday", () => {
    expect(ticketUnitPrice(category, { isMember: false, isHoliday: true, qty: 1 })).toBe(35000);
  });

  it("uses the member price regardless of holiday", () => {
    expect(ticketUnitPrice(category, { isMember: true, isHoliday: false, qty: 1 })).toBe(0);
    expect(ticketUnitPrice(category, { isMember: true, isHoliday: true, qty: 1 })).toBe(0);
  });

  it("ignores group pricing when qty is below the threshold", () => {
    expect(
      ticketUnitPrice(categoryWithGroup, { isMember: false, isHoliday: false, qty: 9 }),
    ).toBe(25000);
  });

  it("uses the group price once qty reaches the threshold", () => {
    expect(
      ticketUnitPrice(categoryWithGroup, { isMember: false, isHoliday: true, qty: 10 }),
    ).toBe(20000);
  });

  it("prefers member price over group price even if qty qualifies", () => {
    expect(
      ticketUnitPrice(categoryWithGroup, { isMember: true, isHoliday: false, qty: 10 }),
    ).toBe(0);
  });
});

describe("calculateTicketTotals", () => {
  it("sums unit price times qty across lines, then service, then tax", () => {
    // 2x 25000 + 1x 10000 = 60000, 5% service = 3000 -> 63000, 10% tax = 6300
    const totals = calculateTicketTotals({
      lines: [
        { unitPrice: 25000, qty: 2 },
        { unitPrice: 10000, qty: 1 },
      ],
      serviceRate: 5,
      taxRate: 10,
    });

    expect(totals.subtotal).toBe(60000);
    expect(totals.serviceAmt).toBe(3000);
    expect(totals.taxAmt).toBe(6300);
    expect(totals.total).toBe(69300);
  });

  it("returns zero totals for an empty cart", () => {
    const totals = calculateTicketTotals({ lines: [], serviceRate: 5, taxRate: 10 });

    expect(totals.subtotal).toBe(0);
    expect(totals.total).toBe(0);
  });

  it("skips service and tax when both rates are disabled", () => {
    const totals = calculateTicketTotals({
      lines: [{ unitPrice: 25000, qty: 1 }],
      serviceRate: 0,
      taxRate: 0,
    });

    expect(totals.serviceAmt).toBe(0);
    expect(totals.taxAmt).toBe(0);
    expect(totals.total).toBe(25000);
  });

  it("computes tax on subtotal plus service, not subtotal alone", () => {
    const totals = calculateTicketTotals({
      lines: [{ unitPrice: 100000, qty: 1 }],
      serviceRate: 10,
      taxRate: 10,
    });

    // service = 10000 -> 110000, tax = 11000 (not 10000)
    expect(totals.serviceAmt).toBe(10000);
    expect(totals.taxAmt).toBe(11000);
    expect(totals.total).toBe(121000);
  });
});
