import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertBusinessAccess } from "@/lib/route-auth";
import QRCode from "qrcode";
import { SITE_URL } from "@/lib/site";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ businessId: string; locationId: string }> },
) {
  const { businessId, locationId } = await params;
  const business = await assertBusinessAccess(businessId);
  if (!business) return new NextResponse("Forbidden", { status: 403 });

  const supabase = await createClient();

  const [{ data: biz }, { data: location }] = await Promise.all([
    supabase.from("businesses").select("name, receive_stock_slug").eq("id", businessId).single(),
    supabase.from("stock_locations").select("name").eq("id", locationId).eq("business_id", businessId).maybeSingle(),
  ]);

  if (!biz?.receive_stock_slug) {
    return new NextResponse("Link terima barang belum tersedia.", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  if (!location) {
    return new NextResponse("Lokasi tidak ditemukan.", { status: 404 });
  }

  const url = `${SITE_URL}/terima-barang/${biz.receive_stock_slug}?lokasi=${locationId}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, width: 320 });
  const locationName = location?.name ?? "Lokasi";

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>QR Terima Barang — ${escapeHtml(biz.name)}</title>
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
    <p class="sub">Scan buat konfirmasi terima barang dari Gudang — khusus ${escapeHtml(locationName)}</p>
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
