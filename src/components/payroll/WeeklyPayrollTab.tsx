import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  CreditCard,
  Users,
  Eye,
  RefreshCw,
  Award,
  Sparkles,
  Info,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { formatIDR, parseIDRInput, formatIDRInput } from '../../utils/formatCurrency';
import { countWorkingDays } from '../../utils/workingDays';
import PieceworkBreakdownModal from './PieceworkBreakdownModal';
import type { PayrollItem, PieceworkTask, Staff, WeeklyPayroll } from '../../types';

interface WeeklyPayrollTabProps {
  calculateDraftPayroll: (params: {
    periodStart: string;
    periodEnd: string;
    salesTargetQty: number;
    salesBelowScheme: 'none' | 'half';
    customAttendance?: Record<string, number>;
    customAllowances?: Record<string, number>;
    customDeductions?: Record<string, number>;
    customBonusOverrides?: Record<string, number>;
  }) => Promise<{
    items: PayrollItem[];
    totalAmount: number;
    completedTasksByStaff: Record<string, PieceworkTask[]>;
    salesOrdersByStaff: Record<string, any[]>;
    bonusEligibleOrderIds?: string[];
  }>;
  createPayroll: (payload: {
    period_start: string;
    period_end: string;
    payment_date: string;
    sales_target_qty: number;
    sales_below_target_scheme: 'none' | 'half';
    notes?: string;
    items: Omit<PayrollItem, 'id' | 'payroll_id' | 'user_id' | 'created_at' | 'staff'>[];
  }) => Promise<WeeklyPayroll>;
  payPayroll: (payrollId: string) => Promise<any>;
  onPayrollPaidSuccess: () => void;
  /** Daftar payroll yang sudah ada (draft & paid) untuk preview overlap */
  existingPayrolls?: WeeklyPayroll[];
  /** Tandai order yang sudah masuk bonus sebagai bonus_paid setelah payroll dibayar */
  markOrderBonusPaid?: (orderIds: string[]) => Promise<void>;
}

function getDefaultPayrollPeriod() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0: Sun, 1: Mon, ..., 6: Sat

  // Diff to this week's Saturday
  const diffToSaturday = (6 - dayOfWeek + 7) % 7;
  const saturday = new Date(today);
  saturday.setDate(today.getDate() + diffToSaturday);

  // Monday of the same week (5 days before Saturday)
  const monday = new Date(saturday);
  monday.setDate(saturday.getDate() - 5);

  const toISO = (d: Date) => d.toISOString().slice(0, 10);
  return {
    periodStart: toISO(monday),
    periodEnd: toISO(saturday),
    paymentDate: toISO(saturday),
  };
}

function formatDateShort(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: '2-digit' });
}

