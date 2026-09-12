"use client";

import ManualDocForm, { type ManualDocOnSuccess } from "./manual-doc-form";
import { createManualStockOpname, type ManualDocItemInput } from "./actions";

export default function StockOpnameManualForm({
  businessId,
  locationId,
  onSuccess,
}: {
  businessId: string;
  locationId: string | null;
  onSuccess?: ManualDocOnSuccess;
}) {
  function handleSubmit(_context: string, note: string, items: ManualDocItemInput[]) {
    return createManualStockOpname(businessId, locationId, note, items);
  }

  return (
    <ManualDocForm
      onSubmit={handleSubmit}
      onSuccess={onSuccess}
      title="Catat Stock Opname Baru"
      helperText="Catat hasil hitung fisik apa adanya — tidak dibandingkan otomatis ke stok sistem, tidak mengoreksi stok apa pun."
      qtyColumnLabel="Qty Fisik"
      submitLabel="Simpan Hasil Opname"
      submitPendingLabel="Menyimpan…"
    />
  );
}
