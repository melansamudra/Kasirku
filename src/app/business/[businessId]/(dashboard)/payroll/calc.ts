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
  // "flat": izinDeductionWeekday/Weekend dipakai apa adanya (nominal Rp
  // tetap, diisi manual). "full_day": potongan izin weekday = 1 hari gaji
  // penuh (dihitung otomatis dari rate karyawan, ikut naik-turun kalau
  // gajinya berubah), weekend = 1 hari gaji penuh + izinDeductionWeekend
  // sebagai denda tambahan. izinDeductionWeekday diabaikan di mode ini.
  izinDeductionMode: "flat" | "full_day";
  izinDeductionWeekday: number;
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
};

export type PayslipCalcResult = {
  hadirCount: number;
  izinCount: number;
  sakitCount: number;
  alpaCount: number;
  offCount: number;
  izinWeekdayCount: number;
  izinWeekendCount: number;
  lateCount: number;
  hariKerjaEfektif: number;
  basePay: number;
  izinDeduction: number;
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
  let lateCount = 0;
  let lateDeduction = 0;
  for (const r of attendanceRows) {
    if (r.status in counts) counts[r.status as keyof typeof counts] += 1;
    if (r.status === "izin") {
      const dow = new Date(`${r.date}T00:00:00Z`).getUTCDay(); // 0 = Minggu, 6 = Sabtu
      const isWeekend = weekendDays.includes(dow) || holidayDates.has(r.date);
      const hasNote = !!r.note && r.note.trim().length > 0;
      // Weekend + keterangan jelas = dispensasi, dipotong seperti hari
      // biasa (tanpa denda tambahan weekend) -- lihat catatan di
      // AttendanceForCalc.note.
      if (isWeekend && !hasNote) izinWeekendCount += 1;
      else izinWeekdayCount += 1;
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

  // Izin sekarang dihitung tetap dibayar (seperti hadir) di gaji pokok, tapi
  // kena potongan tetap terpisah — menggantikan cara lama (izin = tidak
  // dihitung sama sekali, sehingga upah hari itu hilang begitu saja).
  const dailyEquivalent =
    employee.salaryType === "bulanan" ? employee.monthlyRate / hariKerjaEfektif : employee.dailyRate;
  const basePay = dailyEquivalent * (counts.hadir + counts.izin);

  const izinDeduction =
    settings.izinDeductionMode === "full_day"
      ? izinWeekdayCount * dailyEquivalent + izinWeekendCount * (dailyEquivalent + settings.izinDeductionWeekend)
      : izinWeekdayCount * settings.izinDeductionWeekday + izinWeekendCount * settings.izinDeductionWeekend;

  return {
    hadirCount: counts.hadir,
    izinCount: counts.izin,
    sakitCount: counts.sakit,
    alpaCount: counts.alpa,
    offCount: counts.off,
    izinWeekdayCount,
    izinWeekendCount,
    lateCount,
    hariKerjaEfektif,
    basePay,
    izinDeduction,
    lateDeduction,
    estimatedTotal: basePay - izinDeduction - lateDeduction,
  };
}
