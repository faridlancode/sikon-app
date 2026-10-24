import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
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
  XCircle,
  ExternalLink,
  ChevronDown,
  Building2,
  Send,
  CreditCard,
  Ban,
  ArrowRight,
  Receipt,
  Package,
} from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import Button from '../components/ui/button';
import InvoiceModal from '../components/documents/invoices/InvoiceModal';
import PdfPreviewDialog from '../components/documents/PdfPreviewDialog';
import { useInvoices } from '../hooks/useInvoices';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { getInvoicePdfBlobUrl, downloadInvoicePdf } from '../lib/pdf/invoicePdf';
import type { SignatureMode } from '../lib/pdf/invoicePdf';
import { formatIDR } from '../utils/formatCurrency';
import { formatDateID } from '../utils/dateHelpers';
import type { Invoice, InvoiceStatus, InvoiceType } from '../types';

export default function InvoicesPage() {
  const {
    invoices,
    loading,
    error,
    saveInvoice,
    setInvoiceStatus,
    deleteInvoice,
  } = useInvoices();

  // Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);

  // Preview / Print Modal State
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [signatureMode, setSignatureMode] = useState<SignatureMode>('none');
  const [keterangan, setKeterangan] = useState('');

  const { profile } = useCompanySettings();

  // Generate / revoke blob URL saat previewInvoice atau signatureMode berubah
  useEffect(() => {
    let active = true;
    let url: string | null = null;
    if (previewInvoice) {
      setPdfBlobUrl(null);
      getInvoicePdfBlobUrl(previewInvoice, profile, signatureMode, keterangan).then(u => {
        if (!active) { URL.revokeObjectURL(u); return; }
        url = u;
        setPdfBlobUrl(u);
      }).catch(console.error);
    }
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewInvoice, signatureMode, keterangan]);

  async function handleDownloadInvoice() {
    if (!previewInvoice) return;
    try {
      setDownloading(true);
      await downloadInvoicePdf(previewInvoice, profile, signatureMode, keterangan);
    } catch (e) { console.error(e); }
    finally { setDownloading(false); }
  }

  // Filter & Search State
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');

  // Filtered Invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // Search
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesNo = inv.invoice_no.toLowerCase().includes(query);
        const matchesName = inv.customer_name.toLowerCase().includes(query);
        const matchesAddr = (inv.customer_address || '').toLowerCase().includes(query);
        if (!matchesNo && !matchesName && !matchesAddr) return false;
      }

      // Status
      if (statusFilter !== 'all' && inv.status !== statusFilter) {
        return false;
      }

      // Type
      if (typeFilter !== 'all' && inv.invoice_type !== typeFilter) {
        return false;
      }

      // Source
      if (sourceFilter !== 'all' && inv.source_type !== sourceFilter) {
        return false;
      }

      return true;
    });
  }, [invoices, search, statusFilter, typeFilter, sourceFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = invoices.length;
    const draft = invoices.filter((i) => i.status === 'draft').length;
    const sent = invoices.filter((i) => i.status === 'sent').length;
    const paid = invoices.filter((i) => i.status === 'paid').length;
    const cancelled = invoices.filter((i) => i.status === 'cancelled').length;

    const totalDue = invoices
      .filter((i) => i.status === 'sent')
      .reduce((sum, i) => sum + (Number(i.amount_due) || 0), 0);

    const totalPaid = invoices
      .filter((i) => i.status === 'paid')
      .reduce((sum, i) => sum + (Number(i.grand_total) || 0), 0);

    return { total, draft, sent, paid, cancelled, totalDue, totalPaid };
  }, [invoices]);

  // Actions
  function handleOpenCreate() {
    setEditingInvoice(null);
    setIsFormOpen(true);
  }

  function handleOpenEdit(inv: Invoice) {
    if (inv.status !== 'draft') {
      alert('Hanya invoice berstatus draft yang dapat diubah rinciannya.');
      return;
    }
    setEditingInvoice(inv);
    setIsFormOpen(true);
  }

  async function handleDelete(inv: Invoice) {
    if (inv.status !== 'draft') {
      alert('Invoice yang sudah diterbitkan (sent/paid) atau dibatalkan tidak dapat dihapus.');
      return;
    }

    if (!window.confirm(`Hapus invoice ${inv.invoice_no} untuk ${inv.customer_name}?`)) {
      return;
    }

    try {
      await deleteInvoice(inv.id);
    } catch (err: any) {
      alert(err.message || 'Gagal menghapus invoice.');
    }
  }

  async function handleStatusChange(inv: Invoice, nextStatus: InvoiceStatus) {
    let confirmMsg = '';
    if (nextStatus === 'sent') {
      confirmMsg = `Tandai invoice ${inv.invoice_no} sebagai TERKIRIM ke pelanggan?`;
    } else if (nextStatus === 'paid') {
      confirmMsg = `Tandai invoice ${inv.invoice_no} sebagai LUNAS? (Catatan: Ini tidak mengubah pencatatan kas/jurnal akuntansi)`;
    } else if (nextStatus === 'cancelled') {
      confirmMsg = `Yakin ingin MEMBATALKAN invoice ${inv.invoice_no}? Status pembatalan bersifat permanen.`;
    }

    if (confirmMsg && !window.confirm(confirmMsg)) {
      return;
    }

    try {
      await setInvoiceStatus(inv.id, nextStatus);
    } catch (err: any) {
      alert(err.message || 'Gagal memperbarui status invoice.');
    }
  }

  // Badges
  function renderTypeBadge(type: InvoiceType) {
    switch (type) {
      case 'dp':
        return (
          <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200">
            DP (Uang Muka)
          </span>
        );
      case 'pelunasan':
        return (
          <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 border border-indigo-200">
            Pelunasan
          </span>
        );
      case 'penuh':
        return (
          <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 border border-purple-200">
            Penuh
          </span>
        );
    }
  }

  function renderStatusBadge(status: InvoiceStatus) {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" /> Lunas
          </span>
        );
      case 'sent':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 border border-blue-200">
            <Send className="h-3 w-3" /> Terkirim
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 border border-rose-200">
            <XCircle className="h-3.5 w-3.5" /> Dibatalkan
          </span>
        );
      case 'draft':
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 border border-slate-200">
            <Clock className="h-3.5 w-3.5" /> Draft
          </span>
        );
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* HEADER SECTION */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              Invoice & Penagihan
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Kelola faktur tagihan pelanggan untuk uang muka (DP), pelunasan sisa pesanan, atau tagihan penuh
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link to="/quotations">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs text-slate-700 hover:bg-slate-50 border-slate-200"
              >
                <FileText className="h-3.5 w-3.5 text-amber-600" />
                Dari Penawaran
              </Button>
            </Link>
            <Link to="/orders">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs text-slate-700 hover:bg-slate-50 border-slate-200"
              >
                <Package className="h-3.5 w-3.5 text-indigo-600" />
                Dari Pesanan
              </Button>
            </Link>
          </div>
        </div>

        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
            <p className="text-xs font-medium text-muted-foreground">Total Invoice</p>
            <p className="text-2xl font-bold text-foreground mt-1">{stats.total}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Seluruh riwayat</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
            <p className="text-xs font-medium text-slate-500">Draft</p>
            <p className="text-2xl font-bold text-slate-700 mt-1">{stats.draft}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Belum diterbitkan</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
            <p className="text-xs font-medium text-blue-600">Terkirim (Menunggu)</p>
            <p className="text-2xl font-bold text-blue-700 mt-1">{stats.sent}</p>
            <p className="text-[11px] font-mono font-medium text-blue-600 mt-1">
              {formatIDR(stats.totalDue)}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
            <p className="text-xs font-medium text-emerald-600">Lunas</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">{stats.paid}</p>
            <p className="text-[11px] font-mono font-medium text-emerald-600 mt-1">
              {formatIDR(stats.totalPaid)}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-xs col-span-2 sm:col-span-1">
            <p className="text-xs font-medium text-rose-600">Dibatalkan</p>
            <p className="text-2xl font-bold text-rose-700 mt-1">{stats.cancelled}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Tidak ditagihkan</p>
          </div>
        </div>

        {/* TOOLBAR FILTER & CARI */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between rounded-xl border border-border bg-card p-3 shadow-xs">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Cari nomor invoice, nama pelanggan, alamat..."
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
              <option value="paid">Lunas</option>
              <option value="cancelled">Dibatalkan</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
            >
              <option value="all">Semua Jenis</option>
              <option value="dp">Uang Muka (DP)</option>
              <option value="pelunasan">Pelunasan</option>
              <option value="penuh">Penuh</option>
            </select>

            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
            >
              <option value="all">Semua Sumber</option>
              <option value="manual">Manual</option>
              <option value="quotation">Dari Penawaran</option>
              <option value="order">Dari Pesanan</option>
            </select>
          </div>
        </div>

        {/* INVOICE LIST TABLE */}
        <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-xs text-muted-foreground">
              Memuat data invoice...
            </div>
          ) : error ? (
            <div className="p-12 text-center text-xs text-rose-600">
              Terjadi kesalahan: {error}
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground space-y-2">
              <FileText className="h-8 w-8 text-slate-300 mx-auto" />
              <p className="font-semibold text-slate-700">Belum ada invoice ditemukan</p>
              <p className="text-[11px] text-slate-400">
                Invoice otomatis diterbitkan saat Anda membuat Surat Penawaran (Invoice DP) atau Pesanan (Invoice Pelunasan).
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-foreground">
                <thead className="bg-muted/50 text-[11px] font-bold text-muted-foreground uppercase border-b border-border">
                  <tr>
                    <th className="py-3 px-4">Nomor & Jenis</th>
                    <th className="py-3 px-4">Tanggal</th>
                    <th className="py-3 px-4">Pelanggan</th>
                    <th className="py-3 px-4">Rujukan / Sumber</th>
                    <th className="py-3 px-4 text-right">Total Tagihan</th>
                    <th className="py-3 px-4 text-right">Jumlah Ditagih</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                      {/* Nomor & Jenis */}
                      <td className="py-3 px-4 font-medium">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-primary">
                            {inv.invoice_no}
                          </span>
                          {renderTypeBadge(inv.invoice_type)}
                        </div>
                      </td>

                      {/* Tanggal & Tempo */}
                      <td className="py-3 px-4 text-muted-foreground">
                        <div>
                          <span className="text-foreground">{formatDateID(inv.invoice_date)}</span>
                          {inv.due_date && (
                            <span className="block text-[10px] text-slate-400 mt-0.5">
                              Tempo: {formatDateID(inv.due_date)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Pelanggan */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-foreground">
                          {inv.customer_name}
                        </div>
                        {inv.customer_address && (
                          <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                            {inv.customer_address}
                          </div>
                        )}
                      </td>

                      {/* Rujukan / Sumber */}
                      <td className="py-3 px-4">
                        {inv.source_type === 'quotation' && inv.quotation ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                            PNW: {inv.quotation.quotation_no}
                          </span>
                        ) : inv.source_type === 'order' && inv.order ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                            ORD: {inv.order.order_id}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">Manual</span>
                        )}
                      </td>

                      {/* Total Tagihan */}
                      <td className="py-3 px-4 text-right">
                        <span className="font-medium text-slate-600">
                          {formatIDR(inv.grand_total)}
                        </span>
                        {Number(inv.shipping_cost) > 0 && (
                          <span className="block text-[10px] text-slate-400">
                            (Termasuk ongkir: {formatIDR(inv.shipping_cost)})
                          </span>
                        )}
                      </td>

                      {/* Jumlah Ditagih */}
                      <td className="py-3 px-4 text-right">
                        <span className="font-mono font-bold text-slate-900 text-sm">
                          {formatIDR(inv.amount_due)}
                        </span>
                        {Number(inv.paid_amount) > 0 && (
                          <span className="block text-[10px] text-emerald-600 font-medium">
                            Terbayar: {formatIDR(inv.paid_amount)}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        {renderStatusBadge(inv.status)}
                      </td>

                      {/* Aksi */}
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Cetak / Preview PDF */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPreviewInvoice(inv)}
                            className="h-8 w-8 p-0 text-slate-600 hover:text-primary hover:bg-primary/10"
                            title="Pratinjau & Cetak Invoice"
                          >
                            <Printer className="h-4 w-4" />
                          </Button>

                          {/* Edit (Draft Only) */}
                          {inv.status === 'draft' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenEdit(inv)}
                              className="h-8 w-8 p-0 text-slate-600 hover:text-amber-600 hover:bg-amber-50"
                              title="Ubah Rincian"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          )}

                          {/* Transisi Status: Draft -> Sent */}
                          {inv.status === 'draft' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleStatusChange(inv, 'sent')}
                              className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              title="Tandai Terkirim ke Pelanggan"
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          )}

                          {/* Transisi Status: Sent -> Paid */}
                          {inv.status === 'sent' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleStatusChange(inv, 'paid')}
                              className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              title="Tandai Lunas"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                          )}

                          {/* Batalkan (Draft / Sent) */}
                          {(inv.status === 'draft' || inv.status === 'sent') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleStatusChange(inv, 'cancelled')}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                              title="Batalkan Invoice"
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          )}

                          {/* Hapus (Draft Only) */}
                          {inv.status === 'draft' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(inv)}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                              title="Hapus Invoice Draft"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
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
      </div>

      {/* MODAL FORM CREATE / EDIT */}
      {isFormOpen && (
        <InvoiceModal
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          invoiceToEdit={editingInvoice}
          onSave={saveInvoice}
        />
      )}

      {/* PDF PREVIEW DIALOG */}
      <PdfPreviewDialog
        open={Boolean(previewInvoice)}
        onClose={() => { setPreviewInvoice(null); setPdfBlobUrl(null); setSignatureMode('none'); setKeterangan(''); }}
        title={`Invoice — ${previewInvoice?.invoice_no ?? ''}`}
        subtitle={previewInvoice?.customer_name}
        pdfUrl={pdfBlobUrl}
        onDownload={handleDownloadInvoice}
        downloading={downloading}
        signatureMode={signatureMode}
        onSignatureModeChange={setSignatureMode}
        hasSignature={Boolean(profile.signatureUrl)}
        hasStamp={Boolean(profile.stampUrl)}
        sideContent={
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Keterangan</label>
            <textarea
              rows={4}
              value={keterangan}
              onChange={e => setKeterangan(e.target.value)}
              placeholder="Tambahkan keterangan untuk invoice..."
              className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        }
      />
    </AppShell>
  );
}
