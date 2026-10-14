import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  RefreshCw,
  Search,
  Building2,
  Trash2,
  RotateCcw,
  LogOut,
  Eye,
  Info,
  DollarSign,
  TrendingDown,
  Clock,
  Edit2,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import Card from '../ui/card';
import Button from '../ui/button';
import { formatIDR } from '../../utils/formatCurrency';
import { formatDateID } from '../../utils/dateHelpers';
import { useFixedAssets } from '../../hooks/useFixedAssets';
import FixedAssetModal from './FixedAssetModal';
import DisposeAssetModal from './DisposeAssetModal';
import AssetDetailModal from './AssetDetailModal';
import EditAssetInfoModal from './EditAssetInfoModal';
import type { FixedAssetRegisterItem, FixedAssetClass } from '../../types';

interface FixedAssetsTabProps {
  isAccountingEnabled?: boolean;
  booksStartDate: string | null;
  onNavigateToJournal?: (entryNo: string) => void;
  onNavigateToSummary?: () => void;
  onAssetMutated?: () => void;
}

export default function FixedAssetsTab({
  isAccountingEnabled = true,
  booksStartDate,
  onNavigateToJournal,
  onNavigateToSummary,
  onAssetMutated,
}: FixedAssetsTabProps) {
  const {
    register,
    loading,
    error,
    fetchRegister,
    registerFixedAsset,
    disposeFixedAsset,
    undoDisposeFixedAsset,
    deleteFixedAsset,
    updateFixedAssetInfo,
    fetchDepreciationHistory,
  } = useFixedAssets();

  // Load register on mount
  useEffect(() => {
    fetchRegister();
  }, [fetchRegister]);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<string>('all');

  // Modals
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isDisposeModalOpen, setIsDisposeModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<FixedAssetRegisterItem | null>(null);
  const [editAsset, setEditAsset] = useState<FixedAssetRegisterItem | null>(null);

  // Confirmation dialogs
  const [confirmDeleteAsset, setConfirmDeleteAsset] = useState<FixedAssetRegisterItem | null>(null);
  const [confirmUndoAsset, setConfirmUndoAsset] = useState<FixedAssetRegisterItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Filtered register
  const filteredRegister = useMemo(() => {
    return register.filter((asset) => {
      // Status filter
      if (statusFilter === 'active' && (asset.status !== 'active' || asset.fully_depreciated)) return false;
      if (statusFilter === 'fully_depreciated' && (!asset.fully_depreciated || asset.status === 'disposed')) return false;
      if (statusFilter === 'disposed' && asset.status !== 'disposed') return false;

      // Class filter
      if (classFilter !== 'all' && asset.asset_class !== classFilter) return false;

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchName = asset.name.toLowerCase().includes(query);
        const matchNotes = asset.notes ? asset.notes.toLowerCase().includes(query) : false;
        if (!matchName && !matchNotes) return false;
      }
      return true;
    });
  }, [register, statusFilter, classFilter, searchQuery]);

  // Summary Metrics (computed from active & fully depreciated, excluding disposed for active asset book value)
  const metrics = useMemo(() => {
    const nonDisposed = register.filter((a) => a.status !== 'disposed');
    const totalCost = nonDisposed.reduce((sum, a) => sum + (a.cost || 0), 0);
    const totalDepreciation = nonDisposed.reduce((sum, a) => sum + (a.accumulated || 0), 0);
    const totalBookValue = nonDisposed.reduce((sum, a) => sum + (a.book_value || 0), 0);
    const monthlyDepreciation = register
      .filter((a) => a.status === 'active' && !a.fully_depreciated)
      .reduce((sum, a) => sum + (a.monthly_depreciation || 0), 0);

    return { totalCost, totalDepreciation, totalBookValue, monthlyDepreciation };
  }, [register]);

  const handleDeleteConfirm = async () => {
    if (!confirmDeleteAsset) return;
    try {
      setActionLoading(true);
      setActionError(null);
      await deleteFixedAsset(confirmDeleteAsset.id);
      setConfirmDeleteAsset(null);
      onAssetMutated?.();
    } catch (err: any) {
      setActionError(err?.message || 'Gagal menghapus aset tetap.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUndoConfirm = async () => {
    if (!confirmUndoAsset) return;
    try {
      setActionLoading(true);
      setActionError(null);
      await undoDisposeFixedAsset(confirmUndoAsset.id);
      setConfirmUndoAsset(null);
      onAssetMutated?.();
    } catch (err: any) {
      setActionError(err?.message || 'Gagal membatalkan pelepasan aset.');
    } finally {
      setActionLoading(false);
    }
  };

  const getClassBadge = (cls: FixedAssetClass) => {
    switch (cls) {
      case 'equipment':
      case 'mesin_peralatan':
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-500/10 text-blue-700 dark:text-blue-300">Mesin & Alat</span>;
      case 'vehicle':
      case 'kendaraan':
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-purple-500/10 text-purple-700 dark:text-purple-300">Kendaraan</span>;
      case 'furniture':
      case 'inventaris_perabot':
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300">Perabot</span>;
      case 'building':
      case 'bangunan':
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Bangunan</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground">{cls}</span>;
    }
  };

  const getStatusBadge = (asset: FixedAssetRegisterItem) => {
    if (asset.status === 'disposed') {
      return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-400">Dilepas / Dijual</span>;
    }
    if (asset.fully_depreciated) {
      return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-400">Lunas Susut</span>;
    }
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">Aktif</span>;
  };

  return (
    <div className="space-y-6">
      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border-l-4 border-l-primary flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Total Biaya Perolehan</p>
            <h4 className="text-xl font-bold text-foreground mt-1">{formatIDR(metrics.totalCost)}</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">Aset belum dilepas</p>
          </div>
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <Building2 className="w-5 h-5" />
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-amber-500 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Akumulasi Penyusutan</p>
            <h4 className="text-xl font-bold text-foreground mt-1">{formatIDR(metrics.totalDepreciation)}</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">Total susut tercatat</p>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <TrendingDown className="w-5 h-5" />
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-emerald-500 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Nilai Buku Bersih (NBV)</p>
            <h4 className="text-xl font-bold text-foreground mt-1">{formatIDR(metrics.totalBookValue)}</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">Sisa nilai aktiva di neraca</p>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <DollarSign className="w-5 h-5" />
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-purple-500 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Penyusutan Bulanan</p>
            <h4 className="text-xl font-bold text-foreground mt-1">{formatIDR(metrics.monthlyDepreciation)}</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">Estimasi beban susut per bulan</p>
          </div>
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <Clock className="w-5 h-5" />
          </div>
        </Card>
      </div>

      {/* Global Error Banner */}
      {(error || actionError) && (
        <div className="p-4 rounded-xl bg-destructive/10 text-destructive text-sm flex items-start justify-between gap-3 border border-destructive/20">
          <div className="flex items-start gap-2">
            <Info className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error || actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="text-xs underline hover:no-underline font-medium"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Inactive Accounting Banner */}
      {!isAccountingEnabled && (
        <Card className="p-4 border-l-4 border-l-amber-500 bg-amber-500/10 text-amber-950 dark:text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <p className="font-semibold text-sm">Sistem Akuntansi Belum Aktif</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Aktifkan akuntansi di tab Ringkasan untuk mulai mendaftarkan aset tetap dan mengelola penyusutan periodik.
              </p>
            </div>
          </div>
          {onNavigateToSummary && (
            <Button
              variant="outline"
              size="sm"
              onClick={onNavigateToSummary}
              className="whitespace-nowrap shrink-0 border-amber-600/30 hover:bg-amber-500/20 text-xs gap-1.5"
            >
              <span>Aktifkan di tab Ringkasan</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          )}
        </Card>
      )}

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-3 justify-between items-stretch md:items-center">
        {/* Search & Filter Controls */}
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Cari nama atau catatan aset..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">Semua Status</option>
            <option value="active">Aktif</option>
            <option value="fully_depreciated">Lunas Susut</option>
            <option value="disposed">Dilepas / Dijual</option>
          </select>

          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">Semua Klasifikasi</option>
            <option value="equipment">Mesin & Peralatan</option>
            <option value="vehicle">Kendaraan</option>
            <option value="furniture">Perabot & Perlengkapan</option>
            <option value="building">Bangunan</option>
          </select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchRegister()}
            disabled={loading}
            title="Muat ulang data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Action Button */}
        <Button
          variant="primary"
          onClick={() => setIsRegisterModalOpen(true)}
          disabled={!isAccountingEnabled}
          title={!isAccountingEnabled ? 'Aktifkan akuntansi di tab Ringkasan terlebih dahulu' : undefined}
          className="flex items-center gap-2 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Daftarkan Aset Tetap</span>
        </Button>
      </div>

      {/* Register Table */}
      <Card className="overflow-hidden border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 border-b border-border text-xs text-muted-foreground font-semibold">
              <tr>
                <th className="py-3 px-4">Nama Aset</th>
                <th className="py-3 px-4">Klasifikasi</th>
                <th className="py-3 px-4">Tgl Perolehan</th>
                <th className="py-3 px-4 text-right">Harga Perolehan</th>
                <th className="py-3 px-4 text-right">Akumulasi Susut</th>
                <th className="py-3 px-4 text-right">Nilai Buku</th>
                <th className="py-3 px-4 text-right">Beban/Bulan</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && register.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-muted-foreground">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                    Memuat daftar aset tetap...
                  </td>
                </tr>
              ) : filteredRegister.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-muted-foreground">
                    {searchQuery || statusFilter !== 'all' || classFilter !== 'all'
                      ? 'Tidak ada aset yang sesuai dengan kriteria filter.'
                      : 'Belum ada aset tetap yang didaftarkan.'}
                  </td>
                </tr>
              ) : (
                filteredRegister.map((asset) => {
                  const canDelete = asset.depreciation_months_posted === 0 && asset.status !== 'disposed';
                  return (
                    <tr
                      key={asset.id}
                      className="hover:bg-muted/20 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <button
                          onClick={() => {
                            setSelectedAsset(asset);
                            setIsDetailModalOpen(true);
                          }}
                          className="text-left group"
                        >
                          <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                            {asset.name}
                          </div>
                          {asset.notes && (
                            <div className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">
                              {asset.notes}
                            </div>
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-4">{getClassBadge(asset.asset_class)}</td>
                      <td className="py-3 px-4 whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateID(asset.acquisition_date)}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-foreground whitespace-nowrap">
                        {formatIDR(asset.cost)}
                      </td>
                      <td className="py-3 px-4 text-right text-muted-foreground whitespace-nowrap">
                        {formatIDR(asset.accumulated)}
                        <span className="block text-[10px] text-muted-foreground">
                          {asset.depreciation_months_posted} / {asset.useful_life_months} bln
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-foreground whitespace-nowrap">
                        {formatIDR(asset.book_value)}
                      </td>
                      <td className="py-3 px-4 text-right text-xs text-muted-foreground whitespace-nowrap">
                        {asset.status === 'active' && !asset.fully_depreciated ? formatIDR(asset.monthly_depreciation) : '-'}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {getStatusBadge(asset)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {/* Detail Button */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0"
                            title="Lihat Detail & Riwayat Penyusutan"
                            onClick={() => {
                              setSelectedAsset(asset);
                              setIsDetailModalOpen(true);
                            }}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>

                          {/* Edit Info Button (Ubah Nama / Catatan) */}
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!isAccountingEnabled}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                            title={!isAccountingEnabled ? 'Aktifkan akuntansi di tab Ringkasan terlebih dahulu' : 'Ubah Nama / Catatan'}
                            onClick={() => {
                              setEditAsset(asset);
                              setIsEditModalOpen(true);
                            }}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>

                          {/* Disposal Action: Dispose if not disposed, Undo if disposed */}
                          {asset.status !== 'disposed' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!isAccountingEnabled}
                              className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                              title={!isAccountingEnabled ? 'Aktifkan akuntansi di tab Ringkasan terlebih dahulu' : 'Lepas / Jual Aset Ini'}
                              onClick={() => {
                                setSelectedAsset(asset);
                                setIsDisposeModalOpen(true);
                              }}
                            >
                              <LogOut className="w-3.5 h-3.5" />
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!isAccountingEnabled}
                              className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-500/10"
                              title={!isAccountingEnabled ? 'Aktifkan akuntansi di tab Ringkasan terlebih dahulu' : 'Batalkan Pelepasan (Kembalikan Aset)'}
                              onClick={() => setConfirmUndoAsset(asset)}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </Button>
                          )}

                          {/* Delete Button (Allowed only if zero posted depreciation) */}
                          {canDelete && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!isAccountingEnabled}
                              className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                              title={!isAccountingEnabled ? 'Aktifkan akuntansi di tab Ringkasan terlebih dahulu' : 'Hapus Aset (Belum Ada Penyusutan)'}
                              onClick={() => setConfirmDeleteAsset(asset)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Register Asset Modal */}
      <FixedAssetModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        booksStartDate={booksStartDate}
        onSubmit={async (payload) => {
          const res = await registerFixedAsset(payload);
          onAssetMutated?.();
          return res;
        }}
      />

      {/* Dispose Asset Modal */}
      <DisposeAssetModal
        isOpen={isDisposeModalOpen}
        onClose={() => {
          setIsDisposeModalOpen(false);
          setSelectedAsset(null);
        }}
        asset={selectedAsset}
        onConfirm={async (payload) => {
          const res = await disposeFixedAsset(payload);
          onAssetMutated?.();
          return res;
        }}
      />

      {/* Asset Detail Modal */}
      <AssetDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedAsset(null);
        }}
        asset={selectedAsset}
        fetchDepreciationHistory={fetchDepreciationHistory}
        onNavigateToJournal={onNavigateToJournal}
      />

      {/* Edit Asset Info Modal (Ubah Nama / Catatan) */}
      <EditAssetInfoModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditAsset(null);
        }}
        asset={editAsset}
        onSubmit={async (assetId, name, notes) => {
          await updateFixedAssetInfo(assetId, name, notes);
        }}
      />

      {/* Confirmation Dialog: Delete Asset */}
      {confirmDeleteAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md p-6 space-y-4 shadow-xl border border-border">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-destructive/10 text-destructive shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-foreground">Hapus Aset Tetap</h4>
                <p className="text-xs text-muted-foreground">
                  Apakah Anda yakin ingin menghapus aset <span className="font-semibold text-foreground">{confirmDeleteAsset.name}</span>?
                </p>
                <p className="text-xs text-muted-foreground">
                  Jurnal perolehan dan data aset akan dihapus secara permanen. Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDeleteAsset(null)}
                disabled={actionLoading}
              >
                Batal
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleDeleteConfirm}
                disabled={actionLoading}
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                {actionLoading ? 'Menghapus...' : 'Ya, Hapus Aset'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Confirmation Dialog: Undo Disposal */}
      {confirmUndoAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md p-6 space-y-4 shadow-xl border border-border">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-foreground">Batalkan Pelepasan Aset</h4>
                <p className="text-xs text-muted-foreground">
                  Apakah Anda yakin ingin membatalkan pelepasan aset <span className="font-semibold text-foreground">{confirmUndoAsset.name}</span>?
                </p>
                <p className="text-xs text-muted-foreground">
                  Jurnal pelepasan akan dihapus dan aset akan dikembalikan ke status aktif.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmUndoAsset(null)}
                disabled={actionLoading}
              >
                Batal
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleUndoConfirm}
                disabled={actionLoading}
              >
                {actionLoading ? 'Memproses...' : 'Ya, Batalkan Pelepasan'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
