-- Kasbon dipakai beberapa bisnis (mis. Adi's Culinary) tapi TIDAK dipakai
-- Llauk Nusantara -- perlu toggle per-bisnis biar tombol "Kasbon" di form
-- Catat Nota & link publik /kasbon tidak muncul buat bisnis yang tidak
-- pakai fitur ini. Default true (backward compatible, bisnis lain yang
-- sudah pakai Kasbon tidak kena regresi), Llauk di-set false di sini juga.
alter table public.businesses add column kasbon_enabled boolean not null default true;

update public.businesses set kasbon_enabled = false where name ilike '%llauk%';
