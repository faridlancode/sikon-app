import { useState } from "react";
import {
  Package,
  History,
  PackagePlus,
  Truck,
  Warehouse,
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

  const tabs = [
    { key: "stock" as const, label: "Stok Material", icon: Package },
    { key: "requests" as const, label: "Permintaan Restock", icon: PackagePlus, count: pendingRequests.length },
    { key: "receive" as const, label: "Terima Barang", icon: Truck, count: orderedPurchases.length },
    { key: "history" as const, label: "Riwayat Mutasi", icon: History },
  ];

  return (
    <AppShell
      title="Gudang & Inventori"
      subtitle="Kelola stok fisik kain & aksesoris, ajukan restock, serta konfirmasi penerimaan barang dari supplier"
      actions={
        <Button
          onClick={() => setActiveTab("receive")}
          className="gap-2 shadow-sm"
        >
          <Truck className="h-4 w-4" />
          <span>Terima Barang</span>
          {orderedPurchases.length > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary-foreground/90 px-1.5 text-[10px] font-bold text-primary">
              {orderedPurchases.length}
            </span>
          )}
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-xs font-semibold text-primary">
          <Warehouse className="h-4 w-4" />
          Operasional gudang
        </div>
        {/* Navigation Tabs */}
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1 shadow-soft">
          {tabs.map(({ key, label, icon: Icon, count }) => (
            <Button
              key={key}
              type="button"
              variant={activeTab === key ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab(key)}
              className="h-9 shrink-0 gap-2 px-3 text-xs"
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
              {Boolean(count) && (
                <span className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${activeTab === key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-accent text-accent-foreground"}`}>
                  {count}
                </span>
              )}
            </Button>
          ))}
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
