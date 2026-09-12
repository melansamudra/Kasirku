import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BlankFormPrint from "../../../lokasi/[locationId]/dokumen-manual/blank-form-print";
import PrintButton from "../../../lokasi/[locationId]/dokumen-manual/print-button";

export default async function PermintaanBarangBlankPrintPageGlobal({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase.from("businesses").select("name").eq("id", businessId).single();
  if (!business) notFound();

  return (
    <>
      <BlankFormPrint
        businessName={business.name}
        locationName={business.name}
        title="Permintaan Barang"
        fields={["Tanggal", "Diminta oleh"]}
        signLabels={["Diminta oleh", "Diterima Purchasing"]}
      />
      <div className="mt-4 w-full max-w-2xl">
        <PrintButton
          backHref={`/business/${businessId}/dokumen-manual?tab=permintaan-barang`}
          cetakLabel="Cetak Formulir Kosong"
        />
      </div>
    </>
  );
}
