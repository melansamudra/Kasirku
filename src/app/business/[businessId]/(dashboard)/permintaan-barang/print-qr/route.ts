import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertBusinessAccess } from "@/lib/route-auth";
import QRCode from "qrcode";
import { SITE_URL } from "@/lib/site";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const { businessId } = await params;
  const business = await assertBusinessAccess(businessId);
  if (!business) return new NextResponse("Forbidden", { status: 403 });

  const lokasiParam = new URL(req.url).searchParams.get("lokasi");

  const supabase = await createClient();

  const { data: biz } = await supabase
    .from("businesses")
    .select("name, purchase_request_slug")
    .eq("id", businessId)
    .single();

  if (!biz?.purchase_request_slug) {
    return new NextResponse("Link order barang belum tersedia.", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // "?lokasi=produksi" (lama) atau "?lokasi=<uuid lokasi>" (pola generik
  // sekarang, sama seperti Stok Opname/Terima Barang/Transfer Internal) --
  // keduanya di-resolve ke id lokasi asli sebelum dipasang ke URL QR.
  let lockedLocation: { id: string; name: string } | null = null;
  if (lokasiParam === "produksi") {
    const { data: loc } = await supabase
      .from("stock_locations")
      .select("id, name")
      .eq("business_id", businessId)
      .eq("is_production", true)
      .maybeSingle();
    lockedLocation = loc ?? null;
  } else if (lokasiParam) {
    const { data: loc } = await supabase
      .from("stock_locations")
      .select("id, name")
      .eq("business_id", businessId)
      .eq("id", lokasiParam)
      .maybeSingle();
    lockedLocation = loc ?? null;
  }

  const url = `${SITE_URL}/permintaan-barang/${biz.purchase_request_slug}${lockedLocation ? `?lokasi=${lockedLocation.id}` : ""}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, width: 320 });

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>QR Order Barang — ${escapeHtml(biz.name)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: sans-serif; background: #fff; padding: 24px; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card {
      border: 1px solid #e4e4e7;
      border-radius: 16px;
      padding: 32px;
      width: 380px;
      text-align: center;
    }
    .qr svg { width: 260px; height: 260px; display: block; margin: 0 auto; }
    h1 { font-size: 16px; color: #18181b; margin-top: 16px; }
    p.sub { font-size: 12px; color: #71717a; margin-top: 4px; }
    p.url { font-size: 9px; color: #a1a1aa; margin-top: 12px; word-break: break-all; }
    @media print {
      body { padding: 0; }
      @page { margin: 12mm; }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="qr">${svg}</div>
    <h1>${escapeHtml(biz.name)}</h1>
    <p class="sub">${
      lockedLocation
        ? `Scan buat order barang — khusus ${escapeHtml(lockedLocation.name)}`
        : "Scan buat order barang (staf dapur/bar/front)"
    }</p>
    <p class="url">${escapeHtml(url)}</p>
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 300);
    };
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
