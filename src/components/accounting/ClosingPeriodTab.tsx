import React, { useState, useEffect, useCallback } from 'react';
import {
  Lock,
  Unlock,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Archive,
  ArrowRight,
} from 'lucide-react';
import Card from '../ui/card';
import Button from '../ui/button';
import { formatIDR } from '../../utils/formatCurrency';
import { formatDateID } from '../../utils/dateHelpers';
import { useFinancialStatements } from '../../hooks/useFinancialStatements';
import type { AccountingSettings, ClosePreview } from '../../types';

interface ClosingPeriodTabProps {
  settings: AccountingSettings | null;
  onRefreshSettings: () => Promise<void>;
}

export default function ClosingPeriodTab({
  settings,
  onRefreshSettings,
}: ClosingPeriodTabProps) {
  const [preview, setPreview] = useState<ClosePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Checkbox konfirmasi
  const [confirmChecked, setConfirmChecked] = useState(false);

  // Modal buka kembali periode
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [newLockedDate, setNewLockedDate] = useState<string>('');
  const [reopening, setReopening] = useState(false);

  const { getClosePreview, closePeriod, reopenPeriod } = useFinancialStatements();

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getClosePreview();
      setPreview(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Gagal memuat pratinjau tutup buku.');
    } finally {
      setLoading(false);
    }
  }, [getClosePreview]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  // Handler Tutup Periode
  async function handleClosePeriod() {
    if (!preview || !preview.next_period_end) return;
    if (!confirmChecked) {
      setError('Harap centang persetujuan konfirmasi sebelum melanjutkan tutup buku.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await closePeriod(preview.next_period_end);
      setSuccessMessage(
        `Periode hingga ${preview.next_period_end} berhasil ditutup! Penyesuaian persediaan dan kunci periode telah diposting.`
      );
      setConfirmChecked(false);
      await onRefreshSettings();
      await loadPreview();
    } catch (err: any) {
      console.error(err);
      // Tampilkan pesan error database apa adanya
      setError(err.message || 'Gagal menutup periode akuntansi.');
    } finally {
      setSubmitting(false);
    }
  }

  // Handler Buka Kembali Periode
  async function handleReopenPeriod() {
    setReopening(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const targetDate = newLockedDate.trim() ? newLockedDate.trim() : null;
      await reopenPeriod(targetDate);
      setSuccessMessage(
        targetDate
          ? `Periode berhasil dibuka kembali hingga ${targetDate}.`
          : 'Seluruh periode terkunci berhasil dibuka kembali.'
      );
      setReopenModalOpen(false);
      setNewLockedDate('');
      await onRefreshSettings();
      await loadPreview();
    } catch (err: any) {
      console.error(err);
      // Tampilkan pesan error database apa adanya
      setError(err.message || 'Gagal membuka kembali periode akuntansi.');
    } finally {
      setReopening(false);
    }
  }

  const lockedThrough = settings?.locked_through ?? null;
  const nextPeriodEnd = preview?.next_period_end ?? null;
  const canClose = preview?.can_close ?? false;
  const adj = preview?.adjustment ?? 0;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Notifikasi Sukses */}
      {successMessage && (
        <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success-soft p-4 text-xs font-semibold text-success shadow-sm">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span className="flex-1">{successMessage}</span>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-success hover:underline text-[11px]"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Notifikasi Error Database Apa Adanya */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive-soft p-4 text-xs font-semibold text-destructive shadow-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="flex-1 whitespace-pre-wrap">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-destructive hover:underline text-[11px]"
          >
            Tutup
          </button>
        </div>
      )}

      {/* 1. Header & Status Kunci Periode */}
      <Card className="p-6 border border-border">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                lockedThrough
                  ? 'bg-success-soft text-success border border-success/20'
                  : 'bg-muted text-muted-foreground border border-border'
              }`}
            >
              <Lock className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Tutup Buku Bulanan (Period Close)
              </h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-xl">
                Menghitung penyesuaian persediaan periodik resmi (Dr HPP / Cr Persediaan),
                membuat snapshot nilai stok fisik, dan mengunci transaksi agar angka laporan keuangan menjadi final.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={loadPreview}
              disabled={loading}
              className="h-8 gap-1.5 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Segarkan
            </Button>

            {lockedThrough && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReopenModalOpen(true)}
                className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive-soft border-destructive/30"
              >
                <Unlock className="h-3.5 w-3.5" />
                Buka Kembali Periode
              </Button>
            )}
          </div>
        </div>

        {/* Info Grid */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 border-t border-border pt-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                Status Periode Terkunci Saat Ini
              </p>
              <p className="text-sm font-semibold text-foreground">
                {lockedThrough ? formatDateID(lockedThrough) : 'Belum ada periode yang ditutup'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
              <Archive className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                Bulan Berikutnya yang Akan Ditutup
              </p>
              <p className="text-sm font-semibold text-foreground">
                {nextPeriodEnd ? formatDateID(nextPeriodEnd) : '-'}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* 2. Pratinjau Penyesuaian Persediaan (Inventory Valuation Preview) */}
      <Card className="p-6 border border-border space-y-5">
        <div className="border-b border-border pb-3 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-foreground">
              Pratinjau Penyesuaian Persediaan & Jurnal
            </h4>
            <p className="text-xs text-muted-foreground">
              Perbandingan antara saldo buku persediaan bahan baku dan nilai fisik barang saat ini.
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              canClose
                ? 'bg-success-soft text-success border border-success/20'
                : 'bg-amber-500/10 text-amber-700 border border-amber-500/20'
            }`}
          >
            {canClose ? 'Siap Ditutup' : 'Belum Dapat Ditutup'}
          </span>
        </div>

        {!canClose && preview?.reason && (
          <div className="flex items-center gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>{preview.reason}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-muted/20 p-3.5">
            <p className="text-[11px] font-medium text-muted-foreground">
              Saldo Buku Persediaan (1-1500)
            </p>
            <p className="mt-1 text-base font-mono font-bold text-foreground">
              {formatIDR(preview?.inventory_balance ?? 0)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Akumulasi pembelian & SPJ bahan s/d {nextPeriodEnd || '-'}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-3.5">
            <p className="text-[11px] font-medium text-muted-foreground">
              Nilai Stok Fisik Saat Ini
            </p>
            <p className="mt-1 text-base font-mono font-bold text-foreground">
              {formatIDR(preview?.inventory_value ?? 0)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Σ (Stok Efektif × Harga Beli Bahan)
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-3.5">
            <p className="text-[11px] font-medium text-muted-foreground">
              Selisih yang Akan Dijurnal
            </p>
            <p
              className={`mt-1 text-base font-mono font-bold ${
                adj < 0 ? 'text-destructive' : adj > 0 ? 'text-success' : 'text-foreground'
              }`}
            >
              {adj < 0 ? `(${formatIDR(Math.abs(adj))})` : formatIDR(adj)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {adj < 0
                ? 'HPP Bahan Baku (Debet) / Persediaan (Kredit)'
                : adj > 0
                ? 'Persediaan (Debet) / Pengurang HPP (Kredit)'
                : 'Tidak ada jurnal penyesuaian (saldo cocok)'}
            </p>
          </div>
        </div>

        {/* Simulasi Baris Jurnal Penyesuaian */}
        {adj !== 0 && (
          <div className="rounded-lg border border-border overflow-hidden text-xs">
            <div className="bg-muted/50 px-3 py-1.5 font-semibold text-muted-foreground">
              Rencana Jurnal Penyesuaian (Source: inventory_adjustment)
            </div>
            <table className="w-full text-left">
              <tbody className="divide-y divide-border">
                {adj < 0 ? (
                  <>
                    <tr className="hover:bg-muted/10">
                      <td className="p-2.5 font-mono text-muted-foreground w-20">5-1000</td>
                      <td className="p-2.5 text-foreground">HPP Bahan Baku</td>
                      <td className="p-2.5 text-right font-mono text-foreground font-medium w-36">
                        {formatIDR(Math.abs(adj))}
                      </td>
                      <td className="p-2.5 text-right font-mono text-muted-foreground w-36">-</td>
                    </tr>
                    <tr className="hover:bg-muted/10">
                      <td className="p-2.5 font-mono text-muted-foreground w-20">1-1500</td>
                      <td className="p-2.5 text-foreground pl-6">Persediaan Bahan Baku</td>
                      <td className="p-2.5 text-right font-mono text-muted-foreground w-36">-</td>
                      <td className="p-2.5 text-right font-mono text-foreground font-medium w-36">
                        {formatIDR(Math.abs(adj))}
                      </td>
                    </tr>
                  </>
                ) : (
                  <>
                    <tr className="hover:bg-muted/10">
                      <td className="p-2.5 font-mono text-muted-foreground w-20">1-1500</td>
                      <td className="p-2.5 text-foreground">Persediaan Bahan Baku</td>
                      <td className="p-2.5 text-right font-mono text-foreground font-medium w-36">
                        {formatIDR(adj)}
                      </td>
                      <td className="p-2.5 text-right font-mono text-muted-foreground w-36">-</td>
                    </tr>
                    <tr className="hover:bg-muted/10">
                      <td className="p-2.5 font-mono text-muted-foreground w-20">5-1000</td>
                      <td className="p-2.5 text-foreground pl-6">HPP Bahan Baku (Pengurang)</td>
                      <td className="p-2.5 text-right font-mono text-muted-foreground w-36">-</td>
                      <td className="p-2.5 text-right font-mono text-foreground font-medium w-36">
                        {formatIDR(adj)}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Form Konfirmasi & Tombol Tutup Buku */}
        <div className="border-t border-border pt-4 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={confirmChecked}
              onChange={(e) => setConfirmChecked(e.target.checked)}
              disabled={!canClose || submitting}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary mt-0.5"
            />
            <span className="text-xs font-medium text-foreground">
              Saya memahami bahwa penyesuaian persediaan akan dihitung berdasarkan kondisi nilai stok fisik barang saat ini di sistem, dan periode hingga{' '}
              <strong className="text-primary">{nextPeriodEnd || '-'}</strong> akan dikunci dari pengeditan atau penghapusan transaksi.
            </span>
          </label>

          <div className="flex items-center justify-end">
            <Button
              variant="default"
              size="sm"
              onClick={handleClosePeriod}
              disabled={!canClose || !confirmChecked || submitting}
              className="gap-2 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {submitting ? 'Memproses Tutup Buku...' : `Tutup Buku Periode ${nextPeriodEnd || ''}`}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Modal Buka Kembali Periode */}
      {reopenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-card border border-border p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5 text-destructive font-bold text-sm">
                <AlertTriangle className="h-5 w-5" />
                <span>Buka Kembali Periode Akuntansi</span>
              </div>
              <button
                onClick={() => setReopenModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Membuka kembali periode akan <strong>menghapus jurnal penyesuaian persediaan</strong> dan snapshot valuasi persediaan yang bertanggal setelah batas kunci baru.
            </p>

            <div className="space-y-1.5 text-xs">
              <label className="font-semibold text-foreground">
                Kunci Baru Hingga Tanggal (Opsional, harus akhir bulan):
              </label>
              <input
                type="date"
                value={newLockedDate}
                onChange={(e) => setNewLockedDate(e.target.value)}
                placeholder="Kosongkan untuk membuka seluruh kunci"
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="text-[11px] text-muted-foreground italic">
                *Jika dikosongkan, seluruh periode terkunci akan dibuka kembali.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReopenModalOpen(false)}
                className="text-xs"
              >
                Batal
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleReopenPeriod}
                disabled={reopening}
                className="text-xs font-semibold"
              >
                {reopening ? 'Membuka...' : 'Konfirmasi Buka Kembali'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
