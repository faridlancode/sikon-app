import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  CheckCircle2,
  XCircle,
  ShoppingBag,
  Truck,
  Plus,
  Trash2,
  Ban,
  Package,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  Info,
  Check,
  X,
} from 'lucide-react';
import Button from '../ui/button';
import { inputClass } from '../ui/FormField';
import StockRequestModal from './StockRequestModal';
import { useStaff } from '../../hooks/useStaff';
import type { StockRequest } from '../../types';

interface StockRequestsTabProps {
  requests: StockRequest[];
  loading: boolean;
  onCreateRequest: (payload: any) => Promise<void>;
  onUpdateStatus: (id: string, status: any, fulfillmentType?: any) => Promise<void>;
  onDeleteRequest: (id: string) => Promise<void>;
  onConfirmDraftAuto?: (
    id: string,
    payload: {
      requested_by: string;
      quantity_needed?: number;
      reason?: string | null;
      fulfillment_type?: 'spj' | 'supplier_purchase';
    }
  ) => Promise<void>;
}

const STATUS_FILTERS = [
  { value: 'all', label: 'Semua' },
  { value: 'draft_auto', label: 'Otomatis dari Order' },
  { value: 'pending', label: 'Menunggu Approval' },
  { value: 'approved', label: 'Disetujui (Siap Belanja)' },
  { value: 'in_progress', label: 'Sedang Diproses' },
  { value: 'rejected', label: 'Ditolak' },
  { value: 'fulfilled', label: 'Terpenuhi' },
  { value: 'cancelled', label: 'Dibatalkan' },
];

