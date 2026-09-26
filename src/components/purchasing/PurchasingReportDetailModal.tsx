import { useState } from 'react';
import {
  X,
  CheckCircle2,
  XCircle,
  ExternalLink,
  FileImage,
  Send,
  Calendar,
  User,
  Wallet,
  Clock,
  Info,
} from 'lucide-react';
import Button from '../ui/button';
import RejectReasonModal from './RejectReasonModal';
import { formatIDR } from '../../utils/formatCurrency';
import type { PurchasingReport } from '../../types';

interface PurchasingReportDetailModalProps {
  report: PurchasingReport | null;
  open: boolean;
  onClose: () => void;
  onSubmitReport: (id: string) => Promise<void>;
  onApproveReport: (id: string) => Promise<void>;
  onRejectReport: (id: string, reason: string) => Promise<void>;
  onEditReport: (report: PurchasingReport) => void;
}

export default function PurchasingReportDetailModal({
  report,
  open,
  onClose,
  onSubmitReport,
  onApproveReport,
  onRejectReport,
  onEditReport,
}: PurchasingReportDetailModalProps) {
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  if (!open || !report) return null;

  const isDisbursed = report.status === 'disbursed' || report.status === 'draft';
  const isSubmitted = report.status === 'submitted';
  const isFinanciallyApproved = report.status === 'financially_approved';
  const isGoodsReceived = report.status === 'goods_received' || report.status === 'approved';
  const isRejected = report.status === 'rejected';

  const advanceAmount = report.cash_advances ? Number(report.cash_advances.amount) : 0;
  const grandTotal = Number(report.total_amount) || 0;
  const serviceFeeAmount = Number(report.service_fee) || 0;
  const totalWithFee = grandTotal + serviceFeeAmount;
  const balanceDifference = totalWithFee - advanceAmount;

  async function handleApprove() {
    if (!report) return;
    if (
      !window.confirm(
        `Konfirmasi approval SPJ oleh "${report.staff?.name || 'Staf'}" senilai ${formatIDR(grandTotal)}?\n\n- Pengeluaran aktual & reversal kasbon akan dicatat otomatis\n- Mutasi stok dibuat PENDING menunggu diserahkan & diverifikasi fisik oleh staf Gudang.`
      )
    ) {
      return;
    }

    setProcessing(true);
    try {
      await onApproveReport(report.id);
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal menyetujui SPJ.');
    } finally {
      setProcessing(false);
    }
  }

  async function handleSubmitDraft() {
    if (!report) return;
    setProcessing(true);
    try {
      await onSubmitReport(report.id);
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal submit SPJ.');
    } finally {
      setProcessing(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

        <div className="relative my-auto flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl bg-white dark:bg-card shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">
                  Detail SPJ: #{report.id.substring(0, 8)}
                </h2>
                {isDisbursed && (
                  <span className="rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/50 dark:border-blue-800 dark:text-blue-300">
                    Sedang Belanja (Uang Cair)
                  </span>
                )}
                {isSubmitted && (
                  <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-300">
                    Menunggu Approval Finance
                  </span>
                )}
                {isFinanciallyApproved && (
                  <span className="rounded-full bg-purple-50 border border-purple-200 px-2.5 py-0.5 text-xs font-semibold text-purple-700 dark:bg-purple-950/50 dark:border-purple-800 dark:text-purple-300">
                    Disetujui Finance (Menunggu Gudang)
                  </span>
                )}
                {isGoodsReceived && (
                  <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-300">
                    Selesai (Barang Tiba di Gudang)
                  </span>
                )}
                {isRejected && (
                  <span className="rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/50 dark:border-rose-800 dark:text-rose-300">
                    Ditolak
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Diajukan oleh {report.staff?.name || 'Staf'} pada {report.report_date}
                {report.received_by_staff && (
                  <span className="ml-2 text-emerald-600 font-medium">
                    • Diterima gudang oleh: {report.received_by_staff.name}
                  </span>
                )}
              </p>
            </div>
            <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {isDisbursed && (
              <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50/80 p-3.5 text-xs text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                <Info className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-blue-950 dark:text-blue-100">
                    Status: Sedang Dibelanjakan (Uang Muka Telah Dicairkan)
                  </p>
                  <p className="text-blue-800/90 dark:text-blue-300">
                    Staf purchasing sedang/telah berbelanja di lapangan. Pastikan rincian barang &amp; bukti foto nota sudah diisi (klik <strong>Isi Rincian / Edit Nota</strong>). Anda juga dapat langsung menyetujui SPJ ini dengan tombol <strong>Setujui (Approve) SPJ Langsung</strong> di bawah.
                  </p>
                </div>
              </div>
            )}

            {/* Info Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <User className="h-4 w-4 text-slate-500" />
                  <span>Staf Purchasing</span>
                </div>
                <p className="mt-1.5 text-sm font-bold text-slate-900">{report.staff?.name || '—'}</p>
                <p className="text-[11px] text-muted-foreground">{report.staff?.phone || 'Tanpa no. HP'}</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <Wallet className="h-4 w-4 text-amber-600" />
                  <span>Uang Muka Terkait</span>
                </div>
                {report.cash_advances ? (
                  <>
                    <p className="mt-1.5 text-sm font-bold text-amber-800">
                      {formatIDR(Number(report.cash_advances.amount))}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Status: {report.cash_advances.status === 'settled' ? 'Selesai (Settled)' : 'Outstanding'}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-xs italic text-slate-500">Tanpa Uang Muka</p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <Calendar className="h-4 w-4 text-slate-500" />
                  <span>Total Belanja Aktual</span>
                </div>
                <p className="mt-1.5 text-lg font-bold text-slate-900">
                  {formatIDR(grandTotal)}
                </p>
                {serviceFeeAmount > 0 && (
                  <p className="text-[11px] text-violet-700 mt-0.5">
                    + Biaya Jasa {formatIDR(serviceFeeAmount)}
                  </p>
                )}
                <p className="text-[11px] text-slate-600">
                  {balanceDifference > 0
                    ? `Kurang bayar ${formatIDR(balanceDifference)}`
                    : balanceDifference < 0
                    ? `Sisa lebih ${formatIDR(Math.abs(balanceDifference))}`
                    : 'Pas'}
                </p>
              </div>
            </div>

            {report.notes && (
              <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                <p className="text-xs font-semibold text-slate-600">Catatan SPJ:</p>
                <p className="mt-1 text-sm text-slate-800 whitespace-pre-wrap">{report.notes}</p>
              </div>
            )}

            {/* Items Table */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-2.5">
                Daftar Barang Belanja ({report.purchasing_report_items?.length || 0} item)
              </h3>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50/80 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-3.5 py-2.5">Barang / Deskripsi</th>
                      <th className="px-3.5 py-2.5">Kategori</th>
                      <th className="px-3.5 py-2.5 text-right">Qty</th>
                      <th className="px-3.5 py-2.5 text-right">Harga Satuan</th>
                      <th className="px-3.5 py-2.5 text-right">Subtotal</th>
                      <th className="px-3.5 py-2.5 text-center">Bukti Nota</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(report.purchasing_report_items || []).map((item, i) => (
                      <tr key={item.id || i} className="hover:bg-slate-50/50">
                        <td className="px-3.5 py-3">
                          <p className="font-semibold text-slate-900">{item.description}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            {item.supplier_name && <span>Toko: {item.supplier_name}</span>}
                            {item.materials && (
                              <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-700">
                                Masuk Gudang: {item.materials.name}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3.5 py-3 text-xs text-slate-600">
                          {item.transaction_categories?.name ?? item.categories?.name ?? '—'}
                        </td>
                        <td className="px-3.5 py-3 text-right text-xs font-medium text-slate-900">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="px-3.5 py-3 text-right text-xs text-slate-600">
                          {formatIDR(Number(item.unit_price))}
                        </td>
                        <td className="px-3.5 py-3 text-right text-xs font-bold text-slate-900">
                          {formatIDR(Number(item.total_price))}
                        </td>
                        <td className="px-3.5 py-3 text-center">
                          {item.receipt_photo_url ? (
                            <a
                              href={item.receipt_photo_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                              title="Buka foto nota di tab baru"
                            >
                              <FileImage className="h-3.5 w-3.5 text-slate-500" />
                              Lihat <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Tanpa foto</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-6 py-4 bg-muted/40">
            <div className="flex items-center gap-2">
              {isDisbursed && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onClose();
                    onEditReport(report);
                  }}
                >
                  Isi Rincian / Edit Nota
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Tutup
              </Button>

              {isDisbursed && (
                <>
                  <Button
                    type="button"
                    onClick={handleSubmitDraft}
                    disabled={processing}
                    className="bg-blue-600 text-white hover:bg-blue-700"
                  >
                    <Send className="h-4 w-4" />
                    {processing ? 'Mengirim...' : 'Submit untuk Di-approve Finance'}
                  </Button>
                  {(report.purchasing_report_items?.length || 0) > 0 && (
                    <Button
                      type="button"
                      onClick={handleApprove}
                      disabled={processing}
                      className="bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {processing ? 'Menyetujui...' : 'Setujui (Approve) SPJ Langsung'}
                    </Button>
                  )}
                </>
              )}

              {isSubmitted && (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setRejectModalOpen(true)}
                    disabled={processing}
                    className="border-rose-200 text-rose-700 hover:bg-rose-50"
                  >
                    <XCircle className="h-4 w-4 text-rose-600" />
                    Tolak SPJ
                  </Button>
                  <Button
                    type="button"
                    onClick={handleApprove}
                    disabled={processing}
                    className="bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {processing ? 'Menyetujui...' : 'Setujui (Approve) SPJ'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <RejectReasonModal
        open={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        onSubmit={async (reason) => {
          await onRejectReport(report.id, reason);
          onClose();
        }}
        reportTitle={`SPJ #${report.id.substring(0, 8)} oleh ${report.staff?.name || 'Staf'}`}
      />
    </>
  );
}
