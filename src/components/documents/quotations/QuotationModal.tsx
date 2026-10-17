import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  FileText,
  User,
  ShoppingBag,
  CreditCard,
  AlertCircle,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import Button from '../../ui/button';
import { formatIDR } from '../../../utils/formatCurrency';
import { useSales } from '../../../hooks/useSales';
import { useCompanyBankAccounts } from '../../../hooks/useCompanyBankAccounts';
import { useProductCategories } from '../../../hooks/useProductCategories';
import { useProducts } from '../../../hooks/useProducts';
import { useMaterials } from '../../../hooks/useMaterials';
import { supabase } from '../../../lib/supabaseClient';
import type { Quotation, QuotationItem, MaterialColor } from '../../../types';

interface QuotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  quotationToEdit?: Quotation | null;
  onSave: (
    id: string | null,
    header: Partial<Quotation>,
    items: QuotationItem[]
  ) => Promise<string>;
}

const DEFAULT_ITEM: QuotationItem = {
  sort_order: 1,
  category_id: null,
  product_id: null,
  material_id: null,
  material_color_id: null,
  product_name: '',
  fabric_type: '',
  fabric_color: '',
  fabric_specs: '',
  sewing_notes: '',
  embroidery_notes: '',
  print_notes: '',
  qty: 1,
  unit: 'pcs',
  unit_price: 0,
  item_notes: '',
};

