-- "Tipe akun: Kasir/Admin" di form Undang Admin sebelumnya cuma preset UI
-- (menentukan checkbox permission mana yang default tercentang) tanpa
-- pernah tersimpan — jadi sistem tidak pernah benar-benar tahu siapa
-- "kasir" vs "admin" setelah staff diundang. Kolom ini membuatnya nyata,
-- supaya bisa dipakai untuk gating UI (mis. Kas Kecil: staff role='kasir'
-- cuma lihat ringkasan, role='admin' bisa Setujui/Tolak/Verifikasi).
alter table public.business_staff
  add column role text not null default 'kasir' check (role in ('kasir', 'admin'));
