# 4 tambahan untuk kasir tiket: export Excel, member di POS, barcode, nomor tiket manual

## Context

Fitur kasir tiket (business type "tiket") sudah selesai dan dipakai (commit `5719374`,
`f59331c`). User sekarang minta 4 penambahan berdasarkan kebutuhan operasional nyata di
lapangan:

1. **Export Excel/CSV** untuk laporan tiket — per transaksi, per jam, per tiket.
2. **Kasir bisa tambah & lihat member langsung dari layar kasir** (bukan cuma lewat
   halaman back-office `/members` yang terpisah dari alur jualan).
3. **Barcode member** — scan kartu langsung ketemu (tanpa ketik manual), DAN sistem perlu
   bisa generate & cetak barcode untuk kartu member fisik.
4. **Nomor tiket fisik manual per unit** — selain nomor seri otomatis yang sudah ada
   (`ticket_serials.serial_no`, kontinu, tidak reset), tiap tiket individual yang dijual
   (per Pengunjung/Penunggu) harus dicatat nomor tiket fisiknya juga (dari buku tiket
   kertas yang dipegang kasir), karena buku fisik terpisah per kategori (dikonfirmasi user).

**Keputusan desain yang sudah dikonfirmasi user:**
- Nomor tiket fisik unik per kategori (`business_id, ticket_category_id, manual_number`),
  bukan lintas kategori — konsisten dengan `serial_no` yang juga terpisah per kategori.
- Member butuh generate barcode asli (Code128) untuk dicetak jadi kartu, bukan cuma
  auto-scan ke kode yang sudah ada.
- Panel tambah/lihat member harus ada langsung di layar kasir (POS), bukan cuma di
  halaman Anggota back-office.

**Catatan keamanan yang relevan** (sudah diverifikasi): sesi PIN kasir (`cashier-session.ts`)
cuma penanda "siapa yang pegang device", bukan boundary keamanan sungguhan — akses
sebenarnya dijamin oleh sesi Supabase Auth pemilik toko yang sudah login di device/browser
yang sama. Jadi menambah panel member di layar kasir **tidak butuh perubahan keamanan
apapun**, cuma butuh UI baru supaya kasir tidak perlu keluar dari mode kasir.

## 1. Migration — `supabase/migrations/20260706300000_ticket_manual_number.sql`

Tambah kolom `manual_number` (backfill dari `serial_no` untuk 4 baris test yang sudah ada),
constraint unik per kategori, dan update RPC `checkout_ticket_transaction` supaya
`p_items` menerima `manual_numbers: string[]` per kategori (bukan `qty` lagi) — signature
SQL function-nya sendiri tidak berubah (tetap `jsonb`), cuma bentuk isi JSON-nya yang
berubah, jadi tidak perlu drop overload lama.

