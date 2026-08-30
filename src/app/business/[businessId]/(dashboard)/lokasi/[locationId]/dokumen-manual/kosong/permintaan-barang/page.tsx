import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BlankFormPrint from "../../blank-form-print";
import PrintButton from "../../print-button";

export default async function PermintaanBarangBlankPrintPage({
  params,
}: {
  params: Promise<{ businessId: string; locationId: string }>;
}) {
  const { businessId, locationId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase.from("businesses").select("name").eq("id", businessId).single();
  if (!business) notFound();

  const { data: location } = await supabase
    .from("stock_locations")
    .select("id, name")
    .eq("id", locationId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!location) notFound();

  return (
    <>
      <BlankFormPrint
        businessName={business.name}
        locationName={location.name}
        title="Permintaan Barang"
        fields={["Tanggal", "Diminta oleh"]}
        signLabels={["Diminta oleh", "Diterima Purchasing"]}
      />
      <div className="mt-4 w-full max-w-2xl">
        <PrintButton
          backHref={`/business/${businessId}/lokasi/${locationId}/dokumen-manual?tab=permintaan-barang`}
          cetakLabel="Cetak Formulir Kosong"
        />
      </div>
    </>
  );
}
