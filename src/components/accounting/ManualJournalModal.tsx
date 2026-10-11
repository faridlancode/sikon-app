import React, { useState } from 'react';
import { X, Plus, Trash2, AlertCircle, CheckCircle2, FileText } from 'lucide-react';
import Button from '../ui/button';
import { formatIDR, parseIDRInput } from '../../utils/formatCurrency';
import { todayISO } from '../../utils/dateHelpers';
import type { Account } from '../../types';

interface JournalLineForm {
  account_id: string;
  debit: number;
  credit: number;
  memo: string;
}

interface ManualJournalModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  onSubmit: (entry: {
    entry_date: string;
    description: string;
    lines: {
      account_id: string;
      debit: number;
      credit: number;
      memo?: string;
    }[];
  }) => Promise<void>;
}

export default function ManualJournalModal({
  isOpen,
  onClose,
  accounts,
  onSubmit,
}: ManualJournalModalProps) {
  const today = todayISO();

  const [entryDate, setEntryDate] = useState(today);
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<JournalLineForm[]>([
    { account_id: '', debit: 0, credit: 0, memo: '' },
    { account_id: '', debit: 0, credit: 0, memo: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Akun-akun aktif
  const activeAccounts = accounts.filter((a) => a.is_active);

  // Kalkulasi total debit dan kredit live
  const totalDebit = lines.reduce((acc, line) => acc + (Number(line.debit) || 0), 0);
  const totalCredit = lines.reduce((acc, line) => acc + (Number(line.credit) || 0), 0);
  const diff = Math.abs(totalDebit - totalCredit);
  const isBalanced = diff < 0.001 && totalDebit > 0;

  function handleAddLine() {
    setLines([...lines, { account_id: '', debit: 0, credit: 0, memo: '' }]);
  }

  function handleRemoveLine(index: number) {
    if (lines.length <= 2) {
      setError('Jurnal umum minimal membutuhkan 2 baris transaksi.');
      return;
    }
    setLines(lines.filter((_, i) => i !== index));
  }

  function handleLineChange(
    index: number,
    field: keyof JournalLineForm,
    val: any
  ) {
    setError(null);
    const updated = [...lines];
    if (field === 'debit') {
      const num = Number(val) || 0;
      updated[index].debit = num;
      if (num > 0) updated[index].credit = 0; // Satu sisi saja yang terisi
    } else if (field === 'credit') {
      const num = Number(val) || 0;
      updated[index].credit = num;
      if (num > 0) updated[index].debit = 0;
    } else {
      (updated[index] as any)[field] = val;
    }
    setLines(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!entryDate) {
      setError('Tanggal jurnal wajib diisi.');
      return;
    }
    if (!description.trim()) {
      setError('Keterangan / uraian jurnal wajib diisi.');
      return;
    }
    if (!isBalanced) {
      setError(
        `Jurnal tidak seimbang. Total Debit (${formatRupiah(
          totalDebit
        )}) tidak sama dengan Total Kredit (${formatRupiah(totalCredit)}).`
      );
      return;
    }

    // Validasi baris akun
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.account_id) {
        setError(`Baris #${i + 1}: Silakan pilih akun.`);
        return;
      }
      if (l.debit <= 0 && l.credit <= 0) {
        setError(`Baris #${i + 1}: Nominal debit atau kredit harus lebih dari 0.`);
        return;
      }
    }

    setSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        entry_date: entryDate,
        description: description.trim(),
        lines: lines.map((l) => ({
          account_id: l.account_id,
          debit: l.debit,
          credit: l.credit,
          memo: l.memo.trim() || undefined,
        })),
      });
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Gagal menyimpan jurnal manual.');
    } finally {
      setSubmitting(false);
    }
  }

  function formatRupiah(val: number) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(val || 0);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[95vh] w-full max-w-4xl flex-col rounded-xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Buat Jurnal Umum Manual
              </h2>
              <p className="text-xs text-muted-foreground">
                Catat transaksi penyesuaian, modal, atau koreksi berpasangan (double-entry)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto p-6">
          <div className="space-y-4">
            {error && (
              <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive-soft p-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="text-xs font-medium text-foreground">
                  Tanggal Jurnal <span className="text-destructive">*</span>
                </label>
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  required
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-foreground">
                  Uraian / Keterangan Transaksi <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Setoran modal awal / Penyesuaian kas"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            {/* Tabel Baris Jurnal Dinamis */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-foreground">
                  Daftar Baris Jurnal (Minimal 2 Baris)
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddLine}
                  className="gap-1.5 text-xs h-8"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Tambah Baris
                </Button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-muted/50 font-semibold text-muted-foreground">
                    <tr>
                      <th className="p-2.5 w-10 text-center">#</th>
                      <th className="p-2.5 min-w-[220px]">Akun Akuntansi</th>
                      <th className="p-2.5 w-36 text-right">Debit (Rp)</th>
                      <th className="p-2.5 w-36 text-right">Kredit (Rp)</th>
                      <th className="p-2.5 min-w-[160px]">Memo (Opsional)</th>
                      <th className="p-2.5 w-12 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-muted/10">
                        <td className="p-2.5 text-center font-mono text-muted-foreground">
                          {idx + 1}
                        </td>
                        <td className="p-2.5">
                          <select
                            value={line.account_id}
                            onChange={(e) =>
                              handleLineChange(idx, 'account_id', e.target.value)
                            }
                            required
                            className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            <option value="">-- Pilih Akun --</option>
                            {activeAccounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.code} - {a.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2.5">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={line.debit ? new Intl.NumberFormat('id-ID').format(line.debit) : ''}
                            placeholder="0"
                            onChange={(e) =>
                              handleLineChange(idx, 'debit', parseIDRInput(e.target.value))
                            }
                            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-right font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        <td className="p-2.5">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={line.credit ? new Intl.NumberFormat('id-ID').format(line.credit) : ''}
                            placeholder="0"
                            onChange={(e) =>
                              handleLineChange(idx, 'credit', parseIDRInput(e.target.value))
                            }
                            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-right font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        <td className="p-2.5">
                          <input
                            type="text"
                            placeholder="Catatan baris"
                            value={line.memo}
                            onChange={(e) =>
                              handleLineChange(idx, 'memo', e.target.value)
                            }
                            className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            className="rounded p-1 text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                            title="Hapus baris"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Live Balance Footer */}
                  <tfoot className="border-t border-border bg-muted/40 font-semibold">
                    <tr>
                      <td colSpan={2} className="p-3 text-right">
                        Total Jurnal:
                      </td>
                      <td className="p-3 text-right font-mono text-xs">
                        {formatRupiah(totalDebit)}
                      </td>
                      <td className="p-3 text-right font-mono text-xs">
                        {formatRupiah(totalCredit)}
                      </td>
                      <td colSpan={2} className="p-3">
                        {isBalanced ? (
                          <div className="flex items-center gap-1.5 text-success text-[11px]">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Seimbang</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-destructive text-[11px]">
                            <AlertCircle className="h-4 w-4" />
                            <span>Selisih: {formatRupiah(diff)}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
            <div className="text-xs text-muted-foreground">
              {!isBalanced && (
                <span className="text-destructive">
                  * Tombol simpan dinonaktifkan sampai total debit sama dengan total kredit.
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={submitting}
              >
                Batal
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!isBalanced || submitting}
              >
                {submitting ? 'Menyimpan...' : 'Simpan Jurnal'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
