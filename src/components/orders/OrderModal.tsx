import { useEffect, useMemo, useState } from "react";
import { X, Plus, Trash2, Shirt, Sparkles, AlertCircle, Scissors, Layers } from "lucide-react";
import { inputClass } from "../ui/FormField";
import Button from "../ui/button";
import { formatIDR, formatIDRInput, parseIDRInput } from "../../utils/formatCurrency";
import { todayISO, formatDateID } from "../../utils/dateHelpers";
import { formatPoDateRange } from "../po/poHelpers";
import { useProducts, type ProductWithDetails } from "../../hooks/useProducts";
import { useMaterials } from "../../hooks/useMaterials";
import { calculateHpp } from "../../utils/calculateHpp";
import { EMBROIDERY_PRESET_SPOTS } from "../../utils/embroideryHelpers";
import { supabase } from "../../lib/supabaseClient";
import type {
  ProductCategory,
  SalesPerson,
  Material,
  MaterialColor,
  ProductWithBom,
  FabricSelection,
  PoBatchSummary,
  PoBatch,
} from "../../types";

interface FabricSlotSelectionState {
  slotId: string;
  slotLabel: string;
  usageQty: number;
  fabricCategoryId: string | null;
  materialId: string;
  materialColorId: string | null;
}

interface OrderItemRow {
  key: string;
  categoryId: string;
  productId: string;
  qty: number | string;
  price: string;
  fabricSelections: FabricSlotSelectionState[];
  embroideryMode: "none" | "flat" | "spots";
  embroideryFlatCost: string;
  embroiderySpots: Record<string, number>;
}

const EMPTY_ORDER = {
  sales_id: "",
  customer_name: "",
  order_date: todayISO(),
  ongkir: "",
};

const PAYMENT_METHODS = [
  { value: "transfer", label: "Transfer" },
  { value: "cash", label: "Tunai" },
  { value: "qris", label: "QRIS" },
  { value: "lainnya", label: "Lainnya" },
];

function createEmptyItemRow(): OrderItemRow {
  return {
    key: crypto.randomUUID(),
    categoryId: "",
    productId: "",
    qty: 1,
    price: "",
    fabricSelections: [],
    embroideryMode: "none",
    embroideryFlatCost: "40000",
    embroiderySpots: {},
  };
}

export interface OrderModalPrefillData {
  customer_name?: string;
  sales_id?: string;
  quotation_no?: string;
  itemsSummary?: string;
  notes?: string;
  quotationItems?: any[];
}

interface OrderModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    order: {
      sales_id: string;
      customer_name: string;
      order_date: string;
      ongkir: number;
      order_type?: "satuan" | "prioritas";
      is_order_type_manual_override?: boolean;
      po_batch_id?: string | null;
    };
    items: {
      product_id: string;
      name_item: string;
      bahan: null;
      qty: number;
      price: number;
      hpp_per_unit_snapshot: number;
      hpp_total_snapshot: number;
      embroidery_cost_per_unit: number;
      embroidery_details: any;
      fabricSelections: FabricSelection[];
      bomMaterials?: { material_id: string; quantity: number; unit?: string }[];
    }[];
    payment: {
      amount: number;
      paymentType: string;
      paymentDate: string;
      paymentMethod: string;
    } | null;
  }) => Promise<unknown>;
  editingOrder: any | null;
  editingItems: any[] | null;
  salesList: SalesPerson[];
  productCategories: ProductCategory[];
  prefillData?: OrderModalPrefillData | null;
}

