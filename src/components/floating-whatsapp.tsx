import { BILLING_CONTACT } from "@/lib/billing/config";

// Persistent contact button for public/marketing pages only — never add this
// to the authenticated app (dashboard/POS), where it'd be noise rather than
// a sales touchpoint. See growth-marketing-phase memory: manual WA closing
// while Midtrans approval is pending.
export default function FloatingWhatsApp({
  message = "Halo, saya mau tanya soal KasirKu.",
}: {
  message?: string;
}) {
  return (
    <a
      href={`https://wa.me/${BILLING_CONTACT.whatsapp}?text=${encodeURIComponent(message)}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat WhatsApp"
      className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-2xl shadow-lg shadow-black/20 transition-transform hover:scale-105"
    >
      💬
    </a>
  );
}
