import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Package,
  AlertTriangle,
  ShoppingBag,
  Truck,
  Plus,
  Trash2,
  Layers,
  Calculator,
  Info,
} from 'lucide-react';
import { inputClass } from '../ui/FormField';
import Button from '../ui/button';
import { useMaterials } from '../../hooks/useMaterials';
import { useStaff } from '../../hooks/useStaff';
import { supabase } from '../../lib/supabaseClient';
import { formatIDR, formatIDRInput, formatPurchaseUnit, parseIDRInput } from '../../utils/formatCurrency';
import type { MaterialColor } from '../../types';
import { getMaterialPurchaseUnits, getPrimaryPurchaseUnit } from '../../utils/materialUnits';

export interface StockRequestItemRow {
  key: string;
  material_id: string;
  material_color_id: string;
  quantity_needed: number | '';
  unit: string;
  conversion_rate: number;
  is_variable_unit: boolean;
  estimated_price: number | '';
  reason: string;
}

export interface StockRequestBulkPayload {
  requested_by: string;
  fulfillment_type: 'spj' | 'supplier_purchase';
  global_reason?: string | null;
  preferred_store?: string | null;
  items: Array<{
    material_id: string;
    material_color_id?: string | null;
    quantity_needed: number;
    unit: string;
    conversion_rate: number;
    is_variable_unit: boolean;
    estimated_price?: number | null;
    reason?: string | null;
  }>;
}

export interface StockRequestSinglePayload {
  material_id: string;
  material_color_id?: string | null;
  requested_by?: string | null;
  quantity_needed: number;
  unit: string;
  conversion_rate: number;
  is_variable_unit: boolean;
  estimated_price?: number | null;
  reason?: string | null;
  fulfillment_type?: 'spj' | 'supplier_purchase';
  preferred_store?: string | null;
}

interface StockRequestModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit?: (payload: any) => Promise<void>;
  onSubmitBulk?: (payload: StockRequestBulkPayload) => Promise<void>;
  defaultMaterialId?: string;
  defaultColorId?: string;
  initialItems?: Array<{
    material_id: string;
    material_color_id?: string | null;
    quantity_needed?: number;
    unit?: string;
    estimated_price?: number | null;
    reason?: string;
    conversion_rate?: number;
    is_variable_unit?: boolean;
  }>;
}

function createEmptyRow(defaultMatId = '', defaultColor = '', defaultUnit = 'meter', defaultPrice: number | '' = '', conversionRate = 1, isVariableUnit = false): StockRequestItemRow {
  return {
    key: Math.random().toString(36).substring(2, 9),
    material_id: defaultMatId,
    material_color_id: defaultColor,
    quantity_needed: '',
    unit: defaultUnit,
    conversion_rate: conversionRate,
    is_variable_unit: isVariableUnit,
    estimated_price: defaultPrice,
    reason: '',
  };
}

