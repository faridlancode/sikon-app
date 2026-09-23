import { useState } from 'react';
import { Pencil, Trash2, Receipt, ShoppingCart } from 'lucide-react';
import Badge from '../ui/badge';
import { formatIDR } from '../../utils/formatCurrency';
import { formatDateID } from '../../utils/dateHelpers';

export default function TransactionTable({ transactions, onEdit, onDelete }) {
  const [deletingId, setDeletingId] = useState(null);

  async function handleDelete(id) {
    if (!window.confirm('Hapus transaksi ini? Tindakan ini tidak dapat dibatalkan.')) return;
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
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
            {transactions.map((trx) => (
              <tr key={trx.id} className="group transition-colors hover:bg-slate-50/80">
                <td className="px-4 py-3.5">
                  <p className="font-semibold text-slate-900">{trx.title}</p>
                  {trx.order_id && trx.orders && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      <ShoppingCart className="h-3 w-3" />
                      {trx.orders.order_id}
                    </span>
                  )}
                  {trx.description && !trx.order_id && (
                    <p className="mt-0.5 max-w-xs truncate text-xs text-slate-400">{trx.description}</p>
                  )}
                </td>
                <td className="px-4 py-3.5 text-slate-500">{trx.transaction_categories?.name ?? trx.categories?.name ?? '—'}</td>
                <td className="px-4 py-3.5 text-slate-500">{formatDateID(trx.transaction_date)}</td>
                <td className="px-4 py-3.5">
                  <Badge type={trx.type} />
                </td>
                <td
                  className={`px-4 py-3.5 text-right font-semibold tabular-nums ${trx.type === 'income' ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                >
                  {trx.type === 'income' ? '+' : '-'} {formatIDR(trx.amount)}
                </td>
                <td className="px-4 py-3.5">
                  {trx.order_id ? (
                    <p className="text-right text-xs italic text-slate-400">Otomatis dari Order</p>
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
