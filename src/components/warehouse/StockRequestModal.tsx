import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Package, AlertTriangle, ShoppingBag, Truck } from 'lucide-react';
import { inputClass } from '../ui/FormField';
import Button from '../ui/button';
import { useMaterials } from '../../hooks/useMaterials';
import { useMaterialColors } from '../../hooks/useMaterialColors';
import { useStaff } from '../../hooks/useStaff';

interface StockRequestModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    material_id: string;
    material_color_id?: string | null;
    requested_by?: string | null;
    quantity_needed: number;
    unit: string;
    reason?: string | null;
    fulfillment_type?: 'spj' | 'supplier_purchase';
  }) => Promise<void>;
  defaultMaterialId?: string;
  defaultColorId?: string;
}

export default function StockRequestModal({
  open,
  onClose,
  onSubmit,
  defaultMaterialId,
  defaultColorId,
}: StockRequestModalProps) {
  const { materials } = useMaterials();
  const { activeStaff } = useStaff();

  const gudangStaff = useMemo(() => {
    return activeStaff.filter((s) => s.role === 'Gudang');
  }, [activeStaff]);

  const [requestedBy, setRequestedBy] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [materialColorId, setMaterialColorId] = useState('');
  const [quantityNeeded, setQuantityNeeded] = useState<number | ''>('');
  const [unit, setUnit] = useState('meter');
  const [fulfillmentType, setFulfillmentType] = useState<'spj' | 'supplier_purchase'>('spj');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const { colors } = useMaterialColors(materialId);

  const selectedMaterial = materials.find((m) => m.id === materialId);
  const isFabric = selectedMaterial?.material_categories?.is_fabric ?? false;

  const materialsRef = useRef(materials);
  const gudangStaffRef = useRef(gudangStaff);
  useEffect(() => { materialsRef.current = materials; }, [materials]);
  useEffect(() => { gudangStaffRef.current = gudangStaff; }, [gudangStaff]);

  const prevOpenRef = useRef(false);
  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;
    if (!justOpened) return;

    const currentMaterials = materialsRef.current;
    const currentStaff = gudangStaffRef.current;

    const initialMatId = defaultMaterialId || (currentMaterials.length > 0 ? currentMaterials[0].id : '');
    setMaterialId(initialMatId);
    setMaterialColorId(defaultColorId || '');
    setRequestedBy(currentStaff.length > 0 ? currentStaff[0].id : '');
    setQuantityNeeded('');
    setFulfillmentType('spj');
    setReason('');
    setError('');

    const initialMat = currentMaterials.find((m) => m.id === initialMatId);
    if (initialMat) {
      setUnit(initialMat.unit || 'pcs');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultMaterialId, defaultColorId]);

  function handleMaterialChange(newId: string) {
    setMaterialId(newId);
    setMaterialColorId('');
    const mat = materials.find((m) => m.id === newId);
    if (mat) {
      setUnit(mat.unit || 'pcs');
    }
  }

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (gudangStaff.length === 0) {
      return setError('Belum ada staf Gudang aktif. Tambahkan staf dengan role Gudang terlebih dahulu.');
    }
    if (!requestedBy) return setError('Pilih staf gudang sebagai pemohon restock.');
    if (!materialId) return setError('Pilih material yang ingin diajukan.');
    if (!quantityNeeded || Number(quantityNeeded) <= 0) {
      return setError('Jumlah kebutuhan harus lebih dari 0.');
    }
    if (isFabric && colors.length > 0 && !materialColorId) {
      return setError('Pilih warna kain yang dibutuhkan.');
    }

    setSubmitting(true);
    try {
      await onSubmit({
        material_id: materialId,
        material_color_id: isFabric ? materialColorId || null : null,
        requested_by: requestedBy || null,
        quantity_needed: Number(quantityNeeded),
        unit: unit.trim() || 'pcs',
        fulfillment_type: fulfillmentType,
        reason: reason.trim() || null,
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengajukan restock.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Ajukan Permintaan Restock</h2>
            <p className="text-xs text-muted-foreground">Staf gudang mengajukan pembelian bahan ke Finance / Purchasing</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          {gudangStaff.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <div className="flex items-center gap-1.5 font-semibold text-amber-900 mb-1">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span>Belum ada Staf Gudang aktif</span>
              </div>
              <p>
                Permintaan restock wajib diajukan oleh staf dengan role <strong>Gudang</strong>. Silakan tambahkan staf Gudang di halaman <strong>Staf & Karyawan</strong> terlebih dahulu.
              </p>
            </div>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Staf Pemohon (Gudang)</span>
              <select
                value={requestedBy}
                onChange={(e) => setRequestedBy(e.target.value)}
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
          )}

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Pilih Material</span>
            <select
              value={materialId}
              onChange={(e) => handleMaterialChange(e.target.value)}
              className={inputClass}
            >
              <option value="">-- Pilih Material --</option>
              {materials.map((m) => {
                const isFabricItem = Boolean(m.material_categories?.is_fabric);
                const stockLabel = isFabricItem
                  ? 'lihat per warna'
                  : `Stok: ${m.stock_qty ?? 0} ${m.unit}`;
                return (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.material_categories?.name || 'Umum'}) — {stockLabel}
                  </option>
                );
              })}
            </select>
          </label>

          {isFabric && (
            <>
              {colors.length > 0 ? (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Warna Kain</span>
                  <select
                    value={materialColorId}
                    onChange={(e) => setMaterialColorId(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">-- Pilih Warna --</option>
                    {colors.map((c) => {
                      const qty = Number(c.stock_qty) || 0;
                      const min = Number(c.minimum_stock) || 0;
                      const isLow = qty <= min && min > 0;
                      const isOut = qty <= 0;
                      return (
                        <option key={c.id} value={c.id}>
                          {c.color_name} — Stok: {qty} {selectedMaterial?.unit || 'meter'}{isOut ? ' ⚠ Habis' : isLow ? ' ⚠ Menipis' : ''}
                        </option>
                      );
                    })}
                  </select>
                  {/* Info stok warna yang dipilih */}
                  {materialColorId && (() => {
                    const sel = colors.find(c => c.id === materialColorId);
                    if (!sel) return null;
                    const qty = Number(sel.stock_qty) || 0;
                    const min = Number(sel.minimum_stock) || 0;
                    const isOut = qty <= 0;
                    const isLow = qty <= min && min > 0;
                    return (
                      <div className={`mt-1.5 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm ${
                        isOut ? 'bg-rose-50 text-rose-700' :
                        isLow ? 'bg-amber-50 text-amber-700' :
                        'bg-emerald-50 text-emerald-700'
                      }`}>
                        {isOut || isLow ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> : <Package className="h-3.5 w-3.5 shrink-0" />}
                        <span>
                          Stok <strong>{sel.color_name}</strong>: <strong>{qty} {selectedMaterial?.unit || 'meter'}</strong>
                          {min > 0 && ` (min. ${min})`}
                          {isOut ? ' — Stok habis!' : isLow ? ' — Stok menipis!' : ' — Aman'}
                        </span>
                      </div>
                    );
                  })()}
                </label>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
                  Belum ada data warna untuk kain ini. Tambahkan warna terlebih dahulu di halaman Bahan Baku.
                </div>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Jumlah Dibutuhkan</span>
              <input
                type="number"
                min="0.01"
                step="any"
                value={quantityNeeded}
                onChange={(e) => setQuantityNeeded(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="mis. 50"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Satuan</span>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="meter, pcs, roll"
                className={inputClass}
              />
            </label>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">
              Kategori Pembelian <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setFulfillmentType('spj')}
                onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') setFulfillmentType('spj'); }}
                className={`relative flex cursor-pointer flex-col justify-between rounded-xl border p-3 text-left transition-all ${
                  fulfillmentType === 'spj'
                    ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-600/20 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`rounded-lg p-1.5 ${fulfillmentType === 'spj' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      <ShoppingBag className="h-3.5 w-3.5" />
                    </div>
                    <span className="font-semibold text-slate-900 text-xs sm:text-sm">SPJ Belanja</span>
                  </div>
                  <input
                    type="radio"
                    name="fulfillment_type"
                    value="spj"
                    checked={fulfillmentType === 'spj'}
                    onChange={() => setFulfillmentType('spj')}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 mt-0.5"
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
                  Belanja retail dadakan via staf purchasing (toko/pasar), nota menyusul.
                </p>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => setFulfillmentType('supplier_purchase')}
                onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') setFulfillmentType('supplier_purchase'); }}
                className={`relative flex cursor-pointer flex-col justify-between rounded-xl border p-3 text-left transition-all ${
                  fulfillmentType === 'supplier_purchase'
                    ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-600/20 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`rounded-lg p-1.5 ${fulfillmentType === 'supplier_purchase' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      <Truck className="h-3.5 w-3.5" />
                    </div>
                    <span className="font-semibold text-slate-900 text-xs sm:text-sm">Direct Supplier</span>
                  </div>
                  <input
                    type="radio"
                    name="fulfillment_type"
                    value="supplier_purchase"
                    checked={fulfillmentType === 'supplier_purchase'}
                    onChange={() => setFulfillmentType('supplier_purchase')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 mt-0.5"
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
                  Supplier langganan tetap (harga & qty pasti, lunas di muka).
                </p>
              </div>
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Alasan / Catatan Restock</span>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="mis. Stok tipis untuk order seragam PT ABC, butuh restock segera"
              className={inputClass}
            />
          </label>

          {error && <div className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</div>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" variant="primary" disabled={submitting || gudangStaff.length === 0}>
              {submitting ? 'Mengirim...' : 'Kirim Pengajuan'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
