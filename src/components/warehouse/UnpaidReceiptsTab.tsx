import { useState } from "react";
import {
  CreditCard,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Truck,
  Calendar,
  Wallet,
  Receipt,
  Search,
  Check,
  X,
} from "lucide-react";
import Button from "../ui/button";
import Card from "../ui/card";
import { inputClass } from "../ui/FormField";
import { formatIDR } from "../../utils/formatCurrency";
import type { PurchaseReceipt } from "../../types";

interface UnpaidReceiptsTabProps {
  receipts: PurchaseReceipt[];
  loading: boolean;
  onPayReceipt: (
    receiptId: string,
    paymentDate: string,
    paymentMethod?: string
  ) => Promise<void>;
}

export default function UnpaidReceiptsTab({
  receipts,
  loading,
  onPayReceipt,
}: UnpaidReceiptsTabProps) {
  const [filterStatus, setFilterStatus] = useState<"unpaid" | "paid" | "all">("unpaid");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedReceiptIds, setExpandedReceiptIds] = useState<Record<string, boolean>>({});

  // Mini payment modal state
  const [paymentTarget, setPaymentTarget] = useState<PurchaseReceipt | null>(null);
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [paymentMethod, setPaymentMethod] = useState("transfer");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedReceiptIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const filtered = receipts.filter((r) => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const sup = (r.supplier_name || "").toLowerCase();
      const notes = (r.notes || "").toLowerCase();
      if (!sup.includes(q) && !notes.includes(q)) return false;
    }
    return true;
  });

  const unpaidCount = receipts.filter((r) => r.status === "unpaid").length;
  const unpaidTotal = receipts
    .filter((r) => r.status === "unpaid")
    .reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);

  const handleOpenPayment = (receipt: PurchaseReceipt) => {
    setPaymentTarget(receipt);
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setPaymentMethod("transfer");
    setPayError(null);
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentTarget) return;

    setPaying(true);
    setPayError(null);
    try {
      await onPayReceipt(paymentTarget.id, paymentDate, paymentMethod);
      setPaymentTarget(null);
    } catch (err: any) {
      setPayError(err?.message || "Gagal memproses pembayaran tagihan.");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Summary & Filter Banner ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="p-4 flex items-center gap-4 bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md shadow-amber-500/20">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Total Tagihan Belum Dibayar</p>
            <p className="text-xl font-bold text-foreground mt-0.5">
              {formatIDR(unpaidTotal)}
            </p>
            <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium mt-0.5">
              {unpaidCount} surat penerimaan menunggu pelunasan
            </p>
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-center gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex rounded-lg border border-border p-0.5 bg-muted/30">
              <button
                type="button"
                onClick={() => setFilterStatus("unpaid")}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  filterStatus === "unpaid"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Belum Lunas ({unpaidCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus("paid")}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  filterStatus === "paid"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Lunas ({receipts.filter((r) => r.status === "paid").length})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus("all")}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  filterStatus === "all"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Semua
              </button>
            </div>

            <div className="relative flex-1 max-w-[200px]">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Cari supplier..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${inputClass} pl-8 py-1 text-xs`}
              />
            </div>
          </div>
        </Card>
      </div>

      {/* ── Receipts List ── */}
      <div className="space-y-3">
        {loading ? (
          <Card className="p-12 text-center text-xs text-muted-foreground">
            Memuat daftar tagihan supplier...
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Receipt className="h-6 w-6" />
            </div>
            <p className="mt-3 font-medium text-foreground text-sm">Tidak ada tagihan</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {filterStatus === "unpaid"
                ? "Hebat! Semua tagihan supplier telah lunas dibayar."
                : "Belum ada dokumen tagihan pembelian material."}
            </p>
          </Card>
        ) : (
          filtered.map((r) => {
            const isUnpaid = r.status === "unpaid";
            const items = r.purchase_receipt_items || [];
            const isExpanded = Boolean(expandedReceiptIds[r.id]);

            return (
              <Card
                key={r.id}
                className="overflow-hidden border border-border transition-all hover:border-border/80"
              >
                {/* Header card */}
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        isUnpaid
                          ? "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200"
                          : "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200"
                      }`}
                    >
                      <Truck className="h-5 w-5" />
                    </div>

                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-foreground">
                          {r.supplier_name || "Supplier Umum"}
                        </span>
                        {isUnpaid ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-400">
                            <Clock className="h-3 w-3" /> Belum Lunas
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" /> Lunas
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          Diterima:{" "}
                          <strong className="text-foreground font-medium">
                            {new Date(r.received_date).toLocaleDateString("id-ID", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </strong>
                        </span>
                        {r.notes && (
                          <>
                            <span>•</span>
                            <span className="italic truncate max-w-xs">{r.notes}</span>
                          </>
                        )}
                        {!isUnpaid && r.paid_date && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              Dibayar tgl {new Date(r.paid_date).toLocaleDateString("id-ID")}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Total & Action */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 border-t border-border/60 pt-3 sm:border-0 sm:pt-0">
                    <div className="text-left sm:text-right">
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                        Total Tagihan
                      </p>
                      <p className="text-base font-bold text-foreground">
                        {formatIDR(r.total_amount)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpand(r.id)}
                        className="h-8 text-xs gap-1 text-muted-foreground"
                      >
                        <span>{items.length} Barang</span>
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </Button>

                      {isUnpaid && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleOpenPayment(r)}
                          className="h-8 text-xs font-semibold bg-primary text-primary-foreground gap-1.5"
                        >
                          <CreditCard className="h-3.5 w-3.5" />
                          <span>Bayar</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Item Details */}
                {isExpanded && (
                  <div className="border-t border-border bg-muted/20 p-4 animate-in fade-in duration-150">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-border/80 text-[10px] font-semibold uppercase text-muted-foreground">
                          <th className="pb-2">Nama Material</th>
                          <th className="pb-2">Warna</th>
                          <th className="pb-2 text-right">Qty</th>
                          <th className="pb-2 text-right">Harga Satuan</th>
                          <th className="pb-2 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {items.map((it) => (
                          <tr key={it.id} className="text-foreground">
                            <td className="py-2 font-medium">
                              {it.materials?.name || "Material"}
                            </td>
                            <td className="py-2 text-muted-foreground">
                              {it.material_colors?.color_name || "—"}
                            </td>
                            <td className="py-2 text-right">
                              {it.qty} {it.unit}
                            </td>
                            <td className="py-2 text-right text-muted-foreground">
                              {formatIDR(it.unit_price)}
                            </td>
                            <td className="py-2 text-right font-semibold">
                              {formatIDR(it.total_price)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* ── Mini Payment Modal ── */}
      {paymentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    Pelunasan Tagihan Material
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Catat pengeluaran kas ke modul Keuangan
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPaymentTarget(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmPayment} className="mt-5 space-y-4">
              {payError && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{payError}</span>
                </div>
              )}

              {/* Rincian Tagihan */}
              <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Supplier:</span>
                  <strong className="text-foreground font-semibold">
                    {paymentTarget.supplier_name || "Supplier Umum"}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tanggal Diterima:</span>
                  <span className="text-foreground">
                    {new Date(paymentTarget.received_date).toLocaleDateString("id-ID")}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t border-border pt-2">
                  <span className="font-medium text-foreground">Nominal Tagihan:</span>
                  <span className="text-lg font-bold text-primary">
                    {formatIDR(paymentTarget.total_amount)}
                  </span>
                </div>
              </div>

              {/* Input Tanggal Bayar */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  Tanggal Pembayaran <span className="text-destructive">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className={inputClass}
                />
              </div>

              {/* Input Metode Pembayaran */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                  Metode Pembayaran
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className={inputClass}
                >
                  <option value="transfer">Transfer Bank</option>
                  <option value="cash">Kas Tunai</option>
                  <option value="qris">QRIS / E-Wallet</option>
                  <option value="lainnya">Lainnya</option>
                </select>
              </div>

              {/* Notice otomatisasi */}
              <p className="text-[11px] text-muted-foreground rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-2.5 border border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300">
                ✨ Transaksi pengeluaran baru otomatis dibuat di menu <strong>Keuangan</strong> pada kategori <strong>"Pembelian Material"</strong>.
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPaymentTarget(null)}
                  disabled={paying}
                >
                  Batal
                </Button>
                <Button type="submit" disabled={paying} className="min-w-[120px]">
                  {paying ? "Memproses..." : "Konfirmasi Lunas"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
