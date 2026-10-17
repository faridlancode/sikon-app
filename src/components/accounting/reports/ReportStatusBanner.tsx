import React from 'react';
import {
  Lock,
  Clock,
  AlertTriangle,
  AlertOctagon,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import Button from '../../ui/button';
import { formatIDR } from '../../../utils/formatCurrency';

interface ReportStatusBannerProps {
  status: 'locked' | 'open_estimate' | 'open_no_estimate' | 'open';
  lockedThrough?: string | null;
  provisional?: {
    applied: boolean;
    hpp_bahan?: number;
    diff?: number;
    reason?: string | null;
  };
  balanced?: boolean;
  reconciled?: boolean;
  suspenseBalance?: number;
  onGoToClosing?: () => void;
  onGoToSuspense?: () => void;
}

export default function ReportStatusBanner({
  status,
  lockedThrough,
  provisional,
  balanced = true,
  reconciled,
  suspenseBalance = 0,
  onGoToClosing,
  onGoToSuspense,
}: ReportStatusBannerProps) {
  const estAmount = provisional?.hpp_bahan ?? provisional?.diff ?? 0;

  return (
    <div className="space-y-2">
      {/* 1. Alarm Keseimbangan Neraca (Merah) */}
      {!balanced && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive-soft p-3.5 text-xs font-semibold text-destructive shadow-sm">
          <AlertOctagon className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            Neraca tidak seimbang. Total Aset tidak sama dengan Total Liabilitas + Ekuitas. Silakan periksa jurnal atau hubungi administrator/developer.
          </span>
        </div>
      )}

      {/* Alarm Rekonsiliasi (Merah) */}
      {reconciled === false && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive-soft p-3.5 text-xs font-semibold text-destructive shadow-sm">
          <AlertOctagon className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            Laporan tidak cocok dengan Neraca. Terdapat selisih rekonsiliasi antara angka laporan ini dengan posisi keuangan pada Neraca.
          </span>
        </div>
      )}

      {/* 2. Alarm Akun Penampung (Merah) */}
      {suspenseBalance !== 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive-soft p-3.5 text-xs font-semibold text-destructive shadow-sm">
          <div className="flex items-center gap-2">
            <AlertOctagon className="h-4 w-4 shrink-0" />
            <span>
              Ada transaksi yang belum diklasifikasi akunnya pada akun Penampung (9-9999) sebesar{' '}
              {formatIDR(suspenseBalance)}.
            </span>
          </div>
          {onGoToSuspense && (
            <Button
              variant="outline"
              size="sm"
              onClick={onGoToSuspense}
              className="h-7 shrink-0 gap-1 border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground text-[11px]"
            >
              Lihat di Buku Besar
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}

      {/* 3. Spanduk Status Periode */}
      {status === 'locked' && (
        <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success-soft p-3.5 text-xs font-medium text-success shadow-sm">
          <Lock className="h-4 w-4 shrink-0" />
          <span>
            Periode terkunci sampai {lockedThrough || '-'}. Angka laporan pada periode ini bersifat final.
          </span>
        </div>
      )}

      {status === 'open_estimate' && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/15 p-3.5 text-xs font-semibold text-amber-950 dark:text-amber-100 shadow-sm">
          <Clock className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
          <span>
            Laporan Bersifat Sementara. HPP bahan baku diperkirakan dari selisih saldo buku persediaan dan nilai stok fisik saat ini ({formatIDR(estAmount)}). Angka final akan ditetapkan saat penutupan periode (Tutup Buku).
          </span>
        </div>
      )}

      {status === 'open' && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/15 p-3.5 text-xs font-semibold text-amber-950 dark:text-amber-100 shadow-sm">
          <Clock className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
          <span>
            Periode Berjalan (Terbuka). Angka laporan masih berjalan dinamis dan akan menjadi final saat periode ini ditutup pada akhir bulan.
          </span>
        </div>
      )}

      {status === 'open_no_estimate' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/15 p-3.5 text-xs font-semibold text-amber-950 dark:text-amber-100 shadow-sm">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
            <span>
              {provisional?.reason ||
                'Periode belum ditutup. HPP bahan belum dihitung sehingga laba masih terlalu besar. Lakukan tutup buku bulanan untuk mendapatkan laporan final.'}
            </span>
          </div>
          {onGoToClosing && (
            <Button
              variant="default"
              size="sm"
              onClick={onGoToClosing}
              className="h-7 shrink-0 gap-1 bg-amber-700 hover:bg-amber-800 text-white text-[11px]"
            >
              Tutup Buku Sekarang
              <ArrowRight className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
