import React, { useState } from 'react';
import {
  Calendar,
  CreditCard,
  FileText,
  Trash2,
  CheckCircle2,
  Clock,
  Printer,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { formatIDR } from '../../utils/formatCurrency';
import PayrollSlipModal from './PayrollSlipModal';
import type { WeeklyPayroll } from '../../types';

interface PayrollHistoryTabProps {
  payrolls: WeeklyPayroll[];
  loading: boolean;
  onPayDraft: (payrollId: string) => Promise<void>;
  onDeletePayroll: (payrollId: string) => Promise<void>;
}

export default function PayrollHistoryTab({
  payrolls,
  loading,
  onPayDraft,
  onDeletePayroll,
}: PayrollHistoryTabProps) {
  const [selectedPayrollForSlip, setSelectedPayrollForSlip] = useState<WeeklyPayroll | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function handlePay(id: string) {
    if (window.confirm('Apakah Anda yakin ingin menyelesaikan pembayaran untuk payroll ini?')) {
      try {
        setProcessingId(id);
        await onPayDraft(id);
      } finally {
        setProcessingId(null);
      }
    }
  }

  async function handleDelete(id: string) {
    if (window.confirm('Hapus riwayat payroll ini? Data slip gaji akan terhapus.')) {
      try {
        setProcessingId(id);
        await onDeletePayroll(id);
      } finally {
        setProcessingId(null);
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Riwayat Pembayaran Payroll Mingguan
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Daftar seluruh transaksi penggajian mingguan (Sabtu) yang telah tercatat dan dibayarkan.
            </p>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">
            Total {payrolls.length} Periode Penggajian
          </span>
        </div>
      </div>

      {/* Table of Payrolls */}
      <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Memuat riwayat penggajian...
          </div>
        ) : payrolls.length === 0 ? (
          <div className="p-12 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-medium text-slate-600">Belum ada riwayat penggajian</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Buka tab <strong>"Payroll Mingguan"</strong> untuk menghitung dan mencairkan gaji karyawan.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-slate-50/80 text-[11px] font-semibold text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Tgl Pembayaran</th>
                  <th className="px-4 py-3">Periode Kerja</th>
                  <th className="px-4 py-3 text-center">Karyawan</th>
                  <th className="px-4 py-3 text-center">Target Sales</th>
                  <th className="px-4 py-3 text-right">Total Dibayarkan</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payrolls.map((payroll) => {
                  const itemCount = payroll.payroll_items?.length || 0;
                  const isPaid = payroll.status === 'paid';

                  return (
                    <tr key={payroll.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-4 py-3.5 whitespace-nowrap font-medium text-slate-900">
                        {payroll.payment_date}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-xs text-muted-foreground">
                        {payroll.period_start} s/d {payroll.period_end}
                      </td>
                      <td className="px-4 py-3.5 text-center text-xs font-semibold text-slate-700">
                        {itemCount} orang
                      </td>
                      <td className="px-4 py-3.5 text-center text-xs text-muted-foreground">
                        {payroll.sales_target_qty} pcs ({payroll.sales_below_target_scheme === 'half' ? '50%' : '0%'})
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap font-bold text-slate-900">
                        {formatIDR(payroll.total_amount)}
                      </td>
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        {isPaid ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                            <CheckCircle2 className="h-3 w-3" /> Lunas
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                            <Clock className="h-3 w-3" /> Draft
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSelectedPayrollForSlip(payroll)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-primary transition shadow-xs"
                          >
                            <FileText className="h-3.5 w-3.5 text-primary" />
                            Lihat Slip
                          </button>

                          {!isPaid && (
                            <button
                              disabled={processingId === payroll.id}
                              onClick={() => handlePay(payroll.id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                            >
                              Bayar
                            </button>
                          )}

                          <button
                            disabled={processingId === payroll.id}
                            onClick={() => handleDelete(payroll.id)}
                            className="rounded p-1.5 text-slate-400 hover:text-rose-600 transition"
                            title="Hapus riwayat"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slip Modal */}
      <PayrollSlipModal
        isOpen={Boolean(selectedPayrollForSlip)}
        onClose={() => setSelectedPayrollForSlip(null)}
        payroll={selectedPayrollForSlip}
      />
    </div>
  );
}
