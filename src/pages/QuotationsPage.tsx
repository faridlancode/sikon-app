import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Plus,
  Search,
  Filter,
  Printer,
  Edit2,
  Trash2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  ExternalLink,
  ChevronDown,
  Building2,
  Send,
  ShoppingCart,
  Receipt,
} from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import Button from '../components/ui/button';
import QuotationModal from '../components/documents/quotations/QuotationModal';
import DocumentPreviewModal from '../components/documents/DocumentPreviewModal';
import QuotationTemplate from '../components/documents/QuotationTemplate';
import { useQuotations } from '../hooks/useQuotations';
import { useInvoices } from '../hooks/useInvoices';
import { useSales } from '../hooks/useSales';
import { formatIDR } from '../utils/formatCurrency';
import { formatDateID } from '../utils/dateHelpers';
import type { Quotation, QuotationStatus } from '../types';

export default function QuotationsPage() {
  const {
    quotations,
    loading,
    error,
    saveQuotation,
    setQuotationStatus,
    deleteQuotation,
  } = useQuotations();

  const { activeSales } = useSales();
  const { createInvoiceFromQuotation } = useInvoices();

  // Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null);

  // Preview / Print Modal State
  const [previewQuotation, setPreviewQuotation] = useState<Quotation | null>(null);

  // Filter & Search State
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [salesFilter, setSalesFilter] = useState<string>('all');

  // Helper check expiration
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  function isQuotationExpired(q: Quotation): boolean {
    if (!q.valid_until) return false;
    if (q.status === 'accepted' || q.status === 'rejected') return false;
    return q.valid_until < todayStr;
  }

  // Filtered List
  const filteredQuotations = useMemo(() => {
    return quotations.filter((q) => {
      // Search text
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesNo = q.quotation_no.toLowerCase().includes(query);
        const matchesName = q.customer_name.toLowerCase().includes(query);
        const matchesCompany = (q.customer_company || '').toLowerCase().includes(query);
        if (!matchesNo && !matchesName && !matchesCompany) return false;
      }

      // Status
      if (statusFilter !== 'all') {
        if (statusFilter === 'expired') {
          if (!isQuotationExpired(q)) return false;
        } else if (q.status !== statusFilter) {
          return false;
        }
      }

      // Sales
      if (salesFilter !== 'all' && q.sales_id !== salesFilter) {
        return false;
      }

      return true;
    });
  }, [quotations, search, statusFilter, salesFilter, todayStr]);

  // Statistics
  const stats = useMemo(() => {
    const total = quotations.length;
    const draft = quotations.filter((q) => q.status === 'draft').length;
    const sent = quotations.filter((q) => q.status === 'sent' && !isQuotationExpired(q)).length;
    const accepted = quotations.filter((q) => q.status === 'accepted').length;
    const expired = quotations.filter((q) => isQuotationExpired(q)).length;

    const totalValue = quotations.reduce((sum, q) => {
      const itemsSum = (q.quotation_items || []).reduce(
        (isum, it) => isum + (Number(it.subtotal) || (Number(it.qty) || 0) * (Number(it.unit_price) || 0)),
        0
      );
      return sum + itemsSum;
    }, 0);

    return { total, draft, sent, accepted, expired, totalValue };
  }, [quotations, todayStr]);

  const navigate = useNavigate();

  // Action handlers
  function handleOpenCreate() {
    setEditingQuotation(null);
    setIsFormOpen(true);
  }

  function handleOpenEdit(q: Quotation) {
    setEditingQuotation(q);
    setIsFormOpen(true);
  }

  function handleConvertToOrder(q: Quotation) {
    navigate('/orders', { state: { convertFromQuotation: q } });
  }

  async function handleCreateInvoice(q: Quotation) {
    try {
      await createInvoiceFromQuotation(q.id, 'dp');
      navigate('/invoices');
    } catch (err: any) {
      alert(err.message || 'Gagal membuat invoice dari penawaran.');
    }
  }

  async function handleDelete(q: Quotation) {
    if (q.order_id) {
      alert('Surat penawaran yang sudah terhubung ke pesanan tidak dapat dihapus.');
      return;
    }

    if (
      !window.confirm(
        `Hapus Surat Penawaran ${q.quotation_no} untuk ${q.customer_name}?`
      )
    ) {
      return;
    }

    try {
      await deleteQuotation(q.id);
    } catch (err: any) {
      alert(err.message || 'Gagal menghapus penawaran.');
    }
  }

  async function handleStatusChange(q: Quotation, nextStatus: 'draft' | 'sent' | 'rejected') {
    try {
      await setQuotationStatus(q.id, nextStatus);
    } catch (err: any) {
      alert(err.message || 'Gagal memperbarui status penawaran.');
    }
  }

  // Render Status Badge
  function renderStatusBadge(q: Quotation) {
    const expired = isQuotationExpired(q);

    if (q.status === 'accepted') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="h-3.5 w-3.5" /> Diterima / Jadi Order
        </span>
      );
    }

    if (q.status === 'rejected') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 border border-rose-200">
          <XCircle className="h-3.5 w-3.5" /> Ditolak
        </span>
      );
    }

    if (expired) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
          <AlertTriangle className="h-3.5 w-3.5" /> Kedaluwarsa
        </span>
      );
    }

    if (q.status === 'sent') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 border border-blue-200">
          <Send className="h-3 w-3" /> Terkirim
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 border border-slate-200">
        <Clock className="h-3.5 w-3.5" /> Draft
      </span>
    );
  }

  return (
    <AppShell
      title="Surat Penawaran"
      subtitle="Dokumen penawaran harga dan spesifikasi teknis kepada calon pelanggan (pra-order)"
      actions={
        <Button
          variant="default"
          size="sm"
          onClick={handleOpenCreate}
          className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Buat Penawaran Baru
        </Button>
      }
    >
      <div className="space-y-6">
        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
            <p className="text-xs font-medium text-muted-foreground">Total Penawaran</p>
            <p className="text-2xl font-bold text-foreground mt-1">{stats.total}</p>
            <p className="text-[11px] font-mono text-slate-500 mt-1">
              Nilai: {formatIDR(stats.totalValue)}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
            <p className="text-xs font-medium text-slate-500">Draft</p>
            <p className="text-2xl font-bold text-slate-700 mt-1">{stats.draft}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Belum dikirim</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
            <p className="text-xs font-medium text-blue-600">Terkirim</p>
            <p className="text-2xl font-bold text-blue-700 mt-1">{stats.sent}</p>
            <p className="text-[11px] text-blue-600/80 mt-1">Menunggu respon</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
            <p className="text-xs font-medium text-emerald-600">Disetujui</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">{stats.accepted}</p>
            <p className="text-[11px] text-emerald-600/80 mt-1">Jadi pesanan produksi</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-xs col-span-2 sm:col-span-1">
            <p className="text-xs font-medium text-amber-600">Kedaluwarsa</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">{stats.expired}</p>
            <p className="text-[11px] text-amber-600/80 mt-1">Lewat batas waktu</p>
          </div>
        </div>

        {/* TOOLBAR FILTER & CARI */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between rounded-xl border border-border bg-card p-3 shadow-xs">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Cari nomor penawaran, nama pelanggan, instansi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Filter className="h-3.5 w-3.5" />
              <span>Status:</span>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
            >
              <option value="all">Semua Status</option>
              <option value="draft">Draft</option>
              <option value="sent">Terkirim</option>
              <option value="accepted">Disetujui / Order</option>
              <option value="rejected">Ditolak</option>
              <option value="expired">Kedaluwarsa</option>
            </select>

            <select
              value={salesFilter}
              onChange={(e) => setSalesFilter(e.target.value)}
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
            >
              <option value="all">Semua Sales</option>
              {activeSales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* TABEL PENAWARAN */}
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-border bg-slate-50 text-slate-700 font-semibold uppercase text-[10px]">
                <tr>
                  <th className="py-3 px-4 text-left">Nomor & Tanggal</th>
                  <th className="py-3 px-4 text-left">Pelanggan / Perusahaan</th>
                  <th className="py-3 px-4 text-left">Sales</th>
                  <th className="py-3 px-4 text-center">Rincian Item</th>
                  <th className="py-3 px-4 text-right">Total Nilai</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      Memuat daftar surat penawaran...
                    </td>
                  </tr>
                ) : filteredQuotations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      {quotations.length === 0
                        ? 'Belum ada surat penawaran yang dibuat. Klik tombol "Buat Penawaran Baru" di atas.'
                        : 'Tidak ada surat penawaran yang cocok dengan filter pencarian.'}
                    </td>
                  </tr>
                ) : (
                  filteredQuotations.map((q) => {
                    const items = q.quotation_items || [];
                    const totalAmount = items.reduce(
                      (sum, it) =>
                        sum + (Number(it.subtotal) || (Number(it.qty) || 0) * (Number(it.unit_price) || 0)),
                      0
                    );
                    const totalQty = items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);

                    return (
                      <tr key={q.id} className="hover:bg-slate-50/50 transition">
                        <td className="py-3 px-4">
                          <p className="font-mono font-bold text-primary">
                            {q.quotation_no}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {formatDateID(q.quotation_date)}
                          </p>
                          {q.valid_until && (
                            <p className="text-[10px] text-slate-500">
                              Berlaku s/d: {formatDateID(q.valid_until)}
                            </p>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <p className="font-bold text-foreground">{q.customer_name}</p>
                          {q.customer_company && (
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Building2 className="h-3 w-3" />
                              {q.customer_company}
                            </p>
                          )}
                        </td>

                        <td className="py-3 px-4 text-slate-700">
                          {q.sales?.name ? (
                            <span className="font-medium">{q.sales.name}</span>
                          ) : (
                            <span className="text-slate-400 italic">-</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center">
                          <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            {items.length} item ({totalQty} pcs)
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <p className="font-mono font-bold text-foreground">
                            {formatIDR(totalAmount)}
                          </p>
                          {q.dp_percent ? (
                            <p className="text-[10px] text-slate-500">
                              DP {q.dp_percent}%: {formatIDR(Math.round((totalAmount * q.dp_percent) / 100))}
                            </p>
                          ) : null}
                        </td>

                        <td className="py-3 px-4 text-center">
                          {renderStatusBadge(q)}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Tombol Konversi ke Pesanan */}
                            {!q.order_id && q.status !== 'rejected' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleConvertToOrder(q)}
                                className="h-8 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                title="Jadikan Pesanan"
                              >
                                <ShoppingCart className="h-3.5 w-3.5" />
                              </Button>
                            )}

                            {/* Tombol Terbitkan Invoice DP */}
                            {q.status !== 'rejected' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCreateInvoice(q)}
                                className="h-8 px-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                title="Terbitkan Invoice DP"
                              >
                                <Receipt className="h-3.5 w-3.5" />
                              </Button>
                            )}

                            {/* Tombol Cetak / PDF */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPreviewQuotation(q)}
                              className="h-8 px-2 text-slate-700 hover:text-primary hover:bg-primary/10"
                              title="Pratinjau & Cetak PDF"
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </Button>

                            {/* Tombol Edit */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenEdit(q)}
                              className="h-8 px-2 text-slate-700 hover:text-blue-600 hover:bg-blue-50"
                              title="Edit Penawaran"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>

                            {/* Dropdown / Aksi Status */}
                            {q.status === 'draft' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleStatusChange(q, 'sent')}
                                className="h-8 px-2 text-blue-600 hover:bg-blue-50"
                                title="Tandai Terkirim ke Pelanggan"
                              >
                                <Send className="h-3.5 w-3.5" />
                              </Button>
                            )}

                            {/* Tombol Hapus */}
                            {!q.order_id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(q)}
                                className="h-8 px-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                title="Hapus Penawaran"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
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
      </div>

      {/* MODAL FORM BUAT / EDIT PENAWARAN */}
      <QuotationModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        quotationToEdit={editingQuotation}
        onSave={saveQuotation}
      />

      {/* MODAL PRATINJAU CETAK DOKUMEN */}
      {previewQuotation && (
        <DocumentPreviewModal
          isOpen={Boolean(previewQuotation)}
          onClose={() => setPreviewQuotation(null)}
          title="Pratinjau Cetak Surat Penawaran"
          documentNo={previewQuotation.quotation_no}
          customerName={previewQuotation.customer_name}
          documentType="Surat Penawaran"
        >
          {(printMode) => (
            <QuotationTemplate
              quotation={previewQuotation}
              printMode={printMode}
            />
          )}
        </DocumentPreviewModal>
      )}
    </AppShell>
  );
}
