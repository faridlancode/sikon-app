import { useEffect, useRef, useState } from 'react';
import { X, Plus, Trash2, Truck, Calculator, AlertCircle } from 'lucide-react';
import { inputClass } from '../ui/FormField';
import Button from '../ui/button';
import { useStaff } from '../../hooks/useStaff';
import { useMaterials } from '../../hooks/useMaterials';
import { useCategories } from '../../hooks/useCategories';
import { useStockRequests } from '../../hooks/useStockRequests';
import { supabase } from '../../lib/supabaseClient';
import { formatIDR, formatIDRInput, parseIDRInput } from '../../utils/formatCurrency';

interface SupplierPurchaseModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    requested_by?: string | null;
    supplier_name: string;
    payment_date?: string;
    items: {
      material_id: string;
      material_color_id?: string | null;
      category_id: string;
      stock_request_id?: string | null;
      quantity: number;
      unit: string;
      unit_price: number;
    }[];
  }) => Promise<void>;
  initialStockRequestId?: string;
}

interface PurchaseItemRow {
  stock_request_id: string;
  material_id: string;
  material_color_id: string;
  category_id: string;
  quantity: number | '';
  unit: string;
  unit_price: string;
  total_price: number;
}

const EMPTY_ROW: PurchaseItemRow = {
  stock_request_id: '',
  material_id: '',
  material_color_id: '',
  category_id: '',
  quantity: '',
  unit: 'meter',
  unit_price: '',
  total_price: 0,
};

function findMaterialCategoryId(categories: { id: string | number; name: string }[]): string {
  const target = categories.find((c) =>
    c.name.trim().toLowerCase() === 'pembelian material' ||
    c.name.toLowerCase().includes('pembelian material') ||
    c.name.toLowerCase().includes('material')
  );
  return target ? String(target.id) : (categories[0]?.id ? String(categories[0].id) : '');
}

