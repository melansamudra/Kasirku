"use client";

import ManualDocForm, { type ManualDocOnSuccess } from "./manual-doc-form";
import { createManualPurchaseOrder, type ManualDocItemInput } from "./actions";

export default function PoSupplierManualForm({
  businessId,
  locationId,
  onSuccess,
}: {
  businessId: string;
  locationId: string | null;
  onSuccess?: ManualDocOnSuccess;
}) {
  function handleSubmit(supplierName: string, note: string, items: ManualDocItemInput[]) {
    return createManualPurchaseOrder(businessId, locationId, supplierName, note, items);
  }

  return (
    <ManualDocForm
      onSubmit={handleSubmit}
      onSuccess={onSuccess}
      title="Buat PO Supplier Baru"
      helperText="Isi bebas — tidak terhubung ke Purchase Order digital manapun. Perlu disetujui Owner/Finance sebelum dikirim ke supplier."
      contextLabel="Nama Supplier"
      contextPlaceholder="mis. CV Sumber Rejeki"
      qtyColumnLabel="Qty"
      submitLabel="Simpan & Buat PO Supplier"
      submitPendingLabel="Menyimpan…"
    />
  );
}
