import { useState } from "react";
import {
  Package,
  History,
  PackagePlus,
  Truck,
  Warehouse,
  ArrowUpRight,
} from "lucide-react";
import AppShell from "../components/layout/AppShell";
import Button from "../components/ui/button";
import StockTable from "../components/warehouse/StockTable";
import StockHistoryTab from "../components/warehouse/StockHistoryTab";
import StockRequestsTab from "../components/warehouse/StockRequestsTab";
import PendingRequestsTab from "../components/warehouse/PendingRequestsTab";
import ReceiveOrdersTab from "../components/warehouse/ReceiveOrdersTab";
import { useMaterials } from "../hooks/useMaterials";
import { useMaterialCategories } from "../hooks/useMaterialCategories";
import { useStockMovements } from "../hooks/useStockMovements";
import { useStockRequests } from "../hooks/useStockRequests";
import { useSupplierPurchases } from "../hooks/useSupplierPurchases";
import { usePurchasingReports } from "../hooks/usePurchasingReports";
import { useStaff } from "../hooks/useStaff";

type TabKey = "stock" | "requests" | "outgoing" | "receive" | "history";

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
    pendingMovements,
    loading: movementsLoading,
    refetch: refetchMovements,
    confirmMovement,
    cancelMovement,
    adjustStock,
    updateMinimumStock,
  } = useStockMovements();
  const {
    requests,
    draftAutoRequests,
    pendingRequests,
    loading: requestsLoading,
    refetch: refetchRequests,
    createRequest,
    confirmDraftAutoRequest,
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
  const {
    reports: purchasingReports,
    loading: purchasingReportsLoading,
    refetch: refetchReports,
    confirmReportReceipt,
  } = usePurchasingReports();
  const { activeStaff } = useStaff();

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

  const handleReceivePurchase = async (purchaseId: string, receivedBy?: string) => {
    await receivePurchase(purchaseId, receivedBy);
    refetchMaterials();
    refetchMovements();
    refetchRequests();
    refetchSupplierPurchases();
  };

  const handleConfirmReportReceipt = async (reportId: string, receivedBy?: string) => {
    await confirmReportReceipt(reportId, receivedBy);
    refetchMaterials();
    refetchMovements();
    refetchRequests();
    refetchReports();
  };

  const pendingOutgoingMovements = movements.filter(
    (m) => m.movement_type === "out" && m.status === "pending"
  );

  const pendingSpjReports = purchasingReports.filter(
    (r) => r.status === "financially_approved"
  );

  const totalNeedsAttentionRequests = draftAutoRequests.length + pendingRequests.length;
  const totalNeedsReceive = orderedPurchases.length + pendingSpjReports.length;

  const tabs = [
    { key: "stock" as const, label: "Stok Material", icon: Package },
    {
      key: "requests" as const,
      label: "Permintaan Restock",
      icon: PackagePlus,
      count: totalNeedsAttentionRequests,
    },
    {
      key: "outgoing" as const,
      label: "Barang Keluar",
      icon: ArrowUpRight,
      count: pendingOutgoingMovements.length,
    },
    {
      key: "receive" as const,
      label: "Terima Barang",
      icon: Truck,
      count: totalNeedsReceive,
    },
    { key: "history" as const, label: "Riwayat Mutasi", icon: History },
  ];

  return (
    <AppShell
      title="Gudang & Inventori"
      subtitle="Kelola stok fisik kain & aksesoris, ajukan restock, penyerahan barang keluar, serta konfirmasi penerimaan barang supplier"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setActiveTab("outgoing")}
            className="gap-2 shadow-sm"
          >
            <ArrowUpRight className="h-4 w-4 text-rose-600" />
            <span>Barang Keluar</span>
            {pendingOutgoingMovements.length > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-100 text-rose-800 px-1.5 text-[10px] font-bold">
                {pendingOutgoingMovements.length}
              </span>
            )}
          </Button>

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
        </div>
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
                <span
                  className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                    activeTab === key
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-accent text-accent-foreground"
                  }`}
                >
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
            onConfirmDraftAuto={async (id, payload) => {
              await confirmDraftAutoRequest(id, payload);
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

        {activeTab === "outgoing" && (
          <PendingRequestsTab
            pendingMovements={pendingMovements}
            loading={movementsLoading}
            onConfirm={async (id, takenBy, recordedBy) => {
              await confirmMovement(id, takenBy, recordedBy);
              refetchMaterials();
              refetchMovements();
            }}
            onCancel={async (id) => {
              await cancelMovement(id);
              refetchMovements();
            }}
          />
        )}

        {activeTab === "receive" && (
          <ReceiveOrdersTab
            purchases={supplierPurchases}
            reports={purchasingReports}
            staffList={activeStaff}
            loading={supplierPurchasesLoading || purchasingReportsLoading}
            onReceivePurchase={handleReceivePurchase}
            onConfirmReportReceipt={handleConfirmReportReceipt}
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
