import { useState } from 'react';
import { Pencil, Trash2, Receipt, ShoppingCart, Eye, Package } from 'lucide-react';
import Badge from '../ui/badge';
import { formatIDR } from '../../utils/formatCurrency';
import { formatDateID } from '../../utils/dateHelpers';
import { isAdvanceReversal } from '../../hooks/useFinanceSummary';
import PurchaseDetailsModal from './PurchaseDetailsModal';

export default function TransactionTable({ transactions, onEdit, onDelete }: {
  transactions: any[];
  onEdit: (trx: any) => void;
  onDelete: (id: string | number) => Promise<any>;
}) {
  const [deletingId, setDeletingId] = useState<string | number | null>(null);
  const [selectedPurchaseTrx, setSelectedPurchaseTrx] = useState<any | null>(null);

  async function handleDelete(id: string | number) {
    if (!window.confirm('Hapus transaksi ini? Tindakan ini tidak dapat dibatalkan.')) return;
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  }

  function hasPurchaseDetails(trx: any): boolean {
    if (trx.purchasing_report_id || trx.supplier_purchase_id) return true;
    const desc = trx.description || '';
    if (desc.includes('SPJ #') || desc.includes('pembelian supplier #')) return true;
    return false;
  }

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <Receipt className="h-5 w-5 text-slate-400" />
        </div>
        <p className="mt-3 text-sm font-medium text-slate-600">Tidak ada transaksi ditemukan</p>
        <p className="mt-1 text-xs text-slate-400">Coba ubah filter atau tambahkan transaksi baru.</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80">
              <tr className="border-b border-border text-left text-[11px] font-semibold text-muted-foreground">
                <th className="px-4 py-3">Transaksi</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Tipe</th>
                <th className="px-4 py-3 text-right">Jumlah</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {transactions.map((trx) => {
                const isReversal = isAdvanceReversal(trx);
                const canViewPurchase = hasPurchaseDetails(trx);

                return (
                  <tr key={trx.id} className="group transition-colors hover:bg-slate-50/80">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900">{trx.title}</p>
                        {isReversal && (
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200"
                            title="Pembalikan kasbon SPJ (bukan uang masuk usaha)"
                          >
                            Clearing
                          </span>
                        )}
                      </div>

                      {/* Tag Order / PO Batch */}
                      {trx.order_id && trx.orders && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            <ShoppingCart className="h-3 w-3" />
                            {trx.orders.order_id}
                          </span>
                          {trx.orders.po_batches && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                              {trx.orders.po_batches.name || trx.orders.po_batches.code}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Opsi 3 Gabungan: Ringkasan Bahan Singkat */}
                      {trx.items_summary && (
                        <p className="mt-1 text-xs text-slate-600 font-normal leading-relaxed line-clamp-2">
                          <span className="font-medium text-slate-500">Bahan:</span> {trx.items_summary}
                        </p>
                      )}

                      {/* Opsi 3 Gabungan: Tombol Lihat Rincian Nota */}
                      {canViewPurchase && (
                        <div className="mt-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedPurchaseTrx(trx)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 px-2 py-0.5 rounded-md transition shadow-2xs"
                            title="Buka rincian lengkap barang yang dibeli pada transaksi ini"
                          >
                            <Package className="h-3 w-3" />
                            <span>Lihat Rincian Bahan</span>
                            <Eye className="h-3 w-3 opacity-60 ml-0.5" />
                          </button>
                        </div>
                      )}

                      {/* Deskripsi manual biasa (jika bukan order dan bukan ringkasan bahan) */}
                      {trx.description && !trx.order_id && !trx.items_summary && (
                        <p className="mt-0.5 max-w-xs truncate text-xs text-slate-400">{trx.description}</p>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-slate-500">
                      {trx.transaction_categories?.name ?? trx.categories?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3.5 text-slate-500">{formatDateID(trx.transaction_date)}</td>
                    <td className="px-4 py-3.5">
                      {isReversal ? (
                        <span
                          className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700"
                          title="Pembalikan kasbon SPJ (tidak menambah omzet usaha)"
                        >
                          Penyeimbang Kasbon
                        </span>
                      ) : (
                        <Badge type={trx.type} />
                      )}
                    </td>
                    <td
                      className={`px-4 py-3.5 text-right font-semibold tabular-nums ${
                        isReversal
                          ? 'text-slate-600'
                          : trx.type === 'income'
                          ? 'text-emerald-700'
                          : 'text-rose-600'
                      }`}
                    >
                      {trx.type === 'income' ? '+' : '-'} {formatIDR(trx.amount)}
                    </td>
                    <td className="px-4 py-3.5">
                      {trx.order_id ? (
                        <p className="text-right text-xs italic text-slate-400">Otomatis dari Order</p>
                      ) : isReversal || canViewPurchase ? (
                        <p className="text-right text-xs italic text-slate-400">Otomatis Sistem</p>
                      ) : (
                        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={() => onEdit(trx)}
                            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                            title="Edit transaksi"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(trx.id)}
                            disabled={deletingId === trx.id}
                            className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                            title="Hapus transaksi"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Rincian Belanja Material */}
      <PurchaseDetailsModal
        open={!!selectedPurchaseTrx}
        onClose={() => setSelectedPurchaseTrx(null)}
        transaction={selectedPurchaseTrx}
      />
    </>
  );
}
