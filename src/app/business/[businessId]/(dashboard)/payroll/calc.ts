// Logika hitung gaji pokok + potongan izin/keterlambatan — dipakai bareng
// oleh createPayslip (yang nyimpen ke DB) dan halaman Rekap Payroll (yang
// cuma nampilin estimasi tanpa bikin slip). Dipisah ke sini supaya dua
// tempat itu selalu pakai formula yang sama persis, nggak ada risiko
// ketinggalan sinkron kalau formulanya berubah lagi nanti.

export type AttendanceForCalc = {
  date: string;
  status: string;
  late: boolean;
  lateMinutes: number;
  // Izin weekend dengan keterangan jelas (note terisi) dianggap dispensasi
  // resmi -- dipotong seperti izin hari biasa (tanpa denda tambahan
  // weekend), bukan berarti hari itu jadi bukan izin.
  note: string | null;
};

export type LateTier = { thresholdMinutes: number; amount: number };

export type PayrollSettings = {
  // izinDeductionMode & izinDeductionWeekday sudah TIDAK dipakai lagi --
  // sisa dari cara lama sebelum potongan izin berbasis keterangan (lihat
  // calcPayslip). Dibiarkan ada di tipe/DB/UI cuma buat kompatibilitas,
  // tidak memengaruhi total gaji.
  izinDeductionMode: "flat" | "full_day";
  izinDeductionWeekday: number;
  // Masih dipakai -- nominal DENDA ekstra (bukan potongan gaji) buat izin
  // TANPA keterangan yang jatuh di hari weekend toko ini atau tanggal merah
  // di Kalender Libur Payroll. Lihat izinWeekendPenalty di calcPayslip.
  izinDeductionWeekend: number;
  // Dipakai kalau lateTiers kosong (bisnis belum sempat atur tingkatan
  // custom) — potongan flat per hari telat, tidak peduli berapa menitnya.
  lateDeductionPerOccurrence: number;
  // Tingkatan custom: "lebih dari N menit = Rp Y". Kalau ada isinya, ini
  // yang dipakai (bukan lateDeductionPerOccurrence) — dicari tier dengan
  // thresholdMinutes terbesar yang masih lebih kecil dari menit telat hari
  // itu. Nominal per tingkat bebas sama atau beda.
  lateTiers: LateTier[];
};

// "> N menit = Rp Y" — cari tier tertinggi yang thresholdnya masih
// terlampaui. Tidak ada tier yang cocok (mis. telat 3 menit tapi tier
// termurah "> 5 menit") = 0, tidak kena potongan.
function lateDeductionForMinutes(minutes: number, tiers: LateTier[], flatFallback: number): number {
  if (tiers.length === 0) return minutes > 0 ? flatFallback : 0;
  const sorted = [...tiers].sort((a, b) => a.thresholdMinutes - b.thresholdMinutes);
  let amount = 0;
  for (const t of sorted) {
    if (minutes > t.thresholdMinutes) amount = t.amount;
  }
  return amount;
}

export type EmployeeForCalc = {
  salaryType: "harian" | "bulanan";
  dailyRate: number;
  monthlyRate: number;
  // Komponen tambahan opsional (0 = tidak dipakai, gaji tetap cuma Gaji
  // Pokok seperti sebelumnya) -- nominal tetap x jumlah hari HADIR saja
  // (bukan izin), karena keduanya cuma berlaku kalau fisik masuk kerja.
  dailyMealAllowance: number;
  dailyAttendanceAllowance: number;
};

