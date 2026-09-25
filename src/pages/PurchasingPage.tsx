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
  AlertTriangle,
  ArrowUpRight,
  ShoppingBag,
  Send,
  Info,
} from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import Card from '../components/ui/card';
import Button from '../components/ui/button';
import PurchasingReportModal from '../components/purchasing/PurchasingReportModal';
import PurchasingReportDetailModal from '../components/purchasing/PurchasingReportDetailModal';
import CashAdvanceModal from '../components/purchasing/CashAdvanceModal';
import SupplierPurchaseModal from '../components/purchasing/SupplierPurchaseModal';
import { usePurchasingReports } from '../hooks/usePurchasingReports';
import { useCashAdvances } from '../hooks/useCashAdvances';
import { useSupplierPurchases } from '../hooks/useSupplierPurchases';
import { formatIDR } from '../utils/formatCurrency';
import type { PurchasingReport, SupplierPurchase } from '../types';

type MainTab = 'spj' | 'supplier' | 'advances';

export default function PurchasingPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab State
  const [activeTab, setActiveTab] = useState<MainTab>('spj');
  const [spjStatusFilter, setSpjStatusFilter] = useState('all');
  const [supplierStatusFilter, setSupplierStatusFilter] = useState('all');
  const [advanceStatusFilter, setAdvanceStatusFilter] = useState('all');

  // Modals state
  const [spjModalOpen, setSpjModalOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<PurchasingReport | null>(null);
  const [detailReport, setDetailReport] = useState<PurchasingReport | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [advanceModalOpen, setAdvanceModalOpen] = useState(false);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [initialRequestId, setInitialRequestId] = useState<string | undefined>(undefined);

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
  } = useSupplierPurchases();

  // Handle URL Query Params from Stock Requests ("Proses via SPJ" / "Proses via Supplier")
  useEffect(() => {
    const action = searchParams.get('action');
    const reqId = searchParams.get('requestId') || undefined;

    if (action === 'new-spj') {
      setActiveTab('spj');
      setInitialRequestId(reqId);
      setEditingReport(null);
      setSpjModalOpen(true);
      searchParams.delete('action');
      searchParams.delete('requestId');
      setSearchParams(searchParams, { replace: true });
    } else if (action === 'new-supplier') {
      setActiveTab('supplier');
      setInitialRequestId(reqId);
      setSupplierModalOpen(true);
      searchParams.delete('action');
      searchParams.delete('requestId');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Filtered lists
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (spjStatusFilter !== 'all' && r.status !== spjStatusFilter) return false;
      return true;
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

  // Key KPI stats
  const submittedReports = useMemo(() => reports.filter((r) => r.status === 'submitted'), [reports]);
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
    { key: 'advances' as const, label: 'Kasbon & Uang Muka', icon: Wallet, count: outstandingAdvances.length },
  ];

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
              setSupplierModalOpen(true);
            }}
          >
            <Truck className="h-4 w-4" />
            Beli ke Supplier
          </Button>

          <Button
            onClick={() => {
              setInitialRequestId(undefined);
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
      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
            {formatIDR(totalOrderedSupplierAmount)} (Sudah Lunas)
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
                <span className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${activeTab === key ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-accent text-accent-foreground'}`}>
                  {count}
                </span>
              )}
            </Button>
          ))}
        </div>

        {/* TAB 1: LAPORAN SPJ BELANJA */}
        {activeTab === 'spj' && (
          <div>
            {/* Subfilters */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card p-1">
                {[
                  { value: 'all', label: 'Semua Status' },
                  { value: 'submitted', label: 'Menunggu Approval' },
                  { value: 'draft', label: 'Draft' },
                  { value: 'approved', label: 'Disetujui' },
                  { value: 'rejected', label: 'Ditolak' },
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
                    {f.value === 'submitted' && submittedReports.length > 0 && (
                      <span className="ml-1.5 rounded-full bg-amber-400/30 px-1.5 py-0.2 text-[10px] font-bold text-amber-900">
                        {submittedReports.length}
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
                <p className="mt-3 text-sm font-medium text-foreground">Belum ada laporan SPJ</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Klik "Buat SPJ Baru" untuk mempertanggungjawabkan belanja ritel staf.
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
                          <p className="font-semibold text-slate-900">#{report.id.substring(0, 8)}</p>
                          <p className="text-xs text-slate-500">{report.report_date}</p>
                        </td>

                        <td className="px-4 py-3.5">
                          <p className="font-medium text-slate-900">{report.staff?.name || '—'}</p>
                          <p className="text-[11px] text-muted-foreground">{report.staff?.phone || 'Tanpa no. HP'}</p>
                        </td>

                        <td className="px-4 py-3.5 max-w-xs">
                          <p className="text-xs text-slate-700 font-medium truncate">
                            {report.purchasing_report_items && report.purchasing_report_items.length > 0
                              ? report.purchasing_report_items.map((i) => i.description).join(', ')
                              : 'Tidak ada item'}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {report.purchasing_report_items?.length || 0} baris nota
                          </p>
                        </td>

                        <td className="px-4 py-3.5 text-right text-xs">
                          {report.cash_advances ? (
                            <span className="font-medium text-amber-800">
                              {formatIDR(Number(report.cash_advances.amount))}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">—</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-right">
                          <p className="font-bold text-slate-900">
                            {formatIDR(Number(report.total_amount))}
                          </p>
                          {report.service_fee && Number(report.service_fee) > 0 && (
                            <p className="text-[11px] text-violet-600 mt-0.5">
                              + Jasa {formatIDR(Number(report.service_fee))}
                            </p>
                          )}
                        </td>

                        <td className="px-4 py-3.5">
                          {report.status === 'draft' && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                              Draft
                            </span>
                          )}
                          {report.status === 'submitted' && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                              <Clock className="h-3 w-3" />
                              Menunggu Approval
                            </span>
                          )}
                          {report.status === 'approved' && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" />
                              Disetujui
                            </span>
                          )}
                          {report.status === 'rejected' && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
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
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50"
                              title="Lihat detail & bukti nota"
                            >
                              <Eye className="h-3.5 w-3.5 text-slate-500" />
                              Detail
                            </button>

                            {report.status === 'draft' && (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingReport(report);
                                    setSpjModalOpen(true);
                                  }}
                                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                  title="Edit draft"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (window.confirm('Hapus draft SPJ ini?')) {
                                      deleteReport(report.id);
                                    }
                                  }}
                                  className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                  title="Hapus draft"
                                >
                                  <Trash2 className="h-4 w-4" />
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
                Penerimaan fisik barang dan penambahan saldo stok inventori dikonfirmasi oleh Staf Gudang di menu{" "}
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
                  <thead className="bg-slate-50/80">
                    <tr className="border-b border-border text-left text-[11px] font-semibold text-muted-foreground">
                      <th className="px-4 py-3">Tgl Pembayaran</th>
                      <th className="px-4 py-3">Supplier & Pemohon</th>
                      <th className="px-4 py-3">Bahan Baku Dipesan</th>
                      <th className="px-4 py-3 text-right">Total Nominal</th>
                      <th className="px-4 py-3">Status Pengiriman</th>
                      <th className="px-4 py-3 text-right">Penerimaan Gudang</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {filteredPurchases.map((purchase) => (
                      <tr key={purchase.id} className="transition-colors hover:bg-slate-50/80">
                        <td className="px-4 py-3.5 text-xs text-slate-500">{purchase.payment_date}</td>

                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-slate-900">{purchase.supplier_name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Diminta: {purchase.staff?.name || 'Gudang'}
                          </p>
                        </td>

                        <td className="px-4 py-3.5 max-w-xs">
                          {purchase.supplier_purchase_items?.map((item) => (
                            <span
                              key={item.id}
                              className="mr-1 mb-1 inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                            >
                              {item.materials?.name || 'Material'} ({item.quantity} {item.unit})
                            </span>
                          ))}
                        </td>

                        <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                          {formatIDR(Number(purchase.total_amount))}
                        </td>

                        <td className="px-4 py-3.5">
                          {purchase.status === 'ordered' ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                              <Truck className="h-3 w-3" />
                              Menunggu Barang Sampai
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" />
                              Diterima ({purchase.received_date ? new Date(purchase.received_date).toLocaleDateString('id-ID') : ''})
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-right">
                          {purchase.status === 'ordered' ? (
                            <div className="flex flex-col items-end">
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                                <Clock className="h-3 w-3 text-amber-600" />
                                Menunggu Gudang
                              </span>
                              <span className="mt-0.5 text-[10px] text-muted-foreground">
                                Dikonfirmasi di Gudang
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-end">
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
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

        {/* TAB 3: UANG MUKA / KASBON */}
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
        }}
        onSubmit={async (header, items) => {
          if (editingReport) {
            await updateDraftReport(editingReport.id, header, items);
          } else {
            await createDraftReport(header, items);
          }
          refetchReports();
          refetchAdvances();
        }}
        editingReport={editingReport}
        initialStockRequestId={initialRequestId}
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
        }}
        onSubmit={async (payload) => {
          await createPurchase(payload);
          refetchPurchases();
        }}
        initialStockRequestId={initialRequestId}
      />
    </AppShell>
  );
}
