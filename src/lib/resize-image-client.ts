// Resize gambar di browser sebelum upload — foto produk dari HP kasir/owner
// sering beresolusi tinggi (2-8 MB) padahal cuma dipakai sebagai thumbnail
// kecil di grid kasir. Mengecilkan di sini sebelum upload menghemat bandwidth
// upload DAN bandwidth setiap kali grid produk dimuat ulang di kasir.
const MAX_DIMENSION = 480;
const JPEG_QUALITY = 0.82;

export async function resizeImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return file;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  if (scale >= 1) {
    bitmap.close?.();
    return file;
  }

  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, outputType, JPEG_QUALITY)
  );
  if (!blob || blob.size >= file.size) return file;

  const ext = outputType === "image/png" ? "png" : "jpg";
  const name = file.name.replace(/\.[^.]+$/, "") + `.${ext}`;
  return new File([blob], name, { type: outputType });
}