export type PayslipCalcResult = {
  hadirCount: number;
  izinCount: number;
  sakitCount: number;
  alpaCount: number;
  offCount: number;
  izinWeekdayCount: number;
  izinWeekendCount: number;
  // Dasar Gaji Pokok & potongan sekarang: izin dengan keterangan (note
  // terisi) dibayar penuh, tanpa keterangan kehilangan gaji 1 hari penuh --
  // lihat catatan panjang di calcPayslip soal kenapa ini menggantikan
  // izinDeductionMode/Weekday lama.
  izinNotedCount: number;
  izinUnnotedCount: number;
  // Dari izinUnnotedCount, berapa yang jatuh di hari weekend/tanggal merah
  // -- ini yang kena izinWeekendPenalty (DENDA, terpisah dari izinDeduction
  // yang cuma "gaji hari itu hilang"). Izin BERKETERANGAN tidak pernah kena
  // ini sama sekali, apapun harinya.
  izinUnnotedWeekendCount: number;
  lateCount: number;
  hariKerjaEfektif: number;
  basePay: number;
  mealAllowance: number;
  attendanceAllowance: number;
  izinDeduction: number;
  izinWeekendPenalty: number;
  lateDeduction: number;
  estimatedTotal: number;
};

// Rate lembur karyawan: pakai override per-karyawan kalau diisi, kalau
// tidak (null) pakai default toko. Dipakai bareng di Rekap Payroll (buat
// preview sebelum slip dibuat) dan createPayslip (buat snapshot final).
export function effectiveLemburRate(
  employeeRatePerHour: number | null,
  businessDefaultRatePerHour: number,
): number {
  return employeeRatePerHour ?? businessDefaultRatePerHour;
}

// Hari yang dianggap "weekend" buat potongan izin, per hari-dalam-minggu
// (0 = Minggu ... 6 = Sabtu). Default Sabtu-Minggu untuk semua bisnis,
// kecuali override eksplisit di sini. Adi's Culinary Pleburan liburnya
// Jumat-Sabtu (bukan Sabtu-Minggu seperti kebanyakan), jadi izin di hari itu
// yang kena denda tambahan, bukan Minggu.
const WEEKEND_DAYS_OVERRIDE: Record<string, number[]> = {
  "356ada11-270d-4249-b45c-0a30c12de58c": [5, 6], // ADIS'S CULINARY PLEBURAN
};

export function weekendDaysForBusiness(businessId: string): number[] {
  return WEEKEND_DAYS_OVERRIDE[businessId] ?? [0, 6];
}

