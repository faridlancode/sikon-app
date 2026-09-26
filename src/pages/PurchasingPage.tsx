import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ReceiptText,
  Truck,
  Wallet,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  Pencil,
  Trash2,
  ShoppingBag,
  Info,
  PackagePlus,
  Check,
  X,
  Sparkles,
  CheckSquare,
  Square,
  AlertCircle,
  ArrowRight,
  FileImage,
  UploadCloud,
  ExternalLink,
  Send,
} from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import Card from '../components/ui/card';
import Button from '../components/ui/button';
import PurchasingReportModal from '../components/purchasing/PurchasingReportModal';
import PurchasingReportDetailModal from '../components/purchasing/PurchasingReportDetailModal';
import CashAdvanceModal from '../components/purchasing/CashAdvanceModal';
import SupplierPurchaseModal from '../components/purchasing/SupplierPurchaseModal';
import RejectReasonModal from '../components/purchasing/RejectReasonModal';
import SupplierProofModal from '../components/purchasing/SupplierProofModal';
import { usePurchasingReports } from '../hooks/usePurchasingReports';
import { useCashAdvances } from '../hooks/useCashAdvances';
import { useSupplierPurchases } from '../hooks/useSupplierPurchases';
import { useStockRequests } from '../hooks/useStockRequests';
import { useStaff } from '../hooks/useStaff';
import { formatIDR } from '../utils/formatCurrency';
import type { PurchasingReport, StockRequest, SupplierPurchase } from '../types';

type MainTab = 'spj' | 'supplier' | 'requests' | 'advances';

