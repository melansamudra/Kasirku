// Rumus final 1 slip gaji (dipakai halaman Payroll & laporan cost-center per
// lokasi) -- diekstrak ke sini supaya kedua tempat itu tidak bisa diam-diam
// beda hasil kalau salah satu diubah belakangan.
export type PayslipAgg = {
  base_pay: number;
  meal_allowance: number;
  attendance_allowance: number;
  lembur_amount: number;
  thr_amount: number;
  izin_deduction: number;
  izin_weekend_penalty: number;
  late_deduction: number;
  kasbon_deduction: number;
  personal_loan_deduction: number;
  payslip_adjustments: { type: string; amount: number }[];
};

export function payslipTotal(p: PayslipAgg): number {
  const tunjangan = p.payslip_adjustments
    .filter((a) => a.type === "tunjangan")
    .reduce((s, a) => s + Number(a.amount), 0);
  const potongan = p.payslip_adjustments
    .filter((a) => a.type === "potongan")
    .reduce((s, a) => s + Number(a.amount), 0);
  return (
    Number(p.base_pay) +
    Number(p.meal_allowance) +
    Number(p.attendance_allowance) +
    Number(p.lembur_amount) +
    Number(p.thr_amount) +
    tunjangan -
    potongan -
    Number(p.izin_deduction) -
    Number(p.izin_weekend_penalty) -
    Number(p.late_deduction) -
    Number(p.kasbon_deduction) -
    Number(p.personal_loan_deduction)
  );
}
