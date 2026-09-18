import { useEffect, useRef, useState } from 'react';
import { X, Package, AlertTriangle } from 'lucide-react';
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

  const [requestedBy, setRequestedBy] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [materialColorId, setMaterialColorId] = useState('');
  const [quantityNeeded, setQuantityNeeded] = useState<number | ''>('');
  const [unit, setUnit] = useState('meter');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const { colors } = useMaterialColors(materialId);

  const selectedMaterial = materials.find((m) => m.id === materialId);
  const isFabric = selectedMaterial?.material_categories?.is_fabric ?? false;

  const materialsRef = useRef(materials);
  const activeStaffRef = useRef(activeStaff);
  useEffect(() => { materialsRef.current = materials; }, [materials]);
  useEffect(() => { activeStaffRef.current = activeStaff; }, [activeStaff]);

  const prevOpenRef = useRef(false);
  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;
    if (!justOpened) return;

    const currentMaterials = materialsRef.current;
    const currentStaff = activeStaffRef.current;

    const initialMatId = defaultMaterialId || (currentMaterials.length > 0 ? currentMaterials[0].id : '');
    setMaterialId(initialMatId);
    setMaterialColorId(defaultColorId || '');
    setRequestedBy(currentStaff.length > 0 ? currentStaff[0].id : '');
    setQuantityNeeded('');
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
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Staf Pemohon</span>
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
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Mengirim...' : 'Kirim Pengajuan'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
