import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BlankFormPrint from "../../../lokasi/[locationId]/dokumen-manual/blank-form-print";
import PrintButton from "../../../lokasi/[locationId]/dokumen-manual/print-button";

export default async function SuratJalanBlankPrintPageGlobal({
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
        title="Surat Jalan"
        fields={["Tanggal", "Tujuan Pengiriman"]}
        signLabels={["Dikirim oleh", "Diterima oleh"]}
      />
      <div className="mt-4 w-full max-w-2xl">
        <PrintButton
          backHref={`/business/${businessId}/dokumen-manual`}
          cetakLabel="Cetak Formulir Kosong"
        />
      </div>
    </>
  );
}
