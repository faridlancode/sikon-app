import { useState } from "react";
import {
  Package,
  History,
  PackagePlus,
  Truck,
} from "lucide-react";
import AppShell from "../components/layout/AppShell";
import Button from "../components/ui/button";
import StockTable from "../components/warehouse/StockTable";
import StockHistoryTab from "../components/warehouse/StockHistoryTab";
import StockRequestsTab from "../components/warehouse/StockRequestsTab";
import ReceiveOrdersTab from "../components/warehouse/ReceiveOrdersTab";
import { useMaterials } from "../hooks/useMaterials";
import { useMaterialCategories } from "../hooks/useMaterialCategories";
import { useStockMovements } from "../hooks/useStockMovements";
import { useStockRequests } from "../hooks/useStockRequests";
import { useSupplierPurchases } from "../hooks/useSupplierPurchases";

type TabKey = "stock" | "requests" | "receive" | "history";

export default function WarehousePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("stock");

  // Hooks
  const {
    materials,
    loading: materialsLoading,
    refetch: refetchMaterials,
  } = useMaterials();
  const { categories } = useMaterialCategories();
  const {
    movements,
    loading: movementsLoading,
    refetch: refetchMovements,
    adjustStock,
    updateMinimumStock,
  } = useStockMovements();
  const {
    requests,
    pendingRequests,
    loading: requestsLoading,
    refetch: refetchRequests,
    createRequest,
    updateRequestStatus,
    deleteRequest,
  } = useStockRequests();
  const {
    purchases: supplierPurchases,
    orderedPurchases,
    loading: supplierPurchasesLoading,
    refetch: refetchSupplierPurchases,
    receivePurchase,
  } = useSupplierPurchases();

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

  const handleReceivePurchase = async (purchaseId: string) => {
    await receivePurchase(purchaseId);
    refetchMaterials();
    refetchMovements();
    refetchRequests();
    refetchSupplierPurchases();
  };

  return (
    <AppShell
      title="Gudang & Inventori"
      subtitle="Kelola stok fisik kain & aksesoris, ajukan restock, serta konfirmasi penerimaan barang dari supplier"
      actions={
        <Button
          onClick={() => setActiveTab("receive")}
          className={`gap-2 shadow-sm ${
            activeTab === "receive"
              ? "bg-emerald-700 text-white"
              : "bg-emerald-600 text-white hover:bg-emerald-700"
          }`}
        >
          <Truck className="h-4 w-4" />
          <span>Terima Barang</span>
          {orderedPurchases.length > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white px-1.5 text-[10px] font-bold text-emerald-800 shadow-xs">
              {orderedPurchases.length}
            </span>
          )}
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
            onClick={() => setActiveTab("requests")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === "requests"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            <PackagePlus className="h-4 w-4" />
            <span>Permintaan Restock</span>
            {pendingRequests.length > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white shadow-xs">
                {pendingRequests.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("receive")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === "receive"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            <Truck className="h-4 w-4" />
            <span>Terima Barang</span>
            {orderedPurchases.length > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-bold text-white shadow-xs">
                {orderedPurchases.length}
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

        {activeTab === "requests" && (
          <StockRequestsTab
            requests={requests}
            loading={requestsLoading}
            onCreateRequest={async (payload) => {
              await createRequest(payload);
              refetchRequests();
            }}
            onUpdateStatus={async (id, status, fulfillmentType) => {
              await updateRequestStatus(id, status, fulfillmentType);
              refetchRequests();
            }}
            onDeleteRequest={async (id) => {
              await deleteRequest(id);
              refetchRequests();
            }}
          />
        )}

        {activeTab === "receive" && (
          <ReceiveOrdersTab
            purchases={supplierPurchases}
            loading={supplierPurchasesLoading}
            onReceivePurchase={handleReceivePurchase}
          />
        )}

        {activeTab === "history" && (
          <StockHistoryTab
            movements={movements}
            loading={movementsLoading}
          />
        )}
      </div>
    </AppShell>
  );
}