export default function StockRequestsTab({
  requests,
  loading,
  onCreateRequest,
  onUpdateStatus,
  onDeleteRequest,
  onConfirmDraftAuto,
}: StockRequestsTabProps) {
  const navigate = useNavigate();
  const { activeStaff } = useStaff();
  const [modalOpen, setModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  // Confirmation Modal for Draft Auto
  const [confirmModalItem, setConfirmModalItem] = useState<StockRequest | null>(null);
  const [confirmStaffId, setConfirmStaffId] = useState('');
  const [confirmQty, setConfirmQty] = useState<number | ''>('');
  const [confirmReason, setConfirmReason] = useState('');
  const [confirmFulfillmentType, setConfirmFulfillmentType] = useState<'spj' | 'supplier_purchase'>('spj');
  const [submittingConfirm, setSubmittingConfirm] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  // Cancel/Reject Modal
  const [cancelModalItem, setCancelModalItem] = useState<StockRequest | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [submittingCancel, setSubmittingCancel] = useState(false);

  const gudangStaff = useMemo(() => {
    return activeStaff.filter((s) => s.role === 'Gudang');
  }, [activeStaff]);

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      return true;
    });
  }, [requests, statusFilter]);

  const draftAutoCount = useMemo(
    () => requests.filter((r) => r.status === 'draft_auto').length,
    [requests]
  );
  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === 'pending').length,
    [requests]
  );
  const approvedCount = useMemo(
    () => requests.filter((r) => r.status === 'approved').length,
    [requests]
  );

  function getStatusBadge(req: StockRequest) {
    switch (req.status) {
      case 'draft_auto':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
            <Sparkles className="h-3 w-3 text-amber-600" />
            Otomatis Order (Perlu Konfirmasi)
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            <Clock className="h-3 w-3 text-amber-600" />
            Menunggu Approval Purchasing
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            Disetujui (Siap Belanja)
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
            <XCircle className="h-3 w-3 text-rose-600" />
            Ditolak Purchasing
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
            {req.fulfillment_type === 'spj' ? <ShoppingBag className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
            Diproses ({req.fulfillment_type === 'spj' ? 'SPJ Belanja' : 'Direct Supplier'})
          </span>
        );
      case 'fulfilled':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            Terpenuhi
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            <Ban className="h-3 w-3 text-slate-400" />
            Dibatalkan
          </span>
        );
      default:
        return null;
    }
  }

  function handleOpenConfirmModal(req: StockRequest) {
    setConfirmModalItem(req);
    setConfirmStaffId(gudangStaff[0]?.id || '');
    setConfirmQty(req.quantity_needed);
    setConfirmReason(req.reason || '');
    setConfirmFulfillmentType(req.fulfillment_type || 'spj');
    setConfirmError('');
  }

  async function handleConfirmDraftSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmModalItem) return;
    if (!confirmStaffId) {
      return setConfirmError('Pilih staf gudang sebagai pemohon.');
    }
    if (!confirmQty || Number(confirmQty) <= 0) {
      return setConfirmError('Jumlah kebutuhan harus lebih dari 0.');
    }

    setSubmittingConfirm(true);
    try {
      if (onConfirmDraftAuto) {
        await onConfirmDraftAuto(confirmModalItem.id, {
          requested_by: confirmStaffId,
          quantity_needed: Number(confirmQty),
          reason: confirmReason.trim() || null,
          fulfillment_type: confirmFulfillmentType,
        });
      } else {
        await onUpdateStatus(confirmModalItem.id, 'pending', confirmFulfillmentType);
      }
      setConfirmModalItem(null);
    } catch (err: any) {
      setConfirmError(err?.message || 'Gagal mengonfirmasi pengajuan.');
    } finally {
      setSubmittingConfirm(false);
    }
  }

  async function handleCancelSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cancelModalItem) return;
    setSubmittingCancel(true);
    try {
      await onUpdateStatus(cancelModalItem.id, 'cancelled');
      setCancelModalItem(null);
      setCancelReason('');
    } catch (err: any) {
      alert(err?.message || 'Gagal membatalkan pengajuan.');
    } finally {
      setSubmittingCancel(false);
    }
  }

  function handleProcessViaSpj(req: StockRequest) {
    navigate(`/purchasing?action=new-spj&requestId=${req.id}`);
  }

  function handleProcessViaSupplier(req: StockRequest) {
    navigate(`/purchasing?action=new-supplier&requestId=${req.id}`);
  }

  return (
    <div className="space-y-4">
      {/* Banner info bila ada pengajuan otomatis dari order yang butuh konfirmasi */}
      {draftAutoCount > 0 && statusFilter !== 'draft_auto' && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50/80 p-3.5 text-xs text-amber-900 shadow-sm">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-semibold">
                Ada {draftAutoCount} Pengajuan Restock Otomatis dari Pesanan Baru
              </p>
              <p className="text-amber-700">
                Sistem mendeteksi kekurangan stok kain. Mohon verifikasi kondisi fisik di rak gudang sebelum diajukan ke Purchasing.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setStatusFilter('draft_auto')}
            className="shrink-0 border-amber-300 bg-white text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            Review Sekarang ({draftAutoCount})
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
        {/* Header bar */}
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_FILTERS.map((tab) => {
              let count = 0;
              if (tab.value === 'draft_auto') count = draftAutoCount;
              if (tab.value === 'pending') count = pendingCount;
              if (tab.value === 'approved') count = approvedCount;

              return (
                <Button
                  key={tab.value}
                  type="button"
                  variant={statusFilter === tab.value ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setStatusFilter(tab.value)}
                  className="h-8 px-3 text-xs"
                >
                  {tab.label}
                  {Boolean(count) && (
                    <span
                      className={`ml-1.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                        tab.value === 'draft_auto'
                          ? 'bg-amber-500/20 text-amber-900'
                          : tab.value === 'approved'
                          ? 'bg-emerald-500/20 text-emerald-900'
                          : 'bg-primary-foreground/20 text-primary-foreground'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>

          <Button onClick={() => setModalOpen(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            Ajukan Restock Baru
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Package className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm font-medium text-foreground">Tidak ada pengajuan restock</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Gunakan tombol di atas untuk mengajukan pembelian bahan baru dari gudang.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr className="border-b border-border text-left text-[11px] font-semibold text-muted-foreground">
                  <th className="px-4 py-3">Tgl & Jalur Beli</th>
                  <th className="px-4 py-3">Material & Warna</th>
                  <th className="px-4 py-3 text-right">Kebutuhan</th>
                  <th className="px-4 py-3">Pemohon / Approver</th>
                  <th className="px-4 py-3">Catatan / Alasan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi Alur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {filteredRequests.map((req) => (
                  <tr key={req.id} className="transition-colors hover:bg-muted/40">
                    {/* Tanggal & Jalur Pembelian */}
                    <td className="px-4 py-3.5 text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">{req.requested_date}</p>
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        {req.fulfillment_type === 'supplier_purchase' ? (
                          <span className="inline-flex items-center gap-1 rounded bg-blue-50 dark:bg-blue-950/50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                            <Truck className="h-2.5 w-2.5" /> Direct Supplier
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-indigo-50 dark:bg-indigo-950/50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">
                            <ShoppingBag className="h-2.5 w-2.5" /> SPJ Belanja
                          </span>
                        )}
                        {req.source_type === 'auto_order' ? (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                            <Sparkles className="h-2.5 w-2.5" /> Auto
                          </span>
                        ) : null}
                      </div>
                    </td>

                    {/* Material & Warna */}
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-foreground">{req.materials?.name || '—'}</p>
                      {req.material_colors && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <span
                            className="h-2 w-2 rounded-full border border-slate-300"
                            style={{ backgroundColor: req.material_colors.color_code || '#94a3b8' }}
                          />
                          {req.material_colors.color_name}
                        </span>
                      )}
                    </td>

                    {/* Kebutuhan */}
                    <td className="px-4 py-3.5 text-right font-medium text-foreground whitespace-nowrap">
                      {req.quantity_needed} <span className="text-xs text-muted-foreground">{req.unit}</span>
                    </td>

                    {/* Pemohon / Approver */}
                    <td className="px-4 py-3.5 text-foreground">
                      {req.status === 'draft_auto' ? (
                        <span className="italic text-xs text-amber-700 font-medium">
                          Belum dikonfirmasi staf
                        </span>
                      ) : (
                        <div>
                          <p className="text-xs font-semibold">{req.staff?.name || '—'}</p>
                          <p className="text-[10px] text-muted-foreground">{req.staff?.role || 'Staf Gudang'}</p>
                          {req.approved_by_staff && (
                            <p className="text-[10px] text-emerald-700 font-medium mt-0.5">
                              ACC: {req.approved_by_staff.name}
                            </p>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Catatan */}
                    <td className="max-w-xs px-4 py-3.5 text-xs text-muted-foreground">
                      <p className="line-clamp-2">{req.reason || '—'}</p>
                      {req.rejected_reason && (
                        <p className="mt-1 text-[11px] font-medium text-rose-600 bg-rose-50 rounded p-1">
                          Alasan tolak: {req.rejected_reason}
                        </p>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5">{getStatusBadge(req)}</td>

                    {/* Aksi */}
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      {req.status === 'draft_auto' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleOpenConfirmModal(req)}
                            className="h-8 gap-1 bg-emerald-600 text-xs font-semibold hover:bg-emerald-700"
                            title="Konfirmasi stok fisik & ajukan ke Purchasing"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Konfirmasi & Ajukan
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setCancelModalItem(req);
                              setCancelReason('');
                            }}
                            className="h-8 text-xs text-muted-foreground hover:text-rose-600"
                            title="Abaikan/Batalkan"
                          >
                            <X className="h-3.5 w-3.5 mr-1" />
                            Abaikan
                          </Button>
                        </div>
                      ) : req.status === 'approved' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          {req.fulfillment_type === 'supplier_purchase' ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleProcessViaSupplier(req)}
                              className="h-8 gap-1 text-xs text-blue-700 hover:bg-blue-50"
                              title="Buka form Supplier Purchase di Purchasing"
                            >
                              <Truck className="h-3.5 w-3.5" />
                              Buat Pembelian Supplier
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleProcessViaSpj(req)}
                              className="h-8 gap-1 text-xs text-indigo-750 text-indigo-700 hover:bg-indigo-50"
                              title="Buka form SPJ di Purchasing"
                            >
                              <ShoppingBag className="h-3.5 w-3.5" />
                              Buat SPJ Belanja
                            </Button>
                          )}
                        </div>
                      ) : req.status === 'pending' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-[11px] text-muted-foreground italic mr-1">
                            Menunggu Purchasing
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (window.confirm('Batalkan pengajuan restock ini?')) {
                                onUpdateStatus(req.id, 'cancelled');
                              }
                            }}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-600"
                            title="Batalkan pengajuan"
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : req.status === 'cancelled' || req.status === 'rejected' ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (window.confirm('Hapus riwayat pengajuan ini?')) {
                              onDeleteRequest(req.id);
                            }
                          }}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          title="Hapus baris"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {req.status === 'fulfilled'
                            ? `Selesai ${req.fulfilled_date ? new Date(req.fulfilled_date).toLocaleDateString('id-ID') : ''}`
                            : 'Sedang diproses'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Ajukan Restock Manual */}
      <StockRequestModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={onCreateRequest}
      />

      {/* Modal Konfirmasi Draft Auto */}
      {confirmModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setConfirmModalItem(null)}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Konfirmasi Pengajuan Otomatis
                </h2>
                <p className="text-xs text-muted-foreground">
                  Verifikasi kekurangan stok fisik sebelum diajukan ke Purchasing
                </p>
              </div>
              <button
                onClick={() => setConfirmModalItem(null)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <form onSubmit={handleConfirmDraftSubmit} className="space-y-4 px-5 py-5">
              <div className="rounded-lg bg-slate-50 p-3 text-xs space-y-1">
                <p className="font-semibold text-slate-800">
                  {confirmModalItem.materials?.name}
                  {confirmModalItem.material_colors && ` — ${confirmModalItem.material_colors.color_name}`}
                </p>
                <p className="text-slate-500">{confirmModalItem.reason}</p>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Staf Gudang Pemohon
                </span>
                <select
                  value={confirmStaffId}
                  onChange={(e) => setConfirmStaffId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">-- Pilih Staf Gudang --</option>
                  {gudangStaff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.role})
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Jumlah Dibutuhkan
                  </span>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={confirmQty}
                    onChange={(e) =>
                      setConfirmQty(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Satuan
                  </span>
                  <input
                    type="text"
                    disabled
                    value={confirmModalItem.unit}
                    className={`${inputClass} bg-slate-100`}
                  />
                </label>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">
                  Kategori Pembelian <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmFulfillmentType('spj')}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${
                      confirmFulfillmentType === 'spj'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <ShoppingBag className="h-3.5 w-3.5 shrink-0" />
                    SPJ Belanja
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmFulfillmentType('supplier_purchase')}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${
                      confirmFulfillmentType === 'supplier_purchase'
                        ? 'border-blue-600 bg-blue-50 text-blue-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <Truck className="h-3.5 w-3.5 shrink-0" />
                    Direct Supplier
                  </button>
                </div>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Catatan / Alasan
                </span>
                <textarea
                  rows={2}
                  value={confirmReason}
                  onChange={(e) => setConfirmReason(e.target.value)}
                  className={inputClass}
                />
              </label>

              {confirmError && (
                <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {confirmError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setConfirmModalItem(null)}
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={submittingConfirm || gudangStaff.length === 0}
                >
                  {submittingConfirm ? 'Menyimpan...' : 'Konfirmasi & Ajukan ke Purchasing'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Abaikan / Batalkan */}
      {cancelModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setCancelModalItem(null)}
          />
          <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-xl p-5 space-y-4">
            <h3 className="font-semibold text-slate-900">Abaikan Pengajuan Otomatis Ini?</h3>
            <p className="text-xs text-slate-500">
              Pengajuan ini akan dibatalkan (misal karena stok fisik sebenarnya masih ada atau menggunakan kain lain).
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCancelModalItem(null)}
              >
                Batal
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={submittingCancel}
                onClick={handleCancelSubmit}
              >
                {submittingCancel ? 'Memproses...' : 'Ya, Abaikan'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
