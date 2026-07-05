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
