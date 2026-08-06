-- Ukuran kertas per printer: 58 (mm) atau 80 (mm), default 58.
alter table kitchen_printers
  add column if not exists paper_width smallint not null default 58;
