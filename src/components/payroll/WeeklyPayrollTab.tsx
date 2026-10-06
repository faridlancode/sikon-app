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
  Scissors,
} from 'lucide-react';
import Button from '../ui/button';
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
    <div className="space-y-5">
      {/* Config Bar */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-soft space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-border pb-4">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Periode Penggajian &amp; Skema Pembayaran
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Standar pembayaran mingguan dilakukan setiap hari Sabtu untuk seluruh staf borongan, absensi, dan sales.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={loadDraft}
            disabled={calculating}
            className="h-9 self-start text-xs lg:self-auto"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${calculating ? 'animate-spin' : ''}`} />
            Hitung Ulang Draft
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Periode Mulai */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Mulai Periode (Senin)
            </label>
            <input
              type="date"
              aria-label="Mulai Periode (Senin)"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="h-10 w-full min-w-0 rounded-md border border-border bg-card px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
          </div>

          {/* Periode Selesai */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Cut-off Periode (Sabtu)
            </label>
            <input
              type="date"
              aria-label="Cut-off Periode (Sabtu)"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="h-10 w-full min-w-0 rounded-md border border-border bg-card px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
          </div>

          {/* Target Sales */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1 flex items-center justify-between">
              <span>Target Sales (Pcs)</span>
              <span className="text-xs text-primary font-normal">Fleksibel Owner</span>
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                aria-label="Target Sales (Pcs)"
                value={salesTargetQty}
                onChange={(e) => setSalesTargetQty(Number(e.target.value) || 0)}
                className="h-10 w-full min-w-0 rounded-md border border-border bg-card px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                pcs/mgg
              </span>
            </div>
          </div>

          {/* Skema jika di bawah target */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Kebijakan Jika &lt; Target
            </label>
            <select
              aria-label="Kebijakan Jika di bawah Target"
              value={salesBelowScheme}
              onChange={(e) => setSalesBelowScheme(e.target.value as 'none' | 'half')}
              className="h-10 w-full min-w-0 rounded-md border border-border bg-card px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
            >
              <option value="half">Cair 50% (Sebagian)</option>
              <option value="none">0% (Tidak Cair)</option>
            </select>
          </div>
        </div>

        {/* Info maks hari kerja */}
        <div className="flex items-center gap-2 rounded-lg bg-accent border border-primary/20 px-3 py-2 text-xs text-primary">
          <Clock className="h-4 w-4 text-primary shrink-0" />
          <span>
            <strong>Maks hari kerja periode ini: {maxWorkingDays} hari</strong>
            {' '}(Senin–Sabtu, Minggu libur) — input absensi tidak boleh melebihi angka ini.
          </span>
        </div>

        {/* Warning overlap dengan payroll existing */}
        {overlappingPayrolls.length > 0 && (
          <div className="rounded-lg bg-warning-soft border border-warning px-3 py-2.5 text-xs text-warning space-y-1.5">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
              <span>Peringatan: Periode ini bertabrakan dengan payroll yang sudah ada!</span>
            </div>
            <ul className="ml-6 space-y-0.5 list-disc text-warning">
              {overlappingPayrolls.map((p) => (
                <li key={p.id}>
                  {formatDateShort(p.period_start)} – {formatDateShort(p.period_end)}
                  {' '}
                  <span className={`font-semibold ${p.status === 'paid' ? 'text-success' : 'text-warning'}`}>
                    ({p.status === 'paid' ? 'Sudah Dibayar' : 'Draft'})
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-warning">Jika tetap submit, database akan menolak dengan error.</p>
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
                <div key={p.id} className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs ${
                  p.status === 'paid'
                    ? 'border-success bg-success-soft text-success'
                    : 'border-warning bg-warning-soft text-warning'
                }`}>
                  <span>{formatDateShort(p.period_start)} – {formatDateShort(p.period_end)}</span>
                  <span className="font-semibold">{p.status === 'paid' ? '✓ Paid' : 'Draft'}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        <details className="border-t border-border pt-3 text-xs">

          <summary className="cursor-pointer font-semibold text-muted-foreground">Ketentuan perhitungan gaji</summary>
          <div className="mt-2">
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
          </details>
        </details>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {[
          { label: 'Upah Borongan', value: summary.totalPiecework, detail: 'Penjahit & potong' },
          { label: 'Gaji Harian / Absensi', value: summary.totalAttendance, detail: 'Staf umum & sales' },
          { label: 'Bonus Sales', value: summary.totalSalesBonus, detail: 'Insentif per pcs' },
          { label: 'Tunjangan / Potongan', value: summary.totalAllowances - summary.totalDeductions, detail: 'Penyesuaian kasbon/bonus' },
        ].map(({ label, value, detail }) => (
          <div key={label} className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-soft">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-2 break-words text-lg font-bold tabular-nums text-foreground">{formatIDR(value)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </div>
        ))}
        <div className="col-span-2 min-w-0 rounded-lg border border-primary/20 bg-accent p-4 shadow-soft lg:col-span-1">
          <p className="text-xs font-semibold text-primary">Grand Total Payroll</p>
          <p className="mt-2 break-words text-lg font-bold tabular-nums text-primary">{formatIDR(totalAmount)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{summary.staffCount} staf aktif</p>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-destructive bg-destructive-soft p-4 text-sm text-destructive flex items-start gap-2">
          <AlertCircle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Staff Payroll Draft Table */}
      <div className="rounded-lg border border-border bg-card shadow-soft overflow-hidden">
        <div className="border-b border-border bg-gradient-to-r from-muted to-white px-4 py-4 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <h4 className="font-semibold text-sm text-foreground flex flex-wrap items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Rincian Pembayaran Staf &amp; Karyawan
            <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
              {items.length} orang
            </span>
          </h4>
          <span className="text-xs text-muted-foreground">
            Periode:{' '}
            <strong className="text-foreground">{periodStart}</strong>
            {' '}s/d{' '}
            <strong className="text-foreground">{periodEnd}</strong>
            {' '}<span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-primary">({maxWorkingDays} hari kerja)</span>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm tabular-nums">
            <thead className="border-b border-border bg-muted/60 text-xs font-semibold text-muted-foreground ">
              <tr>
                <th className="w-8 px-4 py-3 text-center text-muted-foreground">#</th>
                <th className="px-4 py-3">Nama &amp; Peran</th>
                <th className="px-4 py-3">Skema Upah</th>
                <th className="px-4 py-3">Rincian Pengerjaan / Absensi</th>
                <th className="px-4 py-3 text-right">Upah Dasar</th>
                <th className="px-4 py-3 text-right">Tunjangan (+)</th>
                <th className="px-4 py-3 text-right">Potongan (−)</th>
                <th className="px-4 py-3 text-right bg-primary/5 text-primary">Total Dibayarkan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {items.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center">
                  <Users className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">{calculating ? 'Menghitung draft penggajian…' : 'Belum ada staf dalam periode ini'}</p>
                </td></tr>
              )}
              {items.map((item, idx) => {
                const staff = item.staff;
                const staffId = item.staff_id;
                const tasks = completedTasksByStaff[staffId] || [];
                const isEven = idx % 2 === 0;

                return (
                  <tr key={staffId} className={`group hover:bg-muted/40 transition-colors ${isEven ? 'bg-card' : 'bg-muted/40'}`}>
                    {/* Row Number */}
                    <td className="w-8 px-4 py-4 text-center text-xs font-medium text-muted-foreground">
                      {idx + 1}
                    </td>
                    {/* Nama & Peran */}
                    <td className="px-4 py-4">
                      <div className="font-bold text-foreground leading-tight">{staff?.name || 'Karyawan'}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{staff?.role || 'Umum'}</div>
                    </td>

                    {/* Skema Upah */}
                    <td className="px-4 py-4">
                      {item.wage_type === 'piecework' ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-primary border border-primary/20">
                          <Scissors className="h-3 w-3" />Borongan
                        </span>
                      ) : item.wage_type === 'sales' ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-success-soft px-2.5 py-1 text-xs font-semibold text-success border border-success">
                          <TrendingUp className="h-3 w-3" />Sales
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-primary border border-primary/20">
                          <Calendar className="h-3 w-3" />Harian
                        </span>
                      )}
                    </td>

                    {/* Rincian Pengerjaan */}
                    <td className="px-4 py-4">
                      {item.wage_type === 'piecework' ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-foreground font-medium">
                            {tasks.length} tugas selesai
                          </span>
                          <Button
                            type="button"
                            onClick={() => setSelectedStaffForBreakdown(staff || null)}
                            variant="outline" size="sm" className="h-8 px-2.5 text-xs"
                          >
                            <Eye className="h-3 w-3" />
                            Rincian
                          </Button>
                        </div>
                      ) : item.wage_type === 'sales' ? (
                        /* SALES */
                        <div className="space-y-2 text-xs">
                          <div className="flex items-center gap-2">
                            <label className="shrink-0 text-muted-foreground font-medium">Hari Masuk:</label>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min="0"
                                max={maxWorkingDays}
                                aria-label={`Hari masuk ${staff?.name || "karyawan"}`}
                                value={customAttendance[staffId] ?? item.attendance_days ?? 6}
                                onChange={(e) => {
                                  const val = Math.min(
                                    maxWorkingDays,
                                    Math.max(0, parseInt(e.target.value) || 0)
                                  );
                                  setCustomAttendance((prev) => ({ ...prev, [staffId]: val }));
                                }}
                                className="w-12 rounded-lg border border-border px-1.5 py-1 text-center text-xs font-bold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                              />
                              <span className="text-muted-foreground text-xs">/ {maxWorkingDays} hr</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground">{item.sales_total_qty} pcs terjual</span>
                            {Number(item.sales_total_qty) >= Number(salesTargetQty) ? (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-success-soft px-2 py-0.5 text-xs font-bold text-success">
                                <Award className="h-3 w-3" /> Target Capai
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-bold text-warning">
                                &lt; Target ({item.sales_bonus_percentage}%)
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Bonus potensial: <span className="font-semibold text-success">{formatIDR(item.sales_potential_bonus || 0)}</span>
                          </div>
                        </div>
                      ) : (
                        /* ATTENDANCE */
                        <div className="flex items-center gap-2 text-xs">
                          <label className="shrink-0 text-muted-foreground font-medium">Hari Masuk:</label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              max={maxWorkingDays}
                              aria-label={`Hari masuk ${staff?.name || "karyawan"}`}
                                value={customAttendance[staffId] ?? item.attendance_days ?? 6}
                              onChange={(e) => {
                                const val = Math.min(
                                  maxWorkingDays,
                                  Math.max(0, parseInt(e.target.value) || 0)
                                );
                                setCustomAttendance((prev) => ({ ...prev, [staffId]: val }));
                              }}
                              className="w-12 rounded-lg border border-border px-1.5 py-1 text-center text-xs font-bold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                            />
                            <span className="text-muted-foreground text-xs">/ {maxWorkingDays} × {formatIDR(item.daily_rate || 0)}/hr</span>
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Upah Dasar / Borongan */}
                    <td className="px-4 py-4 text-right font-semibold text-foreground whitespace-nowrap">
                      {item.wage_type === 'piecework' ? (
                        <span className="font-bold text-primary">{formatIDR(item.piecework_amount)}</span>
                      ) : item.wage_type === 'sales' ? (
                        <div className="text-right">
                          <div className="font-bold text-success">{formatIDR((item.base_amount || 0) + (item.sales_bonus_amount || 0))}</div>
                          <div className="text-xs font-normal text-muted-foreground">
                            {formatIDR(item.base_amount || 0)} + bonus {formatIDR(item.sales_bonus_amount || 0)}
                          </div>
                        </div>
                      ) : (
                        <span className="font-bold text-primary">{formatIDR(item.base_amount)}</span>
                      )}
                    </td>

                    {/* Tunjangan (+) */}
                    <td className="px-4 py-4 text-right whitespace-nowrap">
                      <input
                        type="text"
                        aria-label={`Tunjangan ${staff?.name || "karyawan"}`}
                        value={formatIDRInput(customAllowances[staffId] ?? item.allowances ?? 0)}
                        onChange={(e) => {
                          const val = parseIDRInput(e.target.value);
                          setCustomAllowances((prev) => ({ ...prev, [staffId]: val }));
                        }}
                        className="w-24 rounded-lg border border-success bg-success-soft/50 px-2 py-1.5 text-right text-xs font-semibold text-success focus:border-success focus:outline-none focus:bg-success-soft"
                        placeholder="Rp 0"
                      />
                    </td>

                    {/* Potongan (-) */}
                    <td className="px-4 py-4 text-right whitespace-nowrap">
                      <input
                        type="text"
                        aria-label={`Potongan ${staff?.name || "karyawan"}`}
                        value={formatIDRInput(customDeductions[staffId] ?? item.deductions ?? 0)}
                        onChange={(e) => {
                          const val = parseIDRInput(e.target.value);
                          setCustomDeductions((prev) => ({ ...prev, [staffId]: val }));
                        }}
                        className="w-24 rounded-lg border border-destructive bg-destructive-soft/50 px-2 py-1.5 text-right text-xs font-semibold text-destructive focus:border-destructive focus:outline-none focus:bg-destructive-soft"
                        placeholder="Rp 0"
                      />
                    </td>

                    {/* Take Home Pay */}
                    <td className="px-4 py-4 text-right whitespace-nowrap bg-accent/40">
                      <span className="text-sm font-bold text-primary">
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
        <div className="border-t border-border bg-muted/30 p-4 flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
          <div className="flex-1 xl:max-w-md">
            <label className="block text-xs font-semibold text-foreground mb-1">
              Catatan Penggajian (Opsional)
            </label>
            <input
              type="text"
              placeholder="Contoh: Penggajian Sabtu Minggu ke-3 September 2026..."
              aria-label="Catatan Penggajian (Opsional)"
              value={payrollNotes}
              onChange={(e) => setPayrollNotes(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
            />
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <div className="text-right mr-2">
              <span className="text-xs text-muted-foreground block">Total Yang Harus Dibayarkan:</span>
              <span className="text-xl font-bold text-primary">{formatIDR(totalAmount)}</span>
            </div>

            <Button
              type="button"
              disabled={submitting || calculating || totalAmount <= 0 || overlappingPayrolls.length > 0}
              onClick={() => setShowConfirmModal(true)}
              className="h-auto min-h-10 whitespace-normal px-4 py-2 text-sm"
            >
              <CheckCircle2 className="h-5 w-5" />
              Bayar Payroll &amp; Catat Keuangan
            </Button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success-soft text-success">
                <CreditCard className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Konfirmasi Pembayaran Payroll
                </h3>
                <p className="text-xs text-muted-foreground">
                  Periode: {periodStart} s/d {periodEnd}
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-muted p-4 border border-border space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Jumlah Karyawan:</span>
                <span className="font-bold text-foreground">{items.length} orang</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Dibayarkan:</span>
                <span className="font-bold text-base text-success">{formatIDR(totalAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Kategori Biaya:</span>
                <span className="font-semibold text-foreground">Gaji Karyawan</span>
              </div>
              {bonusEligibleOrderIds.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Order bonus dicairkan:</span>
                  <span className="font-semibold text-success">{bonusEligibleOrderIds.length} order</span>
                </div>
              )}
            </div>

            <div className="rounded-lg bg-warning-soft p-3 text-xs text-warning border border-warning">
              <span className="font-semibold">Perhatian:</span> Sistem akan menandai seluruh tugas borongan staf sebagai <strong>Sudah Dibayar (Lunas)</strong>, order yang sudah masuk hitungan bonus akan ditandai <strong>bonus_paid</strong>, dan otomatis mencatat pengeluaran di modul Keuangan.
            </div>

            {errorMsg && (
              <div className="rounded-lg bg-destructive-soft p-3 text-xs text-destructive border border-destructive flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                disabled={submitting}
                onClick={() => setShowConfirmModal(false)}
                variant="outline"
              >
                Batal
              </Button>
              <Button
                type="button"
                disabled={submitting}
                onClick={handleExecutePayment}
                className="gap-1.5"
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
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
