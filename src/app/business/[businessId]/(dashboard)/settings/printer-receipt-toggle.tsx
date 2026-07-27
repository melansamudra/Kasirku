"use client";

import { useState } from "react";
import { setKitchenPrinterPrintsReceipt } from "./actions";

export default function PrinterReceiptToggle({
  businessId,
  printerId,
  printsReceipt,
}: {
  businessId: string;
  printerId: string;
  printsReceipt: boolean;
}) {
  const [checked, setChecked] = useState(printsReceipt);
  const [pending, setPending] = useState(false);

  async function toggle() {
    const next = !checked;
    setChecked(next);
    setPending(true);
    await setKitchenPrinterPrintsReceipt(businessId, printerId, next);
    setPending(false);
  }

  return (
    <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        onChange={() => void toggle()}
        className="h-3 w-3"
      />
      Cetak struk pelanggan otomatis di sini
    </label>
  );
}
