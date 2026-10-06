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
import Button from '../ui/button';
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
    <div className="space-y-5">
      {/* Header Info */}
      <div className="rounded-lg border border-border bg-gradient-to-r from-muted to-white p-5 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Riwayat Pembayaran Payroll Mingguan
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Daftar seluruh transaksi penggajian mingguan (Sabtu) yang telah tercatat dan dibayarkan.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-foreground">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              {payrolls.length} Periode
            </span>
            {payrolls.filter(p => p.status === 'paid').length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 text-xs font-semibold text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {payrolls.filter(p => p.status === 'paid').length} Lunas
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Table of Payrolls */}
      <div className="rounded-lg border border-border bg-card shadow-soft overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Memuat riwayat penggajian...
          </div>
        ) : payrolls.length === 0 ? (
          <div className="p-12 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium text-foreground">Belum ada riwayat penggajian</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Buka tab <strong>"Payroll Mingguan"</strong> untuk menghitung dan mencairkan gaji karyawan.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm tabular-nums">
              <thead className="border-b border-border bg-muted/60 text-xs font-semibold text-muted-foreground ">
                <tr>
                  <th className="w-8 px-4 py-3 text-center text-muted-foreground">#</th>
                  <th className="px-4 py-3">Tgl Pembayaran</th>
                  <th className="px-4 py-3">Periode Kerja</th>
                  <th className="px-4 py-3 text-center">Karyawan</th>
                  <th className="px-4 py-3 text-center">Target Sales</th>
                  <th className="px-4 py-3 text-right bg-primary/5 text-primary">Total Dibayarkan</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {payrolls.map((payroll, idx) => {
                  const itemCount = payroll.payroll_items?.length || 0;
                  const isPaid = payroll.status === 'paid';
                  const isEven = idx % 2 === 0;

                  const fmtDate = (d: string) =>
                    d ? new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : d;

                  return (
                    <tr key={payroll.id} className={`group hover:bg-muted/40 transition-colors ${isEven ? 'bg-card' : 'bg-muted/40'}`}>
                      <td className="w-8 px-4 py-4 text-center text-xs font-medium text-muted-foreground">{idx + 1}</td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="font-semibold text-foreground">{fmtDate(payroll.payment_date)}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">Tanggal bayar</div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-foreground">{fmtDate(payroll.period_start)}</div>
                        <div className="text-xs text-muted-foreground">s/d {fmtDate(payroll.period_end)}</div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="inline-flex items-center justify-center rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-foreground">
                          {itemCount} orang
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="text-xs font-semibold text-foreground">{payroll.sales_target_qty} pcs</div>
                        <div className="text-xs text-muted-foreground">{payroll.sales_below_target_scheme === 'half' ? '50% jika < target' : '0% jika < target'}</div>
                      </td>
                      <td className="px-4 py-4 text-right whitespace-nowrap bg-accent/40">
                        <span className="text-sm font-bold text-primary">{formatIDR(payroll.total_amount)}</span>
                      </td>
                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        {isPaid ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success">
                            <CheckCircle2 className="h-3 w-3" /> Lunas
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1 text-xs font-semibold text-warning">
                            <Clock className="h-3 w-3" /> Draft
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            onClick={() => setSelectedPayrollForSlip(payroll)}
                            variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Lihat Slip
                          </Button>

                          {!isPaid && (
                            <Button
                              disabled={processingId === payroll.id}
                              onClick={() => handlePay(payroll.id)}
                              size="sm" className="h-8 px-3 text-xs"
                            >
                              Bayar
                            </Button>
                          )}

                          <Button
                            disabled={processingId === payroll.id}
                            onClick={() => handleDelete(payroll.id)}
                            variant="ghost" size="sm" aria-label="Hapus riwayat penggajian" className="h-8 w-8 p-0 text-destructive"
                            title="Hapus riwayat"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
