import { describe, expect, it } from "vitest";
import { calculateCheckoutTotals, itemDiscAmount } from "./checkout-totals";

describe("itemDiscAmount", () => {
  it("computes a percentage discount off the line total", () => {
    expect(itemDiscAmount({ price: 10000, qty: 2, disc: 10, discType: "pct" })).toBe(2000);
  });

  it("computes a flat discount per unit, scaled by qty", () => {
    expect(itemDiscAmount({ price: 10000, qty: 3, disc: 1000, discType: "amt" })).toBe(3000);
  });

  it("caps a flat discount at the line total instead of going negative", () => {
    expect(itemDiscAmount({ price: 5000, qty: 1, disc: 999999, discType: "amt" })).toBe(5000);
  });
});

describe("calculateCheckoutTotals", () => {
  it("applies item discount, then order discount, then service, then tax", () => {
    // 2x Kopi Susu @ 18000 = 36000, 10% item disc = 3600 -> 32400
    // 10% order disc on 32400 = 3240 -> subtotal 29160
    // 5% service = 1458 -> 30618
    // 10% tax on (subtotal + service) = 3061.8 -> rounds to 3062
    const totals = calculateCheckoutTotals({
      items: [{ price: 18000, qty: 2, disc: 10, discType: "pct" }],
      orderDisc: 10,
      orderDiscType: "pct",
      serviceRate: 5,
      taxRate: 10,
    });

    expect(totals.subtotalRaw).toBe(36000);
    expect(totals.totalItemDisc).toBe(3600);
    expect(totals.afterItemDisc).toBe(32400);
    expect(totals.orderDiscAmt).toBe(3240);
    expect(totals.subtotal).toBe(29160);
    expect(totals.serviceAmt).toBe(1458);
    expect(totals.taxAmt).toBe(3062);
    expect(totals.total).toBe(29160 + 1458 + 3062);
  });

  it("returns zero totals for an empty cart", () => {
    const totals = calculateCheckoutTotals({
      items: [],
      orderDisc: 0,
      orderDiscType: "pct",
      serviceRate: 5,
      taxRate: 10,
    });

    expect(totals.total).toBe(0);
  });

  it("skips service and tax when both rates are disabled", () => {
    const totals = calculateCheckoutTotals({
      items: [{ price: 10000, qty: 1, disc: 0, discType: "pct" }],
      orderDisc: 0,
      orderDiscType: "pct",
      serviceRate: 0,
      taxRate: 0,
    });

    expect(totals.serviceAmt).toBe(0);
    expect(totals.taxAmt).toBe(0);
    expect(totals.total).toBe(10000);
  });

  it("never lets a flat order discount exceed the post-item-discount subtotal", () => {
    const totals = calculateCheckoutTotals({
      items: [{ price: 10000, qty: 1, disc: 0, discType: "pct" }],
      orderDisc: 999999,
      orderDiscType: "amt",
      serviceRate: 0,
      taxRate: 0,
    });

    expect(totals.orderDiscAmt).toBe(10000);
    expect(totals.subtotal).toBe(0);
    expect(totals.total).toBe(0);
  });
});
