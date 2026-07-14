import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// File installer sengaja disimpan di luar public/ — supaya URL download
// tidak bisa ditebak/dibagikan tanpa order+token yang cocok dan sudah lunas.
const INSTALLER_PATH = path.join(
  process.cwd(),
  "private-assets",
  "kalkulator-hpp-desktop-setup.exe",
);
const INSTALLER_FILENAME = "KalkulatorHPPDesktop-Setup.exe";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("order");
  const token = url.searchParams.get("token");

  if (!orderId || !token) {
    return NextResponse.json({ error: "order dan token wajib diisi" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: order } = await supabase
    .from("hpp_desktop_orders")
    .select("status, download_token")
    .eq("order_id", orderId)
    .maybeSingle();

  if (!order || order.status !== "settlement" || order.download_token !== token) {
    return NextResponse.json({ error: "Pesanan tidak valid atau belum lunas." }, { status: 403 });
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = await readFile(INSTALLER_PATH);
  } catch {
    return NextResponse.json(
      { error: "File installer belum tersedia, hubungi kami." },
      { status: 503 },
    );
  }

  return new NextResponse(new Uint8Array(fileBuffer), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${INSTALLER_FILENAME}"`,
      "Content-Length": String(fileBuffer.length),
    },
  });
}
