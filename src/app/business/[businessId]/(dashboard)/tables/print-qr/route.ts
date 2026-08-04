import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import QRCode from "qrcode";
import { SITE_URL } from "@/lib/site";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .single();

  if (!business) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { data: tables } = await supabase
    .from("tables")
    .select("id, name, qr_slug")
    .eq("business_id", businessId)
    .order("name", { ascending: true });

  if (!tables || tables.length === 0) {
    return new NextResponse("Belum ada meja.", { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  const baseUrl = SITE_URL;

  const qrCards = await Promise.all(
    tables.map(async (t) => {
      const url = `${baseUrl}/order/${t.qr_slug}`;
      const svg = await QRCode.toString(url, { type: "svg", margin: 1, width: 200 });
      return `
        <div class="card">
          <div class="qr">${svg}</div>
          <p class="name">${escapeHtml(t.name)}</p>
          <p class="url">${escapeHtml(url)}</p>
        </div>`;
    }),
  );

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>QR Meja — ${escapeHtml(business.name)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: sans-serif; background: #fff; padding: 24px; }
    h1 { font-size: 16px; color: #111; margin-bottom: 4px; }
    p.sub { font-size: 12px; color: #666; margin-bottom: 20px; }
    .grid { display: flex; flex-wrap: wrap; gap: 16px; }
    .card {
      border: 1px solid #e4e4e7;
      border-radius: 12px;
      padding: 16px;
      width: 180px;
      text-align: center;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .qr svg { width: 148px; height: 148px; display: block; margin: 0 auto; }
    .name { font-size: 14px; font-weight: 700; color: #18181b; margin-top: 10px; }
    .url { font-size: 9px; color: #a1a1aa; margin-top: 4px; word-break: break-all; }
    @media print {
      body { padding: 12px; }
      @page { margin: 12mm; }
    }
  </style>
</head>
<body>
  <h1>QR Meja — ${escapeHtml(business.name)}</h1>
  <p class="sub">${tables.length} meja · Cetak halaman ini atau Save as PDF</p>
  <div class="grid">${qrCards.join("")}</div>
  <script>
    // Auto-open print dialog when page loads
    window.onload = function() {
      // small delay so SVGs render first
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