```sql
-- Module: nomor tiket fisik manual per unit, selain serial_no otomatis yang
-- sudah ada. Buku tiket kertas terpisah per kategori, jadi keunikan nomor
-- fisik di-scope per kategori juga (business_id, ticket_category_id,
-- manual_number) — sama seperti serial_no.

-- Backfill-safe: 4 baris test yang sudah ada dapat manual_number = serial_no
-- supaya kolom bisa langsung NOT NULL di migration yang sama.
alter table public.ticket_serials
  add column manual_number text;

update public.ticket_serials
  set manual_number = serial_no::text
  where manual_number is null;

alter table public.ticket_serials
  alter column manual_number set not null;

alter table public.ticket_serials
  add constraint ticket_serials_manual_number_not_blank
  check (length(trim(manual_number)) > 0);

create unique index ticket_serials_business_id_category_id_manual_number_key
  on public.ticket_serials (business_id, ticket_category_id, manual_number);

-- checkout_ticket_transaction: p_items berubah dari
-- [{ticket_category_id, qty}] jadi [{ticket_category_id, manual_numbers: string[]}].
-- Logika harga/hari-libur/member/pajak/service TIDAK berubah sama sekali,
-- cuma loop insert per-unit yang berubah bentuk.
create or replace function public.checkout_ticket_transaction(
  p_business_id uuid,
  p_cashier_id uuid,
  p_items jsonb, -- array of {ticket_category_id, manual_numbers: string[]}
  p_payment_method text,
  p_received numeric default null,
  p_member_id uuid default null
)
returns table (transaction_id uuid, invoice_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_member record;
  v_invoice_number text;
  v_seq int;
  v_is_holiday boolean;
  v_subtotal numeric(12, 2) := 0;
  v_service numeric(12, 2) := 0;
  v_tax numeric(12, 2) := 0;
  v_total numeric(12, 2);
  v_change numeric(12, 2);
  v_transaction_id uuid;
  v_shift_id uuid;
  v_item jsonb;
  v_category_id uuid;
  v_category record;
  v_manual_numbers jsonb;
  v_manual_number text;
  v_use_member_price boolean := false;
  v_unit_price numeric(12, 2);
  v_serial int;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  if not exists (
    select 1 from public.cashiers c
    where c.id = p_cashier_id and c.business_id = p_business_id and c.active
  ) then
    raise exception 'invalid cashier';
  end if;

  if p_payment_method is null or length(trim(p_payment_method)) = 0 then
    raise exception 'payment method required';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'cart is empty';
  end if;

  select b.tax_enabled, b.tax_rate, b.service_enabled, b.service_rate
  into v_business
  from public.businesses b
  where b.id = p_business_id;

  select id into v_shift_id
  from public.shifts
  where business_id = p_business_id and closed_at is null
  limit 1;

  if v_shift_id is null then
    raise exception 'no active shift — open a shift before selling';
  end if;

  if p_member_id is not null then
    select m.id, m.valid_from, m.valid_until
    into v_member
    from public.members m
    where m.id = p_member_id
      and m.business_id = p_business_id
      and m.deleted_at is null;

    if not found then
      raise exception 'member not found';
    end if;

    if current_date < v_member.valid_from or current_date > v_member.valid_until then
      raise exception 'membership tidak aktif (kadaluarsa atau belum berlaku)';
    end if;

    v_use_member_price := true;
  end if;

  v_is_holiday := extract(dow from current_date) in (0, 6)
    or exists (
      select 1 from public.ticket_holidays h
      where h.business_id = p_business_id and h.holiday_date = current_date
    );

  select count(*) + 1 into v_seq
  from public.ticket_transactions t
  where t.business_id = p_business_id
    and t.date::date = current_date;

  v_invoice_number := 'TIX-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  insert into public.ticket_transactions (
    business_id, shift_id, cashier_id, member_id, invoice_number, date,
    is_holiday, subtotal, service, tax, total, payment_method, received, change
  ) values (
    p_business_id, v_shift_id, p_cashier_id, p_member_id, v_invoice_number, now(),
    v_is_holiday, 0, 0, 0, 0, p_payment_method, p_received, 0
  )
  returning id into v_transaction_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_category_id := (v_item ->> 'ticket_category_id')::uuid;
    v_manual_numbers := v_item -> 'manual_numbers';

    if v_manual_numbers is null or jsonb_typeof(v_manual_numbers) <> 'array'
      or jsonb_array_length(v_manual_numbers) = 0 then
      raise exception 'manual ticket numbers required for category %', v_category_id;
    end if;

    select * into v_category
    from public.ticket_categories
    where id = v_category_id
      and business_id = p_business_id
      and deleted_at is null
    for update;

    if not found then
      raise exception 'ticket category not found: %', v_category_id;
    end if;

    v_unit_price := case
      when v_use_member_price then v_category.member_price
      when v_is_holiday then v_category.price_holiday
      else v_category.price_weekday
    end;

    for v_manual_number in select jsonb_array_elements_text(v_manual_numbers)
    loop
      if v_manual_number is null or length(trim(v_manual_number)) = 0 then
        raise exception 'nomor tiket fisik tidak boleh kosong (kategori %)', v_category.name;
      end if;

      v_serial := v_category.next_serial;

      insert into public.ticket_serials (
        ticket_transaction_id, ticket_category_id, business_id,
        serial_no, manual_number, price, is_member_price
      ) values (
        v_transaction_id, v_category_id, p_business_id,
        v_serial, trim(v_manual_number), v_unit_price, v_use_member_price
      );

      v_category.next_serial := v_category.next_serial + 1;
      v_subtotal := v_subtotal + v_unit_price;
    end loop;

    update public.ticket_categories
    set next_serial = v_category.next_serial
    where id = v_category_id;
  end loop;

  if v_business.service_enabled then
    v_service := round(v_subtotal * v_business.service_rate / 100);
  end if;

  if v_business.tax_enabled then
    v_tax := round((v_subtotal + v_service) * v_business.tax_rate / 100);
  end if;

  v_total := v_subtotal + v_service + v_tax;
  v_change := greatest(coalesce(p_received, v_total) - v_total, 0);

  update public.ticket_transactions
  set subtotal = v_subtotal,
      service = v_service,
      tax = v_tax,
      total = v_total,
      change = v_change
  where id = v_transaction_id;

  return query select v_transaction_id, v_invoice_number;
end;
$$;

grant execute on function public.checkout_ticket_transaction(uuid, uuid, jsonb, text, numeric, uuid) to authenticated;
```

