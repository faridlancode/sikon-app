import React, { useState, useMemo } from 'react';
import {
  CalendarRange,
  List,
  FileText,
  BarChart3,
  Lock,
  Unlock,
  RefreshCw,
  AlertCircle,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Layers,
} from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import { usePoBatches } from '../hooks/usePoBatches';
import { useOrders } from '../hooks/useOrders';
import { CurrentPoOrdersTable } from '../components/po/CurrentPoOrdersTable';
import { PoPurchaseListPanel } from '../components/po/PoPurchaseListPanel';
import { PastOpenWarningBanner } from '../components/po/PastOpenWarningBanner';
import { PoBatchModal } from '../components/po/PoBatchModal';
import { ClosePoModal } from '../components/po/ClosePoModal';
import { ReopenPoModal } from '../components/po/ReopenPoModal';
import PoDailyReportTab from '../components/po/reports/PoDailyReportTab';
import PoCloseReportTab from '../components/po/reports/PoCloseReportTab';
import PoMonthlyReportTab from '../components/po/reports/PoMonthlyReportTab';
import OrderDetailModal from '../components/orders/OrderDetailModal';
import PaymentModal from '../components/orders/PaymentModal';
import { PoBatchSummary, Order } from '../types';
import { getPoLabel, formatPoDateRange, MONTH_NAMES_ID } from '../components/po/poHelpers';

type PoTab = 'list' | 'daily' | 'close' | 'monthly';

