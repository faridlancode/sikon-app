import { useState } from "react";
import {
  Package,
  Clock,
  Receipt,
  History,
  PackagePlus,
  Layers,
  AlertTriangle,
} from "lucide-react";
import AppShell from "../components/layout/AppShell";
import Button from "../components/ui/button";
import StockTable from "../components/warehouse/StockTable";
import PendingRequestsTab from "../components/warehouse/PendingRequestsTab";
import ReceiveGoodsModal from "../components/warehouse/ReceiveGoodsModal";
import UnpaidReceiptsTab from "../components/warehouse/UnpaidReceiptsTab";
import StockHistoryTab from "../components/warehouse/StockHistoryTab";
import { useMaterials } from "../hooks/useMaterials";
import { useMaterialCategories } from "../hooks/useMaterialCategories";
import { useStockMovements } from "../hooks/useStockMovements";
import { usePurchaseReceipts } from "../hooks/usePurchaseReceipts";

type TabKey = "stock" | "pending" | "receipts" | "history";

export default function WarehousePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("stock");
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);

  // Hooks
  const {
    materials,
    loading: materialsLoading,
    refetch: refetchMaterials,
  } = useMaterials();
  const { categories } = useMaterialCategories();
  const {
    movements,
    pendingMovements,
    loading: movementsLoading,
    refetch: refetchMovements,
    confirmMovement,
    cancelMovement,
    adjustStock,
    updateMinimumStock,
  } = useStockMovements();
  const {
    receipts,
    unpaidReceipts,
    loading: receiptsLoading,
    refetch: refetchReceipts,
    createReceipt,
    payReceipt,
  } = usePurchaseReceipts();

  const handleAdjustStock = async (payload: {
    material_id: string;
    material_color_id?: string | null;
    new_qty: number;
    unit: string;
    notes?: string;
    minimum_stock: number;
  }) => {
    await adjustStock({
      material_id: payload.material_id,
      material_color_id: payload.material_color_id,
      new_qty: payload.new_qty,
      unit: payload.unit,
      notes: payload.notes,
    });
    await updateMinimumStock({
      material_id: payload.material_id,
      material_color_id: payload.material_color_id,
      minimum_stock: payload.minimum_stock,
    });
    refetchMaterials();
    refetchMovements();
  };

  const handleConfirmMovement = async (movementId: string) => {
    await confirmMovement(movementId);
    refetchMaterials();
    refetchMovements();
  };

  const handleCancelMovement = async (movementId: string) => {
    await cancelMovement(movementId);
    refetchMovements();
  };

  const handleCreateReceipt = async (payload: any) => {
    await createReceipt(payload);
    refetchMaterials();
    refetchMovements();
    refetchReceipts();
  };

  const handlePayReceipt = async (
    receiptId: string,
    paymentDate: string,
    paymentMethod?: string
  ) => {
    await payReceipt(receiptId, paymentDate, paymentMethod);
    refetchReceipts();
  };

  return (
    <AppShell
      title="Gudang & Inventori"
      subtitle="Kelola stok fisik kain & aksesoris, validasi pengambilan pesanan, serta pembelian supplier"
      actions={
        <Button
          onClick={() => setReceiveModalOpen(true)}
          className="gap-2 bg-primary text-primary-foreground shadow-sm hover:opacity-95"
        >
          <PackagePlus className="h-4 w-4" />
          <span>Terima Barang</span>
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Navigation Tabs */}
        <div className="flex border-b border-border overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("stock")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === "stock"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            <Package className="h-4 w-4" />
            <span>Stok Material</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("pending")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === "pending"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            <Clock className="h-4 w-4" />
            <span>Permintaan Pending</span>
            {pendingMovements.length > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white shadow-xs">
                {pendingMovements.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("receipts")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === "receipts"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            <Receipt className="h-4 w-4" />
            <span>Tagihan Supplier</span>
            {unpaidReceipts.length > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white shadow-xs">
                {unpaidReceipts.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === "history"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            <History className="h-4 w-4" />
            <span>Riwayat Mutasi</span>
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "stock" && (
          <StockTable
            materials={materials}
            categories={categories}
            loading={materialsLoading}
            onRefresh={() => {
              refetchMaterials();
              refetchMovements();
            }}
            onAdjustStock={handleAdjustStock}
          />
        )}

        {activeTab === "pending" && (
          <PendingRequestsTab
            pendingMovements={pendingMovements}
            loading={movementsLoading}
            onConfirm={handleConfirmMovement}
            onCancel={handleCancelMovement}
          />
        )}

        {activeTab === "receipts" && (
          <UnpaidReceiptsTab
            receipts={receipts}
            loading={receiptsLoading}
            onPayReceipt={handlePayReceipt}
          />
        )}

        {activeTab === "history" && (
          <StockHistoryTab
            movements={movements}
            loading={movementsLoading}
          />
        )}
      </div>

      {/* Modal Penerimaan Barang */}
      <ReceiveGoodsModal
        open={receiveModalOpen}
        onClose={() => setReceiveModalOpen(false)}
        materials={materials}
        onSubmit={handleCreateReceipt}
      />
    </AppShell>
  );
}
