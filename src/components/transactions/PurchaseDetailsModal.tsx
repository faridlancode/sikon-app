import { useEffect, useState } from 'react';
import { X, Package, ShoppingBag, Store, UserCheck, Calendar, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { formatIDR } from '../../utils/formatCurrency';
import { formatDateID } from '../../utils/dateHelpers';
import Button from '../ui/button';

interface PurchaseItem {
  id: string;
  material_name: string;
  color_name: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  description?: string | null;
}

interface PurchaseDetails {
  source_type: 'spj' | 'supplier';
  source_id: string;
  title: string;
  staff_name?: string | null;
  supplier_name?: string | null;
  document_date: string;
  service_fee?: number;
  total_amount: number;
  items: PurchaseItem[];
}

export default function PurchaseDetailsModal({
  open,
  onClose,
  transaction,
}: {
  open: boolean;
  onClose: () => void;
  transaction: any;
}) {
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<PurchaseDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !transaction?.id) {
      setDetails(null);
      setError(null);
      return;
    }

    async function fetchDetails() {
      setLoading(true);
      setError(null);
      try {
        const { data, error: rpcError } = await (supabase as any).rpc('get_transaction_purchase_items', {
          p_transaction_id: transaction.id,
        });

        if (rpcError) throw rpcError;
        setDetails(data as PurchaseDetails);
      } catch (err: any) {
        console.error('Error fetching purchase items:', err);
        setError(err.message || 'Gagal memuat rincian pembelian.');
      } finally {
        setLoading(false);
      }
    }

    fetchDetails();
  }, [open, transaction?.id]);

  if (!open) return null;

  const isSpj = details?.source_type === 'spj';
  const hasServiceFee = Number(details?.service_fee || 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={onClose} />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
              isSpj ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
            }`}>
              {isSpj ? <ShoppingBag className="h-5 w-5" /> : <Store className="h-5 w-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {transaction?.title || 'Rincian Belanja Material'}
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-0.5">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  {formatDateID(details?.document_date || transaction?.transaction_date)}
                </span>
                {details?.staff_name && (
                  <span className="flex items-center gap-1 font-medium text-slate-700">
                    <UserCheck className="h-3.5 w-3.5 text-slate-400" />
                    Staf: {details.staff_name}
                  </span>
                )}
                {details?.supplier_name && (
                  <span className="flex items-center gap-1 font-medium text-slate-700">
                    <Store className="h-3.5 w-3.5 text-slate-400" />
                    Supplier: {details.supplier_name}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
              <p className="mt-3 text-xs">Memuat rincian bahan...</p>
            </div>
          ) : error ? (
            <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700 text-sm">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ) : !details || details.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
              <Package className="h-8 w-8 text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-600">Tidak ada rincian bahan ditemukan</p>
              <p className="text-xs text-slate-400 mt-1">Dokumen pembelian ini mungkin belum memiliki rincian item.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Table of items */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5 text-center w-10">No</th>
                      <th className="px-3 py-2.5 text-left">Nama Bahan & Spesifikasi</th>
                      <th className="px-3 py-2.5 text-center w-24">Warna</th>
                      <th className="px-3 py-2.5 text-right w-24">Jumlah</th>
                      <th className="px-3 py-2.5 text-right w-28">Harga Satuan</th>
                      <th className="px-3 py-2.5 text-right w-28">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {details.items.map((item, idx) => (
                      <tr key={item.id || idx} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-3 py-2.5 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="px-3 py-2.5">
                          <p className="font-semibold text-slate-900">{item.material_name}</p>
                          {item.description && (
                            <p className="text-[11px] text-slate-400 mt-0.5">{item.description}</p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {item.color_name ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-medium text-slate-700">
                              {item.color_name}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium text-slate-700 tabular-nums">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-500 tabular-nums">
                          {formatIDR(item.unit_price)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
                          {formatIDR(item.total_price)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-slate-200 bg-slate-50/80 font-semibold text-xs">
                    {hasServiceFee && (
                      <tr className="border-b border-slate-200/60 text-slate-600">
                        <td colSpan={5} className="px-3 py-2 text-right">
                          Jasa Purchasing (Belanja / Transport Staf):
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-800 tabular-nums">
                          {formatIDR(details.service_fee || 0)}
                        </td>
                      </tr>
                    )}
                    <tr className="text-slate-900">
                      <td colSpan={5} className="px-3 py-2.5 text-right uppercase tracking-wider font-bold">
                        Total Belanja:
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-700 text-sm tabular-nums">
                        {formatIDR(transaction?.amount || details.total_amount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-3.5 bg-slate-50/50">
          <Button variant="secondary" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </div>
    </div>
  );
}
