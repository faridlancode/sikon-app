import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Calendar,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Filter,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';
import Card from '../ui/card';
import Button from '../ui/button';
import ManualJournalModal from './ManualJournalModal';
import type { JournalEntry, Account } from '../../types';

interface GeneralJournalTabProps {
  entries: JournalEntry[];
  accounts: Account[];
  loading: boolean;
  onFilterChange: (filters: {
    startDate?: string;
    endDate?: string;
    sourceType?: string;
    search?: string;
  }) => void;
  onCreateManualJournal: (entry: {
    entry_date: string;
    description: string;
    lines: {
      account_id: string;
      debit: number;
      credit: number;
      memo?: string;
    }[];
  }) => Promise<void>;
  onReverseJournal: (entryId: string, reason: string) => Promise<void>;
}

export default function GeneralJournalTab({
  entries,
  accounts,
  loading,
  onFilterChange,
  onCreateManualJournal,
  onReverseJournal,
}: GeneralJournalTabProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [expandedEntries, setExpandedEntries] = useState<Record<string, boolean>>({});

  // Filter local state
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sourceType, setSourceType] = useState('all');

  // Modal Balik Jurnal state
  const [reverseModalOpen, setReverseModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reversing, setReversing] = useState(false);
  const [reverseError, setReverseError] = useState<string | null>(null);

  function toggleExpand(id: string) {
    setExpandedEntries((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function handleApplyFilters() {
    onFilterChange({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      sourceType: sourceType !== 'all' ? sourceType : undefined,
      search: search.trim() || undefined,
    });
  }

  function handleResetFilters() {
    setSearch('');
    setStartDate('');
    setEndDate('');
    setSourceType('all');
    onFilterChange({});
  }

  function openReverseModal(entry: JournalEntry) {
    setSelectedEntry(entry);
    setReverseReason(`Pembalikan jurnal ${entry.entry_no}`);
    setReverseError(null);
    setReverseModalOpen(true);
  }

  async function handleConfirmReverse() {
    if (!selectedEntry) return;
    if (!reverseReason.trim()) {
      setReverseError('Alasan pembalikan jurnal wajib diisi.');
      return;
    }

    setReversing(true);
    setReverseError(null);
    try {
      await onReverseJournal(selectedEntry.id, reverseReason.trim());
      setReverseModalOpen(false);
      setSelectedEntry(null);
    } catch (err: any) {
      console.error(err);
      setReverseError(err.message || 'Gagal membalik jurnal.');
    } finally {
      setReversing(false);
    }
  }

  const formatRupiah = (val: number) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(val || 0);

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'manual':
        return (
          <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
            Manual
          </span>
        );
      case 'opening_balance':
        return (
          <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium bg-success-soft text-success border border-success/20">
            Saldo Awal
          </span>
        );
      case 'order_forfeit':
        return (
          <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium bg-warning-soft text-warning border border-warning/20">
            DP Hangus
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground border border-border">
            Otomatis
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Action & Filter Bar */}
      <Card className="p-4 border border-border">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 flex-1">
            {/* Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="Cari no. jurnal / uraian..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
                className="w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs h-9 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            </div>

            {/* Sumber */}
            <div>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">Semua Sumber</option>
                <option value="manual">Manual</option>
                <option value="transaction">Transaksi Kas/Bank</option>
                <option value="opening_balance">Saldo Awal</option>
                <option value="order_forfeit">DP Hangus</option>
              </select>
            </div>

            {/* Tanggal Dari */}
            <div className="relative">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs h-9 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                title="Tanggal Mulai"
              />
              <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            </div>

            {/* Tanggal Sampai */}
            <div className="relative">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs h-9 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                title="Tanggal Akhir"
              />
              <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleApplyFilters}
              className="gap-1.5 text-xs h-9"
            >
              <Filter className="h-3.5 w-3.5" />
              Saring
            </Button>
            {(search || startDate || endDate || sourceType !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="text-xs h-9"
              >
                Reset
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => setModalOpen(true)}
              className="gap-1.5 text-xs h-9"
            >
              <Plus className="h-4 w-4" />
              Buat Jurnal
            </Button>
          </div>
        </div>
      </Card>

      {/* Tabel Jurnal */}
      <Card className="overflow-hidden border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/50 font-semibold text-muted-foreground">
              <tr>
                <th className="p-3 w-8"></th>
                <th className="p-3">No. Jurnal</th>
                <th className="p-3">Tanggal</th>
                <th className="p-3">Uraian / Keterangan</th>
                <th className="p-3">Sumber</th>
                <th className="p-3 text-right">Total Debit</th>
                <th className="p-3 text-right">Total Kredit</th>
                <th className="p-3 text-center w-28">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    Memuat daftar jurnal...
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <FileSpreadsheet className="h-8 w-8 text-muted-foreground/50" />
                      <p>Belum ada entri jurnal yang tercatat.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const isExpanded = !!expandedEntries[entry.id];
                  const lines = entry.journal_lines || [];
                  const totalDebit = lines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0);
                  const totalCredit = lines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0);
                  const isManual = entry.source_type === 'manual';

                  return (
                    <React.Fragment key={entry.id}>
                      <tr className="hover:bg-muted/10 transition-colors">
                        <td className="p-3 text-center">
                          <button
                            onClick={() => toggleExpand(entry.id)}
                            className="rounded p-1 hover:bg-muted text-muted-foreground"
                            title={isExpanded ? 'Tutup rincian' : 'Buka rincian'}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </td>
                        <td className="p-3 font-mono font-semibold text-foreground">
                          {entry.entry_no}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {entry.entry_date}
                        </td>
                        <td className="p-3 font-medium text-foreground max-w-xs truncate" title={entry.description}>
                          {entry.description}
                        </td>
                        <td className="p-3">{getSourceBadge(entry.source_type)}</td>
                        <td className="p-3 text-right font-mono text-foreground">
                          {formatRupiah(totalDebit)}
                        </td>
                        <td className="p-3 text-right font-mono text-foreground">
                          {formatRupiah(totalCredit)}
                        </td>
                        <td className="p-3 text-center">
                          {isManual && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openReverseModal(entry)}
                              className="h-7 px-2 text-[11px] gap-1 text-destructive hover:bg-destructive-soft hover:text-destructive"
                              title="Balik jurnal ini"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Balik
                            </Button>
                          )}
                        </td>
                      </tr>

                      {/* Baris Rincian Jurnal (Expanded) */}
                      {isExpanded && (
                        <tr className="bg-muted/30">
                          <td colSpan={8} className="p-4">
                            <div className="rounded-lg border border-border bg-card overflow-hidden">
                              <table className="w-full text-left text-xs">
                                <thead className="border-b border-border bg-muted/60 text-muted-foreground font-semibold">
                                  <tr>
                                    <th className="p-2.5 w-10 text-center">#</th>
                                    <th className="p-2.5">Kode & Nama Akun</th>
                                    <th className="p-2.5 text-right w-36">Debit</th>
                                    <th className="p-2.5 text-right w-36">Kredit</th>
                                    <th className="p-2.5">Memo / Keterangan Baris</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                  {lines.length === 0 ? (
                                    <tr>
                                      <td colSpan={5} className="p-4 text-center text-muted-foreground italic text-xs">
                                        Jurnal tidak memiliki baris mutasi (order atau transaksi bernilai nol).
                                      </td>
                                    </tr>
                                  ) : (
                                    lines.map((line, lIdx) => (
                                      <tr key={line.id || lIdx} className="hover:bg-muted/10">
                                        <td className="p-2.5 text-center text-muted-foreground font-mono">
                                          {line.line_no || lIdx + 1}
                                        </td>
                                        <td className="p-2.5 font-medium text-foreground">
                                          <span className="font-mono text-muted-foreground mr-2">
                                            {line.accounts?.code}
                                          </span>
                                          {line.accounts?.name}
                                        </td>
                                        <td className="p-2.5 text-right font-mono">
                                          {line.debit > 0 ? formatRupiah(line.debit) : '-'}
                                        </td>
                                        <td className="p-2.5 text-right font-mono">
                                          {line.credit > 0 ? formatRupiah(line.credit) : '-'}
                                        </td>
                                        <td className="p-2.5 text-muted-foreground text-[11px]">
                                          {line.memo || '-'}
                                        </td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal Jurnal Manual */}
      <ManualJournalModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        accounts={accounts}
        onSubmit={onCreateManualJournal}
      />

      {/* Modal Konfirmasi Balik Jurnal */}
      {reverseModalOpen && selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2.5 text-destructive">
              <RotateCcw className="h-5 w-5" />
              <h3 className="text-base font-semibold text-foreground">
                Balik Jurnal {selectedEntry.entry_no}
              </h3>
            </div>

            <p className="text-xs text-muted-foreground">
              Tindakan ini akan membuat satu jurnal pembalik baru dengan membalik seluruh posisi debit dan kredit dari transaksi ini.
            </p>

            {reverseError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive-soft p-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{reverseError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Alasan Pembalikan <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                required
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReverseModalOpen(false)}
                disabled={reversing}
              >
                Batal
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmReverse}
                disabled={reversing}
              >
                {reversing ? 'Membalik...' : 'Konfirmasi Balik Jurnal'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
