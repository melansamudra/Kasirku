"use client";

import ManualDocForm from "./manual-doc-form";
import { createManualStockOpname, type ManualDocItemInput } from "./actions";

export default function StockOpnameManualForm({
  businessId,
  locationId,
}: {
  businessId: string;
  locationId: string;
}) {
  function handleSubmit(_context: string, note: string, items: ManualDocItemInput[]) {
    return createManualStockOpname(businessId, locationId, note, items);
  }

  return (
    <ManualDocForm
      onSubmit={handleSubmit}
      title="Catat Stock Opname Baru"
      helperText="Catat hasil hitung fisik apa adanya — tidak dibandingkan otomatis ke stok sistem, tidak mengoreksi stok apa pun."
      qtyColumnLabel="Qty Fisik"
      submitLabel="Simpan Hasil Opname"
      submitPendingLabel="Menyimpan…"
    />
  );
}
