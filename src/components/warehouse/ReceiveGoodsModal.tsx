import { useState, useEffect } from "react";
import {
  X,
  Plus,
  Trash2,
  PackagePlus,
  AlertCircle,
  Truck,
  Calendar,
  Layers,
  FileText,
} from "lucide-react";
import Button from "../ui/button";
import { inputClass } from "../ui/FormField";
import { formatIDR, formatIDRInput, parseIDRInput } from "../../utils/formatCurrency";
import { supabase } from "../../lib/supabaseClient";
import type { Material, MaterialColor } from "../../types";
import type { CreateReceiptPayload } from "../../hooks/usePurchaseReceipts";

interface ReceiptItemRow {
  key: string;
  materialId: string;
  materialColorId: string | null;
  qty: string;
  unit: string;
  unitPrice: string;
  totalPrice: number;
}

interface ReceiveGoodsModalProps {
  open: boolean;
  onClose: () => void;
  materials: Material[];
  onSubmit: (payload: CreateReceiptPayload) => Promise<void>;
}

function createEmptyRow(): ReceiptItemRow {
  return {
    key: crypto.randomUUID(),
    materialId: "",
    materialColorId: null,
    qty: "1",
    unit: "pcs",
    unitPrice: "",
    totalPrice: 0,
  };
}

