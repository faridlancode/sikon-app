import { useState, useEffect } from 'react';
import { X, FileText, Calendar, Tag, AlertCircle } from 'lucide-react';
import { supabase } from '../../integrations/supabase/client';
import Button from '../ui/button';
import { formatIDR } from '../../utils/formatCurrency';
import type { JournalEntry } from '../../types';

interface JournalDetailModalProps {
  entryId: string | null;
  onClose: () => void;
}

export default function JournalDetailModal({
  entryId,
  onClose,
}: JournalDetailModalProps) {
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entryId) {
      setEntry(null);
      return;
    }

    let isMounted = true;
    async function fetchDetail() {
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await (supabase as any)
          .from('journal_entries')
          .select(`
            id,
            entry_no,
            entry_date,
            description,
            source_type,
            source_id,
            created_at,
            journal_lines (
              id,
              account_id,
              debit,
              credit,
              memo,
              line_no,
              accounts (
                id,
                code,
                name
              )
            )
          `)
          .eq('id', entryId)
          .single();

        if (err) throw err;
        if (isMounted) {
          // Urutkan baris jurnal berdasarkan line_no
          const sortedLines = [...(data.journal_lines || [])].sort(
            (a, b) => a.line_no - b.line_no
          );
          setEntry({ ...data, journal_lines: sortedLines });
        }
      } catch (e: any) {
        console.error(e);
        if (isMounted) setError(e.message || 'Gagal memuat rincian jurnal.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchDetail();
    return () => {
      isMounted = false;
    };
  }, [entryId]);

  if (!entryId) return null;

  const lines = entry?.journal_lines || [];
  const totalDebit = lines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Rincian Entri Jurnal
              </h3>
              <p className="text-xs text-muted-foreground font-mono">
                {entry?.entry_no || 'Memuat...'}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              Memuat data rincian jurnal...
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive-soft p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : entry ? (
            <>
              {/* Info meta jurnal */}
              <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-3 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Tanggal:</span>
                  <div className="flex items-center gap-1 font-medium mt-0.5">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{entry.entry_date}</span>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Sumber:</span>
                  <div className="flex items-center gap-1 font-medium mt-0.5">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="capitalize">{entry.source_type}</span>
                  </div>
                </div>
                <div className="sm:col-span-3">
                  <span className="text-muted-foreground block text-[11px]">Uraian:</span>
                  <p className="font-medium text-foreground mt-0.5">
                    {entry.description}
                  </p>
                </div>
              </div>

              {/* Tabel baris jurnal */}
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-muted/60 text-muted-foreground font-semibold">
                    <tr>
                      <th className="px-3 py-2 text-center w-10">#</th>
                      <th className="px-3 py-2">Akun</th>
                      <th className="px-3 py-2 text-right w-28">Debit</th>
                      <th className="px-3 py-2 text-right w-28">Kredit</th>
                      <th className="px-3 py-2">Memo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lines.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground italic text-xs">
                          Jurnal tidak memiliki baris mutasi (order atau transaksi bernilai nol).
                        </td>
                      </tr>
                    ) : (
                      lines.map((line, idx) => (
                        <tr key={line.id || idx} className="hover:bg-muted/10">
                          <td className="px-3 py-2 text-center font-mono text-muted-foreground">
                            {line.line_no || idx + 1}
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-mono font-semibold text-foreground mr-1.5">
                              {line.accounts?.code}
                            </span>
                            <span className="text-muted-foreground">
                              {line.accounts?.name}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-foreground">
                            {Number(line.debit) > 0 ? formatIDR(line.debit) : '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-foreground">
                            {Number(line.credit) > 0 ? formatIDR(line.credit) : '-'}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground italic truncate max-w-[140px]">
                            {line.memo || '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot className="border-t-2 border-border bg-muted/50 font-semibold text-foreground">
                    <tr>
                      <td colSpan={2} className="px-3 py-2 text-right uppercase tracking-wider text-[11px]">
                        Total
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-primary font-bold">
                        {formatIDR(totalDebit)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-primary font-bold">
                        {formatIDR(totalCredit)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Tutup
          </Button>
        </div>
      </div>
    </div>
  );
}