Duplikat nomor fisik dalam satu submit (misal kasir ketik "A001" dua kali di kategori
yang sama) otomatis kena unique index saat insert → seluruh transaksi rollback (atomic),
ditangkap jadi pesan ramah di client (lihat bagian 2).

## 2. `pos/ticket-actions.ts` — ubah bentuk items

- `TicketCartItemInput` jadi `{ ticketCategoryId: string; manualNumbers: string[] }`.
- `checkoutTicket`: mapping ke RPC jadi `{ ticket_category_id, manual_numbers }`.
  `itemCount` untuk `logActivity` jadi `items.reduce((s, i) => s + i.manualNumbers.length, 0)`.
- Tangkap `error.code === "23505"` (pola sama seperti `addTicketCategory` di
  `settings/actions.ts`) → pesan: `"Nomor tiket fisik ini sudah dipakai untuk kategori
  ini. Cek kembali nomor booklet."`

## 3. `pos/ticket-pos-screen.tsx` — rombak cart jadi per-unit

Ganti `qtyByCategory: Record<string, number>` + `changeQty` jadi
`unitsByCategory: Record<string, string[]>` (array nomor fisik per kategori, satu
string per tiket). Tetap pakai functional-update (`setUnitsByCategory(prev => ...)`)
supaya tidak kena bug closure-basi yang sudah pernah diperbaiki sebelumnya.

- `addUnit(categoryId)` — tambah satu string kosong ke array kategori itu.
- `removeUnit(categoryId, index)` — hapus satu baris (hapus key kategori kalau array
  jadi kosong).
- `setUnitNumber(categoryId, index, value)` — update nilai satu baris.
- `cartLines`: `units: unitsByCategory[c.id] ?? []`, qty untuk hitung subtotal jadi
  `units.length` (formula harga `unitPriceFor` tidak berubah).
- **UI kategori**: ganti stepper `− angka +` jadi: tombol "+ Tambah Tiket" (panggil
  `addUnit`), lalu daftar input teks satu per unit (placeholder "No. tiket fisik") dengan
  tombol hapus (✕) di tiap baris, plus ringkasan "{units.length} tiket · Rp{...}".
  Karena input butuh lebar yang cukup, ganti grid kategori dari `grid-cols-2 sm:grid-cols-3`
  jadi kartu selebar penuh bertumpuk (`grid-cols-1`) supaya input tidak sempit.
- **Guard sebelum bayar**: cek semua unit di semua kategori terisi (trim tidak kosong),
  kalau ada yang kosong `setError("Semua nomor tiket fisik harus diisi.")` dan batalkan.
- `items` yang dikirim ke `checkoutTicket`: `cartLines.filter(l => l.units.length > 0).map(l
  => ({ ticketCategoryId: l.category.id, manualNumbers: l.units.map(u => u.trim()) }))`.
- Sidebar cart: `"{units.length}x {category.name}"` (dulu `{qty}x`).
- `resetForNextTransaction`: `setUnitsByCategory({})`.

## 4. Panel member di layar kasir

