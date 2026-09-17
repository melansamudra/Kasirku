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
  function handleSubmit(supplierName: string, note: string, items: ManualDocItemInput[], allocation: string) {
    return createManualPurchaseOrder(businessId, locationId, supplierName, allocation, note, items);
  }

  return (
    <ManualDocForm
      onSubmit={handleSubmit}
      onSuccess={onSuccess}
      title="Buat PO Supplier Baru"
      helperText="Isi bebas — tidak terhubung ke Purchase Order digital manapun. Perlu disetujui Owner/Finance sebelum dikirim ke supplier."
      contextLabel="Nama Supplier"
      contextPlaceholder="mis. CV Sumber Rejeki"
      context2Label="Peruntukan"
      context2Placeholder="mis. Dapur Produksi / Outlet Pleburan"
      qtyColumnLabel="Qty"
      submitLabel="Simpan & Buat PO Supplier"
      submitPendingLabel="Menyimpan…"
    />
  );
}
