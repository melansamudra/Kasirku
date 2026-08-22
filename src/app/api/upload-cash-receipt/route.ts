import { createClient } from "@/lib/supabase/server";

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const businessId = formData.get("businessId") as string | null;

  if (!file || !businessId) {
    return Response.json({ error: "File dan businessId wajib ada." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return Response.json({ error: "Ukuran foto maksimal 2 MB." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return Response.json({ error: "Format foto harus JPG, PNG, atau WEBP." }, { status: 400 });
  }

  // Verify ownership
  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .single();
  if (!business) return Response.json({ error: "Toko tidak ditemukan." }, { status: 403 });

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${businessId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from("cash-receipts")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage
    .from("cash-receipts")
    .getPublicUrl(path);

  return Response.json({ url: publicUrl });
}
