import React, { useState, useEffect } from 'react';
import { X, Calendar, AlertTriangle, CheckCircle, Package } from 'lucide-react';
import { PoBatch, PoBatchSummary } from '../../types';
import { MONTH_NAMES_ID } from './poHelpers';
import { todayISO } from '../../utils/dateHelpers';

interface PoBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch?: PoBatch | PoBatchSummary | null;
  existingBatches?: (PoBatch | PoBatchSummary)[];
  onSave: (params: {
    name: string;
    startDate: string;
    endDate: string;
    periodYear: number;
    periodMonth: number;
    quotaQty?: number | null;
    note?: string | null;
  }) => Promise<{ success: boolean; error?: string }>;
}

export const PoBatchModal: React.FC<PoBatchModalProps> = ({
  isOpen,
  onClose,
  batch,
  existingBatches = [],
  onSave,
}) => {
  const isEdit = Boolean(batch);
  const isClosed = batch?.status === 'closed';

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [periodYear, setPeriodYear] = useState<number>(new Date().getFullYear());
  const [periodMonth, setPeriodMonth] = useState<number>(new Date().getMonth() + 1);
  const [quotaQty, setQuotaQty] = useState<string>('');
  const [note, setNote] = useState('');

  const [manualMonthChanged, setManualMonthChanged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setManualMonthChanged(false);

      if (batch) {
        setName(batch.name || '');
        setStartDate(batch.start_date || '');
        setEndDate(batch.end_date || '');
        setPeriodYear(batch.period_year || new Date().getFullYear());
        setPeriodMonth(batch.period_month || new Date().getMonth() + 1);
        setQuotaQty(batch.quota_qty != null ? String(batch.quota_qty) : '');
        setNote(batch.note || '');
      } else {
        const today = todayISO();
        // Default tanggal mulai hari ini, tanggal selesai +6 hari
        const startD = new Date(today);
        const endD = new Date(startD);
        endD.setDate(startD.getDate() + 6);

        const endIso = endD.toISOString().slice(0, 10);
        setName('');
        setStartDate(today);
        setEndDate(endIso);

        const [ey, em] = endIso.split('-').map(Number);
        setPeriodYear(ey);
        setPeriodMonth(em);
        setQuotaQty('');
        setNote('');
      }
    }
  }, [isOpen, batch]);

  // Saat tanggal selesai berubah dan pengguna belum mengubah bulan laporan manual, update bulan laporan default
  const handleEndDateChange = (newEndDate: string) => {
    setEndDate(newEndDate);
    if (!manualMonthChanged && newEndDate) {
      const [ey, em] = newEndDate.split('-').map(Number);
      if (ey && em) {
        setPeriodYear(ey);
        setPeriodMonth(em);
      }
    }
  };

  // Deteksi rentang tanggal tumpang tindih dengan PO lain
  const overlappingBatches = existingBatches.filter((b) => {
    if (batch && b.id === batch.id) return false;
    if (!startDate || !endDate || !b.start_date || !b.end_date) return false;
    return !(b.end_date < startDate || b.start_date > endDate);
  });

  const hasOverlap = overlappingBatches.length > 0;

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setErrorMessage('Nama PO wajib diisi.');
      return;
    }

    if (!startDate || !endDate) {
      setErrorMessage('Tanggal mulai dan selesai wajib diisi.');
      return;
    }

    if (endDate < startDate) {
      setErrorMessage('Tanggal selesai tidak boleh sebelum tanggal mulai.');
      return;
    }

    const quotaNum = quotaQty.trim() !== '' ? Number(quotaQty) : null;
    if (quotaNum !== null && (isNaN(quotaNum) || quotaNum < 0)) {
      setErrorMessage('Kuota harus berupa angka positif.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    const res = await onSave({
      name: name.trim(),
      startDate,
      endDate,
      periodYear,
      periodMonth,
      quotaQty: quotaNum,
      note: note.trim() || null,
    });

    setSubmitting(false);

    if (res.success) {
      onClose();
    } else {
      setErrorMessage(res.error || 'Gagal menyimpan PO.');
    }
  };

  // Opsi tahun: 2 tahun ke belakang s.d. 3 tahun ke depan
  const currentYear = new Date().getFullYear();
  const yearOptions = [
    currentYear - 2,
    currentYear - 1,
    currentYear,
    currentYear + 1,
    currentYear + 2,
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl bg-card border border-border p-6 shadow-xl text-card-foreground">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 text-primary font-bold text-lg">
            <Package className="h-5 w-5" />
            <span>{isEdit ? 'Edit Batch PO' : 'Buat Batch PO Baru'}</span>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isClosed && (
          <div className="mt-3 rounded-lg border border-muted bg-muted/40 p-2.5 text-xs text-muted-foreground">
            PO ini sudah ditutup. Tanggal mulai dan selesai dikunci, tetapi nama, bulan laporan, kuota, dan catatan tetap dapat diperbarui.
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Nama PO */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Nama PO <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Contoh: PO 1 Oktober 2026 atau PO Spesial Lebaran"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Rentang Tanggal */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Tanggal Mulai <span className="text-destructive">*</span>
              </label>
              <input
                type="date"
                required
                disabled={isClosed}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Tanggal Selesai <span className="text-destructive">*</span>
              </label>
              <input
                type="date"
                required
                disabled={isClosed}
                value={endDate}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Peringatan Tumpang Tindih Rentang Tanggal (Tidak memblokir) */}
          {hasOverlap && !isClosed && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-semibold">Perhatian: Rentang Tanggal Tumpang Tindih</p>
                <p className="mt-0.5">
                  Rentang tanggal PO ini tumpang tindih dengan{' '}
                  <strong>{overlappingBatches.map((b) => b.name).join(', ')}</strong>.
                  Sistem mengizinkan tumpang tindih, dan pesanan baru akan menyarankan PO dengan tanggal mulai terbaru.
                </p>
              </div>
            </div>
          )}

          {/* Bulan & Tahun Laporan */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Bulan Laporan
              </label>
              <select
                value={periodMonth}
                onChange={(e) => {
                  setPeriodMonth(Number(e.target.value));
                  setManualMonthChanged(true);
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {MONTH_NAMES_ID.map((mName, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {mName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Tahun Laporan
              </label>
              <select
                value={periodYear}
                onChange={(e) => {
                  setPeriodYear(Number(e.target.value));
                  setManualMonthChanged(true);
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {yearOptions.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Kuota Pcs */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-foreground">
                Kuota Produksi (Pcs) <span className="text-muted-foreground font-normal">(Opsional)</span>
              </label>
            </div>
            <input
              type="number"
              min="0"
              placeholder="Kosongkan jika tidak ada batasan kuota"
              value={quotaQty}
              onChange={(e) => setQuotaQty(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Kuota berfungsi sebagai peringatan analitik bagi tim sales dan tidak memblokir pesanan masuk.
            </p>
          </div>

          {/* Catatan */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Catatan PO <span className="text-muted-foreground font-normal">(Opsional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="Catatan tambahan untuk tim produksi atau penjualan..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {errorMessage && (
            <div className="rounded-md bg-destructive/10 p-2.5 text-xs text-destructive flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Tombol Aksi */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-medium rounded-md border border-input bg-background hover:bg-muted text-foreground transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 shadow transition-colors disabled:opacity-50"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              <span>{submitting ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan' : 'Buat Batch PO'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