export default function QuotationModal({
  isOpen,
  onClose,
  quotationToEdit,
  onSave,
}: QuotationModalProps) {
  const { activeSales } = useSales();
  const { accounts: bankAccounts } = useCompanyBankAccounts();
  const { categories: productCategories } = useProductCategories();
  const { products } = useProducts();
  const { materials } = useMaterials();

  // Filter kain (kategori material bertipe kain)
  const fabricMaterials = useMemo(
    () => materials.filter((m) => m.material_categories?.is_fabric),
    [materials]
  );

  // Cache warna per material_id
  const [colorsByMaterialId, setColorsByMaterialId] = useState<
    Record<string, MaterialColor[]>
  >({});

  async function loadColors(materialId: string) {
    if (!materialId || colorsByMaterialId[materialId]) return;
    try {
      const { data } = await supabase
        .from('material_colors')
        .select('*')
        .eq('material_id', materialId)
        .eq('is_active', true)
        .order('color_name', { ascending: true });
      if (data) {
        setColorsByMaterialId((prev) => ({ ...prev, [materialId]: data }));
      }
    } catch (e) {
      console.error('Gagal memuat warna:', e);
    }
  }

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State - Header
  const [customerName, setCustomerName] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [quotationDate, setQuotationDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [validUntil, setValidUntil] = useState('');
  const [salesId, setSalesId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [dpPercent, setDpPercent] = useState<number | ''>(50);
  const [paymentTerms, setPaymentTerms] = useState(
    'Uang muka (DP) 50% saat pemesanan disetujui, pelunasan sisa 50% sebelum pengiriman barang.'
  );
  const [leadTime, setLeadTime] = useState('14 - 21 hari kerja setelah pembayaran DP dikonfirmasi');
  const [notes, setNotes] = useState(
    'Harga sudah termasuk bordir/sablon standar sesuai spesifikasi di atas. Perubahan desain setelah persetujuan dapat memengaruhi estimasi waktu dan biaya.'
  );

  // Form State - Items
  const [items, setItems] = useState<QuotationItem[]>([{ ...DEFAULT_ITEM }]);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setErrorMessage(null);

      if (quotationToEdit) {
        setCustomerName(quotationToEdit.customer_name || '');
        setCustomerCompany(quotationToEdit.customer_company || '');
        setCustomerAddress(quotationToEdit.customer_address || '');
        setQuotationDate(quotationToEdit.quotation_date || new Date().toISOString().split('T')[0]);
        setValidUntil(quotationToEdit.valid_until || '');
        setSalesId(quotationToEdit.sales_id || '');
        setBankAccountId(quotationToEdit.bank_account_id || '');
        setDpPercent(quotationToEdit.dp_percent ?? '');
        setPaymentTerms(quotationToEdit.payment_terms || '');
        setLeadTime(quotationToEdit.lead_time || '');
        setNotes(quotationToEdit.notes || '');

        if (quotationToEdit.quotation_items && quotationToEdit.quotation_items.length > 0) {
          const hydratedItems = quotationToEdit.quotation_items.map((it, idx) => {
            // Cocokkan model produk jika belum ber-ID
            const matchedProduct = it.product_id
              ? products.find((p) => p.id === it.product_id)
              : products.find((p) => p.name.trim().toLowerCase() === (it.product_name || '').trim().toLowerCase());

            const effectiveCategoryId = it.category_id || matchedProduct?.category_id || null;
            const effectiveProductId = it.product_id || matchedProduct?.id || null;

            // Cocokkan bahan kain jika belum ber-ID
            const matchedMaterial = it.material_id
              ? materials.find((m) => m.id === it.material_id)
              : (it.fabric_type
                  ? fabricMaterials.find((m) =>
                      m.name.trim().toLowerCase() === it.fabric_type.trim().toLowerCase() ||
                      it.fabric_type.toLowerCase().includes(m.name.toLowerCase()) ||
                      m.name.toLowerCase().includes(it.fabric_type.toLowerCase())
                    )
                  : null);
            const effectiveMaterialId = it.material_id || matchedMaterial?.id || null;

            if (effectiveMaterialId) {
              loadColors(effectiveMaterialId);
            }

            // Specs otomatis jika kosong
            let fabricSpecs = it.fabric_specs || '';
            if (!fabricSpecs && matchedMaterial) {
              const parts: string[] = [];
              if (matchedMaterial.composition) parts.push(`Komposisi: ${matchedMaterial.composition}`);
              if (matchedMaterial.description) parts.push(`Deskripsi: ${matchedMaterial.description}`);
              if (matchedMaterial.care_instruction) parts.push(`Perawatan: ${matchedMaterial.care_instruction}`);
              fabricSpecs = parts.join(' | ');
            }

            return {
              ...it,
              category_id: effectiveCategoryId,
              product_id: effectiveProductId,
              material_id: effectiveMaterialId,
              material_color_id: it.material_color_id || null,
              fabric_specs: fabricSpecs,
              sort_order: it.sort_order || idx + 1,
            };
          });
          setItems(hydratedItems);
        } else {
          setItems([{ ...DEFAULT_ITEM }]);
        }
      } else {
        // Reset form baru
        const today = new Date();
        const due = new Date();
        due.setDate(today.getDate() + 14);

        setCustomerName('');
        setCustomerCompany('');
        setCustomerAddress('');
        setQuotationDate(today.toISOString().split('T')[0]);
        setValidUntil(due.toISOString().split('T')[0]);
        setSalesId('');
        // Pilih primary bank account jika ada
        const primaryBank = bankAccounts.find((b) => b.is_primary);
        setBankAccountId(primaryBank ? primaryBank.id : bankAccounts[0]?.id || '');
        setDpPercent(50);
        setPaymentTerms('Uang muka (DP) 50% saat pemesanan disetujui, pelunasan sisa 50% sebelum pengiriman barang.');
        setLeadTime('14 - 21 hari kerja setelah pembayaran DP dikonfirmasi');
        setNotes('Harga sudah termasuk bordir/sablon standar sesuai spesifikasi di atas. Perubahan desain setelah persetujuan dapat memengaruhi estimasi waktu dan biaya.');
        setItems([{ ...DEFAULT_ITEM }]);
      }
    }
  }, [isOpen, quotationToEdit, bankAccounts, products, materials, fabricMaterials]);

  // Preload warna kain untuk item yang sudah memiliki material_id
  useEffect(() => {
    if (items && items.length > 0) {
      for (const it of items) {
        if (it.material_id) {
          loadColors(it.material_id);
        }
      }
    }
  }, [items]);

  // Otomatis cocokkan material_color_id ketika list warna per material telah ter-load
  useEffect(() => {
    setItems((prev) => {
      let changed = false;
      const next = prev.map((it) => {
        if (it.material_id && !it.material_color_id && it.fabric_color) {
          const colorList = colorsByMaterialId[it.material_id];
          if (colorList && colorList.length > 0) {
            const matched = colorList.find(
              (c) => c.color_name.trim().toLowerCase() === it.fabric_color.trim().toLowerCase()
            );
            if (matched) {
              changed = true;
              return { ...it, material_color_id: matched.id };
            }
          }
        }
        return it;
      });
      return changed ? next : prev;
    });
  }, [colorsByMaterialId]);

  if (!isOpen) return null;

  // Item handlers
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
      setErrorMessage('Penawaran harus memiliki minimal 1 item.');
      return;
    }
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  }

  function handleUpdateItem(index: number, field: keyof QuotationItem, value: any) {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function handleItemCategoryChange(index: number, categoryId: string) {
    setItems((prev) => {
      const next = [...prev];
      const current = next[index];
      const prod = products.find((p) => p.id === current.product_id);
      const shouldResetProduct = prod && prod.category_id !== categoryId;
      next[index] = {
        ...current,
        category_id: categoryId || null,
        product_id: shouldResetProduct ? null : current.product_id,
      };
      return next;
    });
  }

  function handleItemProductChange(index: number, productId: string) {
    const selectedProd = products.find((p) => p.id === productId);
    setItems((prev) => {
      const next = [...prev];
      const current = next[index];
      if (selectedProd) {
        const recPrice =
          Number(selectedProd.default_price) ||
          Number(selectedProd.price_prioritas) ||
          Number(selectedProd.price_satuan) ||
          current.unit_price;

        next[index] = {
          ...current,
          product_id: selectedProd.id,
          category_id: selectedProd.category_id || current.category_id,
          product_name: selectedProd.name,
          unit_price: recPrice > 0 ? recPrice : current.unit_price,
        };
      } else {
        next[index] = {
          ...current,
          product_id: null,
        };
      }
      return next;
    });
  }

  function handleItemMaterialChange(index: number, materialId: string) {
    const selectedMat = materials.find((m) => m.id === materialId);
    if (materialId) {
      loadColors(materialId);
    }

    setItems((prev) => {
      const next = [...prev];
      const current = next[index];
      if (selectedMat) {
        const fabricLabel = selectedMat.name + (selectedMat.brand ? ` - ${selectedMat.brand}` : '');
        const specsParts: string[] = [];
        if (selectedMat.composition) specsParts.push(`Komposisi: ${selectedMat.composition}`);
        if (selectedMat.description) specsParts.push(`Deskripsi: ${selectedMat.description}`);
        if (selectedMat.care_instruction) specsParts.push(`Perawatan: ${selectedMat.care_instruction}`);
        const autoSpecs = specsParts.join(' | ');

        next[index] = {
          ...current,
          material_id: selectedMat.id,
          material_color_id: null,
          fabric_type: fabricLabel,
          fabric_color: '',
          fabric_specs: autoSpecs || current.fabric_specs || '',
        };
      } else {
        next[index] = {
          ...current,
          material_id: null,
          material_color_id: null,
        };
      }
      return next;
    });
  }

  function handleItemColorChange(index: number, colorId: string) {
    const currentItem = items[index];
    const colors = colorsByMaterialId[currentItem?.material_id || ''] || [];
    const selectedColor = colors.find((c) => c.id === colorId);

    setItems((prev) => {
      const next = [...prev];
      const current = next[index];
      next[index] = {
        ...current,
        material_color_id: colorId || null,
        fabric_color: selectedColor ? selectedColor.color_name : current.fabric_color,
      };
      return next;
    });
  }

  // Calculate totals
  const totalAmount = items.reduce(
    (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.unit_price) || 0),
    0
  );
  const dpAmount = dpPercent ? Math.round((totalAmount * Number(dpPercent)) / 100) : 0;

  // Step Validation
  function handleNextStep() {
    setErrorMessage(null);
    if (step === 1) {
      if (!customerName.trim()) {
        setErrorMessage('Nama pelanggan wajib diisi.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (items.length === 0) {
        setErrorMessage('Minimal harus ada 1 item barang.');
        return;
      }
      for (let i = 0; i < items.length; i++) {
        if (!items[i].product_name.trim()) {
          setErrorMessage(`Nama produk pada item ke-${i + 1} wajib diisi.`);
          return;
        }
        if ((Number(items[i].qty) || 0) <= 0) {
          setErrorMessage(`Jumlah qty pada item ke-${i + 1} harus lebih dari 0.`);
          return;
        }
        if ((Number(items[i].unit_price) || 0) < 0) {
          setErrorMessage(`Harga satuan pada item ke-${i + 1} tidak boleh negatif.`);
          return;
        }
      }
      setStep(3);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setSaving(true);

    try {
      const header: Partial<Quotation> = {
        customer_name: customerName.trim(),
        customer_company: customerCompany.trim() || null,
        customer_address: customerAddress.trim() || null,
        quotation_date: quotationDate,
        valid_until: validUntil || null,
        sales_id: salesId || null,
        bank_account_id: bankAccountId || null,
        dp_percent: dpPercent === '' ? null : Number(dpPercent),
        payment_terms: paymentTerms.trim() || null,
        lead_time: leadTime.trim() || null,
        notes: notes.trim() || null,
      };

      await onSave(quotationToEdit?.id || null, header, items);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Gagal menyimpan penawaran.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-900">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-slate-50">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {quotationToEdit ? 'Ubah Surat Penawaran' : 'Buat Surat Penawaran Baru'}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Langkah {step} dari 3: {step === 1 ? 'Data Pelanggan & Syarat' : step === 2 ? 'Rincian Item & Spesifikasi' : 'Pratinjau & Simpan'}
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
            disabled={saving}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Wizard Stepper Tabs */}
        <div className="flex border-b border-slate-200 bg-white px-6">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition ${
              step === 1
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <User className="h-4 w-4" />
            1. Pelanggan & Syarat
          </button>
          <button
            type="button"
            onClick={() => {
              if (customerName.trim()) setStep(2);
            }}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition ${
              step === 2
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShoppingBag className="h-4 w-4" />
            2. Item & Spesifikasi ({items.length})
          </button>
          <button
            type="button"
            onClick={() => {
              if (customerName.trim() && items[0]?.product_name) setStep(3);
            }}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition ${
              step === 3
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <CheckCircle2 className="h-4 w-4" />
            3. Ringkasan & Simpan
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Modal Body / Steps */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* STEP 1: INFORMASI PELANGGAN & SYARAT */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Pelanggan / Kontak <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Contoh: Bpk. Hendra Gunawan"
                    className="w-full rounded-lg border border-border px-3 py-2 text-xs focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Perusahaan / Instansi (Opsional)
                  </label>
                  <input
                    type="text"
                    value={customerCompany}
                    onChange={(e) => setCustomerCompany(e.target.value)}
                    placeholder="Contoh: PT Sumber Rezeki Makmur"
                    className="w-full rounded-lg border border-border px-3 py-2 text-xs focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alamat Pengiriman / Penagihan (Opsional)
                </label>
                <textarea
                  rows={2}
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder="Alamat lengkap tujuan dokumen..."
                  className="w-full rounded-lg border border-border px-3 py-2 text-xs focus:outline-none focus:border-primary resize-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Penawaran
                  </label>
                  <input
                    type="date"
                    required
                    value={quotationDate}
                    onChange={(e) => setQuotationDate(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-xs focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Berlaku Hingga
                  </label>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-xs focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Salesperson Penanggung Jawab
                  </label>
                  <select
                    value={salesId}
                    onChange={(e) => setSalesId(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-xs focus:outline-none focus:border-primary bg-white"
                  >
                    <option value="">-- Pilih Sales (Opsional) --</option>
                    {activeSales.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.phone ? `(${s.phone})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Uang Muka (DP %)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={dpPercent}
                      onChange={(e) =>
                        setDpPercent(e.target.value === '' ? '' : Number(e.target.value))
                      }
                      placeholder="50"
                      className="w-24 rounded-lg border border-border px-3 py-2 text-xs focus:outline-none focus:border-primary"
                    />
                    <span className="text-xs text-slate-500 font-medium">%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Rekening Pembayaran Tujuan
                  </label>
                  <select
                    value={bankAccountId}
                    onChange={(e) => setBankAccountId(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-xs focus:outline-none focus:border-primary bg-white"
                  >
                    <option value="">-- Rekening Standar --</option>
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bank_name} - {b.account_number} a.n {b.account_holder_name} {b.is_primary ? '(Utama)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Syarat & Ketentuan Pembayaran
                </label>
                <input
                  type="text"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  placeholder="Keterangan tempo bayar, tahapan DP, dll."
                  className="w-full rounded-lg border border-border px-3 py-2 text-xs focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Estimasi Waktu Pengerjaan (Lead Time)
                </label>
                <input
                  type="text"
                  value={leadTime}
                  onChange={(e) => setLeadTime(e.target.value)}
                  placeholder="Misal: 14 hari kerja setelah DP dan approval sample"
                  className="w-full rounded-lg border border-border px-3 py-2 text-xs focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Tambahan
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Catatan garansi, toleransi ukuran, dll."
                  className="w-full rounded-lg border border-border px-3 py-2 text-xs focus:outline-none focus:border-primary resize-none"
                />
              </div>
            </div>
          )}

          {/* STEP 2: ITEM & SPESIFIKASI */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Daftar Barang & Spesifikasi Teknis
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Item penawaran komersial (tanpa kolom HPP). Subtotal dihitung otomatis.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddItem}
                  className="gap-1.5 text-xs text-primary border-primary/30 hover:bg-primary/5"
                >
                  <Plus className="h-4 w-4" />
                  Tambah Item Barang
                </Button>
              </div>

              <div className="space-y-4">
                {items.map((item, idx) => {
                  const subtotal = (Number(item.qty) || 0) * (Number(item.unit_price) || 0);

                  return (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3 relative group"
                    >
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <span className="font-bold text-xs text-primary">
                          Item #{idx + 1}
                        </span>
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="text-slate-400 hover:text-rose-600 transition p-1"
                            title="Hapus baris item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      {/* Baris 1: Pemilihan Master Kategori, Model Produk, Bahan/Kain, & Warna */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs bg-white p-3 rounded-lg border border-slate-200">
                        {/* Kategori Produk */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Kategori Produk
                          </label>
                          <select
                            value={item.category_id || ''}
                            onChange={(e) => handleItemCategoryChange(idx, e.target.value)}
                            className="w-full rounded-md border border-border bg-slate-50 px-2.5 py-1.5 text-xs focus:outline-none focus:border-primary"
                          >
                            <option value="">-- Pilih Kategori --</option>
                            {productCategories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                            {item.category_id && !productCategories.some((c) => c.id === item.category_id) && (
                              <option value={item.category_id}>
                                Kategori Terpilih
                              </option>
                            )}
                          </select>
                        </div>

                        {/* Model Produk (Opsional) */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Model Produk <span className="text-[10px] text-muted-foreground font-normal">(Opsional)</span>
                          </label>
                          <select
                            value={item.product_id || ''}
                            onChange={(e) => handleItemProductChange(idx, e.target.value)}
                            className="w-full rounded-md border border-border bg-slate-50 px-2.5 py-1.5 text-xs focus:outline-none focus:border-primary"
                          >
                            <option value="">-- Model Bebas / Manual --</option>
                            {products
                              .filter((p) => (p.is_active || p.id === item.product_id) && (!item.category_id || p.category_id === item.category_id || p.id === item.product_id))
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            {item.product_id && !products.some((p) => p.id === item.product_id) && (
                              <option value={item.product_id}>
                                {item.product_name || 'Model Terpilih'}
                              </option>
                            )}
                          </select>
                        </div>

                        {/* Bahan / Kain Utama */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Bahan / Kain Utama
                          </label>
                          <select
                            value={item.material_id || ''}
                            onChange={(e) => handleItemMaterialChange(idx, e.target.value)}
                            className="w-full rounded-md border border-border bg-slate-50 px-2.5 py-1.5 text-xs focus:outline-none focus:border-primary"
                          >
                            <option value="">-- Pilih Kain --</option>
                            {fabricMaterials.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name} {m.brand ? `(${m.brand})` : ''}
                              </option>
                            ))}
                            {item.material_id && !fabricMaterials.some((m) => m.id === item.material_id) && (
                              <option value={item.material_id}>
                                {item.fabric_type || 'Bahan Terpilih'}
                              </option>
                            )}
                          </select>
                        </div>

                        {/* Warna Kain */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Warna Kain
                          </label>
                          <select
                            value={item.material_color_id || ''}
                            onChange={(e) => handleItemColorChange(idx, e.target.value)}
                            disabled={!item.material_id}
                            className="w-full rounded-md border border-border bg-slate-50 px-2.5 py-1.5 text-xs focus:outline-none focus:border-primary disabled:opacity-50"
                          >
                            <option value="">-- Pilih Warna --</option>
                            {(colorsByMaterialId[item.material_id || ''] || []).map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.color_name}
                              </option>
                            ))}
                            {item.material_color_id && !(colorsByMaterialId[item.material_id || ''] || []).some((c) => c.id === item.material_color_id) && (
                              <option value={item.material_color_id}>
                                {item.fabric_color || 'Warna Terpilih'}
                              </option>
                            )}
                          </select>
                        </div>
                      </div>

                      {/* Baris 2: Nama Produk, Qty, Satuan, Harga Satuan */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                        <div className="md:col-span-5">
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Nama Barang / Produk di Penawaran <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={item.product_name}
                            onChange={(e) =>
                              handleUpdateItem(idx, 'product_name', e.target.value)
                            }
                            placeholder="Contoh: Kemeja PDL American Drill"
                            className="w-full rounded-lg border border-border bg-white px-3 py-1.5 text-xs focus:outline-none focus:border-primary"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Qty <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="number"
                            min={1}
                            required
                            value={item.qty}
                            onChange={(e) =>
                              handleUpdateItem(idx, 'qty', Number(e.target.value))
                            }
                            className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-center focus:outline-none focus:border-primary"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Satuan
                          </label>
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) =>
                              handleUpdateItem(idx, 'unit', e.target.value)
                            }
                            placeholder="pcs"
                            className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-center focus:outline-none focus:border-primary"
                          />
                        </div>

                        <div className="md:col-span-3">
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Harga Satuan (Rp) <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={500}
                            required
                            value={item.unit_price}
                            onChange={(e) =>
                              handleUpdateItem(idx, 'unit_price', Number(e.target.value))
                            }
                            className="w-full rounded-lg border border-border bg-white px-3 py-1.5 text-xs text-right font-mono focus:outline-none focus:border-primary"
                          />
                        </div>
                      </div>

                      {/* Baris 3: Spesifikasi Tekstil Kain (Otomatis dari Master Kain, dapat disesuaikan) */}
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-50/50 p-3 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-900">
                          <span className="flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                            Spesifikasi Tekstil Kain di Surat Penawaran
                          </span>
                          <span className="text-[10px] text-emerald-700 font-normal">
                            (Otomatis dari master material kain, bisa disunting)
                          </span>
                        </div>
                        <textarea
                          rows={2}
                          value={item.fabric_specs || ''}
                          onChange={(e) => handleUpdateItem(idx, 'fabric_specs', e.target.value)}
                          placeholder="Komposisi bahan, spesifikasi serat tekstil, gramasi kain, lebar, toleransi, dll."
                          className="w-full rounded-md border border-emerald-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-500 resize-none"
                        />
                      </div>

                      {/* Baris 4: Bordir & Sablon/Jahitan/Catatan Tambahan */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block text-[10px] font-medium text-slate-600 mb-1">
                            Detail Bordir (Opsional)
                          </label>
                          <input
                            type="text"
                            value={item.embroidery_notes || ''}
                            onChange={(e) =>
                              handleUpdateItem(idx, 'embroidery_notes', e.target.value)
                            }
                            placeholder="Dada kiri, punggung, lengan"
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-medium text-slate-600 mb-1">
                            Sablon / Jahitan / Catatan Tambahan (Opsional)
                          </label>
                          <input
                            type="text"
                            value={item.print_notes || ''}
                            onChange={(e) =>
                              handleUpdateItem(idx, 'print_notes', e.target.value)
                            }
                            placeholder="Plastisol / Jahitan rantai / Kancing khusus"
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                          />
                        </div>
                      </div>

                      {/* Baris 3: Subtotal row display */}
                      <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-200/60">
                        <span className="text-[11px] text-slate-500">
                          Subtotal Item #{idx + 1}:
                        </span>
                        <span className="font-mono font-bold text-slate-900">
                          {formatIDR(subtotal)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total Calculation Card */}
              <div className="rounded-xl bg-slate-900 text-white p-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-slate-400">Total Nilai Penawaran ({items.length} item):</p>
                  <p className="text-xl font-black font-mono">{formatIDR(totalAmount)}</p>
                </div>
                {dpPercent ? (
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Estimasi DP ({dpPercent}%):</p>
                    <p className="text-base font-bold font-mono text-emerald-400">
                      {formatIDR(dpAmount)}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* STEP 3: PRATINJAU & KONFIRMASI */}
          {step === 3 && (
            <div className="space-y-6 text-xs">
              <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50 space-y-3">
                <h4 className="font-bold text-sm text-slate-900 border-b border-slate-200 pb-2">
                  Ringkasan Surat Penawaran
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Pelanggan:</span>
                    <p className="font-bold text-slate-900">{customerName}</p>
                    {customerCompany && <p className="text-slate-700">{customerCompany}</p>}
                    {customerAddress && <p className="text-slate-600">{customerAddress}</p>}
                  </div>

                  <div className="text-right space-y-1">
                    <div>
                      <span className="text-slate-500 text-[11px]">Tanggal: </span>
                      <span className="font-semibold">{quotationDate}</span>
                    </div>
                    {validUntil && (
                      <div>
                        <span className="text-slate-500 text-[11px]">Berlaku s/d: </span>
                        <span className="font-semibold text-rose-600">{validUntil}</span>
                      </div>
                    )}
                    {salesId && (
                      <div>
                        <span className="text-slate-500 text-[11px]">Sales: </span>
                        <span className="font-semibold">
                          {activeSales.find((s) => s.id === salesId)?.name || '-'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabel Singkat Item */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3 text-left">Item Barang</th>
                      <th className="py-2 px-3 text-center w-20">Qty</th>
                      <th className="py-2 px-3 text-right w-28">Harga Satuan</th>
                      <th className="py-2 px-3 text-right w-32">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-3 font-medium text-slate-800">
                          {it.product_name}
                          {it.fabric_type && (
                            <span className="block text-[10px] text-slate-500">
                              Bahan: {it.fabric_type} {it.fabric_color ? `(${it.fabric_color})` : ''}
                            </span>
                          )}
                          {it.fabric_specs && (
                            <span className="block text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 mt-0.5 max-w-md">
                              Spesifikasi: {it.fabric_specs}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {it.qty} {it.unit || 'pcs'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {formatIDR(it.unit_price)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold">
                          {formatIDR((Number(it.qty) || 0) * (Number(it.unit_price) || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold border-t border-slate-300">
                      <td colSpan={3} className="py-2.5 px-3 text-right uppercase">
                        Total Penawaran:
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-sm font-black text-slate-900">
                        {formatIDR(totalAmount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Syarat & Catatan */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5 text-[11px] text-slate-700">
                {dpPercent && (
                  <p>• DP {dpPercent}% ({formatIDR(dpAmount)})</p>
                )}
                {leadTime && <p>• Estimasi Waktu: {leadTime}</p>}
                {paymentTerms && <p>• Ketentuan Bayar: {paymentTerms}</p>}
                {notes && <p className="italic text-slate-500">• Catatan: {notes}</p>}
              </div>
            </div>
          )}
        </form>

        {/* Modal Footer Controls */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4 bg-slate-50">
          <div>
            {step > 1 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep((s) => (s - 1) as 1 | 2)}
                disabled={saving}
                className="gap-1.5 text-xs"
              >
                <ChevronLeft className="h-4 w-4" />
                Sebelumnya
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={saving}
                className="text-xs text-slate-500"
              >
                Batal
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step < 3 ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleNextStep}
                className="gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Lanjutkan
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleSubmit}
                disabled={saving}
                className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="h-4 w-4" />
                {saving ? 'Menyimpan...' : quotationToEdit ? 'Simpan Perubahan' : 'Buat Surat Penawaran'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
