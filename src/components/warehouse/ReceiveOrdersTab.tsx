import { useState, useMemo } from "react";
import {
  Truck,
  CheckCircle2,
  Clock,
  Search,
  Package,
  Layers,
  Calendar,
  User,
  AlertCircle,
  X,
  ArrowRight,
  Info,
  ShoppingBag,
  FileImage,
  ExternalLink,
  Check,
} from "lucide-react";
import Button from "../ui/button";
import { inputClass } from "../ui/FormField";
import { formatIDR } from "../../utils/formatCurrency";
import type { SupplierPurchase, PurchasingReport, Staff } from "../../types";

interface ReceiveOrdersTabProps {
  purchases: SupplierPurchase[];
  reports?: PurchasingReport[];
  staffList?: Staff[];
  loading: boolean;
  onReceivePurchase: (purchaseId: string, receivedBy?: string) => Promise<void>;
  onConfirmReportReceipt?: (reportId: string, receivedBy?: string) => Promise<void>;
}

export default function ReceiveOrdersTab({
  purchases,
  reports = [],
  staffList = [],
  loading,
  onReceivePurchase,
  onConfirmReportReceipt,
}: ReceiveOrdersTabProps) {
  const [sourceTab, setSourceTab] = useState<"supplier" | "spj">("spj");
  const [statusFilter, setStatusFilter] = useState<"pending" | "all" | "received">("pending");
  const [searchQuery, setSearchQuery] = useState("");

  // Confirmation modal states
  const [confirmingPurchase, setConfirmingPurchase] = useState<SupplierPurchase | null>(null);
  const [confirmingReport, setConfirmingReport] = useState<PurchasingReport | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filter staff with role 'Gudang'
  const warehouseStaff = useMemo(() => {
    const ws = staffList.filter((s) => s.role === "Gudang");
    return ws.length > 0 ? ws : staffList;
  }, [staffList]);

  // Counts
  const pendingSupplierCount = useMemo(
    () => purchases.filter((p) => p.status === "ordered").length,
    [purchases]
  );
  const pendingSpjCount = useMemo(
    () => reports.filter((r) => r.status === "financially_approved").length,
    [reports]
  );

  // Filtered Purchases (Supplier)
  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      if (statusFilter === "pending" && p.status !== "ordered") return false;
      if (statusFilter === "received" && p.status !== "received") return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchSupplier = p.supplier_name.toLowerCase().includes(query);
        const matchStaff = p.staff?.name?.toLowerCase().includes(query) ?? false;
        const matchItems =
          p.supplier_purchase_items?.some(
            (item) =>
              item.materials?.name?.toLowerCase().includes(query) ||
              item.material_colors?.color_name?.toLowerCase().includes(query)
          ) ?? false;

        return matchSupplier || matchStaff || matchItems;
      }
      return true;
    });
  }, [purchases, statusFilter, searchQuery]);

  // Filtered Reports (SPJ)
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      // Hanya tampilkan yang sudah financially_approved atau goods_received
      if (r.status !== "financially_approved" && r.status !== "goods_received" && r.status !== "approved") {
        return false;
      }
      if (statusFilter === "pending" && r.status !== "financially_approved") return false;
      if (statusFilter === "received" && r.status !== "goods_received" && r.status !== "approved") return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchStaff = r.staff?.name?.toLowerCase().includes(query) ?? false;
        const matchItems =
          r.purchasing_report_items?.some(
            (item) =>
              item.materials?.name?.toLowerCase().includes(query) ||
              item.material_colors?.color_name?.toLowerCase().includes(query) ||
              item.description?.toLowerCase().includes(query)
          ) ?? false;

        return matchStaff || matchItems;
      }
      return true;
    });
  }, [reports, statusFilter, searchQuery]);

  const handleOpenConfirmPurchase = (purchase: SupplierPurchase) => {
    setConfirmingPurchase(purchase);
    setSelectedStaffId(warehouseStaff[0]?.id || "");
    setErrorMessage(null);
  };

  const handleOpenConfirmReport = (report: PurchasingReport) => {
    setConfirmingReport(report);
    setSelectedStaffId(warehouseStaff[0]?.id || "");
    setErrorMessage(null);
  };

  const handleConfirmReceivePurchase = async () => {
    if (!confirmingPurchase) return;
    try {
      setProcessingId(confirmingPurchase.id);
      setErrorMessage(null);
      await onReceivePurchase(confirmingPurchase.id, selectedStaffId || undefined);
      setConfirmingPurchase(null);
    } catch (err) {
      console.error("Gagal menerima barang supplier:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "Terjadi kesalahan saat memproses penerimaan barang."
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleConfirmReceiveReport = async () => {
    if (!confirmingReport || !onConfirmReportReceipt) return;
    try {
      setProcessingId(confirmingReport.id);
      setErrorMessage(null);
      await onConfirmReportReceipt(confirmingReport.id, selectedStaffId || undefined);
      setConfirmingReport(null);
    } catch (err) {
      console.error("Gagal menerima barang SPJ:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "Terjadi kesalahan saat memproses penerimaan barang SPJ."
      );
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Informative Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-accent/60 p-4 text-xs text-accent-foreground shadow-soft">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="font-semibold text-foreground">
            Alur Penerimaan Fisik Barang Baku & Tambah Stok
          </p>
          <p className="leading-relaxed text-muted-foreground">
            Stok inventori di sistem <strong>HANYA</strong> bertambah setelah Staf Gudang memeriksa fisik barang dan mengklik tombol <span className="font-semibold text-emerald-700 dark:text-emerald-400">"Konfirmasi Terima Barang"</span> pada halaman ini.
          </p>
        </div>
      </div>

      {/* Main Source Switcher Tabs (Dari SPJ vs Dari Supplier) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSourceTab("spj")}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-all ${
              sourceTab === "spj"
                ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300 shadow-xs"
                : "border-border bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            <ShoppingBag className="h-4 w-4" />
            <span>Dari SPJ Belanja Ritel</span>
            {pendingSpjCount > 0 && (
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                {pendingSpjCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSourceTab("supplier")}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-all ${
              sourceTab === "supplier"
                ? "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300 shadow-xs"
                : "border-border bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            <Truck className="h-4 w-4" />
            <span>Dari Direct Supplier</span>
            {pendingSupplierCount > 0 && (
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">
                {pendingSupplierCount}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari staf, supplier, atau bahan..."
            className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Status Subfilter */}
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card p-1">
        <Button
          type="button"
          onClick={() => setStatusFilter("pending")}
          variant={statusFilter === "pending" ? "default" : "ghost"}
          size="sm"
          className="h-8 gap-1.5 px-3 text-xs"
        >
          <Clock className="h-3.5 w-3.5" />
          <span>Menunggu Penerimaan</span>
          {sourceTab === "spj" ? (
            pendingSpjCount > 0 && (
              <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-bold text-amber-900 dark:text-amber-200">
                {pendingSpjCount}
              </span>
            )
          ) : (
            pendingSupplierCount > 0 && (
              <span className="ml-1 rounded-full bg-blue-500/20 px-1.5 py-0.2 text-[10px] font-bold text-blue-900 dark:text-blue-200">
                {pendingSupplierCount}
              </span>
            )
          )}
        </Button>

        <Button
          type="button"
          onClick={() => setStatusFilter("received")}
          variant={statusFilter === "received" ? "default" : "ghost"}
          size="sm"
          className="h-8 gap-1.5 px-3 text-xs"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Sudah Diterima</span>
        </Button>

        <Button
          type="button"
          onClick={() => setStatusFilter("all")}
          variant={statusFilter === "all" ? "default" : "ghost"}
          size="sm"
          className="h-8 gap-1.5 px-3 text-xs"
        >
          <span>Semua Data</span>
        </Button>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button type="button" onClick={() => setErrorMessage(null)} className="p-1 hover:opacity-75">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* CONTENT: TAB 1 - DARI SPJ BELANJA */}
      {sourceTab === "spj" && (
        <div>
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-4 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <ShoppingBag className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm font-medium text-foreground">
                Tidak ada barang SPJ yang menunggu penerimaan
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Barang dari SPJ yang telah disetujui Finance akan muncul di sini untuk dikonfirmasi staf Gudang.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr className="border-b border-border text-left text-[11px] font-semibold text-muted-foreground">
                    <th className="px-4 py-3">Tgl & Kode SPJ</th>
                    <th className="px-4 py-3">Staf Purchasing</th>
                    <th className="px-4 py-3">Material yang Dibeli</th>
                    <th className="px-4 py-3">Foto Nota</th>
                    <th className="px-4 py-3">Status Fisik</th>
                    <th className="px-4 py-3 text-right">Aksi Penerimaan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredReports.map((report) => {
                    const isPendingReceive = report.status === "financially_approved";

                    return (
                      <tr key={report.id} className="transition-colors hover:bg-muted/40">
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-foreground">#{report.id.slice(0, 8)}</p>
                          <p className="text-xs text-muted-foreground">{report.report_date}</p>
                        </td>

                        <td className="px-4 py-3.5">
                          <p className="font-medium text-foreground">{report.staff?.name || "Staf Purchasing"}</p>
                          <p className="text-[11px] text-muted-foreground">{report.staff?.role || "Purchasing"}</p>
                        </td>

                        <td className="px-4 py-3.5 max-w-xs">
                          <div className="space-y-1">
                            {report.purchasing_report_items?.map((item, idx) => (
                              <div key={item.id || idx} className="text-xs">
                                <span className="font-medium text-foreground">
                                  {item.materials?.name || item.description || "Material"}
                                </span>
                                {item.material_colors && (
                                  <span className="ml-1 text-muted-foreground">
                                    ({item.material_colors.color_name})
                                  </span>
                                )}
                                <span className="ml-1.5 font-semibold text-primary">
                                  {item.quantity} {item.unit}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          {report.purchasing_report_items?.some((i) => i.receipt_photo_url) ? (
                            <a
                              href={report.purchasing_report_items.find((i) => i.receipt_photo_url)?.receipt_photo_url || "#"}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded border border-border bg-muted/50 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
                            >
                              <FileImage className="h-3.5 w-3.5 text-primary" />
                              <span>Lihat Nota</span>
                              <ExternalLink className="h-3 w-3 opacity-60" />
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Tanpa foto</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5">
                          {isPendingReceive ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-300">
                              <Clock className="h-3 w-3" />
                              Menunggu Dicek Gudang
                            </span>
                          ) : (
                            <div className="flex flex-col">
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-300">
                                <CheckCircle2 className="h-3 w-3" />
                                Sudah Diterima
                              </span>
                              {report.received_by_staff && (
                                <span className="text-[10px] text-muted-foreground mt-0.5">
                                  Penerima: {report.received_by_staff.name}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          {isPendingReceive ? (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleOpenConfirmReport(report)}
                              className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Konfirmasi Terima Barang
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Stok Sudah Masuk</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* CONTENT: TAB 2 - DARI DIRECT SUPPLIER */}
      {sourceTab === "supplier" && (
        <div>
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : filteredPurchases.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-4 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Truck className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm font-medium text-foreground">
                Tidak ada pesanan supplier yang menunggu penerimaan
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr className="border-b border-border text-left text-[11px] font-semibold text-muted-foreground">
                    <th className="px-4 py-3">Tgl Bayar & Supplier</th>
                    <th className="px-4 py-3">Pemohon</th>
                    <th className="px-4 py-3">Bahan Baku Dipesan</th>
                    <th className="px-4 py-3">Bukti Nota</th>
                    <th className="px-4 py-3">Status Pengiriman</th>
                    <th className="px-4 py-3 text-right">Aksi Penerimaan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredPurchases.map((purchase) => {
                    const isOrdered = purchase.status === "ordered";

                    return (
                      <tr key={purchase.id} className="transition-colors hover:bg-muted/40">
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-foreground">{purchase.supplier_name}</p>
                          <p className="text-xs text-muted-foreground">{purchase.payment_date}</p>
                        </td>

                        <td className="px-4 py-3.5 text-xs">
                          <p className="font-medium text-foreground">{purchase.staff?.name || "Gudang"}</p>
                        </td>

                        <td className="px-4 py-3.5 max-w-xs">
                          <div className="space-y-1">
                            {purchase.supplier_purchase_items?.map((item, idx) => (
                              <div key={item.id || idx} className="text-xs">
                                <span className="font-medium text-foreground">
                                  {item.materials?.name || "Material"}
                                </span>
                                {item.material_colors && (
                                  <span className="ml-1 text-muted-foreground">
                                    ({item.material_colors.color_name})
                                  </span>
                                )}
                                <span className="ml-1.5 font-semibold text-primary">
                                  {item.quantity} {item.unit}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          {purchase.payment_proof_url ? (
                            <a
                              href={purchase.payment_proof_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100"
                            >
                              <FileImage className="h-3.5 w-3.5" />
                              <span>Lihat Nota</span>
                              <ExternalLink className="h-3 w-3 opacity-60" />
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                              <AlertCircle className="h-3 w-3" />
                              Nota belum diupload
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3.5">
                          {isOrdered ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/50 dark:border-blue-800 dark:text-blue-300">
                              <Truck className="h-3 w-3" />
                              Menunggu Barang Sampai
                            </span>
                          ) : (
                            <div className="flex flex-col">
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-300">
                                <CheckCircle2 className="h-3 w-3" />
                                Diterima di Gudang
                              </span>
                              {purchase.received_date && (
                                <span className="text-[10px] text-muted-foreground mt-0.5">
                                  {new Date(purchase.received_date).toLocaleDateString("id-ID")}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          {isOrdered ? (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleOpenConfirmPurchase(purchase)}
                              className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Konfirmasi Terima Barang
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Stok Sudah Masuk</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* CONFIRMATION MODAL (SPJ) */}
      {confirmingReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-card border border-border shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/40">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-amber-600" />
                <h3 className="text-base font-semibold text-foreground">
                  Konfirmasi Terima Barang SPJ
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirmingReport(null)}
                className="p-1 rounded-md text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs space-y-1.5">
                <p className="font-semibold text-foreground">
                  SPJ #{confirmingReport.id.slice(0, 8)} oleh {confirmingReport.staff?.name || "Staf"}
                </p>
                <div className="divide-y divide-border/60 max-h-32 overflow-y-auto">
                  {confirmingReport.purchasing_report_items?.map((item, i) => (
                    <div key={i} className="py-1 flex justify-between">
                      <span>{item.materials?.name || item.description}</span>
                      <span className="font-semibold">{item.quantity} {item.unit}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Staf Gudang Penerima <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">-- Pilih Staf Gudang --</option>
                  {warehouseStaff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.role || "Staf"})
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Dengan mengonfirmasi, stok fisik material di atas akan otomatis bertambah ke inventori gudang dan permohonan restock terkait akan berstatus <strong>fulfilled (selesai)</strong>.
              </p>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmingReport(null)}
                  disabled={Boolean(processingId)}
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirmReceiveReport}
                  disabled={Boolean(processingId)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  <Check className="h-4 w-4" />
                  {processingId ? "Memproses..." : "Konfirmasi & Tambah Stok"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL (SUPPLIER) */}
      {confirmingPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-card border border-border shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/40">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-blue-600" />
                <h3 className="text-base font-semibold text-foreground">
                  Konfirmasi Terima Barang Supplier
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirmingPurchase(null)}
                className="p-1 rounded-md text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs space-y-1.5">
                <p className="font-semibold text-foreground">
                  Supplier: {confirmingPurchase.supplier_name}
                </p>
                <div className="divide-y divide-border/60 max-h-32 overflow-y-auto">
                  {confirmingPurchase.supplier_purchase_items?.map((item, i) => (
                    <div key={i} className="py-1 flex justify-between">
                      <span>{item.materials?.name}</span>
                      <span className="font-semibold">{item.quantity} {item.unit}</span>
                    </div>
                  ))}
                </div>
              </div>

              {!confirmingPurchase.payment_proof_url && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/40 p-2.5 text-xs text-amber-800 dark:text-amber-300">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Nota belum di-upload oleh Finance, namun barang tetap dapat diterima jika fisik sudah tiba.
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Staf Gudang Penerima <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">-- Pilih Staf Gudang --</option>
                  {warehouseStaff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.role || "Staf"})
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Dengan mengonfirmasi, stok fisik material di atas akan otomatis bertambah ke inventori gudang.
              </p>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmingPurchase(null)}
                  disabled={Boolean(processingId)}
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirmReceivePurchase}
                  disabled={Boolean(processingId)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  <Check className="h-4 w-4" />
                  {processingId ? "Memproses..." : "Konfirmasi & Tambah Stok"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
