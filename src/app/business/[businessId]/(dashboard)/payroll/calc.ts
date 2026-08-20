// Logika hitung gaji pokok + potongan izin/keterlambatan — dipakai bareng
// oleh createPayslip (yang nyimpen ke DB) dan halaman Rekap Payroll (yang
// cuma nampilin estimasi tanpa bikin slip). Dipisah ke sini supaya dua
// tempat itu selalu pakai formula yang sama persis, nggak ada risiko
// ketinggalan sinkron kalau formulanya berubah lagi nanti.

export type AttendanceForCalc = { date: string; status: string; late: boolean };

export type PayrollSettings = {
  izinDeductionWeekday: number;
  izinDeductionWeekend: number;
  lateDeductionPerOccurrence: number;
};

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

export function calcPayslip(
  periodStart: string,
  periodEnd: string,
  attendanceRows: AttendanceForCalc[],
  employee: EmployeeForCalc,
  settings: PayrollSettings,
): PayslipCalcResult {
  const counts = { hadir: 0, izin: 0, sakit: 0, alpa: 0, off: 0 };
  let izinWeekdayCount = 0;
  let izinWeekendCount = 0;
  let lateCount = 0;
  for (const r of attendanceRows) {
    if (r.status in counts) counts[r.status as keyof typeof counts] += 1;
    if (r.status === "izin") {
      const dow = new Date(`${r.date}T00:00:00Z`).getUTCDay(); // 0 = Minggu, 6 = Sabtu
      if (dow === 0 || dow === 6) izinWeekendCount += 1;
      else izinWeekdayCount += 1;
    }
    if (r.late) lateCount += 1;
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
    izinWeekdayCount * settings.izinDeductionWeekday + izinWeekendCount * settings.izinDeductionWeekend;
  const lateDeduction = lateCount * settings.lateDeductionPerOccurrence;

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
