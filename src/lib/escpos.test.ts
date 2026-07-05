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

  it("prints the station name in uppercase, double-width/height", () => {
    const buf = buildKitchenTicket({ station: "dapur", source: "Kasir", label: "INV-1", items: [] });
    const text = buf.toString("latin1");
    expect(text).toContain("DAPUR");
    // GS ! 0x11 (double width + height) precedes the station name.
    expect(buf.indexOf(Buffer.from([GS, 0x21, 0x11]))).toBeLessThan(text.indexOf("DAPUR"));
  });

  it("wraps each item name in bold on/off and includes qty", () => {
    const buf = buildKitchenTicket({
      station: "Dapur",
      source: "Kasir",
      label: "INV-1",
      items: [{ name: "Kopi Susu", qty: 2 }],
    });
    const text = buf.toString("latin1");
    expect(text).toContain("2x Kopi Susu");

    const boldOn = Buffer.from([ESC, 0x45, 0x01]);
    const boldOff = Buffer.from([ESC, 0x45, 0x00]);
    const boldOnIdx = buf.indexOf(boldOn);
    const itemIdx = text.indexOf("2x Kopi Susu");
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
    expect(buf.toString("latin1")).toContain("1.50x Es Batu");
  });

  it("includes an item note indented on its own line when present", () => {
    const buf = buildKitchenTicket({
      station: "Dapur",
      source: "Kasir",
      label: "INV-1",
      items: [{ name: "Nasi Goreng", qty: 1, note: "pedas" }],
    });
    expect(buf.toString("latin1")).toContain("Catatan: pedas");
  });

  it("omits the note line entirely when there is no note", () => {
    const buf = buildKitchenTicket({
      station: "Dapur",
      source: "Kasir",
      label: "INV-1",
      items: [{ name: "Nasi Goreng", qty: 1 }],
    });
    expect(buf.toString("latin1")).not.toContain("Catatan");
  });

  it("includes the source and label on one line", () => {
    const buf = buildKitchenTicket({
      station: "Dapur",
      source: "Meja 1",
      label: "Pesanan Self-Order",
      items: [],
    });
    expect(buf.toString("latin1")).toContain("Meja 1 - Pesanan Self-Order");
  });
});