**`pos/page.tsx`** (cabang `business_type === "tiket"`): tambah fetch member penuh,
mirroring fetch `customers` yang sudah ada di jalur F&B/Retail di file yang sama:
```ts
const { data: memberRows } = await supabase
  .from("members")
  .select("id, name, phone, member_code, valid_from, valid_until")
  .eq("business_id", businessId)
  .is("deleted_at", null)
  .order("name", { ascending: true });
```
Lempar sebagai prop `members` baru ke `<TicketPosScreen>`.

**File baru `pos/member-panel.tsx`** (client component), menggantikan kotak "Member
(opsional)" yang sekarang inline di `ticket-pos-screen.tsx`:
- Props: `businessId`, `members` (list penuh), `member` (yang aktif, dikontrol parent),
  `onSelect(member)`, `onRelease()`.
- Input kode + tombol Cari tetap ada, tapi dibungkus `<form onSubmit={...}>` supaya
  Enter dari barcode scanner langsung submit tanpa perlu klik — dan `useEffect` untuk
  auto-focus saat mount / setiap `member` balik jadi `null`.
- Daftar member yang bisa dicari/klik: **pola sama persis** dengan customer-picker yang
  sudah ada di `pos/pos-screen.tsx` (`customerPickerOpen`/`customerSearch`/
  `filteredCustomers` via `useMemo`) — tombol toggle buka panel search+list, klik baris
  untuk pilih.
- Form "+ Member Baru" inline: pakai ulang `AddMemberForm` yang sudah ada
  (`(dashboard)/members/add-member-form.tsx`) dan action `addMember` yang sudah ada
  (`(dashboard)/members/actions.ts`) — TANPA duplikasi form. Bungkus dengan action
  wrapper lokal di `member-panel.tsx` yang manggil `addMember` lalu `router.refresh()`
  kalau sukses, supaya list member di POS ikut ter-update tanpa reload penuh. Tidak ada
  perubahan ke `AddMemberForm`/`addMember` itu sendiri.

`ticket-pos-screen.tsx`: hapus kotak member inline lama, ganti
`<MemberPanel businessId={businessId} members={members} member={member}
onSelect={setMember} onRelease={() => { setMember(null); setMemberCode(""); }} />`
— state `member` tetap dipegang parent (dipakai `unitPriceFor`), cuma dikontrol lewat
child, pola controlled-component standar.

## 5. Barcode member (generate + scan)

- Tambah dependency `jsbarcode` (`npm install jsbarcode`) — ringan, tanpa dependency
  lain, standar industri untuk kasus ini.
- **File baru** `(dashboard)/members/[memberId]/member-barcode.tsx` (client):
  ```tsx
  "use client";
  import { useEffect, useRef } from "react";
  import JsBarcode from "jsbarcode";

  export default function MemberBarcode({ value }: { value: string }) {
    const ref = useRef<SVGSVGElement>(null);
    useEffect(() => {
      if (ref.current) {
        JsBarcode(ref.current, value, { format: "CODE128", displayValue: true, height: 60 });
      }
    }, [value]);
    return <svg ref={ref} />;
  }
  ```
- **File baru** `(dashboard)/members/[memberId]/card/page.tsx` — server component,
  mirip pola `ticket-reports/[transactionId]/receipt/page.tsx`: ambil data member (nama,
  member_code, valid_until), render kartu cetak (nama, kode, `<MemberBarcode
  value={member.member_code} />`, tanggal berlaku) + `<PrintButton />`.
- **File baru** `(dashboard)/members/[memberId]/card/print-button.tsx` — salinan pola
  `ticket-reports/.../receipt/print-button.tsx` (tombol Kembali + Cetak), link balik ke
  `/business/${businessId}/members/${memberId}`.
- Tambah link "🪪 Cetak Kartu" di `members/[memberId]/page.tsx` dekat tombol Edit,
  membuka `/business/${businessId}/members/${memberId}/card` (target="_blank").
- Barcode pakai `member_code` yang sudah ada (mis. `M-0001`) — tidak butuh kolom baru,
  Code128 mendukung huruf/angka/strip.

## 6. Export CSV — `(dashboard)/ticket-reports/export/route.ts`