export default function ReceiveGoodsModal({
  open,
  onClose,
  materials,
  onSubmit,
}: ReceiveGoodsModalProps) {
  const [supplierName, setSupplierName] = useState("");
  const [receivedDate, setReceivedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ReceiptItemRow[]>([createEmptyRow()]);
  const [colorsByMaterial, setColorsByMaterial] = useState<
    Record<string, MaterialColor[]>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load colors when a fabric material is selected
  const loadColorsForMaterial = async (materialId: string) => {
    if (!materialId || colorsByMaterial[materialId]) return;
    try {
      const { data } = await supabase
        .from("material_colors")
        .select("*")
        .eq("material_id", materialId)
        .eq("is_active", true)
        .order("color_name", { ascending: true });

      if (data) {
        setColorsByMaterial((prev) => ({ ...prev, [materialId]: data }));
      }
    } catch (e) {
      console.error("Gagal memuat warna material:", e);
    }
  };

  useEffect(() => {
    if (open) {
      setSupplierName("");
      setReceivedDate(new Date().toISOString().split("T")[0]);
      setNotes("");
      setItems([createEmptyRow()]);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const handleMaterialChange = (index: number, materialId: string) => {
    const selectedMat = materials.find((m) => m.id === materialId);
    if (!selectedMat) return;

    loadColorsForMaterial(materialId);

    setItems((prev) => {
      const updated = [...prev];
      const unitPrice = selectedMat.price || 0;
      const qtyNum = Number(updated[index].qty) || 0;

      updated[index] = {
        ...updated[index],
        materialId,
        materialColorId: null,
        unit: selectedMat.unit || "pcs",
        unitPrice: formatIDRInput(unitPrice),
        totalPrice: qtyNum * unitPrice,
      };
      return updated;
    });
  };

  const handleColorChange = (index: number, colorId: string) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        materialColorId: colorId || null,
      };
      return updated;
    });
  };

  const handleQtyChange = (index: number, val: string) => {
    setItems((prev) => {
      const updated = [...prev];
      const qtyNum = Number(val) || 0;
      const priceNum = parseIDRInput(updated[index].unitPrice);
      updated[index] = {
        ...updated[index],
        qty: val,
        totalPrice: qtyNum * priceNum,
      };
      return updated;
    });
  };

  const handlePriceChange = (index: number, val: string) => {
    setItems((prev) => {
      const updated = [...prev];
      const priceNum = parseIDRInput(val);
      const qtyNum = Number(updated[index].qty) || 0;
      updated[index] = {
        ...updated[index],
        unitPrice: formatIDRInput(priceNum),
        totalPrice: qtyNum * priceNum,
      };
      return updated;
    });
  };

  const addRow = () => {
    setItems((prev) => [...prev, createEmptyRow()]);
  };

  const removeRow = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const grandTotal = items.reduce((sum, it) => sum + (Number(it.totalPrice) || 0), 0);
  const totalQty = items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validasi
    if (items.length === 0) {
      setError("Tambahkan minimal satu baris material.");
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.materialId) {
        setError(`Baris ke-${i + 1}: Silakan pilih material.`);
        return;
      }
      const qtyNum = Number(it.qty);
      if (!qtyNum || qtyNum <= 0) {
        setError(`Baris ke-${i + 1}: Qty harus lebih dari 0.`);
        return;
      }
      const mat = materials.find((m) => m.id === it.materialId);
      const isFabric = Boolean(mat?.material_categories?.is_fabric);
      const colors = colorsByMaterial[it.materialId] || [];
      if (isFabric && colors.length > 0 && !it.materialColorId) {
        setError(`Baris ke-${i + 1} (${mat?.name}): Pilih varian warna kain.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      await onSubmit({
        supplier_name: supplierName.trim() || null,
        received_date: receivedDate,
        notes: notes.trim() || null,
        items: items.map((it) => {
          const qtyNum = Number(it.qty);
          const priceNum = parseIDRInput(it.unitPrice);
          return {
            material_id: it.materialId,
            material_color_id: it.materialColorId,
            qty: qtyNum,
            unit: it.unit,
            unit_price: priceNum,
            total_price: qtyNum * priceNum,
          };
        }),
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || "Gagal menyimpan penerimaan barang.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <PackagePlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Penerimaan Barang Supplier
              </h2>
              <p className="text-xs text-muted-foreground">
                Catat stok masuk & catat tagihan baru ke Keuangan
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* General Info (Supplier, Tanggal, Catatan) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-xl border border-border bg-muted/20 p-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                  Nama Supplier
                </label>
                <input
                  type="text"
                  placeholder="Contoh: CV Sumber Tekstil"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  Tanggal Penerimaan <span className="text-destructive">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  No Surat Jalan / Catatan
                </label>
                <input
                  type="text"
                  placeholder="No. SJ / faktur pengiriman"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Material Items Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Rincian Barang yang Diterima ({items.length} Baris)
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addRow}
                  className="h-8 text-xs gap-1 text-primary border-primary/30 hover:bg-primary/5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Tambah Baris</span>
                </Button>
              </div>

              <div className="space-y-2.5">
                {items.map((row, idx) => {
                  const selectedMat = materials.find((m) => m.id === row.materialId);
                  const isFabric = Boolean(selectedMat?.material_categories?.is_fabric);
                  const colors = selectedMat ? colorsByMaterial[selectedMat.id] || [] : [];

                  return (
                    <div
                      key={row.key}
                      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3.5 transition-all hover:border-border/90 sm:flex-row sm:items-center"
                    >
                      {/* Material Select */}
                      <div className="flex-1 min-w-[180px]">
                        <label className="block text-[10px] text-muted-foreground mb-1">
                          Material #{idx + 1}
                        </label>
                        <select
                          required
                          value={row.materialId}
                          onChange={(e) => handleMaterialChange(idx, e.target.value)}
                          className={inputClass}
                        >
                          <option value="">-- Pilih Material --</option>
                          {materials
                            .filter((m) => m.is_active)
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name} ({m.material_categories?.name || "Material"})
                              </option>
                            ))}
                        </select>
                      </div>

                      {/* Warna (jika kain) */}
                      {isFabric && (
                        <div className="w-full sm:w-44">
                          <label className="block text-[10px] text-muted-foreground mb-1">
                            Varian Warna
                          </label>
                          <select
                            required={colors.length > 0}
                            value={row.materialColorId || ""}
                            onChange={(e) => handleColorChange(idx, e.target.value)}
                            className={inputClass}
                          >
                            <option value="">
                              {colors.length === 0 ? "Belum ada warna" : "-- Pilih Warna --"}
                            </option>
                            {colors.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.color_name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Qty & Satuan */}
                      <div className="w-full sm:w-28">
                        <label className="block text-[10px] text-muted-foreground mb-1">
                          Qty ({row.unit})
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0.01"
                          required
                          value={row.qty}
                          onChange={(e) => handleQtyChange(idx, e.target.value)}
                          className={inputClass}
                          placeholder="1"
                        />
                      </div>

                      {/* Harga Beli Satuan */}
                      <div className="w-full sm:w-36">
                        <label className="block text-[10px] text-muted-foreground mb-1">
                          Harga Beli Satuan
                        </label>
                        <input
                          type="text"
                          required
                          value={row.unitPrice}
                          onChange={(e) => handlePriceChange(idx, e.target.value)}
                          className={inputClass}
                          placeholder="Rp 0"
                        />
                      </div>

                      {/* Subtotal */}
                      <div className="w-full sm:w-32 text-left sm:text-right">
                        <label className="block text-[10px] text-muted-foreground mb-1">
                          Subtotal
                        </label>
                        <p className="py-2 text-xs font-bold text-foreground">
                          {formatIDR(row.totalPrice)}
                        </p>
                      </div>

                      {/* Remove Button */}
                      <div className="pt-2 sm:pt-4">
                        <button
                          type="button"
                          disabled={items.length <= 1}
                          onClick={() => removeRow(idx)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-30 disabled:pointer-events-none"
                          title="Hapus baris"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Info Box */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-primary flex items-center gap-1.5">
                <PackagePlus className="h-4 w-4" /> Otomatisasi Stok & Keuangan:
              </p>
              <ul className="list-disc list-inside space-y-0.5 pl-1 text-[11px]">
                <li>Semua item di atas akan langsung bertambah ke stok fisik gudang.</li>
                <li>Tagihan sebesar <strong>{formatIDR(grandTotal)}</strong> akan masuk ke daftar <em>"Tagihan Belum Bayar"</em>.</li>
                <li>Saat kasir/finance membayar tagihan ini, pengeluaran akan otomatis tercatat di halaman Keuangan.</li>
              </ul>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border bg-card px-6 py-4">
            <div className="flex items-center gap-4 text-xs">
              <div>
                <span className="text-muted-foreground">Total Item:</span>{" "}
                <strong className="text-foreground">{items.length} jenis</strong>
              </div>
              <span>•</span>
              <div>
                <span className="text-muted-foreground">Total Tagihan:</span>{" "}
                <strong className="text-base font-bold text-primary">
                  {formatIDR(grandTotal)}
                </strong>
              </div>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 sm:flex-none"
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="flex-1 sm:flex-none min-w-[140px]"
              >
                {submitting ? "Menyimpan..." : "Simpan Penerimaan"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