export default function PurchasingPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab State
  const [activeTab, setActiveTab] = useState<MainTab>('spj');
  const [spjStatusFilter, setSpjStatusFilter] = useState('all');
  const [supplierStatusFilter, setSupplierStatusFilter] = useState('all');
  const [advanceStatusFilter, setAdvanceStatusFilter] = useState('all');
  const [requestStatusFilter, setRequestStatusFilter] = useState('all');
  const [requestFulfillmentFilter, setRequestFulfillmentFilter] = useState<'all' | 'spj' | 'supplier_purchase'>('all');

  // Multi-select for bulk stock requests
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);

  // Modals state
  const [spjModalOpen, setSpjModalOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<PurchasingReport | null>(null);
  const [detailReport, setDetailReport] = useState<PurchasingReport | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [advanceModalOpen, setAdvanceModalOpen] = useState(false);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [initialRequestId, setInitialRequestId] = useState<string | undefined>(undefined);
  const [initialRequestIds, setInitialRequestIds] = useState<string[] | undefined>(undefined);

  // (SPJ approval from requests uses PurchasingReportModal directly)

  // Upload Supplier Proof Modal
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [proofModalPurchase, setProofModalPurchase] = useState<SupplierPurchase | null>(null);

  // Reject Stock Request Modal
  const [rejectReqModalOpen, setRejectReqModalOpen] = useState(false);
  const [rejectingReq, setRejectingReq] = useState<StockRequest | null>(null);

  // Hooks
  const {
    reports,
    loading: reportsLoading,
    refetch: refetchReports,
    createDraftReport,
    updateDraftReport,
    deleteReport,
    submitReport,
    approveReport,
    rejectReport,
    cancelDisbursedReport,
  } = usePurchasingReports();

  const {
    advances,
    outstandingAdvances,
    totalOutstanding,
    loading: advancesLoading,
    refetch: refetchAdvances,
    giveCashAdvance,
  } = useCashAdvances();

  const {
    purchases,
    orderedPurchases,
    loading: purchasesLoading,
    refetch: refetchPurchases,
    createPurchase,
    approveStockRequestSupplier,
    uploadProof,
  } = useSupplierPurchases();

  const {
    requests,
    pendingRequests,
    approvedRequests,
    loading: requestsLoading,
    refetch: refetchRequests,
    approveRequest,
    rejectRequest: rejectStockReq,
    updateRequestFulfillmentType,
  } = useStockRequests();

  const { activeStaff } = useStaff();

  const purchasingStaff = useMemo(() => {
    return activeStaff.filter((s) => s.role === 'Purchasing');
  }, [activeStaff]);

  // Handle URL Query Params from Stock Requests ("Proses via SPJ" / "Proses via Supplier")
  useEffect(() => {
    const action = searchParams.get('action');
    const reqId = searchParams.get('requestId') || undefined;

    if (action === 'new-spj') {
      setActiveTab('spj');
      setInitialRequestId(reqId);
      setInitialRequestIds(reqId ? [reqId] : undefined);
      setEditingReport(null);
      setSpjModalOpen(true);
      searchParams.delete('action');
      searchParams.delete('requestId');
      setSearchParams(searchParams, { replace: true });
    } else if (action === 'new-supplier') {
      setActiveTab('supplier');
      setInitialRequestId(reqId);
      setInitialRequestIds(reqId ? [reqId] : undefined);
      setSupplierModalOpen(true);
      searchParams.delete('action');
      searchParams.delete('requestId');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Filtered lists
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (spjStatusFilter === 'all') return true;
      if (spjStatusFilter === 'disbursed') return r.status === 'disbursed' || r.status === 'draft';
      if (spjStatusFilter === 'submitted') return r.status === 'submitted';
      if (spjStatusFilter === 'financially_approved') return r.status === 'financially_approved';
      if (spjStatusFilter === 'goods_received') return r.status === 'goods_received' || r.status === 'approved';
      if (spjStatusFilter === 'rejected') return r.status === 'rejected';
      return r.status === spjStatusFilter;
    });
  }, [reports, spjStatusFilter]);

  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      if (supplierStatusFilter !== 'all' && p.status !== supplierStatusFilter) return false;
      return true;
    });
  }, [purchases, supplierStatusFilter]);

  const filteredAdvances = useMemo(() => {
    return advances.filter((a) => {
      if (advanceStatusFilter !== 'all' && a.status !== advanceStatusFilter) return false;
      return true;
    });
  }, [advances, advanceStatusFilter]);

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (r.status === 'draft_auto') return false; // Draft auto is only handled inside Warehouse page
      if (requestStatusFilter !== 'all' && r.status !== requestStatusFilter) return false;
      if (requestFulfillmentFilter !== 'all' && r.fulfillment_type !== requestFulfillmentFilter) return false;
      return true;
    });
  }, [requests, requestStatusFilter, requestFulfillmentFilter]);

  // Key KPI stats
  const submittedReports = useMemo(() => reports.filter((r) => r.status === 'submitted'), [reports]);
  const disbursedCount = useMemo(() => reports.filter((r) => r.status === 'disbursed' || r.status === 'draft').length, [reports]);
  const submittedCount = useMemo(() => reports.filter((r) => r.status === 'submitted').length, [reports]);
  const financiallyApprovedCount = useMemo(() => reports.filter((r) => r.status === 'financially_approved').length, [reports]);
  const goodsReceivedCount = useMemo(() => reports.filter((r) => r.status === 'goods_received' || r.status === 'approved').length, [reports]);
  const rejectedCount = useMemo(() => reports.filter((r) => r.status === 'rejected').length, [reports]);

  const totalSubmittedAmount = useMemo(
    () => submittedReports.reduce((sum, r) => sum + Number(r.total_amount || 0), 0),
    [submittedReports]
  );
  const totalOrderedSupplierAmount = useMemo(
    () => orderedPurchases.reduce((sum, p) => sum + Number(p.total_amount || 0), 0),
    [orderedPurchases]
  );

  const tabs = [
    { key: 'spj' as const, label: 'Laporan SPJ', icon: ReceiptText, count: submittedReports.length },
    { key: 'supplier' as const, label: 'Pembelian Supplier', icon: Truck, count: orderedPurchases.length },
    { key: 'requests' as const, label: 'Pengajuan Gudang', icon: PackagePlus, count: pendingRequests.length },
    { key: 'advances' as const, label: 'Kasbon & Uang Muka', icon: Wallet, count: outstandingAdvances.length },
  ];

  // Multi-select handlers for approved stock requests
  const approvedFilteredRequests = useMemo(() => {
    return filteredRequests.filter((r) => r.status === 'approved');
  }, [filteredRequests]);

  // The fulfillment_type locked by first selection, so bulk can only be same category
  const selectedFulfillmentType = useMemo<'spj' | 'supplier_purchase' | null>(() => {
    if (selectedRequestIds.length === 0) return null;
    const first = approvedFilteredRequests.find((r) => selectedRequestIds.includes(r.id));
    return first?.fulfillment_type || null;
  }, [selectedRequestIds, approvedFilteredRequests]);

  const isAllApprovedSelected =
    approvedFilteredRequests.length > 0 &&
    approvedFilteredRequests.every((r) => selectedRequestIds.includes(r.id));

  function toggleSelectAllApproved() {
    if (isAllApprovedSelected) {
      setSelectedRequestIds([]);
    } else {
      // Only select same category when some are already selected
      if (selectedFulfillmentType) {
        setSelectedRequestIds(
          approvedFilteredRequests
            .filter((r) => r.fulfillment_type === selectedFulfillmentType)
            .map((r) => r.id)
        );
      } else {
        setSelectedRequestIds(approvedFilteredRequests.map((r) => r.id));
      }
    }
  }

  function toggleSelectRequest(id: string) {
    const req = approvedFilteredRequests.find((r) => r.id === id);
    if (!req) return;
    setSelectedRequestIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      // Enforce same category rule
      if (selectedFulfillmentType && req.fulfillment_type !== selectedFulfillmentType) {
        alert(`Hanya bisa memproses satu kategori pembelian sekaligus. Centang yang dipilih adalah "${selectedFulfillmentType === 'spj' ? 'SPJ Belanja' : 'Direct Supplier'}".`);
        return prev;
      }
      return [...prev, id];
    });
  }

  function handleProcessBulkSpj() {
    if (selectedRequestIds.length === 0) return;
    // Open the standard SPJ form with pre-filled request IDs
    setEditingReport(null);
    setInitialRequestId(undefined);
    setInitialRequestIds(selectedRequestIds);
    setSpjModalOpen(true);
  }

  function handleProcessBulkSupplier() {
    if (selectedRequestIds.length === 0) return;
    setInitialRequestId(undefined);
    setInitialRequestIds(selectedRequestIds);
    setSupplierModalOpen(true);
  }

  function handleApproveStockRequest(req: StockRequest) {
    if (req.fulfillment_type === 'supplier_purchase') {
      setInitialRequestId(req.id);
      setInitialRequestIds([req.id]);
      setSupplierModalOpen(true);
    } else {
      // Open standard SPJ form pre-filled with request item
      setEditingReport(null);
      setInitialRequestId(req.id);
      setInitialRequestIds([req.id]);
      setSpjModalOpen(true);
    }
  }

  async function handleRejectStockRequestSubmit(reason: string) {
    if (!rejectingReq) return;
    try {
      await rejectStockReq(rejectingReq.id, reason);
      refetchRequests();
      setRejectingReq(null);
    } catch (err: any) {
      throw err;
    }
  }

  return (
    <AppShell
      title="Purchasing & Pengadaan"
      subtitle="Kelola belanja ritel staf (SPJ), pembelian supplier langsung, dan kasbon uang muka"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setAdvanceModalOpen(true)}
          >
            <Wallet className="h-4 w-4" />
            Beri Uang Muka
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              setInitialRequestId(undefined);
              setInitialRequestIds(undefined);
              setSupplierModalOpen(true);
            }}
          >
            <Truck className="h-4 w-4" />
            Beli ke Supplier
          </Button>

          <Button
            onClick={() => {
              setInitialRequestId(undefined);
              setInitialRequestIds(undefined);
              setEditingReport(null);
              setSpjModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Buat SPJ Baru
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-xs font-semibold text-primary">
          <ShoppingBag className="h-4 w-4" />
          Operasional pengadaan
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          {/* SPJ Menunggu Approval */}
          <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">SPJ Menunggu Approval</span>
              <div className="rounded-md bg-amber-100 p-1.5 text-amber-700">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {submittedReports.length} <span className="text-xs font-normal text-muted-foreground">laporan</span>
            </p>
            <p className="mt-1 text-xs text-amber-700 font-medium">
              {formatIDR(totalSubmittedAmount)}
            </p>
          </div>

          {/* Pengajuan Gudang Menunggu */}
          <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Pengajuan Gudang Baru</span>
              <div className="rounded-md bg-purple-100 p-1.5 text-purple-700">
                <PackagePlus className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {pendingRequests.length} <span className="text-xs font-normal text-muted-foreground">pengajuan</span>
            </p>
            <p className="mt-1 text-xs text-purple-700 font-medium">
              {approvedRequests.length} disetujui & siap belanja
            </p>
          </div>

          {/* Uang Muka Melayang */}
          <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Uang Muka Outstanding</span>
              <div className="rounded-md bg-muted p-1.5 text-foreground">
                <Wallet className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {formatIDR(totalOutstanding)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {outstandingAdvances.length} kasbon staf belum di-SPJ-kan
            </p>
          </div>

          {/* Supplier Purchase Menunggu Kirim */}
          <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Order Supplier Belum Tiba</span>
              <div className="rounded-md bg-accent p-1.5 text-primary">
                <Truck className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {orderedPurchases.length} <span className="text-xs font-normal text-muted-foreground">pesanan</span>
            </p>
            <p className="mt-1 text-xs text-blue-700 font-medium">
              {formatIDR(totalOrderedSupplierAmount)} (Lunas)
            </p>
          </div>
        </div>

        {/* Main Tabs Container */}
        <Card className="overflow-hidden">
          {/* Navigation Tabs */}
          <div className="flex gap-1 overflow-x-auto border-b border-border bg-muted/30 p-2">
            {tabs.map(({ key, label, icon: Icon, count }) => (
              <Button
                key={key}
                type="button"
                variant={activeTab === key ? 'default' : 'ghost'}
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
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-accent text-accent-foreground'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </Button>
            ))}
          </div>

          {/* TAB 1: LAPORAN SPJ BELANJA */}
          {activeTab === 'spj' && (
            <div>
              {/* Informational Flow Banner */}
              <div className="flex items-center gap-2 border-b border-border bg-blue-50/70 dark:bg-blue-950/40 px-4 py-2.5 text-xs text-blue-900 dark:text-blue-200">
                <Info className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <span>
                  <strong>Tahapan Alur SPJ:</strong> 1. Cairkan Uang Muka (<em>Sedang Belanja</em>) → 2. Staf Input Nota &amp; Submit (<em>Menunggu Approval</em>) → 3. Approval Finance (<em>Menunggu Gudang</em>) → 4. Gudang Cek Fisik Barang di menu Gudang (<em>Selesai</em>).
                </span>
              </div>

              {/* Subfilters */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 p-4">
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card p-1">
                  {[
                    { value: 'all', label: 'Semua', count: reports.length },
                    { value: 'disbursed', label: 'Sedang Belanja', count: disbursedCount },
                    { value: 'submitted', label: 'Menunggu Approval', count: submittedCount },
                    { value: 'financially_approved', label: 'Menunggu Gudang', count: financiallyApprovedCount },
                    { value: 'goods_received', label: 'Selesai', count: goodsReceivedCount },
                    { value: 'rejected', label: 'Ditolak', count: rejectedCount },
                  ].map((f) => (
                    <Button
                      key={f.value}
                      type="button"
                      variant={spjStatusFilter === f.value ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setSpjStatusFilter(f.value)}
                      className="h-8 px-3 text-xs"
                    >
                      {f.label}
                      {f.count > 0 && (
                        <span className={`ml-1.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                          spjStatusFilter === f.value
                            ? 'bg-primary-foreground/20 text-primary-foreground'
                            : f.value === 'submitted' ? 'bg-amber-400/30 text-amber-900 dark:text-amber-200'
                            : f.value === 'disbursed' ? 'bg-blue-400/30 text-blue-900 dark:text-blue-200'
                            : f.value === 'financially_approved' ? 'bg-purple-400/30 text-purple-900 dark:text-purple-200'
                            : 'bg-accent text-accent-foreground'
                        }`}>
                          {f.count}
                        </span>
                      )}
                    </Button>
                  ))}
                </div>
              </div>

              {reportsLoading ? (
                <div className="flex justify-center py-16">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : filteredReports.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <ReceiptText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">Tidak ada laporan SPJ untuk status ini</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Gunakan tombol "Buat SPJ Baru" atau approve pengajuan di tab Pengajuan Gudang.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60">
                      <tr className="border-b border-border text-left text-[11px] font-semibold text-muted-foreground">
                        <th className="px-4 py-3">Tgl & Kode</th>
                        <th className="px-4 py-3">Staf Purchasing</th>
                        <th className="px-4 py-3">Rincian Belanja</th>
                        <th className="px-4 py-3 text-right">Uang Muka</th>
                        <th className="px-4 py-3 text-right">Total Aktual</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card">
                      {filteredReports.map((report) => (
                        <tr key={report.id} className="transition-colors hover:bg-muted/40">
                          <td className="px-4 py-3.5">
                            <p className="font-semibold text-foreground">#{report.id.substring(0, 8)}</p>
                            <p className="text-xs text-muted-foreground">{report.report_date}</p>
                          </td>

                          <td className="px-4 py-3.5">
                            <p className="font-medium text-foreground">{report.staff?.name || '—'}</p>
                            <p className="text-[11px] text-muted-foreground">{report.staff?.phone || 'Tanpa no. HP'}</p>
                          </td>

                          <td className="px-4 py-3.5 max-w-xs">
                            <p className="text-xs text-foreground font-medium truncate">
                              {report.purchasing_report_items && report.purchasing_report_items.length > 0
                                ? report.purchasing_report_items.map((i) => i.description || i.materials?.name).filter(Boolean).join(', ')
                                : 'Tidak ada item'}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {report.purchasing_report_items?.length || 0} baris nota
                            </p>
                          </td>

                          <td className="px-4 py-3.5 text-right text-xs">
                            {report.cash_advances ? (
                              <span className="font-medium text-amber-800 dark:text-amber-300">
                                {formatIDR(Number(report.cash_advances.amount))}
                              </span>
                            ) : (
                              <span className="text-muted-foreground italic">—</span>
                            )}
                          </td>

                          <td className="px-4 py-3.5 text-right">
                            <p className="font-bold text-foreground">
                              {formatIDR(Number(report.total_amount))}
                            </p>
                            {report.service_fee && Number(report.service_fee) > 0 && (
                              <p className="text-[11px] text-violet-600 mt-0.5">
                                + Jasa {formatIDR(Number(report.service_fee))}
                              </p>
                            )}
                          </td>

                          <td className="px-4 py-3.5">
                            {(report.status === 'disbursed' || report.status === 'draft') && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-800 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                                <Clock className="h-3 w-3" />
                                Sedang Belanja
                              </span>
                            )}
                            {report.status === 'submitted' && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                                <Clock className="h-3 w-3" />
                                Menunggu Approval
                              </span>
                            )}
                            {report.status === 'financially_approved' && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 dark:bg-purple-950/40 dark:border-purple-800 px-2.5 py-0.5 text-xs font-semibold text-purple-700 dark:text-purple-300">
                                <Clock className="h-3 w-3" />
                                Menunggu Gudang
                              </span>
                            )}
                            {(report.status === 'goods_received' || report.status === 'approved') && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                                <CheckCircle2 className="h-3 w-3" />
                                Selesai (Barang Tiba)
                              </span>
                            )}
                            {report.status === 'rejected' && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:text-rose-300">
                                <XCircle className="h-3 w-3" />
                                Ditolak
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setDetailReport(report);
                                  setDetailModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground shadow-xs hover:bg-muted"
                                title="Lihat detail & bukti nota"
                              >
                                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                                Detail
                              </button>

                              {(report.status === 'disbursed' || report.status === 'draft') && (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingReport(report);
                                      setSpjModalOpen(true);
                                    }}
                                    className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-800 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100"
                                    title="Isi rincian nota belanja & submit"
                                  >
                                    <Pencil className="h-3 w-3" />
                                    Input / Edit Nota
                                  </button>

                                  {(report.purchasing_report_items?.length || 0) > 0 && (
                                    <>
                                      <button
                                        onClick={async () => {
                                          if (window.confirm(`Submit SPJ #${report.id.substring(0, 8)} senilai ${formatIDR(report.total_amount)} untuk diajukan ke Finance?`)) {
                                            await submitReport(report.id);
                                            refetchReports();
                                          }
                                        }}
                                        className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-xs font-semibold text-white shadow-xs hover:bg-blue-700"
                                        title="Submit SPJ agar berstatus 'Menunggu Approval'"
                                      >
                                        <Send className="h-3 w-3" />
                                        Submit SPJ
                                      </button>

                                      <button
                                        onClick={async () => {
                                          if (window.confirm(`Setujui (Approve) SPJ #${report.id.substring(0, 8)} senilai ${formatIDR(report.total_amount)} sekarang?`)) {
                                            await approveReport(report.id);
                                            refetchReports();
                                            refetchAdvances();
                                            refetchRequests();
                                          }
                                        }}
                                        className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700"
                                        title="Langsung setujui (approve) SPJ ini"
                                      >
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        Approve SPJ
                                      </button>
                                    </>
                                  )}

                                  <button
                                    onClick={async () => {
                                      const reason = window.prompt('Alasan pembatalan SPJ ini:');
                                      if (reason) {
                                        await cancelDisbursedReport(report.id, reason);
                                        refetchReports();
                                        refetchRequests();
                                      }
                                    }}
                                    className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50"
                                    title="Batalkan SPJ ini"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </>
                              )}

                              {report.status === 'submitted' && (
                                <>
                                  <button
                                    onClick={async () => {
                                      if (window.confirm(`Setujui (Approve) SPJ #${report.id.substring(0, 8)} senilai ${formatIDR(report.total_amount)}?`)) {
                                        await approveReport(report.id);
                                        refetchReports();
                                        refetchAdvances();
                                        refetchRequests();
                                      }
                                    }}
                                    className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700"
                                    title="Setujui (Approve) SPJ ini"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => {
                                      setDetailReport(report);
                                      setDetailModalOpen(true);
                                    }}
                                    className="rounded-md border border-rose-200 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300"
                                    title="Tolak SPJ"
                                  >
                                    Tolak
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: DIRECT SUPPLIER PURCHASES */}
          {activeTab === 'supplier' && (
            <div>
              {/* Informational Banner */}
              <div className="flex items-center gap-2.5 border-b border-border bg-blue-50/70 px-4 py-2.5 text-xs text-blue-800">
                <Info className="h-4 w-4 shrink-0 text-blue-600" />
                <span>
                  Penerimaan fisik barang dan penambahan saldo stok inventori dikonfirmasi oleh Staf Gudang di menu{' '}
                  <span className="font-semibold text-blue-950">Gudang & Inventori → Terima Barang</span>.
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 p-4">
                <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card p-1">
                  {[
                    { value: 'all', label: 'Semua Status' },
                    { value: 'ordered', label: 'Menunggu Penerimaan Gudang' },
                    { value: 'received', label: 'Barang Sudah Diterima' },
                  ].map((f) => (
                    <Button
                      key={f.value}
                      type="button"
                      variant={supplierStatusFilter === f.value ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setSupplierStatusFilter(f.value)}
                      className="h-8 px-3 text-xs"
                    >
                      {f.label}
                      {f.value === 'ordered' && orderedPurchases.length > 0 && (
                        <span className="ml-1.5 rounded-full bg-blue-500/20 px-1.5 py-0.2 text-[10px] font-bold text-blue-900">
                          {orderedPurchases.length}
                        </span>
                      )}
                    </Button>
                  ))}
                </div>
              </div>

              {purchasesLoading ? (
                <div className="flex justify-center py-16">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : filteredPurchases.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                    <Truck className="h-5 w-5 text-slate-400" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-slate-600">Belum ada data pembelian supplier</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Klik tombol "Beli ke Supplier" di atas untuk mencatat order supplier lunas di muka.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60">
                      <tr className="border-b border-border text-left text-[11px] font-semibold text-muted-foreground">
                        <th className="px-4 py-3">Tgl Pembayaran</th>
                        <th className="px-4 py-3">Supplier & Pemohon</th>
                        <th className="px-4 py-3">Bahan Baku Dipesan</th>
                        <th className="px-4 py-3">Bukti Nota</th>
                        <th className="px-4 py-3 text-right">Total Nominal</th>
                        <th className="px-4 py-3">Status Pengiriman</th>
                        <th className="px-4 py-3 text-right">Penerimaan Gudang</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card">
                      {filteredPurchases.map((purchase) => (
                        <tr key={purchase.id} className="transition-colors hover:bg-muted/40">
                          <td className="px-4 py-3.5 text-xs text-muted-foreground">{purchase.payment_date}</td>

                          <td className="px-4 py-3.5">
                            <p className="font-semibold text-foreground">{purchase.supplier_name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              Diminta: {purchase.staff?.name || 'Gudang'}
                            </p>
                          </td>

                          <td className="px-4 py-3.5 max-w-xs">
                            {purchase.supplier_purchase_items?.map((item) => (
                              <span
                                key={item.id}
                                className="mr-1 mb-1 inline-block rounded bg-muted px-2 py-0.5 text-xs text-foreground"
                              >
                                {item.materials?.name || 'Material'} ({item.quantity} {item.unit})
                              </span>
                            ))}
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
                              <button
                                type="button"
                                onClick={() => {
                                  setProofModalPurchase(purchase);
                                  setProofModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 rounded border border-dashed border-blue-300 px-2 py-1 text-[11px] font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                              >
                                <UploadCloud className="h-3.5 w-3.5" />
                                <span>Upload Nota</span>
                              </button>
                            )}
                          </td>

                          <td className="px-4 py-3.5 text-right font-bold text-foreground">
                            {formatIDR(Number(purchase.total_amount))}
                          </td>

                          <td className="px-4 py-3.5">
                            {purchase.status === 'ordered' ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-800 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                                <Truck className="h-3 w-3" />
                                Menunggu Barang Sampai
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                                <CheckCircle2 className="h-3 w-3" />
                                Diterima ({purchase.received_date ? new Date(purchase.received_date).toLocaleDateString('id-ID') : ''})
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3.5 text-right">
                            {purchase.status === 'ordered' ? (
                              <div className="flex flex-col items-end">
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                                  <Clock className="h-3 w-3 text-amber-600" />
                                  Menunggu Gudang
                                </span>
                                <span className="mt-0.5 text-[10px] text-muted-foreground">
                                  Dikonfirmasi di Gudang
                                </span>
                              </div>
                            ) : (
                              <div className="flex flex-col items-end">
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                  Stok Sudah Masuk
                                </span>
                                {purchase.received_date && (
                                  <span className="mt-0.5 text-[10px] text-muted-foreground">
                                    {new Date(purchase.received_date).toLocaleDateString('id-ID')}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PENGAJUAN GUDANG (BARU - FLOW 1 & BULK SPJ) */}
          {activeTab === 'requests' && (
            <div>
              {/* Header / Subfilter & Bulk Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 p-4">
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card p-1">
                  {[
                    { value: 'all', label: 'Semua Status' },
                    { value: 'pending', label: 'Menunggu Approval' },
                    { value: 'approved', label: 'Disetujui (Siap Belanja)' },
                    { value: 'in_progress', label: 'Sedang Diproses' },
                    { value: 'rejected', label: 'Ditolak' },
                  ].map((f) => {
                    let count = 0;
                    if (f.value === 'pending') count = pendingRequests.length;
                    if (f.value === 'approved') count = approvedRequests.length;

                    return (
                      <Button
                        key={f.value}
                        type="button"
                        variant={requestStatusFilter === f.value ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setRequestStatusFilter(f.value)}
                        className="h-8 px-3 text-xs"
                      >
                        {f.label}
                        {Boolean(count) && (
                          <span
                            className={`ml-1.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                              f.value === 'pending'
                                ? 'bg-amber-400/30 text-amber-900'
                                : 'bg-emerald-400/30 text-emerald-900'
                            }`}
                          >
                            {count}
                          </span>
                        )}
                      </Button>
                    );
                  })}
                </div>

                {/* Category filter chips */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Jalur:</span>
                  <button
                    type="button"
                    onClick={() => setRequestFulfillmentFilter('all')}
                    className={`h-7 rounded-full border px-3 text-[11px] font-semibold transition-all ${
                      requestFulfillmentFilter === 'all'
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    Semua
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequestFulfillmentFilter('spj')}
                    className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold transition-all ${
                      requestFulfillmentFilter === 'spj'
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'
                    }`}
                  >
                    <ShoppingBag className="h-3 w-3" /> SPJ Belanja
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequestFulfillmentFilter('supplier_purchase')}
                    className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold transition-all ${
                      requestFulfillmentFilter === 'supplier_purchase'
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'
                    }`}
                  >
                    <Truck className="h-3 w-3" /> Direct Supplier
                  </button>
                </div>

                {/* Bulk Actions if approved items selected */}
                {selectedRequestIds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-primary">
                      {selectedRequestIds.length} pengajuan dipilih ({selectedFulfillmentType === 'spj' ? 'SPJ Belanja' : selectedFulfillmentType === 'supplier_purchase' ? 'Direct Supplier' : '—'}):
                    </span>
                    {selectedFulfillmentType === 'supplier_purchase' ? (
                      <Button
                        size="sm"
                        onClick={handleProcessBulkSupplier}
                        className="h-8 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                      >
                        <Truck className="h-3.5 w-3.5" />
                        Proses Terpilih sebagai 1 Pembelian Supplier ({selectedRequestIds.length})
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={handleProcessBulkSpj}
                        className="h-8 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                      >
                        <ShoppingBag className="h-3.5 w-3.5" />
                        Proses Terpilih sebagai 1 Laporan SPJ ({selectedRequestIds.length})
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedRequestIds([])}
                      className="h-8 text-xs text-muted-foreground"
                    >
                      Batal Pilih
                    </Button>
                  </div>
                )}
              </div>

              {requestsLoading ? (
                <div className="flex justify-center py-16">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <PackagePlus className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">Tidak ada pengajuan restock gudang</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Pengajuan restock bahan yang diajukan staf gudang akan muncul di sini untuk di-approve.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60">
                      <tr className="border-b border-border text-left text-[11px] font-semibold text-muted-foreground">
                        <th className="w-10 px-3 py-3 text-center">
                          <button
                            type="button"
                            onClick={toggleSelectAllApproved}
                            className="text-muted-foreground hover:text-foreground"
                            title="Pilih semua yang disetujui"
                          >
                            {isAllApprovedSelected ? (
                              <CheckSquare className="h-4 w-4 text-primary" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>
                        </th>
                        <th className="px-4 py-3">Tgl & Jalur Beli</th>
                        <th className="px-4 py-3">Material & Warna</th>
                        <th className="px-4 py-3 text-right">Kebutuhan</th>
                        <th className="px-4 py-3">Pemohon (Gudang)</th>
                        <th className="px-4 py-3">Alasan / Catatan</th>
                        <th className="px-4 py-3">Status Approval</th>
                        <th className="px-4 py-3 text-right">Aksi Pembelanjaan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card">
                      {filteredRequests.map((req) => {
                        const isApproved = req.status === 'approved';
                        const isPending = req.status === 'pending';
                        const isSelected = selectedRequestIds.includes(req.id);

                        return (
                          <tr
                            key={req.id}
                            className={`transition-colors hover:bg-muted/40 ${
                              isSelected ? 'bg-primary/5' : ''
                            }`}
                          >
                            {/* Checkbox */}
                            <td className="px-3 py-3.5 text-center">
                              {isApproved ? (
                                <button
                                  type="button"
                                  onClick={() => toggleSelectRequest(req.id)}
                                  className="text-muted-foreground hover:text-foreground"
                                >
                                  {isSelected ? (
                                    <CheckSquare className="h-4 w-4 text-primary" />
                                  ) : (
                                    <Square className="h-4 w-4" />
                                  )}
                                </button>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>

                            {/* Tgl & Jalur Beli */}
                            <td className="px-4 py-3.5 text-xs text-muted-foreground">
                              <p className="font-medium text-foreground">{req.requested_date}</p>
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                {req.source_type === 'auto_order' ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                                    <Sparkles className="h-2.5 w-2.5" /> Auto Order
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    Manual
                                  </span>
                                )}

                                {isPending ? (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const nextType = req.fulfillment_type === 'spj' ? 'supplier_purchase' : 'spj';
                                      await updateRequestFulfillmentType(req.id, nextType);
                                    }}
                                    className="inline-flex items-center gap-1 rounded border border-dashed px-1.5 py-0.5 text-[10px] font-medium hover:opacity-80 transition-colors"
                                    title="Klik untuk mengubah Kategori Pembelian"
                                  >
                                    {req.fulfillment_type === 'supplier_purchase' ? (
                                      <span className="text-blue-700 dark:text-blue-400 flex items-center gap-1">
                                        <Truck className="h-2.5 w-2.5" /> Direct Supplier <Pencil className="h-2 w-2 opacity-60 ml-0.5" />
                                      </span>
                                    ) : (
                                      <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1">
                                        <ShoppingBag className="h-2.5 w-2.5" /> SPJ Belanja <Pencil className="h-2 w-2 opacity-60 ml-0.5" />
                                      </span>
                                    )}
                                  </button>
                                ) : (
                                  req.fulfillment_type === 'supplier_purchase' ? (
                                    <span className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 dark:bg-blue-950/50 dark:border-blue-800 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                                      <Truck className="h-2.5 w-2.5" /> Direct Supplier
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 dark:bg-amber-950/50 dark:border-amber-800 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                                      <ShoppingBag className="h-2.5 w-2.5" /> SPJ Belanja
                                    </span>
                                  )
                                )}
                              </div>
                            </td>

                            {/* Material & Warna */}
                            <td className="px-4 py-3.5">
                              <p className="font-semibold text-foreground">{req.materials?.name || '—'}</p>
                              {req.material_colors && (
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <span
                                    className="h-2 w-2 rounded-full border border-slate-300"
                                    style={{
                                      backgroundColor: req.material_colors.color_code || '#94a3b8',
                                    }}
                                  />
                                  {req.material_colors.color_name}
                                </span>
                              )}
                            </td>

                            {/* Kebutuhan */}
                            <td className="px-4 py-3.5 text-right font-medium text-foreground whitespace-nowrap">
                              {req.quantity_needed}{' '}
                              <span className="text-xs text-muted-foreground">{req.unit}</span>
                            </td>

                            {/* Pemohon */}
                            <td className="px-4 py-3.5 text-foreground">
                              <p className="text-xs font-semibold">{req.staff?.name || '—'}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {req.staff?.role || 'Staf Gudang'}
                              </p>
                              {req.approved_by_staff && (
                                <p className="text-[10px] text-emerald-700 font-medium mt-0.5">
                                  Disetujui: {req.approved_by_staff.name}
                                </p>
                              )}
                            </td>

                            {/* Catatan / Alasan */}
                            <td className="max-w-xs px-4 py-3.5 text-xs text-muted-foreground">
                              <p className="line-clamp-2">{req.reason || '—'}</p>
                              {req.rejected_reason && (
                                <p className="mt-1 text-[11px] font-medium text-rose-600 bg-rose-50 rounded p-1">
                                  Alasan ditolak: {req.rejected_reason}
                                </p>
                              )}
                            </td>

                            {/* Status */}
                            <td className="px-4 py-3.5">
                              {isPending && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                                  <Clock className="h-3 w-3" />
                                  Menunggu Approval
                                </span>
                              )}
                              {isApproved && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Disetujui (Siap Belanja)
                                </span>
                              )}
                              {req.status === 'in_progress' && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                                  Sedang Dibelanjakan
                                </span>
                              )}
                              {req.status === 'rejected' && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                                  <XCircle className="h-3 w-3" />
                                  Ditolak
                                </span>
                              )}
                              {req.status === 'fulfilled' && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Selesai
                                </span>
                              )}
                            </td>

                            {/* Aksi */}
                            <td className="px-4 py-3.5 text-right whitespace-nowrap">
                              {isPending ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => handleApproveStockRequest(req)}
                                    className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                                    title="Setujui permohonan belanja bahan ini"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                    Setujui
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setRejectingReq(req);
                                      setRejectReqModalOpen(true);
                                    }}
                                    className="h-8 gap-1 text-xs text-rose-600 hover:bg-rose-50 border-rose-200"
                                    title="Tolak permohonan belanja"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                    Tolak
                                  </Button>
                                </div>
                              ) : isApproved ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  {req.fulfillment_type === 'supplier_purchase' ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setInitialRequestId(undefined);
                                        setInitialRequestIds([req.id]);
                                        setSupplierModalOpen(true);
                                      }}
                                      className="h-8 gap-1 text-xs text-blue-700 hover:bg-blue-50 border-blue-200 font-medium"
                                      title="Proses via Direct Supplier"
                                    >
                                      <Truck className="h-3.5 w-3.5" />
                                      Buat Pembelian Supplier
                                    </Button>
                                  ) : (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setInitialRequestId(undefined);
                                        setInitialRequestIds([req.id]);
                                        setEditingReport(null);
                                        setSpjModalOpen(true);
                                      }}
                                      className="h-8 gap-1 text-xs text-amber-700 hover:bg-amber-50 border-amber-200 font-medium"
                                      title="Proses via SPJ Belanja"
                                    >
                                      <ShoppingBag className="h-3.5 w-3.5" />
                                      Buat SPJ Belanja
                                    </Button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  {req.status === 'fulfilled' ? 'Barang sudah tiba' : '—'}
                                </span>
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

          {/* TAB 4: UANG MUKA / KASBON */}
          {activeTab === 'advances' && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 p-4">
                <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card p-1">
                  {[
                    { value: 'all', label: 'Semua Kasbon' },
                    { value: 'outstanding', label: 'Outstanding (Melayang)' },
                    { value: 'settled', label: 'Selesai (Settled)' },
                  ].map((f) => (
                    <Button
                      key={f.value}
                      type="button"
                      variant={advanceStatusFilter === f.value ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setAdvanceStatusFilter(f.value)}
                      className="h-8 px-3 text-xs"
                    >
                      {f.label}
                    </Button>
                  ))}
                </div>

                <Button onClick={() => setAdvanceModalOpen(true)} className="text-xs">
                  <Plus className="h-3.5 w-3.5" />
                  Beri Uang Muka Baru
                </Button>
              </div>

              {advancesLoading ? (
                <div className="flex justify-center py-16">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : filteredAdvances.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                    <Wallet className="h-5 w-5 text-slate-400" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-slate-600">Belum ada data uang muka</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Uang muka kasbon yang diserahkan ke staf purchasing akan tercatat di sini.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50/80">
                      <tr className="border-b border-border text-left text-[11px] font-semibold text-muted-foreground">
                        <th className="px-4 py-3">Tgl Diberikan</th>
                        <th className="px-4 py-3">Penerima (Staf)</th>
                        <th className="px-4 py-3">Keperluan / Catatan</th>
                        <th className="px-4 py-3 text-right">Nominal Kasbon</th>
                        <th className="px-4 py-3 text-right">Status Pertanggungjawaban</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {filteredAdvances.map((adv) => (
                        <tr key={adv.id} className="transition-colors hover:bg-slate-50/80">
                          <td className="px-4 py-3.5 text-xs text-slate-500">{adv.date_given}</td>
                          <td className="px-4 py-3.5">
                            <p className="font-semibold text-slate-900">{adv.staff?.name || '—'}</p>
                            <p className="text-[11px] text-muted-foreground">{adv.staff?.role || 'Purchasing'}</p>
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-700 max-w-sm">
                            {adv.purpose || <span className="italic text-slate-400">Tanpa keterangan</span>}
                          </td>
                          <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                            {formatIDR(Number(adv.amount))}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            {adv.status === 'outstanding' ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                                <Clock className="h-3 w-3" />
                                Outstanding (Belum SPJ)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" />
                                Selesai (Sudah Di-SPJ-kan)
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* MODALS */}
      <PurchasingReportModal
        open={spjModalOpen}
        onClose={() => {
          setSpjModalOpen(false);
          setEditingReport(null);
          setInitialRequestId(undefined);
          setInitialRequestIds(undefined);
        }}
        onSubmit={async (header, items) => {
          if (editingReport) {
            await updateDraftReport(editingReport.id, header, items);
          } else {
            await createDraftReport(header, items);
          }
          setSelectedRequestIds([]);
          refetchReports();
          refetchAdvances();
          refetchRequests();
        }}
        editingReport={editingReport}
        initialStockRequestId={initialRequestId}
        initialStockRequestIds={initialRequestIds}
      />

      <PurchasingReportDetailModal
        open={detailModalOpen}
        onClose={() => {
          setDetailModalOpen(false);
          setDetailReport(null);
        }}
        report={detailReport}
        onSubmitReport={async (id) => {
          await submitReport(id);
          refetchReports();
        }}
        onApproveReport={async (id) => {
          await approveReport(id);
          refetchReports();
          refetchAdvances();
          refetchRequests();
        }}
        onRejectReport={async (id, reason) => {
          await rejectReport(id, reason);
          refetchReports();
        }}
        onEditReport={(report) => {
          setEditingReport(report);
          setSpjModalOpen(true);
        }}
      />

      <CashAdvanceModal
        open={advanceModalOpen}
        onClose={() => setAdvanceModalOpen(false)}
        onSubmit={async (payload) => {
          await giveCashAdvance(payload);
          refetchAdvances();
        }}
      />

      <SupplierPurchaseModal
        open={supplierModalOpen}
        onClose={() => {
          setSupplierModalOpen(false);
          setInitialRequestId(undefined);
          setInitialRequestIds(undefined);
        }}
        onSubmit={async (payload) => {
          const reqIdsFromItems = payload.items
            .map((item) => item.stock_request_id)
            .filter((id): id is string => Boolean(id));
          const allReqIds = Array.from(
            new Set([
              ...reqIdsFromItems,
              ...(initialRequestIds || []),
              ...(initialRequestId ? [initialRequestId] : []),
            ])
          );

          if (allReqIds.length > 0) {
            await approveStockRequestSupplier({
              requestIds: allReqIds,
              requestedBy: payload.requested_by,
              supplier_name: payload.supplier_name,
              payment_date: payload.payment_date,
              notes: payload.notes,
              items: payload.items,
            });
          } else {
            await createPurchase(payload);
          }
          refetchPurchases();
          refetchRequests();
        }}
        initialStockRequestId={initialRequestId}
        initialStockRequestIds={initialRequestIds}
      />

      {/* SPJ approval uses PurchasingReportModal directly (same as 'Buat SPJ Baru') */}

      {/* Upload Supplier Proof Modal */}
      <SupplierProofModal
        open={proofModalOpen}
        onClose={() => {
          setProofModalOpen(false);
          setProofModalPurchase(null);
        }}
        purchase={proofModalPurchase}
        staffList={activeStaff}
        onUploadProof={async (purchaseId, proofUrl, uploadedBy) => {
          await uploadProof(purchaseId, proofUrl, uploadedBy);
          refetchPurchases();
        }}
      />

      {/* Reject Stock Request Modal */}
      <RejectReasonModal
        open={rejectReqModalOpen}
        onClose={() => {
          setRejectReqModalOpen(false);
          setRejectingReq(null);
        }}
        onSubmit={handleRejectStockRequestSubmit}
        title="Tolak Pengajuan Restock Gudang"
        actionLabel="Tolak Pengajuan"
        placeholder="mis. Anggaran belum tersedia / stok di gudang lain masih ada / kain pengganti tersedia"
        reportTitle={
          rejectingReq
            ? `${rejectingReq.materials?.name || 'Material'} (${rejectingReq.quantity_needed} ${rejectingReq.unit})`
            : undefined
        }
      />
    </AppShell>
  );
}
