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
} from 'lucide-react';
import Button from '../ui/button';
import StockRequestModal from './StockRequestModal';
import type { StockRequest } from '../../types';

interface StockRequestsTabProps {
  requests: StockRequest[];
  loading: boolean;
  onCreateRequest: (payload: any) => Promise<void>;
  onUpdateStatus: (id: string, status: any, fulfillmentType?: any) => Promise<void>;
  onDeleteRequest: (id: string) => Promise<void>;
}

const STATUS_FILTERS = [
  { value: 'all', label: 'Semua' },
  { value: 'pending', label: 'Menunggu (Pending)' },
  { value: 'in_progress', label: 'Sedang Diproses' },
  { value: 'fulfilled', label: 'Terpenuhi' },
  { value: 'cancelled', label: 'Dibatalkan' },
];

export default function StockRequestsTab({
  requests,
  loading,
  onCreateRequest,
  onUpdateStatus,
  onDeleteRequest,
}: StockRequestsTabProps) {
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      return true;
    });
  }, [requests, statusFilter]);

  function getStatusBadge(status: string, fulfillmentType?: string | null) {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            <Clock className="h-3 w-3 text-amber-600" />
            Menunggu Finance
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
            {fulfillmentType === 'spj' ? <ShoppingBag className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
            Diproses ({fulfillmentType === 'spj' ? 'SPJ Belanja' : 'Direct Supplier'})
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
            <XCircle className="h-3 w-3 text-slate-400" />
            Dibatalkan
          </span>
        );
      default:
        return null;
    }
  }

  function handleProcessViaSpj(req: StockRequest) {
    navigate(`/purchasing?action=new-spj&requestId=${req.id}`);
  }

  function handleProcessViaSupplier(req: StockRequest) {
    navigate(`/purchasing?action=new-supplier&requestId=${req.id}`);
  }

  return (
    <div>
      {/* Header bar */}
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                statusFilter === tab.value
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {tab.label}
              {tab.value === 'pending' && (
                <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-bold text-amber-800">
                  {requests.filter((r) => r.status === 'pending').length}
                </span>
              )}
            </button>
          ))}
        </div>

        <Button onClick={() => setModalOpen(true)} className="w-full sm:w-auto">
          <Plus className="h-4 w-4" />
          Ajukan Restock Baru
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <Package className="h-5 w-5 text-slate-400" />
          </div>
          <p className="mt-3 text-sm font-medium text-slate-600">Tidak ada pengajuan restock</p>
          <p className="mt-1 text-xs text-slate-400">
            Gunakan tombol di atas untuk mengajukan pembelian bahan baru dari gudang.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80">
              <tr className="border-b border-border text-left text-[11px] font-semibold text-muted-foreground">
                <th className="px-4 py-3">Tgl Pengajuan</th>
                <th className="px-4 py-3">Material & Warna</th>
                <th className="px-4 py-3 text-right">Kebutuhan</th>
                <th className="px-4 py-3">Diajukan Oleh</th>
                <th className="px-4 py-3">Alasan / Catatan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi Alur Pembelian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {filteredRequests.map((req) => (
                <tr key={req.id} className="transition-colors hover:bg-slate-50/80">
                  <td className="px-4 py-3.5 text-xs text-slate-500">{req.requested_date}</td>
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-slate-900">{req.materials?.name || '—'}</p>
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
                  <td className="px-4 py-3.5 text-right font-medium text-slate-900">
                    {req.quantity_needed} <span className="text-xs text-slate-500">{req.unit}</span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-700">
                    <p className="text-sm font-medium">{req.staff?.name || '—'}</p>
                    <p className="text-[11px] text-muted-foreground">{req.staff?.role || 'Staf Gudang'}</p>
                  </td>
                  <td className="max-w-xs px-4 py-3.5 text-xs text-slate-600">
                    {req.reason || <span className="italic text-slate-400">Tidak ada catatan</span>}
                  </td>
                  <td className="px-4 py-3.5">{getStatusBadge(req.status, req.fulfillment_type)}</td>
                  <td className="px-4 py-3.5 text-right">
                    {req.status === 'pending' ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleProcessViaSpj(req)}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 shadow-sm"
                          title="Proses pembelian ritel lewat Staf Purchasing (SPJ nota)"
                        >
                          <ShoppingBag className="h-3.5 w-3.5 text-amber-600" />
                          SPJ Ritel
                        </button>
                        <button
                          onClick={() => handleProcessViaSupplier(req)}
                          className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800 transition hover:bg-blue-100 shadow-sm"
                          title="Proses order ke supplier tetap (lunas di muka)"
                        >
                          <Truck className="h-3.5 w-3.5 text-blue-600" />
                          Direct Supplier
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm('Batalkan pengajuan restock ini?')) {
                              onUpdateStatus(req.id, 'cancelled');
                            }
                          }}
                          className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                          title="Batalkan pengajuan"
                        >
                          <Ban className="h-4 w-4" />
                        </button>
                      </div>
                    ) : req.status === 'cancelled' ? (
                      <button
                        onClick={() => {
                          if (window.confirm('Hapus riwayat pengajuan ini?')) {
                            onDeleteRequest(req.id);
                          }
                        }}
                        className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                        title="Hapus baris"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {req.status === 'fulfilled' ? `Selesai ${req.fulfilled_date ? new Date(req.fulfilled_date).toLocaleDateString('id-ID') : ''}` : 'Sedang diproses'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <StockRequestModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={onCreateRequest}
      />
    </div>
  );
}
