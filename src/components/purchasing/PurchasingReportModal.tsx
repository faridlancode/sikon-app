import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  UploadCloud,
  FileImage,
  ExternalLink,
  Receipt,
  Calculator,
  AlertCircle,
  Wallet,
} from 'lucide-react';
import { inputClass } from '../ui/FormField';
import Button from '../ui/button';
import { useStaff } from '../../hooks/useStaff';
import { useCashAdvances } from '../../hooks/useCashAdvances';
import { useMaterials } from '../../hooks/useMaterials';
import { useCategories } from '../../hooks/useCategories';
import { useStockRequests } from '../../hooks/useStockRequests';
import { supabase } from '../../lib/supabaseClient';
import { formatIDR, formatIDRInput, parseIDRInput } from '../../utils/formatCurrency';
import type { PurchasingReport, PurchasingReportItem } from '../../types';

interface PurchasingReportModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (
    header: {
      staff_id: string;
      cash_advance_id?: string | null;
      report_date?: string;
      notes?: string | null;
      service_fee?: number | null;
      status?: 'disbursed' | 'submitted';
    },
    items: Omit<PurchasingReportItem, 'id' | 'user_id' | 'report_id'>[]
  ) => Promise<void>;
  editingReport?: PurchasingReport | null;
  initialStockRequestId?: string;
  initialStockRequestIds?: string[];
}

interface FormItem {
  id?: string;
  stock_request_id: string;
  material_id: string;
  material_color_id: string;
  category_id: string;
  description: string;
  supplier_name: string;
  quantity: number | '';
  unit: string;
  unit_price: string;
  total_price: number;
  receipt_photo_url: string;
  uploading?: boolean;
}

const EMPTY_ITEM: FormItem = {
  stock_request_id: '',
  material_id: '',
  material_color_id: '',
  category_id: '',
  description: '',
  supplier_name: '',
  quantity: '',
  unit: 'pcs',
  unit_price: '',
  total_price: 0,
  receipt_photo_url: '',
};

function findMaterialCategoryId(categories: { id: string | number; name: string }[]): string {
  const target = categories.find((c) =>
    c.name.trim().toLowerCase() === 'pembelian material' ||
    c.name.toLowerCase().includes('pembelian material') ||
    c.name.toLowerCase().includes('material')
  );
  return target ? String(target.id) : (categories[0]?.id ? String(categories[0].id) : '');
}