export default function SupplierPurchaseModal({
  open,
  onClose,
  onSubmit,
  initialStockRequestId,
}: SupplierPurchaseModalProps) {
  const { activeStaff } = useStaff();
  const { materials } = useMaterials();
  const { expenseCategories } = useCategories();
  const { requests } = useStockRequests();

  const [supplierName, setSupplierName] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<PurchaseItemRow[]>([{ ...EMPTY_ROW }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Refs to hold latest data without triggering re-init on data refresh
  const activeStaffRef = useRef(activeStaff);
  const requestsRef = useRef(requests);
  const materialsRef = useRef(materials);
  const expenseCategoriesRef = useRef(expenseCategories);
  useEffect(() => { activeStaffRef.current = activeStaff; }, [activeStaff]);
  useEffect(() => { requestsRef.current = requests; }, [requests]);
  useEffect(() => { materialsRef.current = materials; }, [materials]);
  useEffect(() => { expenseCategoriesRef.current = expenseCategories; }, [expenseCategories]);

  // Initialize form ONLY when modal opens (open: false->true).
  const prevOpenRef = useRef(false);
  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;
    if (!justOpened) return;

    const currentStaff = activeStaffRef.current;
    const currentRequests = requestsRef.current;
    const currentMaterials = materialsRef.current;
    const currentCategories = expenseCategoriesRef.current;

    setSupplierName('');
    const defaultStaff = currentStaff.find((s) => s.role === 'Gudang') || currentStaff[0];
    setRequestedBy(defaultStaff ? defaultStaff.id : '');
    setPaymentDate(new Date().toISOString().split('T')[0]);

    const defaultCat = findMaterialCategoryId(currentCategories);
    setItems([
      {
        ...EMPTY_ROW,
        category_id: defaultCat,
      },
    ]);
    setError('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reliable prefill from initialStockRequestId (handles async loading & direct fetch)
  const prefilledRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      prefilledRequestIdRef.current = null;
      return;
    }
    if (!initialStockRequestId) return;
    if (prefilledRequestIdRef.current === initialStockRequestId) return;

    let isMounted = true;

    async function applyInitialRequest() {
      let req = requests.find((r) => r.id === initialStockRequestId);
      let mat = req?.materials || materials.find((m) => m.id === req?.material_id);

      if (!req) {
        const { data, error: fetchErr } = await supabase
          .from('stock_requests')
          .select(`
            *,
            materials (
              id,
              name,
              unit,
              price,
              category_id,
              material_categories (
                name,
                is_fabric
              )
            ),
            material_colors (
              id,
              color_name
            )
          `)
          .eq('id', initialStockRequestId)
          .single();

        if (fetchErr || !data || !isMounted) return;
        req = data as any;
        mat = (data as any).materials;
      }

      if (!isMounted || !req) return;

      const fullMat = materials.find((m) => m.id === req?.material_id) || (mat as any);
      const defaultCat = findMaterialCategoryId(expenseCategories);
      const unitPrice = Number(fullMat?.price) || 0;
      const qty = Number(req.quantity_needed) || 0;

      if (req.requested_by) {
        setRequestedBy(req.requested_by);
      }

      setItems([
        {
          stock_request_id: req.id,
          material_id: req.material_id,
          material_color_id: req.material_color_id || '',
          category_id: defaultCat,
          quantity: qty,
          unit: req.unit || mat?.unit || 'pcs',
          unit_price: unitPrice > 0 ? formatIDRInput(unitPrice) : '',
          total_price: unitPrice * qty,
        },
      ]);

      prefilledRequestIdRef.current = initialStockRequestId;
    }

    applyInitialRequest();

    return () => {
      isMounted = false;
    };
  }, [open, initialStockRequestId, requests, materials, expenseCategories]);

  // Auto-fill category to "Pembelian Material" if expenseCategories loads asynchronously
  useEffect(() => {
    if (!open || expenseCategories.length === 0) return;
    const matCatId = findMaterialCategoryId(expenseCategories);
    if (!matCatId) return;

    setItems((prev) => {
      let changed = false;
      const updated = prev.map((item) => {
        const isValid = expenseCategories.some((c) => String(c.id) === String(item.category_id));
        if (!item.category_id || !isValid) {
          changed = true;
          return { ...item, category_id: matCatId };
        }
        return item;
      });
      return changed ? updated : prev;
    });
  }, [open, expenseCategories]);

  if (!open) return null;

  function updateRow(index: number, patch: Partial<PurchaseItemRow>) {
    setItems((prev) => {
      const copy = [...prev];
      const current = { ...copy[index], ...patch };

      const qty = Number(current.quantity) || 0;
      const price = parseIDRInput(current.unit_price);
      current.total_price = qty * price;

      copy[index] = current;
      return copy;
    });
  }

  function handleSelectMaterial(index: number, matId: string) {
    const mat = materials.find((m) => m.id === matId);
    if (!mat) {
      updateRow(index, { material_id: '', material_color_id: '' });
      return;
    }

    const defaultCat = items[index].category_id || findMaterialCategoryId(expenseCategories);
    updateRow(index, {
      material_id: matId,
      material_color_id: '',
      unit: mat.unit || 'pcs',
      unit_price: mat.price ? formatIDRInput(mat.price) : '',
      category_id: defaultCat,
    });
  }

  function handleSelectStockRequest(index: number, reqId: string) {
    const req = requests.find((r) => r.id === reqId);
    if (!req) {
      updateRow(index, { stock_request_id: '' });
      return;
    }

    const mat = materials.find((m) => m.id === req.material_id);
    const defaultCat = items[index].category_id || findMaterialCategoryId(expenseCategories);
    updateRow(index, {
      stock_request_id: reqId,
      material_id: req.material_id,
      material_color_id: req.material_color_id || '',
      quantity: req.quantity_needed,
      unit: req.unit,
      unit_price: mat?.price ? formatIDRInput(mat.price) : '',
      category_id: defaultCat,
    });
  }

  function addRow() {
    const defaultCat = findMaterialCategoryId(expenseCategories);
    setItems((prev) => [
      ...prev,
      {
        ...EMPTY_ROW,
        category_id: defaultCat,
      },
    ]);
  }

  function removeRow(index: number) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const grandTotal = items.reduce((sum, item) => sum + (Number(item.total_price) || 0), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!supplierName.trim()) return setError('Nama supplier wajib diisi.');
    if (items.length === 0) return setError('Minimal harus ada 1 item pembelian.');

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.material_id) {
        return setError(`Baris #${i + 1}: Pilih material yang dipesan.`);
      }
      if (!item.category_id) {
        return setError(`Baris #${i + 1}: Pilih kategori pengeluaran biaya.`);
      }
      if (!item.quantity || Number(item.quantity) <= 0) {
        return setError(`Baris #${i + 1}: Jumlah harus lebih dari 0.`);
      }
      const unitPriceNum = parseIDRInput(item.unit_price);
      if (item.unit_price === '' || unitPriceNum < 0) {
        return setError(`Baris #${i + 1}: Harga satuan tidak boleh kosong atau negatif.`);
      }
    }

    setSubmitting(true);
    try {
      await onSubmit({
        requested_by: requestedBy || null,
        supplier_name: supplierName.trim(),
        payment_date: paymentDate,
        items: items.map((i) => ({
          material_id: i.material_id,
          material_color_id: i.material_color_id || null,
          category_id: i.category_id,
          stock_request_id: i.stock_request_id || null,
          quantity: Number(i.quantity),
          unit: i.unit.trim() || 'pcs',
          unit_price: parseIDRInput(i.unit_price),
        })),
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mencatat pembelian supplier.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative my-auto flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Pembelian Direct Supplier</h2>
              <p className="text-xs text-muted-foreground">
                Order ke supplier tetap, transfer lunas di muka, stok masuk saat barang diterima di gudang
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Header section: Supplier, Pemohon, Tanggal */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-xl bg-slate-50/80 p-4 border border-slate-200/60">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-700">Nama Supplier / Vendor *</span>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="mis. PT Multi Warna Tekstil"
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-700">Staf Pemohon</span>
              <select
                value={requestedBy}
                onChange={(e) => setRequestedBy(e.target.value)}
                className={inputClass}
              >
                <option value="">-- Pilih Staf --</option>
                {activeStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.role || 'Staf'})
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-700">Tanggal Pembayaran Transfer</span>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          {/* Items Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Daftar Bahan Dipesan ({items.length} item)</h3>
                <p className="text-xs text-muted-foreground">
                  Bahan yang dibeli akan langsung dicatat sebagai pengeluaran, status menjadi 'Ordered'.
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={addRow} className="text-xs">
                <Plus className="h-3.5 w-3.5" />
                Tambah Bahan
              </Button>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
                >
                  <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-bold text-slate-700">Item #{idx + 1}</span>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                        <span>Ref Restock Gudang:</span>
                        <select
                          value={item.stock_request_id}
                          onChange={(e) => handleSelectStockRequest(idx, e.target.value)}
                          className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="">-- Bukan dari Pengajuan --</option>
                          {item.stock_request_id && !requests.some((r) => r.id === item.stock_request_id) && (
                            <option value={item.stock_request_id}>
                              Pengajuan Restock Terpilih (#{item.stock_request_id.slice(0, 8)})
                            </option>
                          )}
                          {requests
                            .filter((r) => r.status === 'pending' || r.status === 'in_progress' || r.id === item.stock_request_id)
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.materials?.name || 'Material'} ({r.quantity_needed} {r.unit}) - {r.staff?.name || 'Gudang'}
                              </option>
                            ))}
                        </select>
                      </div>

                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          title="Hapus baris"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                    {/* Material */}
                    <div className="sm:col-span-5">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-slate-600">Material Bahan *</span>
                        <select
                          value={item.material_id}
                          onChange={(e) => handleSelectMaterial(idx, e.target.value)}
                          className={inputClass}
                        >
                          <option value="">-- Pilih Material --</option>
                          {materials.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.material_categories?.name || 'Umum'})
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {/* Kategori Pengeluaran */}
                    <div className="sm:col-span-4">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-slate-600">Kategori Biaya Keuangan *</span>
                        <select
                          value={item.category_id}
                          onChange={(e) => updateRow(idx, { category_id: e.target.value })}
                          className={inputClass}
                        >
                          <option value="">-- Pilih Kategori --</option>
                          {expenseCategories.map((c) => (
                            <option key={c.id} value={String(c.id)}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {/* Qty */}
                    <div className="sm:col-span-3">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-slate-600">Qty *</span>
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          value={item.quantity}
                          onChange={(e) => updateRow(idx, { quantity: e.target.value === '' ? '' : Number(e.target.value) })}
                          placeholder="50"
                          className={inputClass}
                        />
                      </label>
                    </div>

                    {/* Satuan */}
                    <div className="sm:col-span-3">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-slate-600">Satuan *</span>
                        <input
                          type="text"
                          value={item.unit}
                          onChange={(e) => updateRow(idx, { unit: e.target.value })}
                          placeholder="meter"
                          className={inputClass}
                        />
                      </label>
                    </div>

                    {/* Harga Satuan */}
                    <div className="sm:col-span-4">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-slate-600">Harga Satuan (Rp) *</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={item.unit_price}
                          onChange={(e) => updateRow(idx, { unit_price: formatIDRInput(e.target.value) })}
                          placeholder="mis. 45.000"
                          className={inputClass}
                        />
                      </label>
                    </div>

                    {/* Subtotal */}
                    <div className="sm:col-span-5">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-slate-600">Subtotal</span>
                        <div className="flex h-9 items-center rounded-lg bg-slate-100 px-3 font-semibold text-slate-900 text-sm">
                          {formatIDR(item.total_price)}
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Grand Total Footer */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-slate-600" />
                <span className="font-semibold text-slate-900">Total Pembayaran ke Supplier:</span>
              </div>
              <span className="text-xl font-bold text-slate-900">
                {formatIDR(grandTotal)}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              Pengeluaran sebesar <strong>{formatIDR(grandTotal)}</strong> akan langsung tercatat di menu Keuangan pada tanggal {paymentDate}. Saat barang tiba di konveksi, cukup klik tombol <em>"Tandai Barang Diterima"</em> untuk memasukkan stok ke gudang secara otomatis.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Menyimpan...' : 'Bayar & Catat Pembelian'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