export default function PoPage() {
  const [activeTab, setActiveTab] = useState<PoTab>('list');

  // Filter Daftar PO
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all'); // format: 'YYYY-MM' atau 'all'
  const [selectedBatchSubTab, setSelectedBatchSubTab] = useState<'orders' | 'purchases'>('orders');

  // Modals
  const [isPoModalOpen, setIsPoModalOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<PoBatchSummary | null>(null);

  const [closingBatch, setClosingBatch] = useState<PoBatchSummary | null>(null);
  const [reopeningBatch, setReopeningBatch] = useState<PoBatchSummary | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [paymentModalOrder, setPaymentModalOrder] = useState<any | null>(null);

  const {
    batches,
    loadingBatches,
    selectedBatchId,
    setSelectedBatchId,
    selectedBatchOrders,
    loadingOrders,
    error,
    pastOpenBatches,
    hasPastOpenBatches,
    fetchBatches,
    fetchOrdersForBatch,
    createPoBatch,
    updatePoBatch,
    deletePoBatch,
    closePo,
    reopenPo,
  } = usePoBatches();

  const {
    fetchOrderDetail,
    recordPayment,
    deletePayment,
    updateProductionStatus,
  } = useOrders();

  const handleRefresh = async () => {
    await fetchBatches();
  };

  // Opsi filter bulan dari data yang ada
  const availableMonths = useMemo(() => {
    const map = new Map<string, { year: number; month: number; label: string }>();
    batches.forEach((b) => {
      const key = `${b.period_year}-${String(b.period_month).padStart(2, '0')}`;
      if (!map.has(key)) {
        const mName = MONTH_NAMES_ID[b.period_month - 1] || `Bulan ${b.period_month}`;
        map.set(key, { year: b.period_year, month: b.period_month, label: `${mName} ${b.period_year}` });
      }
    });
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, val]) => ({ key, ...val }));
  }, [batches]);

  // Data batch setelah filter
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) {
        return false;
      }
      if (monthFilter !== 'all') {
        const key = `${b.period_year}-${String(b.period_month).padStart(2, '0')}`;
        if (key !== monthFilter) {
          return false;
        }
      }
      return true;
    });
  }, [batches, statusFilter, monthFilter]);

  const selectedBatch = batches.find((b) => b.id === selectedBatchId) || null;

  // Handle Hapus PO
  const handleDeletePo = async (b: PoBatchSummary) => {
    const confirmDelete = window.confirm(
      `Apakah Anda yakin ingin menghapus Batch PO "${b.name}" (${b.code})?\nTindakan ini tidak dapat dibatalkan.`
    );
    if (!confirmDelete) return;

    const res = await deletePoBatch(b.id);
    if (!res.success) {
      alert(res.error || 'Gagal menghapus PO');
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Top Title & Refresh */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CalendarRange className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Batch Pre-Order (PO)
              </h1>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Pengelolaan periode Batch PO fleksibel, batas kuota pemesanan, pembekuan snapshot, dan rekapitulasi produksi.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditingBatch(null);
                setIsPoModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Tambah PO</span>
            </button>

            <button
              onClick={handleRefresh}
              disabled={loadingBatches}
              className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-medium text-card-foreground shadow-sm hover:bg-muted transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingBatches ? 'animate-spin' : ''}`} />
              <span>Muat Ulang</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-border">
          <nav className="flex space-x-2">
            <button
              onClick={() => setActiveTab('list')}
              className={`flex items-center gap-2 border-b-2 py-3 px-4 text-xs font-semibold transition-colors ${
                activeTab === 'list'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground'
              }`}
            >
              <List className="h-4 w-4" />
              <span>Daftar PO</span>
            </button>

            <button
              onClick={() => setActiveTab('daily')}
              className={`flex items-center gap-2 border-b-2 py-3 px-4 text-xs font-semibold transition-colors ${
                activeTab === 'daily'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground'
              }`}
            >
              <FileText className="h-4 w-4" />
              <span>Laporan Harian</span>
            </button>

            <button
              onClick={() => setActiveTab('close')}
              className={`flex items-center gap-2 border-b-2 py-3 px-4 text-xs font-semibold transition-colors ${
                activeTab === 'close'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground'
              }`}
            >
              <Lock className="h-4 w-4" />
              <span>Laporan Close</span>
            </button>

            <button
              onClick={() => setActiveTab('monthly')}
              className={`flex items-center gap-2 border-b-2 py-3 px-4 text-xs font-semibold transition-colors ${
                activeTab === 'monthly'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground'
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              <span>Laporan Bulanan</span>
            </button>
          </nav>
        </div>

        {/* TAB CONTENT: Daftar PO */}
        {activeTab === 'list' && (
          <div className="space-y-6">
            {/* Warning Banner: Past Open POs */}
            {hasPastOpenBatches && (
              <PastOpenWarningBanner show={true} pastBatches={pastOpenBatches} />
            )}

            {/* Error banner */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive border border-destructive/20">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Status:</span>
                  <div className="inline-flex rounded-md border border-input bg-background p-0.5">
                    <button
                      type="button"
                      onClick={() => setStatusFilter('all')}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                        statusFilter === 'all'
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Semua
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusFilter('open')}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                        statusFilter === 'open'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Terbuka
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusFilter('closed')}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                        statusFilter === 'closed'
                          ? 'bg-zinc-700 text-white shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Ditutup
                    </button>
                  </div>
                </div>

                {availableMonths.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-2">
                    <span className="font-medium text-foreground">Bulan:</span>
                    <select
                      value={monthFilter}
                      onChange={(e) => setMonthFilter(e.target.value)}
                      className="rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="all">Semua Bulan</option>
                      {availableMonths.map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="text-xs text-muted-foreground">
                Menampilkan <strong>{filteredBatches.length}</strong> dari {batches.length} Batch PO
              </div>
            </div>

            {/* Tabel Ringkasan PO */}
            <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-card-foreground">
                  <thead className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Nama PO & Kode</th>
                      <th className="py-3 px-4">Rentang Tanggal</th>
                      <th className="py-3 px-4">Bulan Laporan</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-center">Pesanan</th>
                      <th className="py-3 px-4">Realisasi / Kuota</th>
                      <th className="py-3 px-4 text-right">Total Nilai</th>
                      <th className="py-3 px-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loadingBatches ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-muted-foreground animate-pulse">
                          Memuat data Batch PO...
                        </td>
                      </tr>
                    ) : filteredBatches.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-muted-foreground">
                          Tidak ada Batch PO yang sesuai dengan filter.
                        </td>
                      </tr>
                    ) : (
                      filteredBatches.map((b) => {
                        const isSelected = b.id === selectedBatchId;
                        const isOpen = b.status === 'open';
                        const monthName = MONTH_NAMES_ID[b.period_month - 1] || `Bulan ${b.period_month}`;

                        // Perhitungan kuota
                        const hasQuota = b.quota_qty != null && b.quota_qty > 0;
                        const pct = b.quota_used_pct ?? 0;
                        let progressColor = 'bg-emerald-500';
                        if (pct >= 100) {
                          progressColor = 'bg-rose-500';
                        } else if (pct >= 90) {
                          progressColor = 'bg-amber-500';
                        }

                        // Syarat Hapus: order_count === 0, status === open, bukan legacy
                        const canDelete = b.order_count === 0 && isOpen && !b.is_legacy;

                        return (
                          <tr
                            key={b.id}
                            onClick={() => setSelectedBatchId(b.id)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-primary/10 font-medium'
                                : 'hover:bg-muted/40'
                            }`}
                          >
                            <td className="py-3 px-4">
                              <div className="font-semibold text-foreground">{b.name}</div>
                              <div className="text-[11px] font-mono text-muted-foreground">{b.code}</div>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap text-muted-foreground">
                              {formatPoDateRange(b.start_date, b.end_date)}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap text-muted-foreground">
                              {monthName} {b.period_year}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  isOpen
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                                    : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                                }`}
                              >
                                {isOpen ? (
                                  <>
                                    <CheckCircle2 className="h-3 w-3" />
                                    <span>Terbuka</span>
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="h-3 w-3" />
                                    <span>Ditutup</span>
                                  </>
                                )}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center font-medium text-foreground">
                              {b.order_count} order
                            </td>
                            <td className="py-3 px-4 min-w-[160px]">
                              {hasQuota ? (
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[11px]">
                                    <span className="font-medium text-foreground">{b.total_qty} / {b.quota_qty} pcs</span>
                                    <span className={`font-semibold ${pct >= 100 ? 'text-destructive' : pct >= 90 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                                      {pct}%
                                    </span>
                                  </div>
                                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${progressColor}`}
                                      style={{ width: `${Math.min(pct, 100)}%` }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">{b.total_qty} pcs <span className="text-[10px] text-muted-foreground/60">(tanpa kuota)</span></span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right font-semibold text-foreground whitespace-nowrap">
                              Rp {Number(b.total_price || 0).toLocaleString('id-ID')}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <div
                                className="flex items-center justify-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {/* Tombol Edit */}
                                <button
                                  type="button"
                                  title="Edit PO"
                                  onClick={() => {
                                    setEditingBatch(b);
                                    setIsPoModalOpen(true);
                                  }}
                                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>

                                {/* Tombol Tutup / Buka Kembali */}
                                {isOpen ? (
                                  <button
                                    type="button"
                                    title="Tutup PO"
                                    onClick={() => setClosingBatch(b)}
                                    className="rounded p-1 text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-950/40 transition-colors"
                                  >
                                    <Lock className="h-3.5 w-3.5" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    title="Buka Kembali PO"
                                    onClick={() => setReopeningBatch(b)}
                                    className="rounded p-1 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-950/40 transition-colors"
                                  >
                                    <Unlock className="h-3.5 w-3.5" />
                                  </button>
                                )}

                                {/* Tombol Hapus */}
                                <button
                                  type="button"
                                  title={
                                    canDelete
                                      ? 'Hapus PO'
                                      : 'PO tidak dapat dihapus jika sudah berisi order, sudah ditutup, atau berstatus legacy'
                                  }
                                  disabled={!canDelete}
                                  onClick={() => handleDeletePo(b)}
                                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bagian Detail dalam PO yang Dipilih */}
            {selectedBatch && (
              <div className="space-y-4 pt-2">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <Layers className="h-5 w-5 text-primary" />
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">
                        Detail {selectedBatch.name}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Kode: {selectedBatch.code} &bull; Periode: {formatPoDateRange(selectedBatch.start_date, selectedBatch.end_date)} &bull; Status:{' '}
                        <span className={selectedBatch.status === 'open' ? 'text-emerald-600 font-medium' : 'text-zinc-600'}>
                          {selectedBatch.status === 'open' ? 'Terbuka' : 'Ditutup'}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Subtab Toggle: Pesanan vs Daftar Belanja */}
                  <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-2xs self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setSelectedBatchSubTab('orders')}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                        selectedBatchSubTab === 'orders'
                          ? 'bg-primary text-primary-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <span>Pesanan PO</span>
                      <span className="rounded-full bg-primary-foreground/20 px-1.5 py-0.2 text-[10px]">
                        {selectedBatchOrders.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedBatchSubTab('purchases')}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                        selectedBatchSubTab === 'purchases'
                          ? 'bg-primary text-primary-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <span>Daftar Belanja PO</span>
                    </button>
                  </div>
                </div>

                {selectedBatchSubTab === 'orders' ? (
                  <CurrentPoOrdersTable
                    orders={selectedBatchOrders}
                    loading={loadingOrders}
                    batchStatus={selectedBatch.status}
                    batchName={selectedBatch.name}
                    onSelectOrder={(order) => setSelectedOrder(order)}
                    onRefresh={() => fetchOrdersForBatch(selectedBatch.id)}
                  />
                ) : (
                  <PoPurchaseListPanel
                    batchId={selectedBatch.id}
                    batchName={selectedBatch.name}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB CONTENT: Laporan Harian */}
        {activeTab === 'daily' && <PoDailyReportTab />}

        {/* TAB CONTENT: Laporan Close */}
        {activeTab === 'close' && <PoCloseReportTab />}

        {/* TAB CONTENT: Laporan Bulanan */}
        {activeTab === 'monthly' && <PoMonthlyReportTab />}
      </div>

      {/* Modal Tambah/Edit PO */}
      <PoBatchModal
        isOpen={isPoModalOpen}
        onClose={() => {
          setIsPoModalOpen(false);
          setEditingBatch(null);
        }}
        batch={editingBatch}
        existingBatches={batches}
        onSave={async (params) => {
          if (editingBatch) {
            return await updatePoBatch({
              batchId: editingBatch.id,
              ...params,
            });
          } else {
            return await createPoBatch(params);
          }
        }}
      />

      {/* Close PO Modal */}
      {closingBatch && (
        <ClosePoModal
          isOpen={!!closingBatch}
          onClose={() => setClosingBatch(null)}
          batch={closingBatch}
          orderCount={closingBatch.order_count}
          totalQty={closingBatch.total_qty}
          totalPrice={closingBatch.total_price}
          onConfirm={closePo}
        />
      )}

      {/* Reopen PO Modal */}
      {reopeningBatch && (
        <ReopenPoModal
          isOpen={!!reopeningBatch}
          onClose={() => setReopeningBatch(null)}
          batch={reopeningBatch}
          onConfirm={reopenPo}
        />
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <OrderDetailModal
          open={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          order={selectedOrder}
          fetchOrderDetail={fetchOrderDetail}
          onAddPayment={(order) => setPaymentModalOrder(order)}
          onDeletePayment={deletePayment}
          onUpdateProductionStatus={updateProductionStatus}
        />
      )}

      {/* Payment Modal */}
      {paymentModalOrder && (
        <PaymentModal
          open={!!paymentModalOrder}
          onClose={() => setPaymentModalOrder(null)}
          order={paymentModalOrder}
          onSubmit={async (paymentData: any) => {
            await recordPayment(paymentModalOrder.id, paymentData);
            await handleRefresh();
          }}
        />
      )}
    </AppShell>
  );
}
