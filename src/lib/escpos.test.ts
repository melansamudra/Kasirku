import { describe, expect, it } from "vitest";
import { buildKitchenTicket } from "./escpos";

const ESC = 0x1b;
const GS = 0x1d;

describe("buildKitchenTicket", () => {
  it("opens with an ESC/POS init sequence", () => {
    const buf = buildKitchenTicket({ station: "Dapur", source: "Kasir", label: "INV-1", items: [] });
    expect(buf.subarray(0, 2)).toEqual(Buffer.from([ESC, 0x40]));
  });

  it("ends with a partial-cut command", () => {
    const buf = buildKitchenTicket({ station: "Dapur", source: "Kasir", label: "INV-1", items: [] });
    expect(buf.subarray(buf.length - 4)).toEqual(Buffer.from([GS, 0x56, 0x42, 0x00]));
  });

  it("prints the station name in uppercase as a centered separator", () => {
    const buf = buildKitchenTicket({ station: "dapur", source: "Kasir", label: "INV-1", items: [] });
    const text = buf.toString("latin1");
    expect(text).toContain("DAPUR");
    // Station name is center-aligned (ESC a 0x01) and bold.
    const centerCmd = Buffer.from([ESC, 0x61, 0x01]);
    expect(buf.indexOf(centerCmd)).toBeLessThan(text.indexOf("DAPUR"));
  });

  it("wraps each item name in bold on/off and includes qty without 'x'", () => {
    const buf = buildKitchenTicket({
      station: "Dapur",
      source: "Kasir",
      label: "INV-1",
      items: [{ name: "Kopi Susu", qty: 2 }],
    });
    const text = buf.toString("latin1");
    expect(text).toContain("2 Kopi Susu");

    const boldOn = Buffer.from([ESC, 0x45, 0x01]);
    const boldOff = Buffer.from([ESC, 0x45, 0x00]);
    const boldOnIdx = buf.lastIndexOf(boldOn, text.indexOf("2 Kopi Susu"));
    const itemIdx = text.indexOf("2 Kopi Susu");
    const boldOffIdx = buf.indexOf(boldOff, itemIdx);

    expect(boldOnIdx).toBeGreaterThanOrEqual(0);
    expect(boldOnIdx).toBeLessThan(itemIdx);
    expect(boldOffIdx).toBeGreaterThan(itemIdx);
  });

  it("prints a fractional qty with two decimal places, not rounded", () => {
    const buf = buildKitchenTicket({
      station: "Dapur",
      source: "Kasir",
      label: "INV-1",
      items: [{ name: "Es Batu", qty: 1.5 }],
    });
    expect(buf.toString("latin1")).toContain("1.50 Es Batu");
  });

  it("includes an item note indented on its own line when present", () => {
    const buf = buildKitchenTicket({
      station: "Dapur",
      source: "Kasir",
      label: "INV-1",
      items: [{ name: "Nasi Goreng", qty: 1, note: "pedas" }],
    });
    expect(buf.toString("latin1")).toContain("* pedas");
  });

  it("omits the note line entirely when there is no note", () => {
    const buf = buildKitchenTicket({
      station: "Dapur",
      source: "Kasir",
      label: "INV-1",
      items: [{ name: "Nasi Goreng", qty: 1 }],
    });
    expect(buf.toString("latin1")).not.toContain("* ");
  });

  it("prints source and label as separate labeled lines", () => {
    const buf = buildKitchenTicket({
      station: "Dapur",
      source: "Meja 1",
      label: "Pesanan Self-Order",
      items: [],
    });
    const text = buf.toString("latin1");
    expect(text).toContain("Meja 1");
    expect(text).toContain("Pesanan Self-Order");
  });

  it("prints cashier name and order type when provided", () => {
    const buf = buildKitchenTicket({
      station: "Bar",
      source: "Meja 3",
      label: "INV-99",
      items: [],
      cashierName: "Budi",
      orderType: "DINE IN",
    });
    const text = buf.toString("latin1");
    expect(text).toContain("Budi");
    expect(text).toContain("DINE IN");
  });
});