export function calcPayslip(
  periodStart: string,
  periodEnd: string,
  attendanceRows: AttendanceForCalc[],
  employee: EmployeeForCalc,
  settings: PayrollSettings,
  weekendDays: number[] = [0, 6],
  // Tanggal merah/libur tambahan (di luar weekendDays) yang ditandai admin
  // lewat Kalender Libur Payroll -- ikut kena denda "izin weekend" yang sama.
  holidayDates: ReadonlySet<string> = new Set(),
): PayslipCalcResult {
  const counts = { hadir: 0, izin: 0, sakit: 0, alpa: 0, off: 0 };
  let izinWeekdayCount = 0;
  let izinWeekendCount = 0;
  let izinNotedCount = 0;
  let izinUnnotedCount = 0;
  let izinUnnotedWeekendCount = 0;
  let lateCount = 0;
  let lateDeduction = 0;
  for (const r of attendanceRows) {
    if (r.status in counts) counts[r.status as keyof typeof counts] += 1;
    if (r.status === "izin") {
      const dow = new Date(`${r.date}T00:00:00Z`).getUTCDay(); // 0 = Minggu, 6 = Sabtu
      const isWeekend = weekendDays.includes(dow) || holidayDates.has(r.date);
      const hasNote = !!r.note && r.note.trim().length > 0;
      // izinWeekdayCount/izinWeekendCount: statistik informasional saja
      // (weekend + keterangan jelas = dispensasi, ditampilkan sebagai
      // "hari biasa" bukan "weekend") -- TIDAK lagi dipakai buat
      // menghitung potongan, lihat izinNotedCount/izinUnnotedCount di
      // bawah buat itu.
      if (isWeekend && !hasNote) izinWeekendCount += 1;
      else izinWeekdayCount += 1;
      // Dasar Gaji Pokok/potongan yang sebenarnya: ada keterangan = dibayar
      // penuh (kayak hadir/sakit), tidak ada keterangan = kehilangan gaji 1
      // hari penuh -- berlaku hari apa saja, bukan cuma weekend. Kalau
      // TANPA keterangan itu jatuh di weekend/tanggal merah, kena DENDA
      // tambahan juga (izinWeekendPenalty) -- lihat basePay/izinDeduction
      // di bawah.
      if (hasNote) {
        izinNotedCount += 1;
      } else {
        izinUnnotedCount += 1;
        if (isWeekend) izinUnnotedWeekendCount += 1;
      }
    }
    if (r.late) {
      lateCount += 1;
      lateDeduction += lateDeductionForMinutes(r.lateMinutes, settings.lateTiers, settings.lateDeductionPerOccurrence);
    }
  }

  // Hari kerja efektif = total hari di periode dikurangi hari Off — dipakai
  // buat menurunkan rate harian dari gaji bulanan, jadi beda tiap bulan
  // tergantung panjang bulan & berapa hari Off yang diberikan.
  const totalDaysInPeriod =
    Math.round(
      (new Date(`${periodEnd}T00:00:00Z`).getTime() - new Date(`${periodStart}T00:00:00Z`).getTime()) /
        86400000,
    ) + 1;
  const hariKerjaEfektif = Math.max(1, totalDaysInPeriod - counts.off);

  // Gaji Pokok dibayar penuh buat Hadir, Sakit, dan Izin yang ada
  // keterangan (dianggap izin resmi/beralasan) -- Izin TANPA keterangan
  // dan Alpa membuat gaji hari itu otomatis hilang (tetap dihitung di sini
  // dulu, lalu izinDeduction di bawah menagih balik dailyEquivalent-nya,
  // ditambah izinWeekendPenalty kalau jatuh di weekend/tanggal merah). Ini
  // menggantikan settings.izinDeductionMode/izinDeductionWeekday yang lama
  // (izinDeductionWeekend TETAP dipakai, sekarang sebagai nominal denda
  // weekend, bukan lagi bagian dari mode flat/full_day). Berlaku sama di
  // semua bisnis, bukan cuma per-toko.
  const dailyEquivalent =
    employee.salaryType === "bulanan" ? employee.monthlyRate / hariKerjaEfektif : employee.dailyRate;
  // izinUnnotedCount ikut dimasukkan di sini (dibayar dulu), lalu ditagih
  // balik penuh lewat izinDeduction di bawah -- BUKAN langsung dikecualikan
  // dari sini -- supaya slip tetap punya baris "Potongan Izin" yang jelas
  // nominalnya, bukan cuma diam-diam hilang tanpa penjelasan.
  const basePay = dailyEquivalent * (counts.hadir + counts.sakit + izinNotedCount + izinUnnotedCount);
  const mealAllowance = counts.hadir * employee.dailyMealAllowance;
  const attendanceAllowance = counts.hadir * employee.dailyAttendanceAllowance;

  const izinDeduction = izinUnnotedCount * dailyEquivalent;
  // Denda ekstra (bukan potongan gaji) khusus izin TANPA keterangan yang
  // jatuh di weekend toko ini (weekendDaysForBusiness) atau tanggal merah
  // yang ditandai di Kalender Libur Payroll -- nominalnya dari
  // izinDeductionWeekend di Pengaturan Payroll, di luar gaji hari itu yang
  // sudah hilang lewat izinDeduction.
  const izinWeekendPenalty = izinUnnotedWeekendCount * settings.izinDeductionWeekend;

  return {
    hadirCount: counts.hadir,
    izinCount: counts.izin,
    sakitCount: counts.sakit,
    alpaCount: counts.alpa,
    offCount: counts.off,
    izinWeekdayCount,
    izinWeekendCount,
    izinNotedCount,
    izinUnnotedCount,
    izinUnnotedWeekendCount,
    lateCount,
    hariKerjaEfektif,
    basePay,
    mealAllowance,
    attendanceAllowance,
    izinDeduction,
    izinWeekendPenalty,
    lateDeduction,
    estimatedTotal:
      basePay + mealAllowance + attendanceAllowance - izinDeduction - izinWeekendPenalty - lateDeduction,
  };
}
