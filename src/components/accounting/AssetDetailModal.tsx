import React, { useEffect, useState } from 'react';
import { X, Calendar, Layers, BookOpen, AlertCircle } from 'lucide-react';
import Card from '../ui/card';
import Button from '../ui/button';
import { formatIDR } from '../../utils/formatCurrency';
import { formatDateID } from '../../utils/dateHelpers';
import type { FixedAssetRegisterItem, FixedAssetDepreciationHistory } from '../../types';

interface AssetDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: FixedAssetRegisterItem | null;
  fetchDepreciationHistory: (assetId: string) => Promise<FixedAssetDepreciationHistory[]>;
  onNavigateToJournal?: (entryNo: string) => void;
}

export default function AssetDetailModal({
  isOpen,
  onClose,
  asset,
  fetchDepreciationHistory,
  onNavigateToJournal,
}: AssetDetailModalProps) {
  const [history, setHistory] = useState<FixedAssetDepreciationHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !asset) {
      setHistory([]);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetchDepreciationHistory(asset.id)
      .then((data) => {
        if (isMounted) setHistory(data);
      })
      .catch((err) => {
        if (isMounted) setError(err.message || 'Gagal memuat riwayat penyusutan.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, asset, fetchDepreciationHistory]);

  if (!isOpen || !asset) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-xl border border-border">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4 bg-muted/20">
          <div>
            <h3 className="text-base font-bold text-foreground">
              Detail & Riwayat Penyusutan Aset
            </h3>
            <p className="text-xs text-muted-foreground">{asset.name}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Metadata Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 bg-muted/20 p-3 rounded-lg border border-border">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Harga Perolehan</p>
              <p className="text-xs font-mono font-bold text-foreground mt-0.5">
                {formatIDR(asset.cost)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Akumulasi</p>
              <p className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                {formatIDR(asset.accumulated)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Nilai Buku</p>
              <p className="text-xs font-mono font-bold text-success mt-0.5">
                {formatIDR(asset.book_value)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Tarif Bulanan</p>
              <p className="text-xs font-mono font-bold text-foreground mt-0.5">
                {formatIDR(asset.monthly_depreciation)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-muted-foreground border-b border-border pb-3">
            <span>Tgl Perolehan: <strong className="text-foreground">{formatDateID(asset.acquisition_date)}</strong></span>
            <span>Umur Manfaat: <strong className="text-foreground">{asset.useful_life_months} bulan</strong></span>
            <span>Nilai Sisa: <strong className="text-foreground">{formatIDR(asset.salvage_value)}</strong></span>
            <span>Bulan Disusutkan: <strong className="text-foreground">{asset.depreciation_months_posted} bulan</strong></span>
          </div>

          {/* Riwayat Tabel */}
          <div>
            <h4 className="font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              Riwayat Jurnal Penyusutan ({history.length} periode)
            </h4>

            {loading ? (
              <div className="py-8 text-center text-muted-foreground">
                Memuat riwayat penyusutan...
              </div>
            ) : error ? (
              <div className="p-3 rounded-lg bg-destructive-soft text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            ) : history.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground border border-dashed border-border rounded-lg">
                Belum ada penyusutan yang dijurnal untuk aset ini.
                {asset.acquisition_date && (
                  <p className="text-[11px] mt-1 text-muted-foreground">
                    Aset akan mulai disusutkan pada penutupan bulan {asset.next_depreciation_period ? formatDateID(asset.next_depreciation_period) : '-'}.
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-muted/40 text-[11px] font-semibold text-muted-foreground border-b border-border">
                    <tr>
                      <th className="p-2.5">Periode</th>
                      <th className="p-2.5 text-right">Jumlah</th>
                      <th className="p-2.5">No. Jurnal</th>
                      <th className="p-2.5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {history.map((row) => (
                      <tr key={row.id} className="hover:bg-muted/10">
                        <td className="p-2.5 font-medium text-foreground">
                          {formatDateID(row.period)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-medium text-foreground">
                          {formatIDR(row.amount)}
                        </td>
                        <td className="p-2.5 font-mono text-muted-foreground">
                          {row.entry_no || '-'}
                        </td>
                        <td className="p-2.5 text-right">
                          {row.entry_no && onNavigateToJournal && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px] gap-1 text-primary hover:text-primary"
                              onClick={() => {
                                onNavigateToJournal(row.entry_no!);
                                onClose();
                              }}
                            >
                              <BookOpen className="h-3 w-3" />
                              Lihat Jurnal
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-border p-3 bg-muted/20">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Tutup
          </Button>
        </div>
      </Card>
    </div>
  );
}