export default function PurchasingReportModal({
  open,
  onClose,
  onSubmit,
  editingReport,
  initialStockRequestId,
  initialStockRequestIds,
}: PurchasingReportModalProps) {
  const { activeStaff } = useStaff();
  const { advances, giveCashAdvance } = useCashAdvances();
  const { materials } = useMaterials();
  const { expenseCategories } = useCategories();
  const { requests } = useStockRequests();

  const [staffId, setStaffId] = useState('');
  const [cashAdvanceId, setCashAdvanceId] = useState('');
  const [advanceMode, setAdvanceMode] = useState<'select' | 'direct'>('direct');
  const [directAdvanceAmount, setDirectAdvanceAmount] = useState('');
  const [directAdvancePurpose, setDirectAdvancePurpose] = useState('');
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [serviceFee, setServiceFee] = useState('');
  const [items, setItems] = useState<FormItem[]>([{ ...EMPTY_ITEM }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Auto-filter cash advances: either outstanding or already linked to editingReport
  const availableAdvances = useMemo(() => {
    return advances.filter(
      (a) =>
        a.staff_id === staffId &&
        (a.status === 'outstanding' || a.id === editingReport?.cash_advance_id)
    );
  }, [advances, staffId, editingReport]);

  const selectedAdvance = advances.find((a) => a.id === cashAdvanceId);

  // Refs to hold latest data without triggering re-init on data refresh
  const activeStaffRef = useRef(activeStaff);
  const requestsRef = useRef(requests);
  const materialsRef = useRef(materials);
  const expenseCategoriesRef = useRef(expenseCategories);
  useEffect(() => { activeStaffRef.current = activeStaff; }, [activeStaff]);
  useEffect(() => { requestsRef.current = requests; }, [requests]);
  useEffect(() => { materialsRef.current = materials; }, [materials]);
  useEffect(() => { expenseCategoriesRef.current = expenseCategories; }, [expenseCategories]);

  // Initialize form ONLY when modal opens (open: false->true) or editing target changes.
  // We intentionally exclude data arrays from deps to prevent mid-edit reset.
  const prevOpenRef = useRef(false);
  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;
    if (!justOpened) return;

    const currentStaff = activeStaffRef.current;
    const currentRequests = requestsRef.current;
    const currentMaterials = materialsRef.current;
    const currentCategories = expenseCategoriesRef.current;

    if (editingReport) {
      setStaffId(editingReport.staff_id);
      setCashAdvanceId(editingReport.cash_advance_id || '');
      setAdvanceMode('select');
      setDirectAdvanceAmount('');
      setDirectAdvancePurpose('');
      setReportDate(editingReport.report_date);
      setNotes(editingReport.notes || '');
      setServiceFee(editingReport.service_fee ? formatIDRInput(editingReport.service_fee) : '');

      if (editingReport.purchasing_report_items && editingReport.purchasing_report_items.length > 0) {
        setItems(
          editingReport.purchasing_report_items.map((i) => ({
            id: i.id,
            stock_request_id: i.stock_request_id || '',
            material_id: i.material_id || '',
            material_color_id: i.material_color_id || '',
            category_id: i.category_id || '',
            description: i.description || '',
            supplier_name: i.supplier_name || '',
            quantity: i.quantity,
            unit: i.unit || 'pcs',
            unit_price: i.unit_price ? formatIDRInput(i.unit_price) : '',
            total_price: i.total_price,
            receipt_photo_url: i.receipt_photo_url || '',
          }))
        );
      } else {
        setItems([{ ...EMPTY_ITEM }]);
      }
    } else {
      const defaultStaff = currentStaff.find((s) => s.role === 'Purchasing') || currentStaff[0];
      setStaffId(defaultStaff ? defaultStaff.id : '');
      setCashAdvanceId('');
      setAdvanceMode(availableAdvances.length > 0 ? 'select' : 'direct');
      setDirectAdvanceAmount('');
      setDirectAdvancePurpose('');
      setReportDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      setServiceFee('');
      const defaultCat = findMaterialCategoryId(currentCategories);
      setItems([{ ...EMPTY_ITEM, category_id: defaultCat }]);
    }
    setError('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingReport]);

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
      const generatedItems: FormItem[] = foundRequests.map((req) => {
        const mat = req.materials || materials.find((m) => m.id === req.material_id);
        const fullMat = materials.find((m) => m.id === req.material_id) || mat;
        const unitPrice = Number(fullMat?.price) || 0;
        const qty = Number(req.quantity_needed) || 0;

        return {
          ...EMPTY_ITEM,
          stock_request_id: req.id,
          material_id: req.material_id,
          material_color_id: req.material_color_id || '',
          description: `Restock ${mat?.name || 'Material'}${req.material_colors ? ` (${req.material_colors.color_name})` : ''} - ${qty} ${req.unit}`,
          quantity: qty,
          unit: req.unit || mat?.unit || 'pcs',
          unit_price: unitPrice > 0 ? formatIDRInput(unitPrice) : '',
          total_price: unitPrice * qty,
          category_id: defaultCat,
        };
      });

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
    if (!open || expenseCategories.length === 0 || editingReport) return;
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
  }, [open, expenseCategories, editingReport]);

  if (!open) return null;

  function updateItem(index: number, patch: Partial<FormItem>) {
    setItems((prev) => {
      const copy = [...prev];
      const current = { ...copy[index], ...patch };

      // Recalculate total_price
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
      updateItem(index, { material_id: '', material_color_id: '' });
      return;
    }

    const defaultCat = items[index].category_id || findMaterialCategoryId(expenseCategories);
    updateItem(index, {
      material_id: matId,
      material_color_id: '',
      unit: mat.unit || 'pcs',
      unit_price: mat.price ? formatIDRInput(mat.price) : '',
      description: items[index].description || mat.name,
      category_id: defaultCat,
    });
  }

  function handleSelectStockRequest(index: number, reqId: string) {
    const req = requests.find((r) => r.id === reqId);
    if (!req) {
      updateItem(index, { stock_request_id: '' });
      return;
    }

    const mat = materials.find((m) => m.id === req.material_id);
    const defaultCat = items[index].category_id || findMaterialCategoryId(expenseCategories);
    updateItem(index, {
      stock_request_id: reqId,
      material_id: req.material_id,
      material_color_id: req.material_color_id || '',
      quantity: req.quantity_needed,
      unit: req.unit,
      unit_price: mat?.price ? formatIDRInput(mat.price) : '',
      description: `Restock ${mat?.name || 'Material'} (${req.quantity_needed} ${req.unit})`,
      category_id: defaultCat,
    });
  }

  function addItem() {
    const defaultCat = findMaterialCategoryId(expenseCategories);
    setItems((prev) => [
      ...prev,
      {
        ...EMPTY_ITEM,
        category_id: defaultCat,
      },
    ]);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleUploadReceipt(index: number, file: File) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError('Sesi login tidak ditemukan.');
      return;
    }

    updateItem(index, { uploading: true });
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const cleanFileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const filePath = `${user.id}/${cleanFileName}`;

      const { error: uploadError } = await supabase.storage
        .from('purchasing-receipts')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('purchasing-receipts')
        .getPublicUrl(filePath);

      updateItem(index, { receipt_photo_url: urlData.publicUrl, uploading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal upload nota.';
      setError(`Gagal upload nota item ${index + 1}: ${msg}`);
      updateItem(index, { uploading: false });
    }
  }

  const grandTotal = items.reduce((sum, item) => sum + (Number(item.total_price) || 0), 0);
  const serviceFeeAmount = parseIDRInput(serviceFee);
  const totalWithFee = grandTotal + serviceFeeAmount;
  const directAdvanceNum = advanceMode === 'direct' ? parseIDRInput(directAdvanceAmount) : 0;
  const selectedAdvanceNum = advanceMode === 'select' && selectedAdvance ? Number(selectedAdvance.amount) : 0;
  const advanceAmount = advanceMode === 'direct' ? directAdvanceNum : selectedAdvanceNum;
  const balanceDifference = totalWithFee - advanceAmount;

  async function handleSubmit(e?: React.FormEvent, targetStatus: 'disbursed' | 'submitted' = 'submitted') {
    if (e) e.preventDefault();
    setError('');

    if (!staffId) return setError('Pilih staf purchasing penanggung jawab SPJ.');
    if (items.length === 0) return setError('Minimal harus ada 1 baris item belanja.');

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.description.trim()) {
        return setError(`Baris #${i + 1}: Deskripsi / Nama barang wajib diisi.`);
      }
      if (!item.quantity || Number(item.quantity) <= 0) {
        return setError(`Baris #${i + 1}: Jumlah belanja harus lebih dari 0.`);
      }
      const priceNum = parseIDRInput(item.unit_price);
      if (item.unit_price === '' || priceNum < 0) {
        return setError(`Baris #${i + 1}: Harga satuan tidak boleh kosong atau negatif.`);
      }
    }

    setSubmitting(true);
    try {
      let finalCashAdvanceId: string | null = null;
      if (advanceMode === 'select') {
        finalCashAdvanceId = cashAdvanceId || null;
      } else if (advanceMode === 'direct') {
        const directNum = parseIDRInput(directAdvanceAmount);
        if (directNum > 0) {
          const newAdv = await giveCashAdvance({
            staff_id: staffId,
            amount: directNum,
            purpose: directAdvancePurpose.trim() || (notes ? `Uang Muka: ${notes}` : 'Uang Muka Belanja SPJ'),
            date: reportDate,
          });
          finalCashAdvanceId = (newAdv as any)?.id || null;
        }
      }

      await onSubmit(
        {
          staff_id: staffId,
          cash_advance_id: finalCashAdvanceId,
          report_date: reportDate,
          notes: notes.trim() || null,
          service_fee: serviceFeeAmount > 0 ? serviceFeeAmount : null,
          status: targetStatus,
        },
        items.map((item) => ({
          stock_request_id: item.stock_request_id || null,
          material_id: item.material_id || null,
          material_color_id: item.material_color_id || null,
          category_id: item.category_id || null,
          description: item.description.trim(),
          supplier_name: item.supplier_name.trim() || null,
          quantity: Number(item.quantity),
          unit: item.unit.trim() || 'pcs',
          unit_price: parseIDRInput(item.unit_price),
          total_price: Number(item.total_price),
          receipt_photo_url: item.receipt_photo_url || null,
        }))
      );
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan SPJ.';
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {editingReport ? 'Edit Laporan Pertanggungjawaban (SPJ)' : 'Buat Laporan SPJ Belanja'}
              </h2>
              <p className="text-xs text-muted-foreground">
                Lapor belanja ritel dengan bukti nota, rekonsiliasi kasbon, dan pencatatan stok masuk
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Header section: Staf, Tanggal, Catatan, Uang Muka, Biaya Jasa */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 rounded-xl bg-slate-50/80 p-4 border border-slate-200/60">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-700">Staf Penanggung Jawab SPJ *</span>
              <select
                value={staffId}
                onChange={(e) => {
                  setStaffId(e.target.value);
                  setCashAdvanceId('');
                }}
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
              <span className="mb-1 block text-xs font-semibold text-slate-700">Tanggal Laporan Belanja</span>
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className={inputClass}
              />
            </label>

            <div className="sm:col-span-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-700">Catatan Belanja SPJ (opsional)</span>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="mis. Belanja perlengkapan kancing & furing pasar Tanah Abang"
                  className={inputClass}
                />
              </label>
            </div>

            {/* Uang Muka Section */}
            <div className="sm:col-span-2">
              <div className="rounded-xl border border-amber-200/70 bg-amber-50/40 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/60 pb-2">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-amber-700" />
                    <span className="text-xs font-semibold text-amber-950">Uang Muka Belanja (Kasbon)</span>
                  </div>
                  <div className="inline-flex rounded-lg bg-white/90 p-0.5 text-xs font-medium border border-amber-200 shadow-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setAdvanceMode('direct');
                        setCashAdvanceId('');
                      }}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                        advanceMode === 'direct'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-amber-800 hover:text-amber-950'
                      }`}
                    >
                      Input Nominal Langsung
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAdvanceMode('select');
                        setDirectAdvanceAmount('');
                      }}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                        advanceMode === 'select'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-amber-800 hover:text-amber-950'
                      }`}
                    >
                      Pilih Kasbon Tersedia {availableAdvances.length > 0 ? `(${availableAdvances.length})` : ''}
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  {advanceMode === 'direct' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-medium text-amber-950">
                            Nominal Uang Muka Diterima (Rp)
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={directAdvanceAmount}
                            onChange={(e) => setDirectAdvanceAmount(formatIDRInput(e.target.value))}
                            placeholder="0 (kosongkan jika tanpa uang muka)"
                            className={inputClass}
                          />
                        </label>
                      </div>
                      <div>
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-medium text-amber-950">
                            Catatan Uang Muka (opsional)
                          </span>
                          <input
                            type="text"
                            value={directAdvancePurpose}
                            onChange={(e) => setDirectAdvancePurpose(e.target.value)}
                            placeholder="mis. Kasbon belanja Pasar Tanah Abang"
                            className={inputClass}
                          />
                        </label>
                      </div>
                      <p className="sm:col-span-2 text-[11px] text-amber-700">
                        💡 Jika diisi, kasbon baru akan otomatis tercatat di Keuangan dan langsung direkonsiliasi dengan SPJ ini.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-slate-700">
                          Pilih Kasbon Staf yang Sudah Diberikan:
                        </span>
                        <select
                          value={cashAdvanceId}
                          onChange={(e) => setCashAdvanceId(e.target.value)}
                          className={inputClass}
                        >
                          <option value="">-- Tanpa Uang Muka (Reimburse Mandiri) --</option>
                          {availableAdvances.map((adv) => (
                            <option key={adv.id} value={adv.id}>
                              {formatIDR(Number(adv.amount))} ({adv.date_given}) — {adv.purpose || 'Kasbon'}
                            </option>
                          ))}
                        </select>
                      </label>
                      {availableAdvances.length === 0 && (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          Belum ada kasbon tersimpan untuk staf ini. Gunakan tombol <strong>"Input Nominal Langsung"</strong> di atas untuk langsung mengisi uang muka.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Biaya Jasa Belanja / Transport */}
            <div className="sm:col-span-2">
              <div className="rounded-xl border border-violet-200/70 bg-violet-50/40 p-3.5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-violet-800">
                        Biaya Jasa Belanja / Transport
                        <span className="ml-1.5 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-600">Opsional</span>
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={serviceFee}
                        onChange={(e) => setServiceFee(formatIDRInput(e.target.value))}
                        placeholder="mis. 25.000 (ongkos transport, parkir, dll)"
                        className={inputClass}
                      />
                    </label>
                  </div>
                  <div className="mt-5 text-right">
                    <p className="text-xs text-violet-700 font-medium">
                      {serviceFeeAmount > 0 ? formatIDR(serviceFeeAmount) : '—'}
                    </p>
                    <p className="text-[10px] text-violet-500 mt-0.5">akan dicatat terpisah</p>
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] text-violet-600 leading-relaxed">
                  Biaya ini (jasa belanja, transport, parkir) akan dicatat sebagai pengeluaran terpisah saat SPJ disetujui.
                </p>
              </div>
            </div>
          </div>{/* end grid header card */}

          {/* Items Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Rincian Belanja & Nota ({items.length} item)</h3>
                <p className="text-xs text-muted-foreground">
                  Hubungkan ke material gudang agar stok bertambah dan harga acuan ter-update saat di-approve.
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={addItem} className="text-xs">
                <Plus className="h-3.5 w-3.5" />
                Tambah Baris
              </Button>
            </div>

            <div className="space-y-3.5">
              {items.map((item, idx) => {
                const selectedMat = materials.find((m) => m.id === item.material_id);
                const isFabric = selectedMat?.material_categories?.is_fabric ?? false;

                return (
                  <div
                    key={idx}
                    className="relative rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-shadow hover:shadow-sm"
                  >
                    {/* Item header line: index, stock request link, delete button */}
                    <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="text-xs font-bold text-slate-700">Item #{idx + 1}</span>

                      <div className="flex items-center gap-3">
                        {/* Hubungkan ke stock request */}
                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                          <span>Ref Pengajuan:</span>
                          <select
                            value={item.stock_request_id}
                            onChange={(e) => handleSelectStockRequest(idx, e.target.value)}
                            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="">-- Bebas (Bukan dari Pengajuan) --</option>
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
                            onClick={() => removeItem(idx)}
                            className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            title="Hapus baris"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Row inputs */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                      {/* Deskripsi barang */}
                      <div className="sm:col-span-4">
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-medium text-slate-600">Nama / Deskripsi Barang *</span>
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => updateItem(idx, { description: e.target.value })}
                            placeholder="mis. Benang jahit hitam 5000yd"
                            className={inputClass}
                          />
                        </label>
                      </div>

                      {/* Material Master Data Link */}
                      <div className="sm:col-span-4">
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-medium text-slate-600">
                            Masuk ke Stok Material (opsional)
                          </span>
                          <select
                            value={item.material_id}
                            onChange={(e) => handleSelectMaterial(idx, e.target.value)}
                            className={inputClass}
                          >
                            <option value="">-- Bukan Stok Bahan Baku --</option>
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
                            onChange={(e) => updateItem(idx, { category_id: e.target.value })}
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

                      {/* Toko / Supplier */}
                      <div className="sm:col-span-3">
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-medium text-slate-600">Toko / Supplier</span>
                          <input
                            type="text"
                            value={item.supplier_name}
                            onChange={(e) => updateItem(idx, { supplier_name: e.target.value })}
                            placeholder="Toko Benang Berkah"
                            className={inputClass}
                          />
                        </label>
                      </div>

                      {/* Qty & Unit */}
                      <div className="sm:col-span-2">
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-medium text-slate-600">Qty *</span>
                          <input
                            type="number"
                            min="0.01"
                            step="any"
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, { quantity: e.target.value === '' ? '' : Number(e.target.value) })}
                            placeholder="10"
                            className={inputClass}
                          />
                        </label>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-medium text-slate-600">Satuan *</span>
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) => updateItem(idx, { unit: e.target.value })}
                            placeholder="pcs/meter"
                            className={inputClass}
                          />
                        </label>
                      </div>

                      {/* Harga Satuan */}
                      <div className="sm:col-span-2">
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-medium text-slate-600">Harga Satuan (Rp) *</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={item.unit_price}
                            onChange={(e) => updateItem(idx, { unit_price: formatIDRInput(e.target.value) })}
                            placeholder="45.000"
                            className={inputClass}
                          />
                        </label>
                      </div>

                      {/* Subtotal */}
                      <div className="sm:col-span-3">
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-medium text-slate-600">Subtotal Belanja</span>
                          <div className="flex h-9 items-center rounded-lg bg-slate-100 px-3 font-semibold text-slate-900 text-sm">
                            {formatIDR(item.total_price)}
                          </div>
                        </label>
                      </div>

                      {/* Upload Nota */}
                      <div className="sm:col-span-12 pt-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-[11px] font-semibold text-slate-600">Foto Bukti Nota:</span>

                          {item.receipt_photo_url ? (
                            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-2.5 py-1 text-xs text-emerald-800">
                              <FileImage className="h-4 w-4 text-emerald-600" />
                              <a
                                href={item.receipt_photo_url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium underline hover:text-emerald-900 flex items-center gap-1"
                              >
                                Lihat Nota <ExternalLink className="h-3 w-3" />
                              </a>
                              <button
                                type="button"
                                onClick={() => updateItem(idx, { receipt_photo_url: '' })}
                                className="ml-1 rounded-full p-0.5 text-rose-500 hover:bg-rose-100"
                                title="Hapus foto nota"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 hover:border-primary hover:bg-slate-100 transition">
                              <UploadCloud className="h-3.5 w-3.5 text-slate-500" />
                              <span>{item.uploading ? 'Mengupload...' : 'Upload Foto Nota'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={item.uploading}
                                onChange={(e) => {
                                  if (e.target.files && e.target.files[0]) {
                                    handleUploadReceipt(idx, e.target.files[0]);
                                  }
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Financial Calculation Summary Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5 text-sm font-semibold text-slate-900">
              <Calculator className="h-4 w-4 text-slate-600" />
              <span>Rekonsiliasi Keuangan SPJ</span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
              <div className="rounded-lg bg-white p-3 border border-slate-200/80">
                <p className="text-xs text-muted-foreground">Total Belanja Barang</p>
                <p className="mt-1 text-base font-bold text-slate-900">
                  {formatIDR(grandTotal)}
                </p>
              </div>

              <div className="rounded-lg bg-white p-3 border border-violet-200/60">
                <p className="text-xs text-violet-600">Biaya Jasa / Transport</p>
                <p className={`mt-1 text-base font-bold ${serviceFeeAmount > 0 ? 'text-violet-700' : 'text-slate-400'}`}>
                  {serviceFeeAmount > 0 ? formatIDR(serviceFeeAmount) : '—'}
                </p>
              </div>

              <div className="rounded-lg bg-white p-3 border border-amber-200/60">
                <p className="text-xs text-muted-foreground">Uang Muka Diberikan</p>
                <p className="mt-1 text-base font-bold text-amber-700">
                  {formatIDR(advanceAmount)}
                </p>
              </div>

              <div className={`rounded-lg p-3 border ${
                balanceDifference > 0 ? 'bg-rose-50 border-rose-200' :
                balanceDifference < 0 ? 'bg-emerald-50 border-emerald-200' :
                'bg-white border-slate-200/80'
              }`}>
                <p className="text-xs text-muted-foreground">
                  {balanceDifference > 0 ? 'Kurang Bayar' : balanceDifference < 0 ? 'Sisa Uang Muka' : 'Pas / Lunas'}
                </p>
                <p className={`mt-1 text-base font-bold ${
                  balanceDifference > 0 ? 'text-rose-600' :
                  balanceDifference < 0 ? 'text-emerald-600' :
                  'text-slate-700'
                }`}>
                  {formatIDR(Math.abs(balanceDifference))}
                </p>
              </div>
            </div>

            {serviceFeeAmount > 0 && (
              <div className="mt-2.5 flex items-center justify-between rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-700">
                <span>Total Pengeluaran (barang + jasa):</span>
                <span className="font-bold">{formatIDR(totalWithFee)}</span>
              </div>
            )}

            <p className="mt-2.5 text-[11px] text-muted-foreground">
              Catatan: Saat SPJ disetujui, uang muka di-reversal (Income), belanja dicatat per kategori (Expense), dan biaya jasa dicatat terpisah.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-border">
            <Button type="button" variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => handleSubmit(undefined, 'disbursed')}
                title="Simpan draft belanjaan staf (status: Sedang Belanja)"
              >
                Simpan Draft (Sedang Belanja)
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={submitting}
                onClick={() => handleSubmit(undefined, 'submitted')}
                title="Submit SPJ agar siap diverifikasi & di-approve Finance"
              >
                {submitting ? 'Menyimpan...' : 'Submit SPJ (Siap Approval)'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
