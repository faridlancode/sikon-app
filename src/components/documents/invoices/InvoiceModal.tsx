import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  FileText,
  User,
  CreditCard,
  AlertCircle,
  Calendar,
  DollarSign,
  Package,
} from 'lucide-react';
import Button from '../../ui/button';
import { formatIDR } from '../../../utils/formatCurrency';
import { todayISO } from '../../../utils/dateHelpers';
import { useCompanyBankAccounts } from '../../../hooks/useCompanyBankAccounts';
import type { Invoice, InvoiceItem, InvoiceType } from '../../../types';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceToEdit?: Invoice | null;
  onSave: (
    id: string | null,
    header: Partial<Invoice>,
    items: InvoiceItem[]
  ) => Promise<string>;
}

const DEFAULT_ITEM: InvoiceItem = {
  sort_order: 1,
  product_name: '',
  description: '',
  qty: 1,
  unit: 'pcs',
  unit_price: 0,
  subtotal: 0,
};

export default function InvoiceModal({
  isOpen,
  onClose,
  invoiceToEdit,
  onSave,
}: InvoiceModalProps) {
  const { accounts: bankAccounts } = useCompanyBankAccounts();

  // Form State
  const [invoiceDate, setInvoiceDate] = useState<string>(todayISO());
  const [dueDate, setDueDate] = useState<string>('');
  const [invoiceType, setInvoiceType] = useState<InvoiceType>('dp');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerAddress, setCustomerAddress] = useState<string>('');
  const [bankAccountId, setBankAccountId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [shippingCost, setShippingCost] = useState<number>(0);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [amountDue, setAmountDue] = useState<number>(0);
  const [isManualAmountDue, setIsManualAmountDue] = useState<boolean>(false);

  // Items State
  const [items, setItems] = useState<InvoiceItem[]>([
    { ...DEFAULT_ITEM, sort_order: 1 },
  ]);

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initial populate / reset
  useEffect(() => {
    if (!isOpen) return;

    if (invoiceToEdit) {
      setInvoiceDate(invoiceToEdit.invoice_date || todayISO());
      setDueDate(invoiceToEdit.due_date || '');
      setInvoiceType(invoiceToEdit.invoice_type || 'dp');
      setCustomerName(invoiceToEdit.customer_name || '');
      setCustomerAddress(invoiceToEdit.customer_address || '');
      setBankAccountId(invoiceToEdit.bank_account_id || '');
      setNotes(invoiceToEdit.notes || '');
      setShippingCost(Number(invoiceToEdit.shipping_cost) || 0);
      setPaidAmount(Number(invoiceToEdit.paid_amount) || 0);
      setAmountDue(Number(invoiceToEdit.amount_due) || 0);
      setIsManualAmountDue(true); // Biarkan nilai tersimpan bila sedang mengedit

      if (invoiceToEdit.invoice_items && invoiceToEdit.invoice_items.length > 0) {
        setItems(
          invoiceToEdit.invoice_items.map((it, idx) => ({
            ...it,
            sort_order: it.sort_order || idx + 1,
            qty: Number(it.qty) || 0,
            unit_price: Number(it.unit_price) || 0,
            subtotal: (Number(it.qty) || 0) * (Number(it.unit_price) || 0),
          }))
        );
      } else {
        setItems([{ ...DEFAULT_ITEM, sort_order: 1 }]);
      }
    } else {
      // New Invoice Form
      setInvoiceDate(todayISO());
      setDueDate('');
      setInvoiceType('dp');
      setCustomerName('');
      setCustomerAddress('');
      setNotes('Terima kasih atas kerja sama Anda.');
      setShippingCost(0);
      setPaidAmount(0);
      setAmountDue(0);
      setIsManualAmountDue(false);
      setItems([{ ...DEFAULT_ITEM, sort_order: 1 }]);

      // Default ke rekening utama
      const primaryBank = bankAccounts.find((a) => a.is_primary) || bankAccounts[0];
      if (primaryBank) {
        setBankAccountId(primaryBank.id);
      } else {
        setBankAccountId('');
      }
    }

    setErrorMessage(null);
  }, [isOpen, invoiceToEdit, bankAccounts]);

  // Hitung subtotal barang
  const calculatedSubtotal = useMemo(() => {
    return items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0);
  }, [items]);

  // Hitung Grand Total
  const calculatedGrandTotal = useMemo(() => {
    return calculatedSubtotal + (Number(shippingCost) || 0);
  }, [calculatedSubtotal, shippingCost]);

  // Otomatis sesuaikan amount_due jika user belum mengunci manual
  useEffect(() => {
    if (isManualAmountDue) return;

    if (invoiceType === 'dp') {
      // Default DP adalah 50% dari grand total
      setAmountDue(Math.round(calculatedGrandTotal * 0.5));
    } else if (invoiceType === 'pelunasan') {
      // Pelunasan = grand total - sudah dibayar
      setAmountDue(Math.max(0, calculatedGrandTotal - (Number(paidAmount) || 0)));
    } else {
      // Penuh = grand total
      setAmountDue(calculatedGrandTotal);
    }
  }, [invoiceType, calculatedGrandTotal, paidAmount, isManualAmountDue]);

  // Item Handlers
  function handleAddItem() {
    setItems((prev) => [
      ...prev,
      {
        ...DEFAULT_ITEM,
        sort_order: prev.length + 1,
      },
    ]);
  }

  function handleRemoveItem(index: number) {
    if (items.length <= 1) {
      alert('Invoice harus memiliki minimal 1 item.');
      return;
    }
    setItems((prev) =>
      prev.filter((_, idx) => idx !== index).map((it, idx) => ({ ...it, sort_order: idx + 1 }))
    );
  }

  function handleItemChange(index: number, field: keyof InvoiceItem, value: any) {
    setItems((prev) => {
      const next = [...prev];
      const target = { ...next[index], [field]: value };

      if (field === 'qty' || field === 'unit_price') {
        const qty = field === 'qty' ? Number(value) || 0 : Number(target.qty) || 0;
        const price = field === 'unit_price' ? Number(value) || 0 : Number(target.unit_price) || 0;
        target.subtotal = qty * price;
      }

      next[index] = target;
      return next;
    });
  }

  // Submit Handler
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (!customerName.trim()) {
      setErrorMessage('Nama pelanggan wajib diisi.');
      return;
    }

    if (items.length === 0) {
      setErrorMessage('Invoice harus memiliki minimal 1 item.');
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.product_name.trim()) {
        setErrorMessage(`Nama produk/pekerjaan pada item #${i + 1} wajib diisi.`);
        return;
      }
      if (Number(it.qty) <= 0) {
        setErrorMessage(`Jumlah (qty) pada item #${i + 1} harus lebih dari 0.`);
        return;
      }
    }

    try {
      setSaving(true);

      const headerPayload: Partial<Invoice> = {
        invoice_date: invoiceDate,
        due_date: dueDate || null,
        invoice_type: invoiceType,
        customer_name: customerName.trim(),
        customer_address: customerAddress.trim() || null,
        bank_account_id: bankAccountId || null,
        shipping_cost: Number(shippingCost) || 0,
        paid_amount: Number(paidAmount) || 0,
        amount_due: Number(amountDue) || 0,
        notes: notes.trim() || null,
      };

      const itemsPayload: InvoiceItem[] = items.map((it, idx) => ({
        sort_order: idx + 1,
        product_name: it.product_name.trim(),
        description: it.description?.trim() || null,
        qty: Number(it.qty) || 0,
        unit: it.unit?.trim() || 'pcs',
        unit_price: Number(it.unit_price) || 0,
      }));

      await onSave(invoiceToEdit?.id || null, headerPayload, itemsPayload);
      onClose();
    } catch (err: any) {
      console.error('Gagal menyimpan invoice:', err);
      setErrorMessage(err.message || 'Gagal menyimpan invoice.');
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {invoiceToEdit ? `Ubah Invoice: ${invoiceToEdit.invoice_no}` : 'Buat Invoice Baru'}
              </h2>
              <p className="text-xs text-slate-500">
                {invoiceToEdit
                  ? 'Perbarui rincian tagihan invoice'
                  : 'Terbitkan dokumen penagihan pembayaran (DP, Pelunasan, atau Penuh)'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMessage && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 flex items-start gap-3 text-rose-800 text-sm animate-in fade-in duration-200">
              <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Terjadi Kesalahan</p>
                <p className="text-xs text-rose-700 mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* 1. Informasi Header */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Informasi Pelanggan & Dokumen
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Pelanggan <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: PT Harapan Jaya / Bpk. Rudi"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Jenis Invoice <span className="text-rose-500">*</span>
                </label>
                <select
                  value={invoiceType}
                  onChange={(e) => {
                    setInvoiceType(e.target.value as InvoiceType);
                    setIsManualAmountDue(false);
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                >
                  <option value="dp">Uang Muka (DP)</option>
                  <option value="pelunasan">Pelunasan</option>
                  <option value="penuh">Penuh (Sekali Bayar)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Rekening Tujuan Transfer
                </label>
                <select
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                >
                  <option value="">-- Pilih Rekening Bank --</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bank_name} - {b.account_number} ({b.account_holder_name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tanggal Invoice <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="date"
                    required
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Jatuh Tempo (Opsional)
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alamat Pelanggan
                </label>
                <input
                  type="text"
                  placeholder="Kota / Alamat pengiriman"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* 2. Rincian Item Pekerjaan / Produk */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                Daftar Barang & Rincian Tagihan
              </h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddItem}
                className="gap-1.5 text-xs font-medium border-primary/30 text-primary hover:bg-primary/5"
              >
                <Plus className="h-4 w-4" />
                Tambah Baris
              </Button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100 text-[11px] font-bold text-slate-600 uppercase border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">No</th>
                    <th className="py-2.5 px-3 min-w-[200px]">Item / Pekerjaan <span className="text-rose-500">*</span></th>
                    <th className="py-2.5 px-3 min-w-[150px]">Keterangan</th>
                    <th className="py-2.5 px-3 w-24 text-right">Qty</th>
                    <th className="py-2.5 px-3 w-24">Satuan</th>
                    <th className="py-2.5 px-3 w-36 text-right">Harga Satuan</th>
                    <th className="py-2.5 px-3 w-36 text-right">Subtotal</th>
                    <th className="py-2.5 px-2 w-10 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {items.map((it, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 text-center font-medium text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          required
                          placeholder="Nama produk/pekerjaan"
                          value={it.product_name}
                          onChange={(e) => handleItemChange(idx, 'product_name', e.target.value)}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          placeholder="Contoh: Sablon plastisol, bordir dada"
                          value={it.description || ''}
                          onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          required
                          value={it.qty || ''}
                          onChange={(e) => handleItemChange(idx, 'qty', e.target.value)}
                          className="w-full text-right rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-primary focus:outline-none font-medium"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          placeholder="pcs"
                          value={it.unit || ''}
                          onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          min="0"
                          step="100"
                          required
                          value={it.unit_price || ''}
                          onChange={(e) => handleItemChange(idx, 'unit_price', e.target.value)}
                          className="w-full text-right rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-primary focus:outline-none font-medium"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-slate-800">
                        {formatIDR((Number(it.qty) || 0) * (Number(it.unit_price) || 0))}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-slate-400 hover:text-rose-600 transition p-1"
                          title="Hapus baris"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. Ringkasan & Pembayaran */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                Catatan / Instruksi Pembayaran
              </label>
              <textarea
                rows={4}
                placeholder="Catatan tambahan yang akan dicetak pada invoice..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="text-[11px] text-slate-400">
                Catatan ini akan tampil di bagian bawah rincian invoice pada saat cetak/PDF.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 shadow-sm space-y-3">
              <div className="flex justify-between items-center text-xs text-slate-600">
                <span>Subtotal Barang:</span>
                <span className="font-semibold text-slate-800">{formatIDR(calculatedSubtotal)}</span>
              </div>

              <div className="flex justify-between items-center text-xs text-slate-600 gap-3">
                <span className="flex-shrink-0">Ongkos Kirim (Rp):</span>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={shippingCost || ''}
                  onChange={(e) => setShippingCost(Number(e.target.value) || 0)}
                  className="w-36 text-right rounded border border-slate-300 px-2 py-1 text-xs focus:border-primary focus:outline-none font-medium bg-white"
                />
              </div>

              <div className="border-t border-slate-200 pt-2 flex justify-between items-center text-xs font-bold text-slate-900">
                <span>Total Tagihan (Grand Total):</span>
                <span className="text-sm font-black text-slate-900">{formatIDR(calculatedGrandTotal)}</span>
              </div>

              <div className="flex justify-between items-center text-xs text-slate-600 gap-3 pt-1">
                <span className="flex-shrink-0">Terbayar Sebelumnya (Rp):</span>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={paidAmount || ''}
                  onChange={(e) => {
                    setPaidAmount(Number(e.target.value) || 0);
                    setIsManualAmountDue(false);
                  }}
                  className="w-36 text-right rounded border border-slate-300 px-2 py-1 text-xs focus:border-primary focus:outline-none font-medium bg-white"
                />
              </div>

              <div className="border-t border-slate-200 pt-2.5 flex justify-between items-center gap-3">
                <div>
                  <span className="text-xs font-bold text-primary block">
                    Jumlah Ditagih Sekarang ({invoiceType.toUpperCase()}):
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {isManualAmountDue ? 'Nominal disesuaikan manual' : 'Dihitung otomatis'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={amountDue || ''}
                    onChange={(e) => {
                      setAmountDue(Number(e.target.value) || 0);
                      setIsManualAmountDue(true);
                    }}
                    className="w-40 text-right rounded-lg border-2 border-primary/40 px-3 py-1.5 text-sm font-bold text-primary focus:border-primary focus:outline-none bg-white shadow-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4 bg-slate-50">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={saving}
            className="text-slate-600 hover:text-slate-900"
          >
            Batal
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={handleSubmit}
            disabled={saving}
            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 shadow-sm"
          >
            {saving ? (
              'Menyimpan...'
            ) : invoiceToEdit ? (
              'Simpan Perubahan'
            ) : (
              'Terbitkan Invoice'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
