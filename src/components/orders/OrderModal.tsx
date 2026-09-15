import { useEffect, useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { inputClass } from '../ui/FormField';
import Button from '../ui/button';
import { formatIDR, formatIDRInput, parseIDRInput } from '../../utils/formatCurrency';
import { todayISO } from '../../utils/dateHelpers';

const EMPTY_ITEM = () => ({ key: crypto.randomUUID(), category_id: '', name_item: '', bahan: '', qty: 1, price: '' });

const EMPTY_ORDER = {
  sales_id: '',
  customer_name: '',
  order_date: todayISO(),
  ongkir: '',
};

const PAYMENT_METHODS = [
  { value: 'transfer', label: 'Transfer' },
  { value: 'cash', label: 'Tunai' },
  { value: 'qris', label: 'QRIS' },
  { value: 'lainnya', label: 'Lainnya' },
];

export default function OrderModal({ open, onClose, onSubmit, editingOrder, editingItems, salesList = [], productCategories = [] }) {
  const [order, setOrder] = useState(EMPTY_ORDER);
  const [items, setItems] = useState([EMPTY_ITEM()]);
  const [payment, setPayment] = useState({
    amount: '',
    paymentType: 'dp',
    paymentDate: todayISO(),
    paymentMethod: 'transfer',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editingOrder) {
      setOrder({
        sales_id: editingOrder.sales_id || '',
        customer_name: editingOrder.customer_name,
        order_date: editingOrder.order_date,
        ongkir: formatIDRInput(editingOrder.ongkir ?? 0),
      });
      setItems(
        (editingItems?.length ? editingItems : [{}]).map((item) => ({
          key: crypto.randomUUID(),
          category_id: item.category_id || '',
          name_item: item.name_item || '',
          bahan: item.bahan || '',
          qty: item.qty ?? 1,
          price: item.price !== undefined ? formatIDRInput(item.price) : '',
        }))
      );
    } else {
      setOrder(EMPTY_ORDER);
      setItems([EMPTY_ITEM()]);
      setPayment({ amount: '', paymentType: 'dp', paymentDate: todayISO(), paymentMethod: 'transfer' });
    }
    setError('');
  }, [open, editingOrder, editingItems]);

  if (!open) return null;

  function updateItem(key, patch) {
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((list) => [...list, EMPTY_ITEM()]);
  }

  function removeItem(key) {
    setItems((list) => (list.length > 1 ? list.filter((it) => it.key !== key) : list));
  }

  const subtotal = items.reduce((sum, it) => sum + (Number(it.qty) || 0) * parseIDRInput(it.price), 0);
  const ongkirNumber = parseIDRInput(order.ongkir);
  const grandTotal = subtotal + ongkirNumber;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!order.customer_name.trim()) return setError('Nama customer wajib diisi.');
    const validItems = items.filter((it) => it.category_id && Number(it.qty) > 0 && parseIDRInput(it.price) >= 0);
    if (validItems.length === 0) return setError('Tambahkan minimal 1 item dengan kategori, qty, dan harga yang valid.');

    const paymentAmount = parseIDRInput(payment.amount);
    if (!editingOrder) {
      if (!paymentAmount || paymentAmount <= 0) return setError('Jumlah pembayaran harus lebih dari 0.');
      if (paymentAmount > grandTotal) {
        return setError(`Jumlah pembayaran melebihi total order (${formatIDR(grandTotal)}).`);
      }
      if (!payment.paymentDate) return setError('Tanggal pembayaran wajib diisi.');
    }

    setSubmitting(true);
    try {
      await onSubmit({
        order: {
          sales_id: order.sales_id || null,
          customer_name: order.customer_name.trim(),
          order_date: order.order_date,
          ongkir: ongkirNumber,
        },
        items: validItems.map((it) => ({
          category_id: it.category_id,
          name_item: productCategories.find((category) => category.id === it.category_id)?.name || it.name_item.trim(),
          bahan: it.bahan.trim() || null,
          qty: Number(it.qty),
          price: parseIDRInput(it.price),
        })),
        payment: !editingOrder
          ? {
            amount: paymentAmount,
            paymentType: payment.paymentType,
            paymentDate: payment.paymentDate,
            paymentMethod: payment.paymentMethod,
          }
          : null,
      });
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan order. Coba lagi.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{editingOrder ? 'Edit Order' : 'Tambah Order'}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Nama Customer</span>
              <input
                type="text"
                value={order.customer_name}
                onChange={(e) => setOrder((f) => ({ ...f, customer_name: e.target.value }))}
                placeholder="mis. Budi Santoso"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Sales</span>
              <select
                value={order.sales_id}
                onChange={(e) => setOrder((f) => ({ ...f, sales_id: e.target.value }))}
                className={inputClass}
              >
                <option value="">Tanpa sales</option>
                {salesList.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Tanggal Order</span>
              <input
                type="date"
                value={order.order_date}
                onChange={(e) => setOrder((f) => ({ ...f, order_date: e.target.value }))}
                className={inputClass}
              />
            </label>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Item Order</span>
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
              >
                <Plus className="h-3.5 w-3.5" /> Tambah item
              </button>
            </div>

            <div className="space-y-2">
              {items.map((item) => {
                const lineTotal = (Number(item.qty) || 0) * parseIDRInput(item.price);
                return (
                  <div key={item.key} className="rounded-lg border border-slate-200 p-3">
                    <div className="grid grid-cols-12 gap-2">
                      <select
                        value={item.category_id}
                        onChange={(e) => {
                          const category = productCategories.find((option) => option.id === e.target.value);
                          updateItem(item.key, { category_id: e.target.value, name_item: category?.name || '' });
                        }}
                        className={`${inputClass} col-span-12 py-2 sm:col-span-4`}
                      >
                        <option value="">Pilih kategori</option>
                        {productCategories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={item.bahan}
                        onChange={(e) => updateItem(item.key, { bahan: e.target.value })}
                        placeholder="Bahan"
                        className={`${inputClass} col-span-6 py-2 sm:col-span-3`}
                      />
                      <input
                        type="number"
                        min="0"
                        value={item.qty}
                        onChange={(e) => updateItem(item.key, { qty: e.target.value })}
                        placeholder="Qty"
                        className={`${inputClass} col-span-3 py-2 sm:col-span-2`}
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={item.price}
                        onChange={(e) => updateItem(item.key, { price: formatIDRInput(e.target.value) })}
                        placeholder="Harga"
                        className={`${inputClass} col-span-9 py-2 sm:col-span-2`}
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(item.key)}
                        className="col-span-12 flex items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 sm:col-span-1"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="mt-1.5 text-right text-xs text-slate-400">Subtotal: {formatIDR(lineTotal)}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 rounded-lg bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700">Ongkos Kirim (Rp)</label>
              <input
                type="text"
                inputMode="numeric"
                value={order.ongkir}
                onChange={(e) => setOrder((f) => ({ ...f, ongkir: formatIDRInput(e.target.value) }))}
                placeholder="0"
                className={`${inputClass} w-32 py-1.5 text-right`}
              />
            </div>
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>Subtotal Item</span>
              <span className="tabular-nums">{formatIDR(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-sm font-semibold text-slate-900">
              <span>Grand Total</span>
              <span className="tabular-nums">{formatIDR(grandTotal)}</span>
            </div>
          </div>

          {!editingOrder && (
            <div className="space-y-3 rounded-lg border border-slate-200 p-4">
              <span className="block text-sm font-medium text-slate-700">Pembayaran Pertama</span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-slate-600">Jumlah Dibayar (Rp)</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={payment.amount}
                    onChange={(e) => setPayment((value) => ({ ...value, amount: formatIDRInput(e.target.value) }))}
                    placeholder="0"
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-slate-600">Jenis Pembayaran</span>
                  <select
                    value={payment.paymentType}
                    onChange={(e) => setPayment((value) => ({ ...value, paymentType: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="dp">DP</option>
                    <option value="pelunasan">Pelunasan</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-slate-600">Tanggal Pembayaran</span>
                  <input
                    type="date"
                    value={payment.paymentDate}
                    onChange={(e) => setPayment((value) => ({ ...value, paymentDate: e.target.value }))}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-slate-600">Metode Pembayaran</span>
                  <select
                    value={payment.paymentMethod}
                    onChange={(e) => setPayment((value) => ({ ...value, paymentMethod: e.target.value }))}
                    className={inputClass}
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method.value} value={method.value}>
                        {method.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}

          {error && <div className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</div>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Menyimpan...' : editingOrder ? 'Simpan Perubahan' : 'Buat Order'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
