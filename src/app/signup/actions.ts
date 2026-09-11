"use server";

// Notifikasi WA ke owner lewat Fonnte tiap ada pendaftar baru. Gagal kirim
// (token belum diset, Fonnte down, dll) sengaja tidak melempar error --
// pendaftaran user tidak boleh gagal cuma gara-gara notifikasi ini gagal.
export async function notifyNewSignup(email: string, whatsapp: string) {
  const token = process.env.FONNTE_TOKEN;
  const target = process.env.OWNER_WHATSAPP_NUMBER;
  if (!token || !target) return;

  try {
    await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        target,
        message: `🆕 Pendaftar baru KasirKu\nEmail: ${email}\nWA: ${whatsapp}`,
      }),
    });
  } catch (err) {
    console.error("Gagal kirim notifikasi Fonnte:", err);
  }
}