Mirroring persis pola `reports/export/route.ts` (helper `csvEscape`/`toCsv` di-duplikasi
lokal, bukan di-share — konsisten dengan cara file itu sendiri tidak share helper),
BOM UTF-8, `Content-Disposition`. Reuse `../../reports/period.ts` untuk parsing periode.

Tiga jenis lewat query param `type`:
- **`transactions`** — satu baris per `ticket_transactions`: No. Invoice, Tanggal, Jam,
  Kasir, Member, Hari (kerja/libur), Subtotal, Layanan, Pajak, Total, Metode Bayar,
  Diterima, Kembalian, Status (termasuk yang di-void, ditandai statusnya — beda dari
  laporan F&B yang exclude void, karena rekonsiliasi tiket fisik butuh lihat semua
  termasuk yang dibatalkan).
- **`tickets`** — satu baris per `ticket_serials`: No. Invoice, Tanggal, Jam, No. Seri,
  No. Tiket Manual, Kategori, Harga, Member?, Status.
- **`hourly`** — agregasi per jam (0-23) dalam rentang periode: Jam, Jumlah Tiket,
  Pendapatan. Bucket jam dihitung di JS pakai `timeZone: "Asia/Jakarta"` (bukan SQL
  `extract(hour from ...)` yang mengikuti timezone session DB, berpotensi UTC dan salah
  jam) — exclude tiket yang di-void dari hitungan (laporan volume, void tidak
  representasikan kunjungan asli).

Filename: `TiketTransaksi_{period}.csv`, `TiketPerUnit_{period}.csv`,
`TiketPerJam_{period}.csv`.

Wire ke `ticket-reports/page.tsx`: tambah blok "⬇️ Ekspor Data" (3 tombol, `grid-cols-3`)
sama seperti di `reports/page.tsx`.

**Tampilkan `manual_number` juga** (aditif, tidak mengubah yang sudah ada) di 3 tempat:
`ticket-reports/page.tsx` (baris rekonsiliasi), `ticket-reports/[transactionId]/page.tsx`
(daftar tiket), `ticket-reports/[transactionId]/receipt/page.tsx` (struk cetak) — semua
tambah kolom `manual_number` ke query `ticket_serials` yang sudah ada, tampil di samping
`serial_no`.

## Urutan implementasi & verifikasi

1. **Migration dulu** (paling berisiko). User paste ke Supabase SQL Editor. Verifikasi:
   `select count(*) from ticket_serials where manual_number is null;` harus 0; cek
   constraint & index muncul; smoke-test RPC baru langsung lewat SQL editor dengan
   `manual_numbers` array, cek serial_no lanjut dari terakhir.
2. `ticket-actions.ts` — mekanis, kecil.
3. `ticket-pos-screen.tsx` cart rework — paling berisiko di sisi UI, test menyeluruh:
   tambah beberapa unit dengan nomor fisik berbeda, cek subtotal benar, coba submit
   dengan nomor kosong (harus keblok), coba nomor dobel dalam kategori sama (harus dapat
   pesan ramah), checkout sukses cek invoice muncul.
4. Panel member — additive, tidak sentuh logika checkout. Test: scan (ketik+Enter) kode
   member langsung ketemu tanpa klik Cari; browse+cari dari daftar; tambah member baru
   inline lalu muncul di daftar tanpa reload.
5. Barcode/kartu member — independen, bisa kapan saja setelah migration. Test: buka kartu
   member, barcode Code128 muncul untuk `M-0001`, tombol cetak trigger print.
6. Export CSV — tergantung kolom `manual_number` dari langkah 1. Test: unduh ketiga file,
   buka di Excel, cek BOM/encoding oke, cek `manual_number` muncul di export tiket, cek
   bucket jam sesuai jam WIB transaksi test.

Semua pengujian browser bisa pakai bisnis test yang sudah ada: **"Kolam Renang Test"**
(id `f43c8529-7fe5-4074-9e98-43335da31267`), kasir "Kasir Tiket" PIN `1234` (manajer),
kategori Pengunjung/Penunggu, member "Budi Member" kode `M-0001` — tidak perlu bikin data
baru dari nol.
