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
} from "lucide-react";
import Button from "../ui/button";
import { formatIDR } from "../../utils/formatCurrency";
import type { SupplierPurchase } from "../../types";

interface ReceiveOrdersTabProps {
  purchases: SupplierPurchase[];
  loading: boolean;
  onReceivePurchase: (purchaseId: string) => Promise<void>;
}

export default function ReceiveOrdersTab({
  purchases,
  loading,
  onReceivePurchase,
}: ReceiveOrdersTabProps) {
  const [statusFilter, setStatusFilter] = useState<"ordered" | "all" | "received">("ordered");
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmingPurchase, setConfirmingPurchase] = useState<SupplierPurchase | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const orderedCount = useMemo(
    () => purchases.filter((p) => p.status === "ordered").length,
    [purchases]
  );

  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      // Status filter
      if (statusFilter !== "all" && p.status !== statusFilter) {
        return false;
      }
      // Search query
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

  const handleConfirmReceive = async () => {
    if (!confirmingPurchase) return;
    try {
      setProcessingId(confirmingPurchase.id);
      setErrorMessage(null);
      await onReceivePurchase(confirmingPurchase.id);
      setConfirmingPurchase(null);
    } catch (err) {
      console.error("Gagal menerima barang:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "Terjadi kesalahan saat memproses penerimaan barang."
      );
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Informative Banner */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-xs text-blue-900 shadow-xs">
        <Info className="h-5 w-5 shrink-0 text-blue-600 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-blue-950">
            Alur Penerimaan Barang Fisik dari Supplier
          </p>
          <p className="text-blue-800 leading-relaxed">
            Halaman ini mencatat pesanan bahan baku dari Direct Supplier yang telah disetujui &
            dibayar oleh Finance. Saat barang fisik tiba di gudang dan telah diverifikasi oleh staf
            gudang, klik <span className="font-semibold text-emerald-700">"Konfirmasi Terima Barang"</span> agar
            stok material otomatis bertambah ke inventori gudang.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setStatusFilter("ordered")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              statusFilter === "ordered"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Menunggu Penerimaan</span>
            {orderedCount > 0 && (
              <span className="ml-1 rounded-full bg-blue-500/20 px-1.5 py-0.2 text-[10px] font-bold text-blue-900">
                {orderedCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("received")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              statusFilter === "received"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Sudah Diterima</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              statusFilter === "all"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <span>Semua Data ({purchases.length})</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari supplier atau bahan..."
            className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="mt-3 text-xs text-muted-foreground">Memuat data penerimaan barang...</p>
        </div>
      ) : filteredPurchases.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Truck className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-sm font-semibold text-foreground">
            {statusFilter === "ordered"
              ? "Tidak Ada Barang Menunggu Diterima"
              : "Belum Ada Data Pembelian"}
          </h3>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            {statusFilter === "ordered"
              ? "Semua pesanan bahan dari supplier telah diterima dan masuk ke stok gudang, atau belum ada pemesanan baru dari Finance/Purchasing."
              : "Data pesanan bahan baku dari supplier akan tercatat di sini."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPurchases.map((purchase) => {
            const isOrdered = purchase.status === "ordered";
            const itemCount = purchase.supplier_purchase_items?.length ?? 0;

            return (
              <div
                key={purchase.id}
                className="overflow-hidden rounded-xl border border-border bg-card shadow-xs transition hover:border-slate-300"
              >
                {/* Header Card */}
                <div className="flex flex-col gap-2 border-b border-border/60 bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-foreground text-sm">
                      {purchase.supplier_name}
                    </span>
                    <span className="text-muted-foreground">•</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      Tgl Bayar: {purchase.payment_date}
                    </span>
                    {purchase.staff?.name && (
                      <>
                        <span className="text-muted-foreground">•</span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          Diminta: {purchase.staff.name}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isOrdered ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                        <Clock className="h-3 w-3 text-amber-600" />
                        Menunggu Kedatangan Barang
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        Diterima Gudang{" "}
                        {purchase.received_date
                          ? `(${new Date(purchase.received_date).toLocaleDateString("id-ID")})`
                          : ""}
                      </span>
                    )}
                  </div>
                </div>

                {/* Items List */}
                <div className="p-4">
                  <div className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                    Rincian Barang yang Dipesan ({itemCount} item)
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/50 text-left text-muted-foreground">
                          <th className="pb-2 font-medium">Bahan Baku</th>
                          <th className="pb-2 font-medium">Varian / Warna</th>
                          <th className="pb-2 text-right font-medium">Kuantitas</th>
                          <th className="pb-2 text-right font-medium">Harga Satuan</th>
                          <th className="pb-2 text-right font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {purchase.supplier_purchase_items?.map((item) => (
                          <tr key={item.id} className="text-foreground">
                            <td className="py-2.5 font-medium">
                              <div className="flex items-center gap-1.5">
                                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>{item.materials?.name || "Bahan Baku"}</span>
                              </div>
                            </td>
                            <td className="py-2.5 text-muted-foreground">
                              {item.material_colors?.color_name ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                                  <Layers className="h-3 w-3 text-slate-500" />
                                  {item.material_colors.color_name}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic">-</span>
                              )}
                            </td>
                            <td className="py-2.5 text-right font-semibold text-foreground">
                              {item.quantity} {item.unit}
                            </td>
                            <td className="py-2.5 text-right text-muted-foreground">
                              {formatIDR(Number(item.unit_price))}
                            </td>
                            <td className="py-2.5 text-right font-medium text-foreground">
                              {formatIDR(Number(item.total_price))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-border/80">
                          <td colSpan={4} className="pt-2.5 text-right font-semibold text-muted-foreground">
                            Total Pembelian:
                          </td>
                          <td className="pt-2.5 text-right font-bold text-foreground text-sm">
                            {formatIDR(Number(purchase.total_amount))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Actions & Notes Footer */}
                  <div className="mt-4 flex flex-col gap-2 border-t border-border/50 pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      {purchase.notes ? (
                        <span>
                          <span className="font-semibold text-foreground">Catatan:</span>{" "}
                          {purchase.notes}
                        </span>
                      ) : (
                        <span className="italic text-slate-400">Tidak ada catatan pesanan</span>
                      )}
                    </p>

                    <div>
                      {isOrdered ? (
                        <Button
                          type="button"
                          onClick={() => setConfirmingPurchase(purchase)}
                          className="w-full gap-2 bg-emerald-600 text-xs text-white hover:bg-emerald-700 shadow-sm sm:w-auto"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Konfirmasi Terima Barang</span>
                        </Button>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <span>Stok Sudah Masuk ke Gudang</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmingPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    Konfirmasi Penerimaan Barang
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Supplier: <span className="font-semibold text-foreground">{confirmingPurchase.supplier_name}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!processingId) setConfirmingPurchase(null);
                }}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="mt-4 space-y-4 text-xs">
              <p className="text-muted-foreground">
                Pastikan fisik barang telah sampai di gudang dan dicek secara seksama. Kuantitas
                berikut akan <strong>langsung ditambahkan ke stok fisik inventori gudang</strong>:
              </p>

              {/* Items preview box */}
              <div className="max-h-48 overflow-y-auto rounded-xl border border-border bg-muted/40 p-3 space-y-2">
                {confirmingPurchase.supplier_purchase_items?.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between border-b border-border/40 pb-1.5 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="font-semibold text-foreground">
                        {item.materials?.name || "Bahan Baku"}
                      </p>
                      {item.material_colors?.color_name && (
                        <p className="text-[11px] text-muted-foreground">
                          Warna: {item.material_colors.color_name}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="inline-block rounded-md bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">
                        +{item.quantity} {item.unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {errorMessage && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-800">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-amber-900 flex items-start gap-2.5">
                <Clock className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" />
                <p className="text-[11px] leading-relaxed">
                  Tindakan ini akan membuat mutasi stok masuk (<em>in</em>) berstatus{" "}
                  <strong>confirmed</strong> dan otomatis menandai permintaan restock terkait sebagai{" "}
                  <strong>terpenuhi</strong>.
                </p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={Boolean(processingId)}
                onClick={() => setConfirmingPurchase(null)}
              >
                Batal
              </Button>
              <Button
                type="button"
                disabled={Boolean(processingId)}
                onClick={handleConfirmReceive}
                className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {processingId ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Menyimpan Stok...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Konfirmasi & Tambah Stok</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
