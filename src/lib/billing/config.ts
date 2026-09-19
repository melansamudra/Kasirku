// Set ke false setelah XENDIT_SECRET_KEY + XENDIT_WEBHOOK_TOKEN diisi di Vercel env vars
// dan webhook URL https://createimpact.id/api/xendit/webhook didaftarkan di dashboard Xendit.
export const BILLING_MANUAL_MODE = true;

export const BILLING_CONTACT = {
  whatsapp: "6281234556757",
  email: "create2impact.id@gmail.com",
};

// Dicantumkan di Invoice Langganan (panel admin) selama belum ada VA
// otomatis -- GANTI dengan rekening asli sebelum invoice pertama dikirim.
export const BANK_TRANSFER = {
  bankName: "GANTI_NAMA_BANK",
  accountNumber: "GANTI_NOMOR_REKENING",
  accountHolder: "GANTI_ATAS_NAMA",
};
