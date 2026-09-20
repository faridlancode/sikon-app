import React, { useState } from 'react';
import { X, Printer, CheckCircle2, User, Coins, Calendar, FileText } from 'lucide-react';
import { formatIDR } from '../../utils/formatCurrency';
import type { WeeklyPayroll, PayrollItem } from '../../types';

interface PayrollSlipModalProps {
  isOpen: boolean;
  onClose: () => void;
  payroll: WeeklyPayroll | null;
}

export default function PayrollSlipModal({
  isOpen,
  onClose,
  payroll,
}: PayrollSlipModalProps) {
  const [selectedStaffId, setSelectedStaffId] = useState<string>('all');

  if (!isOpen || !payroll) return null;

  const items = payroll.payroll_items || [];
  const displayedItems =
    selectedStaffId === 'all'
      ? items
      : items.filter((it) => it.staff_id === selectedStaffId);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header - Screen Only */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 print:hidden bg-slate-50">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Slip Gaji Mingguan
            </h3>
            <p className="text-xs text-muted-foreground">
              Periode {payroll.period_start} s/d {payroll.period_end} • Dibayarkan {payroll.payment_date}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Filter by Staff */}
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-primary"
            >
              <option value="all">Semua Karyawan ({items.length})</option>
              {items.map((it) => (
                <option key={it.staff_id} value={it.staff_id}>
                  {it.staff?.name || 'Karyawan'} ({it.staff?.role || it.wage_type})
                </option>
              ))}
            </select>

            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 transition shadow-sm"
            >
              <Printer className="h-4 w-4" />
              Cetak Slip
            </button>

            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-slate-200 hover:text-foreground transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Slips Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-100/50 print:bg-white print:p-0 print:space-y-6">
          {displayedItems.map((item) => (
            <div
              key={item.staff_id}
              className="rounded-2xl border border-border bg-white p-6 shadow-sm print:shadow-none print:border-slate-800 print:rounded-none"
            >
              {/* Slip Header */}
              <div className="border-b border-border pb-4 mb-4 flex justify-between items-start">
                <div>
                  <h4 className="text-lg font-black tracking-tight text-slate-900">
                    SIKON APPAREL
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Sistem Informasi Konveksi & Manajemen Produksi
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                    <CheckCircle2 className="h-3.5 w-3.5" /> LUNAS
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tanggal: {payroll.payment_date}
                  </p>
                </div>
              </div>

              {/* Employee & Period Details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 border border-border/80 text-xs mb-5">
                <div>
                  <span className="text-muted-foreground block">Nama Karyawan:</span>
                  <span className="font-bold text-slate-900 text-sm">{item.staff?.name || '-'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Peran / Divisi:</span>
                  <span className="font-semibold text-slate-800">{item.staff?.role || '-'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Skema Upah:</span>
                  <span className="font-semibold text-slate-800">
                    {item.wage_type === 'piecework'
                      ? 'Borongan'
                      : item.wage_type === 'sales'
                      ? 'Sales Incentive'
                      : 'Harian (Absensi)'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Periode Kerja:</span>
                  <span className="font-semibold text-slate-800">
                    {payroll.period_start} s/d {payroll.period_end}
                  </span>
                </div>
              </div>

              {/* Rincian Pendapatan Table */}
              <table className="w-full text-xs text-left mb-4">
                <thead>
                  <tr className="border-b border-border text-muted-foreground font-semibold">
                    <th className="py-2">Komponen Pembayaran</th>
                    <th className="py-2 text-center">Detail / Volume</th>
                    <th className="py-2 text-right">Tarif</th>
                    <th className="py-2 text-right">Jumlah (Rp)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {/* Attendance Base */}
                  {Number(item.base_amount || 0) > 0 && (
                    <tr>
                      <td className="py-2 font-medium text-slate-800">Upah Pokok Harian</td>
                      <td className="py-2 text-center text-muted-foreground">{item.attendance_days} hari</td>
                      <td className="py-2 text-right text-muted-foreground">{formatIDR(item.daily_rate || 0)}</td>
                      <td className="py-2 text-right font-bold text-slate-900">{formatIDR(item.base_amount)}</td>
                    </tr>
                  )}

                  {/* Piecework Base */}
                  {Number(item.piecework_amount || 0) > 0 && (
                    <tr>
                      <td className="py-2 font-medium text-slate-800">Upah Borongan (Selesai Dikerjakan)</td>
                      <td className="py-2 text-center text-muted-foreground">Sesuai SPK/Tugas</td>
                      <td className="py-2 text-right text-muted-foreground">Per Pcs</td>
                      <td className="py-2 text-right font-bold text-slate-900">{formatIDR(item.piecework_amount)}</td>
                    </tr>
                  )}

                  {/* Sales Bonus */}
                  {Number(item.sales_bonus_amount || 0) > 0 && (
                    <tr>
                      <td className="py-2 font-medium text-slate-800">
                        Bonus Penjualan Sales ({item.sales_bonus_percentage}%)
                      </td>
                      <td className="py-2 text-center text-muted-foreground">{item.sales_total_qty} pcs</td>
                      <td className="py-2 text-right text-muted-foreground">Insentif Master Produk</td>
                      <td className="py-2 text-right font-bold text-slate-900">{formatIDR(item.sales_bonus_amount)}</td>
                    </tr>
                  )}

                  {/* Allowances */}
                  {Number(item.allowances || 0) > 0 && (
                    <tr>
                      <td className="py-2 font-medium text-emerald-700">Tunjangan / Bonus Tambahan (+)</td>
                      <td className="py-2 text-center text-muted-foreground">-</td>
                      <td className="py-2 text-right text-muted-foreground">-</td>
                      <td className="py-2 text-right font-bold text-emerald-700">+{formatIDR(item.allowances)}</td>
                    </tr>
                  )}

                  {/* Deductions */}
                  {Number(item.deductions || 0) > 0 && (
                    <tr>
                      <td className="py-2 font-medium text-rose-700">Potongan / Kasbon (-)</td>
                      <td className="py-2 text-center text-muted-foreground">-</td>
                      <td className="py-2 text-right text-muted-foreground">-</td>
                      <td className="py-2 text-right font-bold text-rose-700">-{formatIDR(item.deductions)}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Total Take Home Pay */}
              <div className="flex justify-between items-center border-t-2 border-slate-900 pt-3 mt-2">
                <span className="text-sm font-black uppercase text-slate-900 tracking-wide">
                  Total Gaji Bersih (Take Home Pay)
                </span>
                <span className="text-lg font-black text-primary">
                  {formatIDR(item.take_home_pay)}
                </span>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-8 pt-8 mt-6 border-t border-border/80 text-xs text-center text-muted-foreground">
                <div>
                  <p>Diterima Oleh,</p>
                  <div className="h-16"></div>
                  <p className="font-bold text-slate-800">({item.staff?.name || 'Karyawan'})</p>
                </div>
                <div>
                  <p>Disetujui Oleh,</p>
                  <div className="h-16"></div>
                  <p className="font-bold text-slate-800">(Owner / Manajemen SIKon)</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-3 flex justify-end print:hidden bg-white">
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
