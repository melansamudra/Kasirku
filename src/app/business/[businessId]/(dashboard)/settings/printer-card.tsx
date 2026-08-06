"use client";

import { useState } from "react";
import DeletePrinterButton from "./delete-printer-button";
import PrinterReceiptToggle from "./printer-receipt-toggle";
import EditPrinterForm from "./edit-printer-form";
import type { KitchenPrinterState } from "./actions";

type Printer = {
  id: string;
  name: string;
  connection_type: string;
  address: string | null;
  device_label: string | null;
  categories: string[];
  prints_receipt: boolean;
  paper_width: number;
};

export default function PrinterCard({
  printer,
  businessId,
  updateAction,
  productCategories,
}: {
  printer: Printer;
  businessId: string;
  updateAction: (state: KitchenPrinterState, formData: FormData) => Promise<KitchenPrinterState>;
  productCategories: string[];
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-900">{printer.name}</p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            {editing ? "✕ Tutup" : "Edit"}
          </button>
          <DeletePrinterButton businessId={businessId} printerId={printer.id} />
        </div>
      </div>

      {!editing && (
        <>
          <p className="mt-0.5 text-xs text-zinc-500">
            {printer.connection_type === "lan" ? "🌐 LAN/Wi-Fi" : "📶 Bluetooth"}
            {printer.address
              ? ` · ${printer.connection_type === "bluetooth" ? (printer.device_label ?? printer.address) : printer.address}`
              : ""}
            {" · "}{printer.paper_width}mm
          </p>
          {printer.categories.length > 0 && (
            <p className="mt-1 text-[11px] text-zinc-400">
              Kategori: {printer.categories.join(", ")}
            </p>
          )}
          <PrinterReceiptToggle
            businessId={businessId}
            printerId={printer.id}
            printsReceipt={printer.prints_receipt}
          />
        </>
      )}

      {editing && (
        <EditPrinterForm
          printer={printer}
          action={updateAction}
          categories={productCategories}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}