export default function OrderModal({
  open,
  onClose,
  onSubmit,
  editingOrder,
  editingItems,
  salesList = [],
  productCategories = [],
  prefillData = null,
}: OrderModalProps) {
  const { products } = useProducts();
  const { materials } = useMaterials();

  const [order, setOrder] = useState(EMPTY_ORDER);
  const [items, setItems] = useState<OrderItemRow[]>([createEmptyItemRow()]);
  const [isManualOverride, setIsManualOverride] = useState(false);
  const [manualOrderType, setManualOrderType] = useState<"satuan" | "prioritas">("prioritas");

  const [payment, setPayment] = useState({
    amount: "",
    paymentType: "dp",
    paymentDate: todayISO(),
    paymentMethod: "transfer",
  });

  const [colorsByMaterialId, setColorsByMaterialId] = useState<
    Record<string, MaterialColor[]>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Quick lookup maps
  const activeProducts = useMemo(
    () => products.filter((p) => p.is_active),
    [products]
  );
  const productsMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  // Total order item quantity
  const totalOrderQty = useMemo(() => {
    return items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
  }, [items]);

  // Automatic order type determination (< 6 is satuan, >= 6 is prioritas)
  const autoOrderType: "satuan" | "prioritas" = totalOrderQty < 6 ? "satuan" : "prioritas";
  const effectiveOrderType: "satuan" | "prioritas" = isManualOverride ? manualOrderType : autoOrderType;

  function getRecommendedProductPrice(prod: any, type: "satuan" | "prioritas"): number {
    if (!prod) return 0;
    if (type === "satuan") {
      return (
        Number(prod.price_satuan) ||
        Number(prod.price_prioritas) ||
        Number(prod.default_price) ||
        0
      );
    }
    return Number(prod.price_prioritas) || Number(prod.default_price) || 0;
  }

  function applyRecommendedPrices() {
    setItems((prev) =>
      prev.map((it) => {
        const prod = productsMap.get(it.productId);
        if (!prod) return it;
        const recPrice = getRecommendedProductPrice(prod, effectiveOrderType);
        return {
          ...it,
          price: recPrice > 0 ? formatIDRInput(recPrice) : it.price,
        };
      })
    );
  }
  const materialsMap = useMemo(() => {
    const map: Record<string, Material> = {};
    for (const m of materials) {
      map[m.id] = m;
    }
    return map;
  }, [materials]);

  // Load colors for a material if not cached yet
  async function loadColors(materialId: string) {
    if (!materialId || colorsByMaterialId[materialId]) return;
    try {
      const { data } = await supabase
        .from("material_colors")
        .select("*")
        .eq("material_id", materialId)
        .eq("is_active", true)
        .order("color_name", { ascending: true });
      if (data) {
        setColorsByMaterialId((prev) => ({ ...prev, [materialId]: data }));
      }
    } catch (e) {
      console.error("Gagal memuat warna:", e);
    }
  }

  // Batch PO fleksibel (REVISI 1)
  const [openBatches, setOpenBatches] = useState<PoBatchSummary[]>([]);
  const [currentOrderBatch, setCurrentOrderBatch] = useState<PoBatch | null>(null);
  const [selectedPoBatchId, setSelectedPoBatchId] = useState<string>('');
  const [isManualPoSelected, setIsManualPoSelected] = useState<boolean>(false);

  // Load daftar PO terbuka saat modal dibuka
  useEffect(() => {
    if (!open) return;
    let isCancelled = false;
    async function loadPoOptions() {
      try {
        const { data, error: rpcErr } = await (supabase as any).rpc('list_po_batches_summary', {
          p_status: 'open',
        });
        if (rpcErr) {
          console.error('Error fetching open PO batches:', rpcErr);
          return;
        }
        if (!isCancelled) {
          setOpenBatches((data || []) as PoBatchSummary[]);
        }
      } catch (err) {
        console.error('Error in loadPoOptions:', err);
      }
    }
    loadPoOptions();
    return () => {
      isCancelled = true;
    };
  }, [open]);

  // Saran PO otomatis saat order baru (selama belum dipilih manual oleh user)
  useEffect(() => {
    if (!open || editingOrder) return;
    if (isManualPoSelected) return;

    if (!order.order_date || openBatches.length === 0) {
      setSelectedPoBatchId('');
      return;
    }

    // Cari PO open yang rentang tanggalnya memuat order_date
    const matching = openBatches.filter(
      (b) => b.start_date <= order.order_date && b.end_date >= order.order_date
    );

    if (matching.length > 0) {
      // Bila lebih dari satu, pilih yang start_date paling akhir
      const sorted = [...matching].sort((a, b) => b.start_date.localeCompare(a.start_date));
      setSelectedPoBatchId(sorted[0].id);
    } else {
      setSelectedPoBatchId('');
    }
  }, [open, editingOrder, isManualPoSelected, order.order_date, openBatches]);

  // Gabungkan openBatches dengan currentOrderBatch jika closed
  const allAvailableBatches = useMemo(() => {
    const list: (PoBatch | PoBatchSummary)[] = [...openBatches];
    if (currentOrderBatch && !list.some((b) => b.id === currentOrderBatch.id)) {
      list.push(currentOrderBatch);
    }
    return list;
  }, [openBatches, currentOrderBatch]);

  const selectedBatch = useMemo(() => {
    return allAvailableBatches.find((b) => b.id === selectedPoBatchId) || null;
  }, [allAvailableBatches, selectedPoBatchId]);

  // Peringatan tanggal di luar rentang PO
  const dateWarning = useMemo(() => {
    if (!selectedBatch || !order.order_date) return null;
    if (order.order_date < selectedBatch.start_date || order.order_date > selectedBatch.end_date) {
      return `Tanggal order (${formatDateID(order.order_date)}) berada di luar rentang tanggal PO ${selectedBatch.name} (${formatPoDateRange(selectedBatch.start_date, selectedBatch.end_date)}).`;
    }
    return null;
  }, [selectedBatch, order.order_date]);

  // Peringatan kuota
  const quotaWarning = useMemo(() => {
    if (!selectedBatch || selectedBatch.quota_qty == null || selectedBatch.quota_qty <= 0) {
      return null;
    }
    const currentFilled = Number((selectedBatch as any).total_qty || 0);
    const prevQty = editingOrder && editingOrder.po_batch_id === selectedBatch.id ? Number(editingOrder.total_qty || 0) : 0;
    const projectedTotal = currentFilled - prevQty + totalOrderQty;
    const quota = Number(selectedBatch.quota_qty);
    const projectedPct = Math.round((projectedTotal / quota) * 100);

    if (projectedPct >= 100) {
      return {
        level: 'danger' as const,
        text: `Perhatian: Kuota PO "${selectedBatch.name}" akan terlampaui (${projectedTotal} / ${quota} pcs — ${projectedPct}%). Pesanan tetap dapat disimpan.`,
      };
    }
    if (projectedPct >= 90) {
      return {
        level: 'warning' as const,
        text: `Perhatian: Pesanan ini mendekati kuota PO "${selectedBatch.name}" (${projectedTotal} / ${quota} pcs — ${projectedPct}%).`,
      };
    }
    return null;
  }, [selectedBatch, editingOrder, totalOrderQty]);

  // Preload colors for initial or editing items
  useEffect(() => {
    if (!open) return;

    if (editingOrder) {
      setIsManualOverride(!!editingOrder.is_order_type_manual_override);
      setManualOrderType(editingOrder.order_type || "prioritas");
      if (editingOrder.po_batch_id) {
        setSelectedPoBatchId(editingOrder.po_batch_id);
        setIsManualPoSelected(true);
        supabase
          .from('po_batches')
          .select('*')
          .eq('id', editingOrder.po_batch_id)
          .maybeSingle()
          .then(({ data }) => {
            if (data) setCurrentOrderBatch(data as PoBatch);
          });
      } else {
        setSelectedPoBatchId('');
        setIsManualPoSelected(false);
        setCurrentOrderBatch(null);
      }

      setOrder({
        sales_id: editingOrder.sales_id || "",
        customer_name: editingOrder.customer_name || "",
        order_date: editingOrder.order_date || todayISO(),
        ongkir: formatIDRInput(editingOrder.ongkir ?? 0),
      });

      if (editingItems && editingItems.length > 0) {
        const mappedRows: OrderItemRow[] = editingItems.map((item) => {
          const product = productsMap.get(item.product_id) || item.products;
          const initialCategory = product?.category_id || "";

          const existingFabrics = item.order_item_fabrics ?? [];
          const slotRows: FabricSlotSelectionState[] = (
            product?.product_fabric_slots ?? []
          ).map((slot: any) => {
            const foundFabric = existingFabrics.find(
              (f: any) => f.product_fabric_slot_id === slot.id
            );
            if (foundFabric?.material_id) {
              loadColors(foundFabric.material_id);
            }
            return {
              slotId: slot.id,
              slotLabel: slot.label,
              usageQty: Number(slot.usage_qty) || 1,
              fabricCategoryId: slot.fabric_category_id || null,
              materialId: foundFabric?.material_id || "",
              materialColorId: foundFabric?.material_color_id || null,
            };
          });

          const embDetails = item.embroidery_details || null;
          const embCost = Number(item.embroidery_cost_per_unit) || 0;
          let embMode: "none" | "flat" | "spots" = "none";
          let embFlat = "40000";
          const embSpots: Record<string, number> = {};

          if (embDetails) {
            embMode = embDetails.mode || (embCost > 0 ? "flat" : "none");
            if (embDetails.mode === "flat") {
              embFlat = formatIDRInput(embDetails.flatCost ?? embCost);
            } else if (embDetails.mode === "spots" && Array.isArray(embDetails.spots)) {
              for (const s of embDetails.spots) {
                if (s.location) embSpots[s.location] = Number(s.cost) || 0;
              }
            }
          } else if (embCost > 0) {
            embMode = "flat";
            embFlat = formatIDRInput(embCost);
          }

          return {
            key: crypto.randomUUID(),
            categoryId: initialCategory,
            productId: item.product_id || "",
            qty: item.qty ?? 1,
            price:
              item.price !== undefined ? formatIDRInput(item.price) : "",
            fabricSelections: slotRows,
            embroideryMode: embMode,
            embroideryFlatCost: embFlat,
            embroiderySpots: embSpots,
          };
        });
        setItems(mappedRows);
      } else {
        setItems([createEmptyItemRow()]);
      }
    } else {
      setIsManualOverride(false);
      setManualOrderType("satuan");
      setOrder({
        ...EMPTY_ORDER,
        customer_name: prefillData?.customer_name || "",
        sales_id: prefillData?.sales_id || "",
      });

      if (prefillData?.quotationItems && prefillData.quotationItems.length > 0) {
        const mappedRows: OrderItemRow[] = prefillData.quotationItems.map((qItem: any) => {
          // Cari model produk dari productsMap atau cari berdasarkan nama produk
          const product = (qItem.product_id ? productsMap.get(qItem.product_id) : null)
            || products.find((p) => p.name.trim().toLowerCase() === (qItem.product_name || '').trim().toLowerCase())
            || products.find((p) => qItem.product_name && (
                p.name.toLowerCase().includes(qItem.product_name.toLowerCase()) ||
                qItem.product_name.toLowerCase().includes(p.name.toLowerCase())
              ));

          const initialCategory = qItem.category_id || product?.category_id || "";
          const effectiveProductId = product?.id || qItem.product_id || "";

          // Cari bahan kain jika ID belum ada
          const matchedMaterial = qItem.material_id
            ? materialsMap[qItem.material_id]
            : materials.find((m) =>
                m.name.trim().toLowerCase() === (qItem.fabric_type || '').trim().toLowerCase() ||
                (qItem.fabric_type && (
                  qItem.fabric_type.toLowerCase().includes(m.name.toLowerCase()) ||
                  m.name.toLowerCase().includes(qItem.fabric_type.toLowerCase())
                ))
              );
          const effectiveMaterialId = qItem.material_id || matchedMaterial?.id || "";
          const effectiveMaterialColorId = qItem.material_color_id || null;

          if (effectiveMaterialId) {
            loadColors(effectiveMaterialId);
          }

          const slots = product?.product_fabric_slots ?? [];

          // Prefill slot kain dari penawaran
          const slotRows: FabricSlotSelectionState[] = slots.length > 0
            ? slots.map((slot: any, sIdx: number) => {
                const isMainSlot = sIdx === 0 || !slot.fabric_category_id;
                const useMat = isMainSlot && effectiveMaterialId;
                return {
                  slotId: slot.id,
                  slotLabel: slot.label,
                  usageQty: Number(slot.usage_qty) || 1,
                  fabricCategoryId: slot.fabric_category_id || null,
                  materialId: useMat ? effectiveMaterialId : "",
                  materialColorId: useMat ? effectiveMaterialColorId : null,
                };
              })
            : (effectiveMaterialId
                ? [{
                    slotId: 'prefill-main',
                    slotLabel: 'Kain Utama',
                    usageQty: 1,
                    fabricCategoryId: null,
                    materialId: effectiveMaterialId,
                    materialColorId: effectiveMaterialColorId,
                  }]
                : []);

          return {
            key: crypto.randomUUID(),
            categoryId: initialCategory,
            productId: effectiveProductId,
            qty: Number(qItem.qty) || 1,
            price: qItem.unit_price !== undefined ? formatIDRInput(qItem.unit_price) : "",
            fabricSelections: slotRows,
            embroideryMode: qItem.embroidery_notes ? "flat" : "none",
            embroideryFlatCost: "40000",
            embroiderySpots: {},
          };
        });
        setItems(mappedRows);
      } else {
        setItems([createEmptyItemRow()]);
      }

      setPayment({
        amount: "",
        paymentType: "dp",
        paymentDate: todayISO(),
        paymentMethod: "transfer",
      });

      setSelectedPoBatchId('');
      setIsManualPoSelected(false);
      setCurrentOrderBatch(null);
    }
    setError("");
  }, [open, editingOrder, editingItems, productsMap, prefillData, materials]);

  if (!open) return null;

  function addItem() {
    setItems((prev) => [...prev, createEmptyItemRow()]);
  }

  function removeItem(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  }

  function handleCategoryChange(key: string, newCategoryId: string) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        return {
          ...it,
          categoryId: newCategoryId,
          productId: "",
          fabricSelections: [],
        };
      })
    );
  }

  function handleProductChange(key: string, newProductId: string) {
    const selectedProduct = productsMap.get(newProductId);
    const slots = selectedProduct?.product_fabric_slots ?? [];
    const defaultSellingPrice = getRecommendedProductPrice(selectedProduct, effectiveOrderType);

    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const currentPriceNum = parseIDRInput(it.price);
        const shouldAutofillPrice = defaultSellingPrice > 0 && (!it.price || currentPriceNum === 0);

        // Pertahankan kain & warna yang sebelumnya sudah dipilih (misal dari penawaran)
        const existingMainMat = it.fabricSelections[0]?.materialId || "";
        const existingMainColor = it.fabricSelections[0]?.materialColorId || null;
        if (existingMainMat) {
          loadColors(existingMainMat);
        }

        const initialSelections: FabricSlotSelectionState[] = slots.map((s, sIdx) => ({
          slotId: s.id,
          slotLabel: s.label,
          usageQty: Number(s.usage_qty) || 1,
          fabricCategoryId: s.fabric_category_id || null,
          materialId: (sIdx === 0 && existingMainMat) ? existingMainMat : "",
          materialColorId: (sIdx === 0 && existingMainMat) ? existingMainColor : null,
        }));

        return {
          ...it,
          productId: newProductId,
          categoryId: selectedProduct?.category_id || it.categoryId,
          price: shouldAutofillPrice ? formatIDRInput(defaultSellingPrice) : it.price,
          fabricSelections: initialSelections,
        };
      })
    );
  }

  function handleSlotMaterialChange(
    itemKey: string,
    slotId: string,
    newMaterialId: string
  ) {
    if (newMaterialId) {
      loadColors(newMaterialId);
    }
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== itemKey) return it;
        return {
          ...it,
          fabricSelections: it.fabricSelections.map((slot) => {
            if (slot.slotId !== slotId) return slot;
            return {
              ...slot,
              materialId: newMaterialId,
              materialColorId: null, // Reset color when fabric changes
            };
          }),
        };
      })
    );
  }

  function handleSlotColorChange(
    itemKey: string,
    slotId: string,
    newColorId: string
  ) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== itemKey) return it;
        return {
          ...it,
          fabricSelections: it.fabricSelections.map((slot) => {
            if (slot.slotId !== slotId) return slot;
            return {
              ...slot,
              materialColorId: newColorId || null,
            };
          }),
        };
      })
    );
  }

  function updateItem(key: string, patch: Partial<OrderItemRow>) {
    setItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, ...patch } : it))
    );
  }

  function toggleItemEmbroiderySpot(itemKey: string, spotName: string) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== itemKey) return it;
        const currentSpots = { ...(it.embroiderySpots || {}) };
        if (currentSpots[spotName] !== undefined) {
          delete currentSpots[spotName];
        } else {
          currentSpots[spotName] = spotName.toLowerCase().includes("punggung") ? 20000 : 5000;
        }
        return {
          ...it,
          embroiderySpots: currentSpots,
        };
      })
    );
  }

  function updateItemEmbroiderySpotCost(itemKey: string, spotName: string, costStr: string) {
    const cost = parseIDRInput(costStr);
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== itemKey) return it;
        return {
          ...it,
          embroiderySpots: {
            ...(it.embroiderySpots || {}),
            [spotName]: cost,
          },
        };
      })
    );
  }

  // Calculate order level totals
  const subtotal = items.reduce((sum, it) => {
    const qtyNum = Number(it.qty) || 0;
    const priceNum = parseIDRInput(it.price);
    return sum + qtyNum * priceNum;
  }, 0);

  const ongkirNumber = parseIDRInput(order.ongkir);
  const grandTotal = subtotal + ongkirNumber;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!order.customer_name.trim()) {
      setError("Nama customer wajib diisi.");
      return;
    }
    if (!order.sales_id) {
      setError("Sales wajib dipilih.");
      return;
    }

    if (!selectedPoBatchId) {
      setError("Pilih Batch PO untuk pesanan ini. Jika belum ada PO terbuka, buat terlebih dahulu di menu Batch PO.");
      return;
    }

    if (!editingOrder && selectedBatch?.status === "closed") {
      setError(`PO "${selectedBatch.name}" sudah ditutup. Silakan pilih Batch PO yang masih terbuka.`);
      return;
    }

    if (items.length === 0) {
      setError("Minimal tambahkan 1 item pesanan.");
      return;
    }

    // Validate each order item
    const parsedItems: {
      product_id: string;
      category_id?: string | null;
      name_item: string;
      bahan: null;
      qty: number;
      price: number;
      hpp_per_unit_snapshot: number;
      hpp_total_snapshot: number;
      embroidery_cost_per_unit: number;
      embroidery_details: any;
      fabricSelections: FabricSelection[];
      bomMaterials?: { material_id: string; quantity: number; unit?: string }[];
    }[] = [];

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const product = productsMap.get(it.productId);
      if (!product) {
        setError(`Item ke-${i + 1}: Model produk wajib dipilih.`);
        return;
      }

      const qtyNum = Number(it.qty);
      if (!qtyNum || qtyNum <= 0) {
        setError(`Item ke-${i + 1} (${product.name}): Qty harus lebih dari 0.`);
        return;
      }

      const priceNum = parseIDRInput(it.price);
      if (priceNum < 0) {
        setError(`Item ke-${i + 1} (${product.name}): Harga jual tidak valid.`);
        return;
      }

      // Check all fabric slots
      for (const slot of it.fabricSelections) {
        if (!slot.materialId) {
          setError(
            `Item ke-${i + 1} (${product.name}): Pilih kain untuk slot "${slot.slotLabel}".`
          );
          return;
        }
      }

      // Calculate HPP
      const fabricSelectionsPayload: FabricSelection[] = it.fabricSelections.map(
        (s) => {
          const mat = materialsMap[s.materialId];
          const unitPrice = mat?.price ?? 0;
          return {
            slotId: s.slotId,
            slotLabel: s.slotLabel,
            usageQty: s.usageQty,
            materialId: s.materialId,
            materialColorId: s.materialColorId,
            price: unitPrice,
            lineCost: unitPrice * s.usageQty,
          };
        }
      );

      const productWithBom: ProductWithBom = {
        ...product,
        materials: (product.product_materials ?? []).map((m: any) => ({
          material_id: m.material_id,
          quantity: m.quantity,
          materials: m.materials,
        })),
        fabricSlots: product.product_fabric_slots ?? [],
      };

      // Calculate Embroidery Cost
      let itemEmbroideryCost = 0;
      let itemEmbroideryDetails: any = null;

      if (it.embroideryMode === "flat") {
        itemEmbroideryCost = parseIDRInput(it.embroideryFlatCost);
        itemEmbroideryDetails = {
          mode: "flat",
          flatCost: itemEmbroideryCost,
          totalPerUnit: itemEmbroideryCost,
        };
      } else if (it.embroideryMode === "spots") {
        itemEmbroideryCost = Object.values(it.embroiderySpots || {}).reduce(
          (sum, c) => sum + c,
          0
        );
        itemEmbroideryDetails = {
          mode: "spots",
          spots: Object.entries(it.embroiderySpots || {}).map(([location, cost]) => ({
            id: crypto.randomUUID(),
            location,
            cost,
          })),
          totalPerUnit: itemEmbroideryCost,
        };
      } else {
        itemEmbroideryDetails = {
          mode: "none",
          totalPerUnit: 0,
        };
      }

      const hppBreakdown = calculateHpp(
        productWithBom,
        fabricSelectionsPayload,
        materialsMap,
        itemEmbroideryCost
      );

      const bomMaterialsPayload = (product.product_materials ?? []).map((m: any) => ({
        material_id: m.material_id,
        quantity: Number(m.quantity) || 0,
        unit: m.materials?.unit || materialsMap[m.material_id]?.unit || "pcs",
      }));

      parsedItems.push({
        product_id: product.id,
        category_id: product.category_id || it.categoryId || null,
        name_item: product.name,
        bahan: null,
        qty: qtyNum,
        price: priceNum,
        hpp_per_unit_snapshot: hppBreakdown.hppPerUnit,
        hpp_total_snapshot: hppBreakdown.hppPerUnit * qtyNum,
        embroidery_cost_per_unit: itemEmbroideryCost,
        embroidery_details: itemEmbroideryDetails,
        fabricSelections: fabricSelectionsPayload,
        bomMaterials: bomMaterialsPayload,
      });
    }

    // Validate payment if new order
    const paymentAmount = parseIDRInput(payment.amount);
    if (!editingOrder) {
      if (!paymentAmount || paymentAmount <= 0) {
        setError("Jumlah pembayaran pertama harus lebih dari 0.");
        return;
      }
      if (paymentAmount > grandTotal) {
        setError(
          `Jumlah pembayaran melebihi total pesanan (${formatIDR(grandTotal)}).`
        );
        return;
      }
      if (!payment.paymentDate) {
        setError("Tanggal pembayaran wajib diisi.");
        return;
      }
    }

    // Validasi Batch PO wajib dipilih
    if (!selectedPoBatchId) {
      setError("Pilih Batch PO untuk pesanan ini. Jika belum ada PO terbuka, buat terlebih dahulu di menu Batch PO.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        order: {
          sales_id: order.sales_id,
          customer_name: order.customer_name.trim(),
          order_date: order.order_date,
          ongkir: ongkirNumber,
          order_type: effectiveOrderType,
          is_order_type_manual_override: isManualOverride,
          po_batch_id: selectedPoBatchId,
        },
        items: parsedItems,
        payment: !editingOrder
          ? {
              amount: paymentAmount,
              paymentType: payment.paymentType,
              paymentDate: payment.paymentDate,
              paymentMethod: payment.paymentMethod,
            }
          : null,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal menyimpan order. Coba lagi."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-card border border-border shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {editingOrder ? "Edit Pesanan" : "Buat Pesanan Baru"}
            </h2>
            <p className="text-xs text-muted-foreground">
              Pilih model produk, kain per slot, dan pantau estimasi HPP serta margin.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {prefillData?.quotation_no && (
            <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3.5 text-sm">
              <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-primary">
                  Konversi dari Surat Penawaran: {prefillData.quotation_no}
                </p>
                <p className="text-xs text-muted-foreground">
                  Data pelanggan dan sales telah diisi otomatis. Silakan pilih model produk, spesifikasi bahan/kain, dan rincian pesanan final.
                </p>
                {prefillData.itemsSummary && (
                  <div className="text-xs text-slate-700 bg-white/80 p-2 rounded-lg border border-border/80 mt-1.5">
                    <span className="font-medium text-slate-900">Petunjuk item penawaran:</span> {prefillData.itemsSummary}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Header Data Order */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">
                Nama Customer
              </span>
              <input
                type="text"
                value={order.customer_name}
                onChange={(e) =>
                  setOrder((f) => ({ ...f, customer_name: e.target.value }))
                }
                placeholder="mis. Budi Santoso, PT Adhi Karya"
                className={inputClass}
                required
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">
                Sales
              </span>
              <select
                value={order.sales_id}
                onChange={(e) =>
                  setOrder((f) => ({ ...f, sales_id: e.target.value }))
                }
                className={inputClass}
                required
              >
                <option value="">Pilih sales</option>
                {salesList.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">
                Tanggal Order <span className="text-destructive">*</span>
              </span>
              <input
                type="date"
                value={order.order_date}
                onChange={(e) =>
                  setOrder((f) => ({ ...f, order_date: e.target.value }))
                }
                className={inputClass}
                required
              />
            </label>
          </div>

          {/* Pemilihan Batch PO (REVISI 1) */}
          <div className="rounded-xl border border-border bg-muted/20 p-3.5 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-primary" />
                <span>Batch Pre-Order (PO)</span> <span className="text-destructive">*</span>
              </label>

              {isManualPoSelected && !editingOrder && (
                <button
                  type="button"
                  onClick={() => {
                    setIsManualPoSelected(false);
                    const matching = openBatches.filter(
                      (b) => b.start_date <= order.order_date && b.end_date >= order.order_date
                    );
                    if (matching.length > 0) {
                      const sorted = [...matching].sort((a, b) => b.start_date.localeCompare(a.start_date));
                      setSelectedPoBatchId(sorted[0].id);
                    } else {
                      setSelectedPoBatchId('');
                    }
                  }}
                  className="text-[11px] text-primary hover:underline font-medium self-start sm:self-auto"
                >
                  Kembalikan ke Saran Otomatis
                </button>
              )}
            </div>

            <select
              value={selectedPoBatchId}
              disabled={Boolean(editingOrder && currentOrderBatch?.status === 'closed')}
              onChange={(e) => {
                setSelectedPoBatchId(e.target.value);
                setIsManualPoSelected(true);
              }}
              className={inputClass}
              required
            >
              <option value="">-- Pilih Batch PO --</option>
              {allAvailableBatches.map((b) => {
                const isClosed = b.status === 'closed';
                const hasQuota = b.quota_qty != null && b.quota_qty > 0;
                const totalQty = (b as any).total_qty ?? 0;
                return (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code}) — {formatPoDateRange(b.start_date, b.end_date)}
                    {hasQuota ? ` [Terisi: ${totalQty}/${b.quota_qty} pcs]` : ` [Terisi: ${totalQty} pcs]`}
                    {isClosed ? ' [DITUTUP]' : ''}
                  </option>
                );
              })}
            </select>

            {editingOrder && currentOrderBatch?.status === 'closed' && (
              <p className="text-[11px] text-muted-foreground">
                Batch PO ini sudah ditutup sehingga pesanan tidak dapat dipindahkan ke PO lain.
              </p>
            )}

            {/* Peringatan Tanggal di luar rentang PO (Kuning) */}
            {dateWarning && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <span>{dateWarning}</span>
              </div>
            )}

            {/* Peringatan Kuota Terlampaui (Kuning / Merah) */}
            {quotaWarning && (
              <div
                className={`rounded-lg border p-2.5 text-xs flex items-start gap-2 ${
                  quotaWarning.level === 'danger'
                    ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
                    : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                }`}
              >
                <AlertCircle
                  className={`h-4 w-4 shrink-0 mt-0.5 ${
                    quotaWarning.level === 'danger'
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                />
                <span>{quotaWarning.text}</span>
              </div>
            )}
          </div>

          {/* Banner Kategori Order (Satuan vs Prioritas) */}
          <div
            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-3.5 transition-all ${
              effectiveOrderType === "satuan"
                ? "border-amber-300 bg-amber-50/70 text-amber-950"
                : "border-emerald-300 bg-emerald-50/70 text-emerald-950"
            }`}
          >
            <div className="flex items-start sm:items-center gap-2.5">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg font-bold text-xs shrink-0 ${
                  effectiveOrderType === "satuan"
                    ? "bg-amber-200 text-amber-900"
                    : "bg-emerald-200 text-emerald-900"
                }`}
              >
                {effectiveOrderType === "satuan" ? "SAT" : "PRI"}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Kategori: {effectiveOrderType === "satuan" ? "Satuan (< 6 pcs)" : "Prioritas (≥ 6 pcs)"}
                  </span>
                  {isManualOverride && (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                      Override Manual
                    </span>
                  )}
                </div>
                <p className="text-[11px] opacity-90 mt-0.5">
                  Total Order: <strong>{totalOrderQty} pcs</strong> &middot;{" "}
                  {effectiveOrderType === "satuan"
                    ? "Upah jahit +Rp 10.000 / pcs, harga jual tier satuan aktif."
                    : "Upah jahit standar, harga jual tier prioritas aktif."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <button
                type="button"
                onClick={applyRecommendedPrices}
                className="rounded-lg bg-white/80 hover:bg-white px-2.5 py-1 text-[11px] font-semibold shadow-xs border border-border/70 transition"
                title="Terapkan harga satuan/prioritas rekomendasi ke semua baris item"
              >
                ⚡ Sesuaikan Harga Item
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!isManualOverride) {
                    setIsManualOverride(true);
                    setManualOrderType(effectiveOrderType === "satuan" ? "prioritas" : "satuan");
                  } else {
                    setIsManualOverride(false);
                  }
                }}
                className="rounded-lg bg-card hover:bg-muted px-2.5 py-1 text-[11px] font-medium border border-border transition text-foreground"
              >
                {isManualOverride ? "Reset Otomatis" : "Ubah Manual"}
              </button>
            </div>
          </div>

          {/* Item Order Lines */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div>
                <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Shirt className="h-4 w-4 text-primary" />
                  Daftar Item Pesanan
                </span>
                <span className="text-xs text-muted-foreground">
                  Alur: Kategori &rarr; Model Produk &rarr; Kain &rarr; Warna
                </span>
              </div>
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1 text-xs font-semibold text-primary hover:opacity-80"
              >
                <Plus className="h-3.5 w-3.5" /> Tambah Item
              </button>
            </div>

            <div className="space-y-4">
              {items.map((item, index) => {
                const product = productsMap.get(item.productId);
                const filteredProductsByCat = item.categoryId
                  ? activeProducts.filter((p) => p.category_id === item.categoryId || p.id === item.productId)
                  : activeProducts;

                // Live calculation for this row
                let rowHppPerUnit = 0;
                let rowFixedCost = 0;
                let rowFabricCost = 0;
                let rowEmbroideryCost = 0;

                if (item.embroideryMode === "flat") {
                  rowEmbroideryCost = parseIDRInput(item.embroideryFlatCost);
                } else if (item.embroideryMode === "spots") {
                  rowEmbroideryCost = Object.values(item.embroiderySpots || {}).reduce(
                    (sum, c) => sum + c,
                    0
                  );
                }

                if (product) {
                  const selections: FabricSelection[] = item.fabricSelections.map((s) => {
                    const mat = materialsMap[s.materialId];
                    const p = mat?.price ?? 0;
                    return {
                      slotId: s.slotId,
                      slotLabel: s.slotLabel,
                      usageQty: s.usageQty,
                      materialId: s.materialId,
                      materialColorId: s.materialColorId,
                      price: p,
                      lineCost: p * s.usageQty,
                    };
                  });

                  const productWithBom: ProductWithBom = {
                    ...product,
                    materials: (product.product_materials ?? []).map((m: any) => ({
                      material_id: m.material_id,
                      quantity: m.quantity,
                      materials: m.materials,
                    })),
                    fabricSlots: product.product_fabric_slots ?? [],
                  };

                  const breakdown = calculateHpp(
                    productWithBom,
                    selections,
                    materialsMap,
                    rowEmbroideryCost
                  );
                  rowHppPerUnit = breakdown.hppPerUnit;
                  rowFixedCost = breakdown.fixedMaterialsCost;
                  rowFabricCost = breakdown.fabricCost;
                }

                const qtyNumber = Number(item.qty) || 0;
                const priceNumber = parseIDRInput(item.price);
                const lineSubtotal = qtyNumber * priceNumber;
                const lineTotalHpp = qtyNumber * rowHppPerUnit;
                const marginPerUnit = priceNumber - rowHppPerUnit;
                const marginPercent =
                  priceNumber > 0 ? Math.round((marginPerUnit / priceNumber) * 100) : 0;

                return (
                  <div
                    key={item.key}
                    className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3"
                  >
                    {/* Item Header */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Item #{index + 1}
                      </span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(item.key)}
                          className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 transition-colors"
                          title="Hapus baris item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {/* Step 1 & 2: Kategori & Produk */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-foreground">
                          Kategori Produk
                        </span>
                        <select
                          value={item.categoryId}
                          onChange={(e) =>
                            handleCategoryChange(item.key, e.target.value)
                          }
                          className={inputClass}
                        >
                          <option value="">Semua Kategori</option>
                          {productCategories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                          {item.categoryId && !productCategories.some((c) => c.id === item.categoryId) && (
                            <option value={item.categoryId}>
                              Kategori Terpilih
                            </option>
                          )}
                        </select>
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-foreground">
                          Model Produk
                        </span>
                        <select
                          value={item.productId}
                          onChange={(e) =>
                            handleProductChange(item.key, e.target.value)
                          }
                          className={inputClass}
                          required
                        >
                          <option value="">Pilih Model Produk</option>
                          {filteredProductsByCat.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                          {item.productId && !filteredProductsByCat.some((p) => p.id === item.productId) && (
                            <option value={item.productId}>
                              {productsMap.get(item.productId)?.name || 'Model Terpilih'}
                            </option>
                          )}
                        </select>
                      </label>
                    </div>

                    {/* Step 3: Slot Kain */}
                    {product && item.fabricSelections.length > 0 && (
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-50/20 p-3 space-y-2">
                        <p className="text-xs font-semibold text-emerald-900 flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                          Pilihan Kain ({item.fabricSelections.length} Slot)
                        </p>

                        <div className="space-y-2">
                          {item.fabricSelections.map((slot) => {
                            // Filter fabric materials based on slot.fabricCategoryId
                            const validFabrics = materials.filter((m) => {
                              if (!m.material_categories?.is_fabric) return false;
                              if (slot.fabricCategoryId) {
                                return m.category_id === slot.fabricCategoryId;
                              }
                              return true;
                            });

                            const colors = colorsByMaterialId[slot.materialId] || [];

                            return (
                              <div
                                key={slot.slotId}
                                className="grid grid-cols-12 gap-2 rounded-md border border-emerald-100 bg-card p-2.5 items-center"
                              >
                                <div className="col-span-12 sm:col-span-3">
                                  <span className="text-xs font-semibold text-foreground">
                                    {slot.slotLabel}
                                  </span>
                                  <span className="block text-[10px] text-muted-foreground">
                                    Kebutuhan: {slot.usageQty} m
                                  </span>
                                </div>

                                <div
                                  className={`col-span-12 ${
                                    slot.materialId
                                      ? "sm:col-span-5"
                                      : "sm:col-span-9"
                                  }`}
                                >
                                  <select
                                    value={slot.materialId}
                                    onChange={(e) =>
                                      handleSlotMaterialChange(
                                        item.key,
                                        slot.slotId,
                                        e.target.value
                                      )
                                    }
                                    className={`${inputClass} text-xs py-1.5 h-8`}
                                    required
                                  >
                                    <option value="">Pilih Jenis Kain</option>
                                    {validFabrics.map((fab) => (
                                      <option key={fab.id} value={fab.id}>
                                        {fab.name} ({formatIDR(fab.price)}/
                                        {fab.unit})
                                      </option>
                                    ))}
                                    {slot.materialId && !validFabrics.some((fab) => fab.id === slot.materialId) && (
                                      <option value={slot.materialId}>
                                        {materialsMap[slot.materialId]?.name || 'Kain Terpilih'}
                                      </option>
                                    )}
                                  </select>
                                </div>

                                {slot.materialId && (
                                  <div className="col-span-12 sm:col-span-4">
                                    <select
                                      value={slot.materialColorId || ""}
                                      onChange={(e) =>
                                        handleSlotColorChange(
                                          item.key,
                                          slot.slotId,
                                          e.target.value
                                        )
                                      }
                                      className={`${inputClass} text-xs py-1.5 h-8`}
                                    >
                                      <option value="">{colors.length === 0 ? "Memuat warna..." : "Pilih Warna"}</option>
                                      {colors.map((c) => (
                                        <option key={c.id} value={c.id}>
                                          {c.color_name}
                                        </option>
                                      ))}
                                      {slot.materialColorId && !colors.some((c) => c.id === slot.materialColorId) && (
                                        <option value={slot.materialColorId}>
                                          Warna Terpilih
                                        </option>
                                      )}
                                    </select>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Step 3.5: Estimasi Biaya Bordir / Makloon */}
                    {product && (
                      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-1.5">
                            <Scissors className="h-3.5 w-3.5 text-primary" />
                            <span className="text-xs font-semibold text-foreground">
                              Estimasi Biaya Bordir / Makloon
                            </span>
                            {rowEmbroideryCost > 0 && (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                                {formatIDR(rowEmbroideryCost)} / pcs
                              </span>
                            )}
                          </div>

                          <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
                            <button
                              type="button"
                              onClick={() => updateItem(item.key, { embroideryMode: "none" })}
                              className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${
                                item.embroideryMode === "none"
                                  ? "bg-primary text-primary-foreground shadow-xs"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              Tanpa Bordir
                            </button>
                            <button
                              type="button"
                              onClick={() => updateItem(item.key, { embroideryMode: "flat" })}
                              className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${
                                item.embroideryMode === "flat"
                                  ? "bg-primary text-primary-foreground shadow-xs"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              Flat / Pcs
                            </button>
                            <button
                              type="button"
                              onClick={() => updateItem(item.key, { embroideryMode: "spots" })}
                              className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${
                                item.embroideryMode === "spots"
                                  ? "bg-primary text-primary-foreground shadow-xs"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              Pilih Titik
                            </button>
                          </div>
                        </div>

                        {item.embroideryMode === "flat" && (
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                            <span className="text-[11px] text-muted-foreground">
                              Biaya bordir flat per pcs untuk seluruh baju:
                            </span>
                            <div className="w-full sm:w-44">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={item.embroideryFlatCost}
                                onChange={(e) =>
                                  updateItem(item.key, {
                                    embroideryFlatCost: formatIDRInput(e.target.value),
                                  })
                                }
                                className={`${inputClass} text-right text-xs py-1 h-8 font-semibold`}
                                placeholder="0"
                              />
                            </div>
                          </div>
                        )}

                        {item.embroideryMode === "spots" && (
                          <div className="space-y-2 pt-1">
                            <div className="flex flex-wrap gap-1">
                              {EMBROIDERY_PRESET_SPOTS.map((spot) => {
                                const isSelected = item.embroiderySpots?.[spot] !== undefined;
                                return (
                                  <button
                                    key={spot}
                                    type="button"
                                    onClick={() => toggleItemEmbroiderySpot(item.key, spot)}
                                    className={`rounded border px-2 py-0.5 text-[11px] font-medium transition ${
                                      isSelected
                                        ? "border-primary bg-primary text-primary-foreground shadow-xs"
                                        : "border-border bg-card text-foreground hover:border-primary/50"
                                    }`}
                                  >
                                    {isSelected ? `✓ ${spot}` : `+ ${spot}`}
                                  </button>
                                );
                              })}
                            </div>

                            {item.embroiderySpots && Object.keys(item.embroiderySpots).length > 0 && (
                              <div className="grid gap-1.5 sm:grid-cols-2 pt-1.5 border-t border-border/50">
                                {Object.entries(item.embroiderySpots).map(([spot, cost]) => (
                                  <div
                                    key={spot}
                                    className="flex items-center justify-between gap-2 rounded bg-card px-2 py-1 text-xs border border-border"
                                  >
                                    <span className="font-medium text-foreground text-[11px]">
                                      {spot}
                                    </span>
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] text-muted-foreground">Rp</span>
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={formatIDRInput(cost)}
                                        onChange={(e) =>
                                          updateItemEmbroiderySpotCost(item.key, spot, e.target.value)
                                        }
                                        className="w-20 rounded border border-border bg-background px-1.5 py-0.5 text-right text-xs font-semibold focus:border-primary focus:outline-none"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => toggleItemEmbroiderySpot(item.key, spot)}
                                        className="text-muted-foreground hover:text-rose-600"
                                        title="Hapus titik bordir"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Step 4 & 5: Qty, Harga Jual & Live HPP */}
                    <div className="grid grid-cols-12 gap-3 items-end">
                      <div className="col-span-12 sm:col-span-3">
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-foreground">
                            Qty (pcs)
                          </span>
                          <input
                            type="number"
                            min="1"
                            value={item.qty}
                            onChange={(e) =>
                              updateItem(item.key, { qty: e.target.value })
                            }
                            placeholder="Qty"
                            className={inputClass}
                            required
                          />
                        </label>
                      </div>

                      <div className="col-span-12 sm:col-span-4">
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-foreground">
                            Harga Jual / pcs (Rp)
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={item.price}
                            onChange={(e) =>
                              updateItem(item.key, {
                                price: formatIDRInput(e.target.value),
                              })
                            }
                            placeholder="0"
                            className={inputClass}
                            required
                          />
                        </label>
                      </div>

                      <div className="col-span-12 sm:col-span-5 flex flex-col justify-end">
                        <div className="rounded-lg bg-muted/40 p-2.5 text-right">
                          <div className="text-xs text-muted-foreground">
                            Subtotal Harga Jual:
                          </div>
                          <div className="text-base font-bold tabular-nums text-foreground">
                            {formatIDR(lineSubtotal)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Live HPP & Margin Card */}
                    {product && (
                      <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <span>
                            Estimasi HPP:{" "}
                            <strong className="text-foreground">
                              {formatIDR(rowHppPerUnit)}
                            </strong>{" "}
                            / pcs
                            {rowEmbroideryCost > 0 && (
                              <span className="text-emerald-700 font-medium ml-1">
                                (termasuk bordir {formatIDR(rowEmbroideryCost)})
                              </span>
                            )}
                          </span>
                          <span>·</span>
                          <span>
                            Total HPP:{" "}
                            <strong className="text-foreground">
                              {formatIDR(lineTotalHpp)}
                            </strong>
                          </span>
                        </div>

                        {priceNumber > 0 && (
                          <div
                            className={`font-medium ${
                              marginPerUnit >= 0
                                ? "text-emerald-700"
                                : "text-rose-600"
                            }`}
                          >
                            Margin: {formatIDR(marginPerUnit)} ({marginPercent}%)
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ringkasan Biaya & Ongkir */}
          <div className="space-y-2 rounded-xl bg-muted/30 border border-border p-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">
                Ongkos Kirim (Rp)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={order.ongkir}
                onChange={(e) =>
                  setOrder((f) => ({
                    ...f,
                    ongkir: formatIDRInput(e.target.value),
                  }))
                }
                placeholder="0"
                className={`${inputClass} w-36 py-1.5 text-right`}
              />
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Subtotal Item</span>
              <span className="tabular-nums font-medium text-foreground">
                {formatIDR(subtotal)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold text-foreground">
              <span>Grand Total</span>
              <span className="tabular-nums text-primary text-lg">
                {formatIDR(grandTotal)}
              </span>
            </div>
          </div>

          {/* Pembayaran Pertama (jika order baru) */}
          {!editingOrder && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              <span className="block text-sm font-semibold text-foreground">
                Pembayaran Pertama
              </span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Jumlah Dibayar (Rp)
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={payment.amount}
                    onChange={(e) =>
                      setPayment((value) => ({
                        ...value,
                        amount: formatIDRInput(e.target.value),
                      }))
                    }
                    placeholder="0"
                    className={inputClass}
                    required
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Jenis Pembayaran
                  </span>
                  <select
                    value={payment.paymentType}
                    onChange={(e) =>
                      setPayment((value) => ({
                        ...value,
                        paymentType: e.target.value,
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="dp">DP (Uang Muka)</option>
                    <option value="pelunasan">Pelunasan</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Tanggal Pembayaran
                  </span>
                  <input
                    type="date"
                    value={payment.paymentDate}
                    onChange={(e) =>
                      setPayment((value) => ({
                        ...value,
                        paymentDate: e.target.value,
                      }))
                    }
                    className={inputClass}
                    required
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Metode Pembayaran
                  </span>
                  <select
                    value={payment.paymentMethod}
                    onChange={(e) =>
                      setPayment((value) => ({
                        ...value,
                        paymentMethod: e.target.value,
                      }))
                    }
                    className={inputClass}
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method.value} value={method.value}>
                        {method.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting
                ? "Menyimpan..."
                : editingOrder
                ? "Simpan Perubahan"
                : "Buat Order"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