export default function WeeklyPayrollTab({
  calculateDraftPayroll,
  createPayroll,
  payPayroll,
  onPayrollPaidSuccess,
  existingPayrolls = [],
  markOrderBonusPaid,
}: WeeklyPayrollTabProps) {
  const defaultDates = useMemo(() => getDefaultPayrollPeriod(), []);

  const [periodStart, setPeriodStart] = useState(defaultDates.periodStart);
  const [periodEnd, setPeriodEnd] = useState(defaultDates.periodEnd);
  const [paymentDate, setPaymentDate] = useState(defaultDates.paymentDate);

  const [salesTargetQty, setSalesTargetQty] = useState<number>(20);
  const [salesBelowScheme, setSalesBelowScheme] = useState<'none' | 'half'>('half');
  const [payrollNotes, setPayrollNotes] = useState('');

  // Overrides state per staff
  const [customAttendance, setCustomAttendance] = useState<Record<string, number>>({});
  const [customAllowances, setCustomAllowances] = useState<Record<string, number>>({});
  const [customDeductions, setCustomDeductions] = useState<Record<string, number>>({});
  const [customBonusOverrides, setCustomBonusOverrides] = useState<Record<string, number>>({});

  // Calculation results
  const [items, setItems] = useState<PayrollItem[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [completedTasksByStaff, setCompletedTasksByStaff] = useState<Record<string, PieceworkTask[]>>({});
  const [salesOrdersByStaff, setSalesOrdersByStaff] = useState<Record<string, any[]>>({});
  const [bonusEligibleOrderIds, setBonusEligibleOrderIds] = useState<string[]>([]);

  const [calculating, setCalculating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Breakdown modal state
  const [selectedStaffForBreakdown, setSelectedStaffForBreakdown] = useState<Staff | null>(null);

  // Confirmation dialog state
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Hitung maks hari kerja periode ini (Senin–Sabtu)
  const maxWorkingDays = useMemo(() => {
    if (!periodStart || !periodEnd) return 6;
    return countWorkingDays(periodStart, periodEnd);
  }, [periodStart, periodEnd]);

  // Deteksi overlap dengan payroll existing
  const overlappingPayrolls = useMemo(() => {
    if (!periodStart || !periodEnd) return [];
    return existingPayrolls.filter((p) => {
      return p.period_start <= periodEnd && p.period_end >= periodStart;
    });
  }, [existingPayrolls, periodStart, periodEnd]);

  // Compute draft items
  const loadDraft = useCallback(async () => {
    try {
      setCalculating(true);
      setErrorMsg(null);
      const res = await calculateDraftPayroll({
        periodStart,
        periodEnd,
        salesTargetQty: Number(salesTargetQty) || 0,
        salesBelowScheme,
        customAttendance,
        customAllowances,
        customDeductions,
        customBonusOverrides,
      });

      setItems(res.items);
      setTotalAmount(res.totalAmount);
      setCompletedTasksByStaff(res.completedTasksByStaff);
      setSalesOrdersByStaff(res.salesOrdersByStaff);
      setBonusEligibleOrderIds(res.bonusEligibleOrderIds ?? []);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Gagal menghitung draft payroll.');
    } finally {
      setCalculating(false);
    }
  }, [
    calculateDraftPayroll,
    periodStart,
    periodEnd,
    salesTargetQty,
    salesBelowScheme,
    customAttendance,
    customAllowances,
    customDeductions,
    customBonusOverrides,
  ]);

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  // Aggregate breakdown
  const summary = useMemo(() => {
    let totalPiecework = 0;
    let totalAttendance = 0;
    let totalSalesBonus = 0;
    let totalAllowances = 0;
    let totalDeductions = 0;

    for (const item of items) {
      totalPiecework += Number(item.piecework_amount || 0);
      totalAttendance += Number(item.base_amount || 0);
      totalSalesBonus += Number(item.sales_bonus_amount || 0);
      totalAllowances += Number(item.allowances || 0);
      totalDeductions += Number(item.deductions || 0);
    }

    return {
      totalPiecework,
      totalAttendance,
      totalSalesBonus,
      totalAllowances,
      totalDeductions,
      staffCount: items.length,
    };
  }, [items]);

  // Handle pay submission
  async function handleExecutePayment() {
    try {
      setSubmitting(true);
      setErrorMsg(null);

      // 1. Prepare items payload
      const itemPayload = items.map((it) => ({
        staff_id: it.staff_id,
        wage_type: it.wage_type,
        attendance_days: it.attendance_days || 0,
        daily_rate: it.daily_rate || 0,
        base_amount: it.base_amount || 0,
        piecework_amount: it.piecework_amount || 0,
        sales_total_qty: it.sales_total_qty || 0,
        sales_potential_bonus: it.sales_potential_bonus || 0,
        sales_bonus_percentage: it.sales_bonus_percentage || 100,
        sales_bonus_amount: it.sales_bonus_amount || 0,
        allowances: it.allowances || 0,
        deductions: it.deductions || 0,
        take_home_pay: it.take_home_pay,
        notes: it.notes || null,
      }));

      // 2. Create Payroll
      const payroll = await createPayroll({
        period_start: periodStart,
        period_end: periodEnd,
        payment_date: paymentDate,
        sales_target_qty: salesTargetQty,
        sales_below_target_scheme: salesBelowScheme,
        notes: payrollNotes.trim() || undefined,
        items: itemPayload,
      });

      // 3. Trigger RPC to pay & record in Finance transactions
      await payPayroll(payroll.id);

      // 4. Tandai order-order yang sudah masuk hitungan bonus sebagai bonus_paid
      //    supaya tidak terhitung dua kali di periode berikutnya.
      if (markOrderBonusPaid && bonusEligibleOrderIds.length > 0) {
        await markOrderBonusPaid(bonusEligibleOrderIds);
      }

      setShowConfirmModal(false);
      onPayrollPaidSuccess();
    } catch (err: any) {
      console.error('Error executing payroll:', err);
      // Tampilkan pesan asli dari trigger DB (bukan generic error)
      const msg = err?.message || '';
      setErrorMsg(
        msg.includes('tumpang tindih')
          ? msg
          : msg || 'Gagal mengeksekusi pembayaran payroll.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Config Bar */}
      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-border pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Periode Penggajian &amp; Skema Pembayaran
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Standar pembayaran mingguan dilakukan setiap hari Sabtu untuk seluruh staf borongan, absensi, dan sales.
            </p>
          </div>

          <button
            onClick={loadDraft}
            disabled={calculating}
            className="inline-flex items-center gap-1.5 self-start lg:self-auto rounded-lg border border-border bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${calculating ? 'animate-spin' : ''}`} />
            Hitung Ulang Draft
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          {/* Periode Mulai */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Mulai Periode (Senin)
            </label>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-1.5 text-sm text-slate-800 focus:border-primary focus:outline-none"
            />
          </div>

          {/* Periode Selesai */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Cut-off Periode (Sabtu)
            </label>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-1.5 text-sm text-slate-800 focus:border-primary focus:outline-none"
            />
          </div>

          {/* Target Sales */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
              <span>Target Sales (Pcs)</span>
              <span className="text-[10px] text-primary font-normal">Fleksibel Owner</span>
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                value={salesTargetQty}
                onChange={(e) => setSalesTargetQty(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-border px-3 py-1.5 text-sm text-slate-800 focus:border-primary focus:outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                pcs/mgg
              </span>
            </div>
          </div>

          {/* Skema jika di bawah target */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Kebijakan Jika &lt; Target
            </label>
            <select
              value={salesBelowScheme}
              onChange={(e) => setSalesBelowScheme(e.target.value as 'none' | 'half')}
              className="w-full rounded-lg border border-border px-3 py-1.5 text-sm text-slate-800 focus:border-primary focus:outline-none"
            >
              <option value="half">Cair 50% (Sebagian)</option>
              <option value="none">0% (Tidak Cair)</option>
            </select>
          </div>
        </div>

        {/* Info maks hari kerja */}
        <div className="flex items-center gap-2 rounded-lg bg-sky-50 border border-sky-200 px-3 py-2 text-xs text-sky-800">
          <Clock className="h-4 w-4 text-sky-500 shrink-0" />
          <span>
            <strong>Maks hari kerja periode ini: {maxWorkingDays} hari</strong>
            {' '}(Senin–Sabtu, Minggu libur) — input absensi tidak boleh melebihi angka ini.
          </span>
        </div>

        {/* Warning overlap dengan payroll existing */}
        {overlappingPayrolls.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <span>Peringatan: Periode ini bertabrakan dengan payroll yang sudah ada!</span>
            </div>
            <ul className="ml-6 space-y-0.5 list-disc text-amber-700">
              {overlappingPayrolls.map((p) => (
                <li key={p.id}>
                  {formatDateShort(p.period_start)} – {formatDateShort(p.period_end)}
                  {' '}
                  <span className={`font-semibold ${p.status === 'paid' ? 'text-emerald-700' : 'text-amber-700'}`}>
                    ({p.status === 'paid' ? 'Sudah Dibayar' : 'Draft'})
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-amber-600">Jika tetap submit, database akan menolak dengan error.</p>
          </div>
        )}

        {/* Daftar payroll existing (preview) */}
        {existingPayrolls.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground font-medium flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              Lihat {existingPayrolls.length} payroll yang sudah ada (untuk cek bentrok)
            </summary>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {existingPayrolls.slice(0, 10).map((p) => (
                <div key={p.id} className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-[11px] ${
                  p.status === 'paid'
                    ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
                    : 'border-amber-100 bg-amber-50 text-amber-800'
                }`}>
                  <span>{formatDateShort(p.period_start)} – {formatDateShort(p.period_end)}</span>
                  <span className="font-semibold">{p.status === 'paid' ? '✓ Paid' : 'Draft'}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 flex items-start gap-2 border border-slate-200">
          <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-slate-800">Ketentuan Otomatisasi:</span>
            <ul className="list-disc list-inside mt-0.5 space-y-0.5 text-muted-foreground">
              <li>
                <strong>Penjahit / Potong:</strong> Akumulasi dari tugas borongan bertanda <em>"Selesai (Siap Bayar)"</em>.
              </li>
              <li>
                <strong>Absensi / Staf Harian:</strong> Dihitung berdasarkan hari kerja (default 6 hari) × tarif harian.
              </li>
              <li>
                <strong>Sales:</strong> Gaji harian (absensi × tarif) <strong>ditambah</strong> bonus dari order yang sudah lunas &amp; pengerjaan selesai (belum pernah masuk payroll sebelumnya).
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3.5 shadow-sm">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-700">
            Upah Borongan
          </span>
          <p className="mt-1 text-lg font-black text-purple-950">{formatIDR(summary.totalPiecework)}</p>
          <span className="text-[10px] text-purple-600">Penjahit &amp; Potong</span>
        </div>

        <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3.5 shadow-sm">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-700">
            Gaji Harian / Absensi
          </span>
          <p className="mt-1 text-lg font-black text-sky-950">{formatIDR(summary.totalAttendance)}</p>
          <span className="text-[10px] text-sky-600">Staf Umum &amp; Sales (base)</span>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 shadow-sm">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
            Bonus Sales
          </span>
          <p className="mt-1 text-lg font-black text-emerald-950">{formatIDR(summary.totalSalesBonus)}</p>
          <span className="text-[10px] text-emerald-600">Insentif per PCS</span>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 shadow-sm">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
            Tunjangan / Potongan
          </span>
          <p className="mt-1 text-lg font-black text-amber-950">
            +{formatIDR(summary.totalAllowances - summary.totalDeductions)}
          </p>
          <span className="text-[10px] text-amber-600">Penyesuaian kasbon/bonus</span>
        </div>

        <div className="col-span-2 sm:col-span-1 rounded-xl border border-primary/30 bg-primary/5 p-3.5 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
            Grand Total Payroll
          </span>
          <p className="mt-1 text-xl font-black text-primary">{formatIDR(totalAmount)}</p>
          <span className="text-[10px] text-muted-foreground">{summary.staffCount} staf aktif</span>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-start gap-2">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-500 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Staff Payroll Draft Table */}
      <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
        <div className="border-b border-border bg-slate-50/60 px-5 py-3.5 flex items-center justify-between">
          <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Rincian Pembayaran Staf &amp; Karyawan
          </h4>
          <span className="text-xs text-muted-foreground">
            Periode: <strong>{periodStart}</strong> s/d <strong>{periodEnd}</strong>
            {' '}<span className="text-sky-600 font-semibold">({maxWorkingDays} hari kerja)</span>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-slate-50/80 text-[11px] font-semibold text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Nama &amp; Peran</th>
                <th className="px-4 py-3">Skema Upah</th>
                <th className="px-4 py-3">Rincian Hak Upah / Pengerjaan</th>
                <th className="px-4 py-3 text-right">Upah Dasar / Borongan</th>
                <th className="px-4 py-3 text-right">Tunjangan (+)</th>
                <th className="px-4 py-3 text-right">Potongan (-)</th>
                <th className="px-4 py-3 text-right">Total Dibayarkan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => {
                const staff = item.staff;
                const staffId = item.staff_id;
                const tasks = completedTasksByStaff[staffId] || [];

                return (
                  <tr key={staffId} className="hover:bg-slate-50/60 transition">
                    {/* Nama & Peran */}
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-slate-900">{staff?.name || 'Karyawan'}</div>
                      <div className="text-xs text-muted-foreground">{staff?.role || 'Umum'}</div>
                    </td>

                    {/* Skema Upah */}
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200">
                        {item.wage_type === 'piecework'
                          ? 'Borongan'
                          : item.wage_type === 'sales'
                          ? 'Sales (Dual)'
                          : 'Harian / Absensi'}
                      </span>
                    </td>

                    {/* Rincian Pengerjaan */}
                    <td className="px-4 py-3.5">
                      {item.wage_type === 'piecework' ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-700">
                            {tasks.length} pekerjaan selesai
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedStaffForBreakdown(staff || null)}
                            className="inline-flex items-center gap-1 rounded bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 hover:bg-purple-100 transition border border-purple-200"
                          >
                            <Eye className="h-3 w-3" />
                            Rincian Tugas
                          </button>
                        </div>
                      ) : item.wage_type === 'sales' ? (
                        /* SALES: tampilkan input attendance DAN info bonus */
                        <div className="space-y-2 text-xs">
                          {/* Input hari masuk (sama seperti attendance) */}
                          <div className="flex items-center gap-2">
                            <label className="text-muted-foreground">Hari Masuk:</label>
                            <input
                              type="number"
                              min="0"
                              max={maxWorkingDays}
                              value={customAttendance[staffId] ?? item.attendance_days ?? 6}
                              onChange={(e) => {
                                const val = Math.min(
                                  maxWorkingDays,
                                  Math.max(0, parseInt(e.target.value) || 0)
                                );
                                setCustomAttendance((prev) => ({ ...prev, [staffId]: val }));
                              }}
                              className="w-14 rounded border border-border px-1.5 py-0.5 text-center font-bold text-slate-800 focus:border-primary focus:outline-none"
                            />
                            <span className="text-muted-foreground">
                              / {maxWorkingDays} × {formatIDR(item.daily_rate || 0)}/hr
                            </span>
                          </div>
                          {/* Info bonus */}
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-800">
                                {item.sales_total_qty} pcs terjual (eligible)
                              </span>
                              {Number(item.sales_total_qty) >= Number(salesTargetQty) ? (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.2 text-[10px] font-semibold text-emerald-800">
                                  <Award className="h-3 w-3" /> Target Capai (100%)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.2 text-[10px] font-semibold text-amber-800">
                                  &lt; Target ({item.sales_bonus_percentage}%)
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              Bonus potensi: {formatIDR(item.sales_potential_bonus || 0)}
                              {' '}· Gaji base: {formatIDR(item.base_amount || 0)}
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* ATTENDANCE */
                        <div className="flex items-center gap-2 text-xs">
                          <label className="text-muted-foreground">Hari Masuk:</label>
                          <input
                            type="number"
                            min="0"
                            max={maxWorkingDays}
                            value={customAttendance[staffId] ?? item.attendance_days ?? 6}
                            onChange={(e) => {
                              const val = Math.min(
                                maxWorkingDays,
                                Math.max(0, parseInt(e.target.value) || 0)
                              );
                              setCustomAttendance((prev) => ({ ...prev, [staffId]: val }));
                            }}
                            className="w-14 rounded border border-border px-1.5 py-0.5 text-center font-bold text-slate-800 focus:border-primary focus:outline-none"
                          />
                          <span className="text-muted-foreground">
                            / {maxWorkingDays} × {formatIDR(item.daily_rate || 0)}/hr
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Upah Dasar / Borongan */}
                    <td className="px-4 py-3.5 text-right font-bold text-slate-800 whitespace-nowrap">
                      {item.wage_type === 'piecework'
                        ? formatIDR(item.piecework_amount)
                        : item.wage_type === 'sales'
                        ? (
                          <div className="text-right">
                            <div>{formatIDR((item.base_amount || 0) + (item.sales_bonus_amount || 0))}</div>
                            <div className="text-[11px] font-normal text-muted-foreground">
                              {formatIDR(item.base_amount || 0)} + {formatIDR(item.sales_bonus_amount || 0)}
                            </div>
                          </div>
                        )
                        : formatIDR(item.base_amount)}
                    </td>

                    {/* Tunjangan (+) */}
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <input
                        type="text"
                        value={formatIDRInput(customAllowances[staffId] ?? item.allowances ?? 0)}
                        onChange={(e) => {
                          const val = parseIDRInput(e.target.value);
                          setCustomAllowances((prev) => ({ ...prev, [staffId]: val }));
                        }}
                        className="w-24 rounded border border-border px-2 py-1 text-right text-xs font-medium text-emerald-700 focus:border-primary focus:outline-none"
                        placeholder="Rp 0"
                      />
                    </td>

                    {/* Potongan (-) */}
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <input
                        type="text"
                        value={formatIDRInput(customDeductions[staffId] ?? item.deductions ?? 0)}
                        onChange={(e) => {
                          const val = parseIDRInput(e.target.value);
                          setCustomDeductions((prev) => ({ ...prev, [staffId]: val }));
                        }}
                        className="w-24 rounded border border-border px-2 py-1 text-right text-xs font-medium text-rose-700 focus:border-primary focus:outline-none"
                        placeholder="Rp 0"
                      />
                    </td>

                    {/* Take Home Pay */}
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <span className="text-sm font-black text-slate-900">
                        {formatIDR(item.take_home_pay)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-border bg-slate-50 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex-1 max-w-md">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Catatan Penggajian (Opsional)
            </label>
            <input
              type="text"
              placeholder="Contoh: Penggajian Sabtu Minggu ke-3 September 2026..."
              value={payrollNotes}
              onChange={(e) => setPayrollNotes(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-primary focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
            <div className="text-right mr-2">
              <span className="text-[11px] text-muted-foreground block">Total Yang Harus Dibayarkan:</span>
              <span className="text-xl font-black text-primary">{formatIDR(totalAmount)}</span>
            </div>

            <button
              type="button"
              disabled={submitting || calculating || totalAmount <= 0 || overlappingPayrolls.length > 0}
              onClick={() => setShowConfirmModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-md hover:bg-emerald-700 transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="h-5 w-5" />
              Bayar Payroll &amp; Catat ke Keuangan
            </button>
          </div>
        </div>
      </div>

      {/* Detail breakdown modal for piecework */}
      <PieceworkBreakdownModal
        isOpen={Boolean(selectedStaffForBreakdown)}
        onClose={() => setSelectedStaffForBreakdown(null)}
        staff={selectedStaffForBreakdown}
        tasks={selectedStaffForBreakdown ? completedTasksByStaff[selectedStaffForBreakdown.id] || [] : []}
      />

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <CreditCard className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Konfirmasi Pembayaran Payroll
                </h3>
                <p className="text-xs text-muted-foreground">
                  Periode: {periodStart} s/d {periodEnd}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-4 border border-border space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Jumlah Karyawan:</span>
                <span className="font-bold text-slate-800">{items.length} orang</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Dibayarkan:</span>
                <span className="font-black text-base text-emerald-700">{formatIDR(totalAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Kategori Biaya:</span>
                <span className="font-semibold text-slate-800">Gaji Karyawan</span>
              </div>
              {bonusEligibleOrderIds.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Order bonus dicairkan:</span>
                  <span className="font-semibold text-emerald-700">{bonusEligibleOrderIds.length} order</span>
                </div>
              )}
            </div>

            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200">
              <span className="font-semibold">Perhatian:</span> Sistem akan menandai seluruh tugas borongan staf sebagai <strong>Sudah Dibayar (Lunas)</strong>, order yang sudah masuk hitungan bonus akan ditandai <strong>bonus_paid</strong>, dan otomatis mencatat pengeluaran di modul Keuangan.
            </div>

            {errorMsg && (
              <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowConfirmModal(false)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleExecutePayment}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Ya, Bayar Sekarang
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