export default function StockRequestModal({
  open,
  onClose,
  onSubmit,
  onSubmitBulk,
  defaultMaterialId,
  defaultColorId,
  initialItems,
}: StockRequestModalProps) {
  const { materials } = useMaterials();
  const { activeStaff } = useStaff();

  const gudangStaff = useMemo(() => {
    return activeStaff.filter((s) => s.role === 'Gudang');
  }, [activeStaff]);

  const [requestedBy, setRequestedBy] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState<'spj' | 'supplier_purchase'>('spj');
  const [globalReason, setGlobalReason] = useState('');
  const [preferredStore, setPreferredStore] = useState('');
  const [rows, setRows] = useState<StockRequestItemRow[]>([createEmptyRow()]);
  const [colorsByMaterial, setColorsByMaterial] = useState<Record<string, MaterialColor[]>>({});
  const [loadingColors, setLoadingColors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Fetch all active material colors when modal opens
  useEffect(() => {
    if (!open) return;
    let isMounted = true;
    setLoadingColors(true);

    async function loadColors() {
      try {
        const { data, error: fetchErr } = await supabase
          .from('material_colors')
          .select('*')
          .eq('is_active', true)
          .order('color_name', { ascending: true });

        if (!fetchErr && data && isMounted) {
          const grouped: Record<string, MaterialColor[]> = {};
          for (const c of data) {
            if (!grouped[c.material_id]) grouped[c.material_id] = [];
            grouped[c.material_id].push(c);
          }
          setColorsByMaterial(grouped);
        }
      } catch (err) {
        console.error('Gagal mengambil daftar warna material:', err);
      } finally {
        if (isMounted) setLoadingColors(false);
      }
    }

    loadColors();
    return () => {
      isMounted = false;
    };
  }, [open]);

  // Initialize form state whenever modal opens
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

    setRequestedBy(currentStaff.length > 0 ? currentStaff[0].id : '');
    setFulfillmentType('spj');
    setGlobalReason('');
    setPreferredStore('');
    setError('');

    if (initialItems && initialItems.length > 0) {
      setRows(
        initialItems.map((item) => {
          const mat = currentMaterials.find((m) => m.id === item.material_id);
          return {
            key: Math.random().toString(36).substring(2, 9),
            material_id: item.material_id,
            material_color_id: item.material_color_id || '',
            quantity_needed: item.quantity_needed ?? '',
            unit: item.unit || mat?.unit || 'pcs',
            conversion_rate: item.conversion_rate ?? Number(mat?.conversion_rate) ?? 1,
            is_variable_unit: item.is_variable_unit ?? false,
            estimated_price: item.estimated_price !== undefined && item.estimated_price !== null ? item.estimated_price : (mat?.price ?? ''),
            reason: item.reason || '',
          };
        })
      );
    } else {
      const initialMatId = defaultMaterialId || (currentMaterials.length > 0 ? currentMaterials[0].id : '');
      const initialMat = currentMaterials.find((m) => m.id === initialMatId);
      const primaryUnit = initialMat ? getPrimaryPurchaseUnit(getMaterialPurchaseUnits(initialMat)) : undefined;
      setRows([
        createEmptyRow(
          initialMatId,
          defaultColorId || '',
          primaryUnit?.name || initialMat?.unit || 'meter',
          primaryUnit?.is_variable ? '' : (Number(initialMat?.price || 0) * Number(primaryUnit?.conversion_rate || 1) || ''),
          Number(primaryUnit?.conversion_rate) || 1,
          Boolean(primaryUnit?.is_variable)
        ),
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultMaterialId, defaultColorId, initialItems]);

  function handleAddRow() {
    const firstMat = materials.length > 0 ? materials[0] : undefined;
    const primaryUnit = firstMat ? getPrimaryPurchaseUnit(getMaterialPurchaseUnits(firstMat)) : undefined;
    setRows((prev) => [
      ...prev,
      createEmptyRow(
        firstMat?.id || '',
        '',
        primaryUnit?.name || firstMat?.unit || 'pcs',
        primaryUnit?.is_variable ? '' : (Number(firstMat?.price || 0) * Number(primaryUnit?.conversion_rate || 1) || ''),
        Number(primaryUnit?.conversion_rate) || 1,
        Boolean(primaryUnit?.is_variable)
      ),
    ]);
  }

  function handleRemoveRow(index: number) {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function handleRowChange(index: number, field: keyof StockRequestItemRow, value: any) {
    setRows((prev) => {
      const copy = [...prev];
      const target = { ...copy[index], [field]: value };

      if (field === 'material_id') {
        const mat = materials.find((m) => m.id === value);
        target.material_color_id = '';
        if (mat) {
          const primaryUnit = getPrimaryPurchaseUnit(getMaterialPurchaseUnits(mat));
          target.unit = primaryUnit?.name || mat.unit || 'pcs';
          target.conversion_rate = Number(primaryUnit?.conversion_rate) || 1;
          target.is_variable_unit = Boolean(primaryUnit?.is_variable);
          target.estimated_price = primaryUnit?.is_variable
            ? ''
            : (Number(mat.price || 0) * Number(primaryUnit?.conversion_rate || 1) || '');
        }
      } else if (field === 'unit') {
        const mat = materials.find((m) => m.id === target.material_id);
        const selectedUnit = mat && getMaterialPurchaseUnits(mat).find((purchaseUnit) => purchaseUnit.name === value);
        if (selectedUnit) {
          target.conversion_rate = Number(selectedUnit.conversion_rate) || 1;
          target.is_variable_unit = selectedUnit.is_variable;
          target.estimated_price = selectedUnit.is_variable
            ? ''
            : (Number(mat?.price || 0) * Number(selectedUnit.conversion_rate || 1) || '');
        }
      }

      copy[index] = target;
      return copy;
    });
  }

  const grandTotalEstimate = useMemo(() => {
    return rows.reduce((sum, r) => {
      const qty = Number(r.quantity_needed) || 0;
      const price = Number(r.estimated_price) || 0;
      return sum + qty * price;
    }, 0);
  }, [rows]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (gudangStaff.length === 0) {
      return setError('Belum ada staf Gudang aktif. Tambahkan staf dengan role Gudang terlebih dahulu.');
    }
    if (!requestedBy) {
      return setError('Pilih staf gudang sebagai pemohon restock.');
    }
    if (rows.length === 0) {
      return setError('Minimal harus ada 1 item bahan baku yang diajukan.');
    }

    // Validate each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      if (!row.material_id) {
        return setError(`Baris #${rowNum}: Pilih material yang ingin diajukan.`);
      }
      if (!row.quantity_needed || Number(row.quantity_needed) <= 0) {
        return setError(`Baris #${rowNum}: Jumlah kebutuhan harus lebih dari 0.`);
      }

      const mat = materials.find((m) => m.id === row.material_id);
      const matColors = colorsByMaterial[row.material_id] || [];

      if (matColors.length > 0 && !row.material_color_id) {
        return setError(`Baris #${rowNum} (${mat?.name}): Pilih varian warna yang dibutuhkan.`);
      }
    }

    setSubmitting(true);
    try {
      const formattedItems = rows.map((r) => ({
        material_id: r.material_id,
        material_color_id: r.material_color_id || null,
        quantity_needed: Number(r.quantity_needed),
        unit: r.unit.trim() || 'pcs',
        conversion_rate: r.is_variable_unit ? 0 : r.conversion_rate,
        is_variable_unit: r.is_variable_unit,
        estimated_price: r.estimated_price !== '' ? Number(r.estimated_price) : null,
        reason: r.reason.trim() || null,
      }));

      if (onSubmitBulk) {
        await onSubmitBulk({
          requested_by: requestedBy,
          fulfillment_type: fulfillmentType,
          global_reason: globalReason.trim() || null,
          preferred_store: preferredStore.trim() || null,
          items: formattedItems,
        });
      } else if (onSubmit) {
        // Fallback for general onSubmit prop
        await onSubmit({
          requested_by: requestedBy,
          fulfillment_type: fulfillmentType,
          global_reason: globalReason.trim() || null,
          preferred_store: preferredStore.trim() || null,
          items: formattedItems,
        });
      }

      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengajukan restock.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-3 py-3 sm:px-6 sm:py-4">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
                Ajukan Permintaan Restock Bahan
              </h2>
              <p className="text-xs text-slate-500">
                Staf gudang mengajukan permohonan belanja bahan (SPJ / Direct Supplier) ke Purchasing
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 space-y-6">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-3.5 text-xs text-rose-800 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-900">Periksa Pengajuan</p>
                <p className="mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Section 1: Header / Pengajuan Level */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-3 space-y-4 sm:p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <Layers className="h-4 w-4 text-slate-400" />
              <span>Informasi Utama Pengajuan</span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Staf Pemohon */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Staf Pemohon (Gudang) <span className="text-rose-500">*</span>
                </label>
                {gudangStaff.length === 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                    Belum ada staf role Gudang aktif.
                  </div>
                ) : (
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
                )}
              </div>

              {/* Alasan / Catatan Global */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Catatan / Keterangan Umum (Opsional)
                </label>
                <input
                  type="text"
                  value={globalReason}
                  onChange={(e) => setGlobalReason(e.target.value)}
                  placeholder="mis. Pengadaan stok pesanan PO seragam PT ABC"
                  className={inputClass}
                />
              </div>

              {/* Nama Toko / Supplier Rekomendasi */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Nama Toko / Supplier Rekomendasi
                  <span className="ml-1.5 text-slate-400 font-normal">(Opsional — referensi untuk Purchasing)</span>
                </label>
                <input
                  type="text"
                  value={preferredStore}
                  onChange={(e) => setPreferredStore(e.target.value)}
                  placeholder="mis. Toko Kain ABC Jl. Sudirman No. 5, atau Supplier XYZ"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Kategori Pembelian */}
            <div className="space-y-1.5 pt-1">
              <label className="block text-xs font-medium text-slate-700">
                Kategori Pembelian <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <label
                  className={`relative flex cursor-pointer flex-col justify-between rounded-xl border p-3 text-left transition-all ${fulfillmentType === 'spj'
                    ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-600/20 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`rounded-lg p-1.5 ${fulfillmentType === 'spj' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                        <ShoppingBag className="h-4 w-4" />
                      </div>
                      <span className="font-semibold text-slate-900 text-xs sm:text-sm">SPJ Belanja</span>
                    </div>
                    <input
                      type="radio"
                      name="fulfillment_type"
                      value="spj"
                      checked={fulfillmentType === 'spj'}
                      onChange={() => setFulfillmentType('spj')}
                      className="mt-0.5 h-4 w-4 accent-indigo-600 focus:ring-indigo-500"
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
                    Belanja retail dadakan via staf purchasing (toko/pasar), nota menyusul.
                  </p>
                </label>

                <label
                  className={`relative flex cursor-pointer flex-col justify-between rounded-xl border p-3 text-left transition-all ${fulfillmentType === 'supplier_purchase'
                    ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-600/20 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`rounded-lg p-1.5 ${fulfillmentType === 'supplier_purchase' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                        <Truck className="h-4 w-4" />
                      </div>
                      <span className="font-semibold text-slate-900 text-xs sm:text-sm">Direct Supplier</span>
                    </div>
                    <input
                      type="radio"
                      name="fulfillment_type"
                      value="supplier_purchase"
                      checked={fulfillmentType === 'supplier_purchase'}
                      onChange={() => setFulfillmentType('supplier_purchase')}
                      className="mt-0.5 h-4 w-4 accent-blue-600 focus:ring-blue-500"
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
                    Supplier langganan tetap (harga & qty pasti, invoice lunas di muka).
                  </p>
                </label>
              </div>
            </div>
          </div>

          {/* Section 2: Daftar Item Kebutuhan Restock */}
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Daftar Bahan Baku yang Diajukan ({rows.length})
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddRow}
                className="h-8 w-full gap-1.5 text-xs text-primary border-primary/30 hover:bg-primary/5 sm:w-auto"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Tambah Baris</span>
              </Button>
            </div>

            {/* List of item rows */}
            <div className="space-y-3">
              {rows.map((row, index) => {
                const mat = materials.find((m) => m.id === row.material_id);
                const isFabric = Boolean(mat?.material_categories?.is_fabric);
                const colors = colorsByMaterial[row.material_id] || [];
                const purchaseUnits = mat ? getMaterialPurchaseUnits(mat) : [];
                const selectedPurchaseUnit = purchaseUnits.find((purchaseUnit) => purchaseUnit.name === row.unit);
                const rowTotal = (Number(row.quantity_needed) || 0) * (Number(row.estimated_price) || 0);

                return (
                  <div
                    key={row.key}
                    className="relative rounded-xl border border-slate-200 bg-white p-3 shadow-2xs transition hover:border-slate-300 sm:p-4"
                  >
                    <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                          {index + 1}
                        </span>
                        <span className="text-xs font-semibold text-slate-800">
                          {mat ? mat.name : 'Pilih Material'}
                        </span>
                        {isFabric && (
                          <span className="rounded-full bg-indigo-50 px-2 py-0.2 text-[10px] font-medium text-indigo-700 border border-indigo-200">
                            Kain / Fabric
                          </span>
                        )}
                      </div>

                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(index)}
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 transition"
                          title="Hapus baris ini"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Hapus</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                      {/* Material Select */}
                      <div className={colors.length > 0 ? 'sm:col-span-4' : 'sm:col-span-6'}>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Material <span className="text-rose-500">*</span>
                        </label>
                        <select
                          value={row.material_id}
                          onChange={(e) => handleRowChange(index, 'material_id', e.target.value)}
                          className={inputClass}
                        >
                          <option value="">-- Pilih Material --</option>
                          {materials.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}{m.brand ? ` (${m.brand})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Color Select for ANY material with colors */}
                      {colors.length > 0 && (
                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Varian Warna <span className="text-rose-500">*</span>
                          </label>
                          <select
                            value={row.material_color_id}
                            onChange={(e) => handleRowChange(index, 'material_color_id', e.target.value)}
                            className={inputClass}
                          >
                            <option value="">-- Pilih Warna --</option>
                            {colors.map((c) => {
                              const qty = Number(c.stock_qty) || 0;
                              const min = Number(c.minimum_stock) || 0;
                              const isOut = qty <= 0;
                              const isLow = qty <= min && min > 0;
                              return (
                                <option key={c.id} value={c.id}>
                                  {c.color_name} (Stok: {qty} {mat?.unit || 'pcs'}){isOut ? ' ⚠ Habis' : isLow ? ' ⚠ Menipis' : ''}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      )}

                      {/* Qty Needed */}
                      <div className={colors.length > 0 ? 'sm:col-span-2' : 'sm:col-span-3'}>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Jumlah Beli <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          value={row.quantity_needed}
                          onChange={(e) =>
                            handleRowChange(
                              index,
                              'quantity_needed',
                              e.target.value === '' ? '' : Number(e.target.value)
                            )
                          }
                          placeholder="mis. 50"
                          className={inputClass}
                        />
                      </div>

                      <div className={colors.length > 0 ? 'sm:col-span-3' : isFabric ? 'sm:col-span-2' : 'sm:col-span-3'}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-medium text-slate-600">
                          <span>Satuan Beli</span>
                          {selectedPurchaseUnit?.is_primary && (
                            <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
                              Utama
                            </span>
                          )}
                        </div>
                        <select
                          value={row.unit}
                          onChange={(e) => handleRowChange(index, 'unit', e.target.value)}
                          className={inputClass}
                        >
                          {purchaseUnits.map((purchaseUnit) => (
                            <option key={purchaseUnit.id} value={purchaseUnit.name}>
                              {formatPurchaseUnit(purchaseUnit.name)}
                            </option>
                          ))}
                        </select>
                        {row.is_variable_unit ? (
                          <p className="mt-1 text-[10px] text-amber-700">
                            Isi {mat?.unit || 'satuan stok'} aktual dicatat saat penerimaan.
                          </p>
                        ) : Number(row.quantity_needed) > 0 && (
                          <p className="mt-1 text-[10px] text-slate-500">
                            ≈ {(Number(row.quantity_needed) * row.conversion_rate).toLocaleString('id-ID')} {mat?.unit || 'satuan stok'}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Secondary Row: Price & Note */}
                    <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-12 items-center">
                      <div className="sm:col-span-4">
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Estimasi Harga per Satuan Beli (Rp)
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={row.estimated_price === '' ? '' : formatIDRInput(row.estimated_price)}
                          onChange={(e) =>
                            handleRowChange(
                              index,
                              'estimated_price',
                              e.target.value === '' ? '' : parseIDRInput(e.target.value)
                            )
                          }
                          placeholder="mis. Rp 30.000"
                          className={inputClass}
                        />
                      </div>

                      <div className="sm:col-span-5">
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Catatan Khusus Item (Opsional)
                        </label>
                        <input
                          type="text"
                          value={row.reason}
                          onChange={(e) => handleRowChange(index, 'reason', e.target.value)}
                          placeholder="mis. Kebutuhan furing saku celana"
                          className={inputClass}
                        />
                      </div>

                      <div className="sm:col-span-3 text-right pt-4 sm:pt-0">
                        <span className="text-[10px] text-slate-500 block">Subtotal Estimasi:</span>
                        <span className="text-xs font-semibold text-slate-900">
                          {formatIDR(rowTotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Add Row button */}
            <div className="flex justify-center pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddRow}
                className="w-full border-dashed border-slate-300 py-2.5 text-xs text-slate-600 hover:bg-slate-50 hover:text-primary hover:border-primary/40"
              >
                <Plus className="h-4 w-4 mr-1.5 text-primary" />
                Tambah Baris Item Bahan Lainnya
              </Button>
            </div>
          </div>
        </form>

        {/* Sticky Footer */}
        <div className="flex shrink-0 flex-col items-stretch justify-between gap-3 border-t border-slate-200 bg-slate-50/90 px-4 py-3 sm:flex-row sm:items-center sm:px-6 sm:py-4">
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 text-slate-600">
              <Calculator className="h-4 w-4 text-slate-400" />
              <span>
                Total: <strong>{rows.length} Item Bahan</strong>
              </span>
            </div>
            <span className="text-slate-300">|</span>
            <div className="text-slate-600">
              Estimasi Anggaran: <strong className="text-emerald-700 font-bold">{formatIDR(grandTotalEstimate)}</strong>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              Batal
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleSubmit}
              disabled={submitting || gudangStaff.length === 0}
              className="gap-1.5 shadow-sm"
            >
              {submitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Mengirim...</span>
                </>
              ) : (
                <>
                  <Package className="h-4 w-4" />
                  <span>Kirim Pengajuan ({rows.length} Item)</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
