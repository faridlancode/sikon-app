import { useEffect, useState, useMemo } from "react";
import { X, Scissors, Shirt, Package, Calculator, User, Loader2 } from "lucide-react";
import { inputClass } from "../ui/FormField";
import Button from "../ui/button";
import { formatIDR, formatIDRInput, parseIDRInput } from "../../utils/formatCurrency";
import { useStaff } from "../../hooks/useStaff";
import { useProducts } from "../../hooks/useProducts";
import { useOrders } from "../../hooks/useOrders";
import type { PieceworkTask, Staff, Product, Order } from "../../types";

interface PieceworkTaskModalProps {
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  onSubmit?: (payload: any) => Promise<void>;
  onSave?: (payload: any) => Promise<void>;
  staffList?: Staff[];
  products?: Product[];
  orders?: Order[];
  editingTask?: PieceworkTask | null;
}

const TASK_TYPES = [
  { value: "sewing", label: "Jahit (Sewing)", icon: Shirt },
  { value: "cutting", label: "Potong (Cutting)", icon: Scissors },
  { value: "finishing", label: "Finishing / Packing", icon: Package },
  { value: "other", label: "Lainnya", icon: Package },
];

export default function PieceworkTaskModal({
  open,
  isOpen,
  onClose,
  onSubmit,
  onSave,
  staffList: propStaffList,
  products: propProducts,
  orders: propOrders,
  editingTask,
}: PieceworkTaskModalProps) {
  const isModalOpen = Boolean(open ?? isOpen);
  const handleSaveAction = onSubmit ?? onSave;

  const { staff: fetchedStaff } = useStaff();
  const { products: fetchedProducts } = useProducts();
  const { orders: fetchedOrders, fetchOrderDetail } = useOrders();

  const staffList = propStaffList ?? fetchedStaff;
  const products = propProducts ?? fetchedProducts;
  const orders = propOrders ?? fetchedOrders;

  const [staffId, setStaffId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [productId, setProductId] = useState("");
  const [taskType, setTaskType] = useState<"cutting" | "sewing" | "finishing" | "other">("sewing");
  const [qty, setQty] = useState("1");
  const [ratePerUnit, setRatePerUnit] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"completed" | "pending">("completed");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // State untuk order items yang terload saat order dipilih
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [loadingOrderItems, setLoadingOrderItems] = useState(false);

  // Filter staff: hanya staf aktif
  const pieceworkStaff = staffList.filter((s) => s.is_active);

  // Produk yang boleh ditampilkan di dropdown (bisa difilter berdasarkan order yang dipilih)
  const availableProducts = useMemo(() => {
    if (!orderId || orderItems.length === 0) return products;
    // Ambil product_id unik dari order items yang dipilih
    const orderProductIds = new Set(orderItems.map((item: any) => item.product_id).filter(Boolean));
    if (orderProductIds.size === 0) return products;
    return products.filter((p) => orderProductIds.has(p.id));
  }, [orderId, orderItems, products]);

  useEffect(() => {
    if (!isModalOpen) return;
    setError("");
    setOrderItems([]);

    if (editingTask) {
      setStaffId(editingTask.staff_id);
      setOrderId(editingTask.order_id || "");
      setProductId(editingTask.product_id || "");
      setTaskType(editingTask.task_type);
      setQty(String(editingTask.qty));
      setRatePerUnit(formatIDRInput(editingTask.rate_per_unit));
      setNotes(editingTask.notes || "");
      setStatus(editingTask.status === "pending" ? "pending" : "completed");

      // Jika editingTask punya order_id, load order items untuk filter product
      if (editingTask.order_id) {
        loadOrderItems(editingTask.order_id);
      }
    } else {
      const defaultStaff = pieceworkStaff.find(
        (s) => s.wage_type === "piecework" || s.role === "Penjahit" || s.role === "Tukang Potong"
      ) || pieceworkStaff[0];

      setStaffId(defaultStaff ? defaultStaff.id : "");
      setOrderId("");
      setProductId(products[0]?.id || "");
      setTaskType("sewing");
      setQty("1");

      const firstProd = products[0];
      const defaultRate = firstProd ? Number(firstProd.sewing_cost_per_pcs || 0) : 0;
      setRatePerUnit(defaultRate > 0 ? formatIDRInput(defaultRate) : "");
      setNotes("");
      setStatus("completed");
    }
  }, [isModalOpen, editingTask, staffList, products]);

  if (!isModalOpen) return null;

  async function loadOrderItems(selectedOrderId: string) {
    if (!selectedOrderId) {
      setOrderItems([]);
      return;
    }
    setLoadingOrderItems(true);
    try {
      const { items } = await fetchOrderDetail(selectedOrderId);
      setOrderItems(items);
      return items;
    } catch (err) {
      console.error("Gagal load order items:", err);
      setOrderItems([]);
      return [];
    } finally {
      setLoadingOrderItems(false);
    }
  }

  async function handleOrderChange(newOrderId: string) {
    setOrderId(newOrderId);

    if (!newOrderId) {
      // Kosongkan → reset dropdown product ke semua
      setOrderItems([]);
      // Reset product ke default pertama
      const firstProd = products[0];
      if (firstProd) {
        setProductId(firstProd.id);
        handleProductChange(firstProd.id, taskType);
      }
      return;
    }

    const items = await loadOrderItems(newOrderId);
    if (!items || items.length === 0) return;

    // Kumpulkan product unik dari order items
    const productMap = new Map<string, { id: string; qty: number }>();
    for (const item of items) {
      if (!item.product_id) continue;
      const existing = productMap.get(item.product_id);
      productMap.set(item.product_id, {
        id: item.product_id,
        qty: (existing?.qty ?? 0) + Number(item.qty || 0),
      });
    }

    if (productMap.size === 1) {
      // 1 produk unik → auto-set product, auto-fill qty & rate
      const [onlyProductId, { qty: itemQty }] = [...productMap.entries()][0];
      setProductId(onlyProductId);
      handleProductChange(onlyProductId, taskType);
      setQty(String(itemQty));
    } else if (productMap.size > 1) {
      // Lebih dari 1 produk → filter dropdown, reset pilihan agar user memilih
      setProductId("");
    }
  }

  // Auto-fill rate when product or taskType changes
  function handleProductChange(newProdId: string, currentTaskType?: string) {
    setProductId(newProdId);
    const prod = products.find((p) => p.id === newProdId);
    if (!prod) return;

    const effectiveTaskType = currentTaskType ?? taskType;
    if (effectiveTaskType === "cutting") {
      setRatePerUnit(formatIDRInput(prod.cutting_cost_per_pcs || 0));
    } else if (effectiveTaskType === "sewing") {
      setRatePerUnit(formatIDRInput(prod.sewing_cost_per_pcs || 0));
    }
  }

  function handleTaskTypeChange(newTaskType: "cutting" | "sewing" | "finishing" | "other") {
    setTaskType(newTaskType);
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;

    if (newTaskType === "cutting") {
      setRatePerUnit(formatIDRInput(prod.cutting_cost_per_pcs || 0));
    } else if (newTaskType === "sewing") {
      setRatePerUnit(formatIDRInput(prod.sewing_cost_per_pcs || 0));
    }
  }

  const qtyNum = Number(qty) || 0;
  const rateNum = parseIDRInput(ratePerUnit);
  const totalWage = qtyNum * rateNum;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!staffId) return setError("Pilih karyawan yang mengerjakan.");
    if (qtyNum <= 0) return setError("Jumlah (qty) harus lebih dari 0.");
    if (rateNum < 0) return setError("Tarif upah per pcs tidak boleh negatif.");

    setSubmitting(true);
    try {
      if (handleSaveAction) {
        await handleSaveAction({
          staff_id: staffId,
          order_id: orderId || null,
          product_id: productId || null,
          task_type: taskType,
          qty: qtyNum,
          rate_per_unit: rateNum,
          notes: notes.trim() || null,
          status,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan tugas borongan.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={onClose} />

      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-border pb-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
              <Scissors className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                {editingTask ? "Edit Tugas Borongan" : "Catat Tugas Borongan Baru"}
              </h2>
              <p className="text-xs text-muted-foreground">Upah potong / jahit per pcs pesanan</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-xs">
          {/* Staff selection */}
          <label className="block">
            <span className="mb-1 block font-medium text-foreground flex items-center gap-1">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              Karyawan Borongan *
            </span>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className={inputClass}
              required
            >
              <option value="">-- Pilih Karyawan --</option>
              {pieceworkStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.role || "Staf"})
                </option>
              ))}
            </select>
          </label>

          {/* Task Type */}
          <div>
            <span className="mb-1 block font-medium text-foreground">Jenis Pekerjaan *</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TASK_TYPES.map((t) => {
                const Icon = t.icon;
                const isSelected = taskType === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => handleTaskTypeChange(t.value as any)}
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-xs font-semibold transition ${
                      isSelected
                        ? "border-primary bg-primary/10 text-primary shadow-xs"
                        : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{t.label.split(" ")[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Order reference — DI ATAS product, karena order menentukan filter product */}
          <label className="block">
            <span className="mb-1 block font-medium text-foreground flex items-center gap-1">
              <Package className="h-3.5 w-3.5 text-muted-foreground" />
              Terkait Pesanan / SPK (Opsional)
            </span>
            <div className="relative">
              <select
                value={orderId}
                onChange={(e) => handleOrderChange(e.target.value)}
                className={inputClass}
                disabled={loadingOrderItems}
              >
                <option value="">-- Bukan dari Pesanan Spesifik / Stok Sendiri --</option>
                {orders.map((o: any) => (
                  <option key={o.id} value={String(o.id)}>
                    Order #{String(o.order_id || o.id)} - {String(o.customer_name || "Pelanggan")} ({Number(o.total_qty) || 0} pcs)
                  </option>
                ))}
              </select>
              {loadingOrderItems && (
                <Loader2 className="absolute right-8 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            {orderId && orderItems.length > 0 && availableProducts.length < products.length && (
              <p className="mt-1 text-[11px] text-violet-600 font-medium">
                ✓ Dropdown produk difilter sesuai isi pesanan ({availableProducts.length} produk)
              </p>
            )}
          </label>

          {/* Product selection */}
          <label className="block">
            <span className="mb-1 block font-medium text-foreground flex items-center gap-1">
              <Shirt className="h-3.5 w-3.5 text-muted-foreground" />
              Model / Produk *
            </span>
            <select
              value={productId}
              onChange={(e) => handleProductChange(e.target.value)}
              className={inputClass}
            >
              <option value="">-- Pilih Model Produk --</option>
              {availableProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (Potong: {formatIDR(p.cutting_cost_per_pcs || 0)} | Jahit: {formatIDR(p.sewing_cost_per_pcs || 0)})
                </option>
              ))}
            </select>
          </label>

          {/* Qty & Rate per Unit */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block font-medium text-foreground">Jumlah (Pcs) *</span>
              <input
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className={inputClass}
                required
              />
            </label>

            <label className="block">
              <span className="mb-1 block font-medium text-foreground">Tarif Upah / Pcs (Rp) *</span>
              <input
                type="text"
                inputMode="numeric"
                value={ratePerUnit}
                onChange={(e) => setRatePerUnit(formatIDRInput(e.target.value))}
                placeholder="mis. 3.500"
                className={inputClass}
                required
              />
            </label>
          </div>

          {/* Total Calculation Card */}
          <div className="flex items-center justify-between rounded-xl border border-purple-200 bg-purple-50/70 p-3 text-purple-950">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-purple-600" />
              <span className="font-semibold text-xs">Total Upah Borongan:</span>
            </div>
            <span className="text-sm font-bold text-purple-700">
              {formatIDR(totalWage)}
            </span>
          </div>

          {/* Status selection */}
          <div>
            <span className="mb-1 block font-medium text-foreground">Status Pekerjaan</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStatus("completed")}
                className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition ${
                  status === "completed"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800 shadow-xs"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                ✓ Selesai (Siap Dibayar)
              </button>
              <button
                type="button"
                onClick={() => setStatus("pending")}
                className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition ${
                  status === "pending"
                    ? "border-amber-300 bg-amber-50 text-amber-800 shadow-xs"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                Sedang Dikerjakan
              </button>
            </div>
          </div>

          {/* Notes */}
          <label className="block">
            <span className="mb-1 block font-medium text-foreground">Catatan Tambahan (Opsional)</span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="mis. Kain katun tebal, bordir dada..."
              className={inputClass}
            />
          </label>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-3.5">
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-purple-600 text-white hover:bg-purple-700"
            >
              {submitting ? "Menyimpan..." : editingTask ? "Simpan Perubahan" : "Simpan Tugas"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
