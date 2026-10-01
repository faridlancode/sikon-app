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
import { getMaterialPurchaseUnits, getPrimaryPurchaseUnit } from '../../utils/materialUnits';

interface SupplierPurchaseModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    requested_by?: string | null;
    supplier_name: string;
    payment_date?: string;
    notes?: string | null;
    items: {
      material_id: string;
      material_color_id?: string | null;
      category_id: string;
      stock_request_id?: string | null;
      quantity: number;
      unit: string;
      conversion_rate: number;
      is_variable_unit: boolean;
      unit_price: number;
    }[];
  }) => Promise<void>;
  initialStockRequestId?: string;
  initialStockRequestIds?: string[];
}

interface PurchaseItemRow {
  stock_request_id: string;
  material_id: string;
  material_color_id: string;
  category_id: string;
  quantity: number | '';
  unit: string;
  conversion_rate: number;
  is_variable_unit: boolean;
  unit_price: string;
  total_price: number;
}

const EMPTY_ROW: PurchaseItemRow = {
  stock_request_id: '',
  material_id: '',
  material_color_id: '',
  category_id: '',
  quantity: '',
  unit: '',
  conversion_rate: 1,
  is_variable_unit: false,
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
  initialStockRequestIds,
}: SupplierPurchaseModalProps) {
  const { activeStaff } = useStaff();
  const { materials } = useMaterials();
  const { expenseCategories } = useCategories();
  const { requests } = useStockRequests();

  const [supplierName, setSupplierName] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
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
    const currentCategories = expenseCategoriesRef.current;

    setSupplierName('');
    const defaultStaff = currentStaff.find((s) => s.role === 'Gudang') || currentStaff[0];
    setRequestedBy(defaultStaff ? defaultStaff.id : '');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setNotes('');

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

  // Reliable prefill from initialStockRequestId / initialStockRequestIds (handles async loading & direct fetch)
  const prefilledRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      prefilledRequestIdRef.current = null;
      return;
    }
    const targetIds = initialStockRequestIds && initialStockRequestIds.length > 0
      ? initialStockRequestIds
      : initialStockRequestId
        ? [initialStockRequestId]
        : [];

    if (targetIds.length === 0) return;
    const key = targetIds.sort().join(',');
    if (prefilledRequestIdRef.current === key) return;

    let isMounted = true;

    async function applyInitialRequests() {
      const foundRequests: any[] = [];
      const missingIds: string[] = [];

      for (const id of targetIds) {
        const req = requests.find((r) => r.id === id);
        if (req) {
          foundRequests.push(req);
        } else {
          missingIds.push(id);
        }
      }

      if (missingIds.length > 0) {
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
          .in('id', missingIds);

        if (!fetchErr && data && isMounted) {
          foundRequests.push(...(data as any[]));
        }
      }

      if (!isMounted || foundRequests.length === 0) return;

      const defaultCat = findMaterialCategoryId(expenseCategories);
      const generatedItems: PurchaseItemRow[] = foundRequests.map((req) => {
        const mat = req.materials || materials.find((m) => m.id === req.material_id);
        const fullMat = materials.find((m) => m.id === req.material_id) || mat;
        const estimatedPrice = req.estimated_price != null ? Number(req.estimated_price) : 0;
        const unitPrice = Number(fullMat?.price) || 0;
        const qty = Number(req.quantity_needed) || 0;
        const isVariableUnit = req.is_variable_unit ?? false;

        return {
          stock_request_id: req.id,
          material_id: req.material_id,
          material_color_id: req.material_color_id || '',
          category_id: defaultCat,
          quantity: qty,
          unit: req.unit || mat?.unit || 'pcs',
          conversion_rate: req.conversion_rate ?? 1,
          is_variable_unit: req.is_variable_unit ?? false,
          unit_price: estimatedPrice > 0
            ? formatIDRInput(estimatedPrice)
            : unitPrice > 0 && !isVariableUnit
              ? formatIDRInput(unitPrice * Number(req.conversion_rate || 1))
              : '',
          total_price: unitPrice * qty,
        };
      });

      const firstReqWithStaff = foundRequests.find((r) => r.requested_by);
      if (firstReqWithStaff?.requested_by) {
        setRequestedBy(firstReqWithStaff.requested_by);
      }

      setItems(generatedItems);
      prefilledRequestIdRef.current = key;
    }

    applyInitialRequests();

    return () => {
      isMounted = false;
    };
  }, [open, initialStockRequestId, initialStockRequestIds, requests, materials, expenseCategories]);

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
    const primaryUnit = getPrimaryPurchaseUnit(getMaterialPurchaseUnits(mat));
    const conversionRate = Number(primaryUnit?.conversion_rate) || 1;
    updateRow(index, {
      material_id: matId,
      material_color_id: '',
      unit: primaryUnit?.name || mat.unit || 'pcs',
      conversion_rate: conversionRate,
      is_variable_unit: Boolean(primaryUnit?.is_variable),
      unit_price: primaryUnit?.is_variable ? '' : (mat.price ? formatIDRInput(Number(mat.price) * conversionRate) : ''),
      category_id: defaultCat,
    });
  }

  function handleSelectUnit(index: number, unitName: string) {
    const item = items[index];
    const material = materials.find((candidate) => candidate.id === item.material_id);
    const selectedUnit = material && getMaterialPurchaseUnits(material).find((unit) => unit.name === unitName);
    if (!selectedUnit) return updateRow(index, { unit: unitName });
    updateRow(index, {
      unit: selectedUnit.name,
      conversion_rate: Number(selectedUnit.conversion_rate) || 1,
      is_variable_unit: selectedUnit.is_variable,
      unit_price: selectedUnit.is_variable
        ? ''
        : (material?.price ? formatIDRInput(Number(material.price) * Number(selectedUnit.conversion_rate || 1)) : ''),
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
      conversion_rate: req.conversion_rate ?? 1,
      is_variable_unit: req.is_variable_unit ?? false,
      unit_price: req.estimated_price != null
        ? formatIDRInput(Number(req.estimated_price))
        : mat?.price && !req.is_variable_unit
          ? formatIDRInput(Number(mat.price) * Number(req.conversion_rate || 1))
          : '',
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
        notes: notes.trim() || null,
        items: items.map((i) => ({
          material_id: i.material_id,
          material_color_id: i.material_color_id || null,
          category_id: i.category_id,
          stock_request_id: i.stock_request_id || null,
          quantity: Number(i.quantity),
          unit: i.unit.trim() || 'pcs',
          conversion_rate: i.is_variable_unit ? 0 : i.conversion_rate,
          is_variable_unit: i.is_variable_unit,
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

            <label className="block sm:col-span-3">
              <span className="mb-1 block text-xs font-semibold text-slate-700">Catatan / Keterangan (Opsional)</span>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="mis. Invoice #INV-1234, warna pesanan khusus, dll"
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
                            .filter((r) => r.status === 'approved' || r.status === 'in_progress' || r.id === item.stock_request_id)
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

                    <div className="sm:col-span-3">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-slate-600">Jumlah Beli *</span>
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

                    <div className="sm:col-span-3">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-slate-600">Satuan Beli *</span>
                        {item.material_id ? (
                          <select value={item.unit} onChange={(e) => handleSelectUnit(idx, e.target.value)} className={inputClass}>
                            {getMaterialPurchaseUnits(materials.find((m) => m.id === item.material_id)!).map((unit) => (
                              <option key={unit.id} value={unit.name}>{unit.name}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) => updateRow(idx, { unit: e.target.value })}
                            placeholder="meter, pcs, pack"
                            className={inputClass}
                          />
                        )}
                        {item.is_variable_unit ? (
                          <p className="mt-1 text-[10px] text-amber-700">Qty stok aktual dicatat saat penerimaan.</p>
                        ) : item.material_id && Number(item.quantity) > 0 && (
                          <p className="mt-1 text-[10px] text-slate-500">
                            ≈ {(Number(item.quantity) * item.conversion_rate).toLocaleString('id-ID')} {materials.find((m) => m.id === item.material_id)?.unit}
                          </p>
                        )}
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
