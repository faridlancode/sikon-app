import React, { useState, useEffect } from 'react';
import { X, Sparkles, Calendar, AlertTriangle, AlertCircle } from 'lucide-react';
import Button from '../ui/button';
import { formatIDR, parseIDRInput } from '../../utils/formatCurrency';
import type { OpeningBalanceSuggestion } from '../../types';

interface OpeningRow {
  code: string;
  name: string;
  debit: number;
  credit: number;
  memo: string;
  account_id?: string;
}

interface ActivateAccountingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onActivate: (booksStartDate: string, openingLines?: any[]) => Promise<void>;
  getOpeningBalanceSuggestion: (
    booksStartDate: string
  ) => Promise<OpeningBalanceSuggestion[]>;
}

export default function ActivateAccountingModal({
  isOpen,
  onClose,
  onActivate,
  getOpeningBalanceSuggestion,
}: ActivateAccountingModalProps) {
  // Default tanggal 1 bulan berjalan
  const today = new Date();
  const defaultDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;

  const [booksStartDate, setBooksStartDate] = useState(defaultDate);
  const [rows, setRows] = useState<OpeningRow[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [includeOpeningBalance, setIncludeOpeningBalance] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ambil saran saldo awal setiap kali tanggal berubah
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function loadSuggestions() {
      setLoadingSuggestions(true);
      setError(null);
      try {
        const data = await getOpeningBalanceSuggestion(booksStartDate);
        if (!isMounted) return;

        // Cari nilai usulan kas_bank, karyawan, persediaan, pelanggan
        const bankSug = data.find((s) => s.code === '1-1200');
        const umkSug = data.find((s) => s.code === '1-1400');
        const matSug = data.find((s) => s.code === '1-1500');
        const custSug = data.find((s) => s.code === '2-1200');

        const totalKasBank = bankSug?.suggested_debit ?? 0;

        // Inisialisasi baris editable dengan pembagian Kas (1-1100) dan Bank (1-1200)
        setRows([
          {
            code: '1-1100',
            name: 'Kas',
            debit: 0,
            credit: 0,
            memo: 'Saldo kas fisik',
          },
          {
            code: '1-1200',
            name: 'Bank',
            debit: totalKasBank,
            credit: 0,
            memo: 'Saldo rekening bank',
          },
          {
            code: '1-1400',
            name: 'Uang Muka Karyawan (Purchasing)',
            debit: umkSug?.suggested_debit ?? 0,
            credit: 0,
            memo: 'Uang muka karyawan outstanding',
          },
          {
            code: '1-1500',
            name: 'Persediaan Bahan Baku',
            debit: matSug?.suggested_debit ?? 0,
            credit: 0,
            memo: 'Persediaan bahan baku',
          },
          {
            code: '2-1200',
            name: 'Uang Muka Pelanggan',
            debit: 0,
            credit: custSug?.suggested_credit ?? 0,
            memo: 'DP pelanggan belum selesai',
          },
        ]);
      } catch (err: any) {
        if (isMounted) {
          console.warn('Gagal memuat saran saldo awal:', err);
          setError(err.message || 'Gagal memuat saran saldo awal.');
        }
      } finally {
        if (isMounted) setLoadingSuggestions(false);
      }
    }

    loadSuggestions();
    return () => {
      isMounted = false;
    };
  }, [isOpen, booksStartDate, getOpeningBalanceSuggestion]);

  if (!isOpen) return null;

  function updateRowAmount(idx: number, field: 'debit' | 'credit', val: number) {
    const next = [...rows];
    next[idx][field] = val;
    // Jika debit diisi > 0, kredit 0, dan sebaliknya
    if (field === 'debit' && val > 0) next[idx].credit = 0;
    if (field === 'credit' && val > 0) next[idx].debit = 0;
    setRows(next);
  }

  // Hitung total debit dan kredit
  const totalDebit = rows.reduce((acc, r) => acc + (r.debit || 0), 0);
  const totalCredit = rows.reduce((acc, r) => acc + (r.credit || 0), 0);
  const balanceDiff = totalDebit - totalCredit;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!booksStartDate) {
      setError('Tanggal mulai pembukuan wajib diisi.');
      return;
    }

    // Tanggal harus tanggal 1
    const day = booksStartDate.split('-')[2];
    if (day !== '01') {
      setError('Tanggal mulai pembukuan harus tanggal 1 (awal bulan).');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let linesToPost: any[] | undefined = undefined;
      if (includeOpeningBalance) {
        linesToPost = rows
          .filter((r) => r.debit > 0 || r.credit > 0)
          .map((r) => ({
            code: r.code,
            debit: r.debit,
            credit: r.credit,
            memo: r.memo,
          }));
      }

      await onActivate(booksStartDate, linesToPost);
      onClose();
    } catch (err: any) {
      console.error('Error saat aktivasi pembukuan:', err);
      setError(err.message || 'Gagal mengaktifkan akuntansi.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Aktifkan Pembukuan Akuntansi
              </h2>
              <p className="text-xs text-muted-foreground">
                Inisialisasi 33 akun standar (COA) dan tetapkan tanggal mulai pembukuan
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto p-6">
          <div className="space-y-5">
            {error && (
              <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive-soft p-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Input Tanggal Mulai */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Tanggal Mulai Pembukuan <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={booksStartDate}
                  onChange={(e) => setBooksStartDate(e.target.value)}
                  required
                  className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Wajib tanggal 1 (awal bulan). Transaksi sebelum tanggal ini tidak akan masuk ke jurnal mutasi, melainkan dirangkum dalam saldo awal.
              </p>
            </div>

            {/* Peringatan Stok Persediaan */}
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <span className="font-semibold">Perhatian: </span>
                Nilai persediaan dihitung dari stok saat ini; koreksi bila sudah ada pergerakan stok sejak tanggal mulai.
              </div>
            </div>

            {/* Tabel Saldo Awal yang Dapat Diedit */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-foreground">
                    Saldo Awal Pembukuan
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Sesuaikan pembagian saldo Kas vs Bank dan rincian saldo awal sesuai kondisi riil perusahaan.
                  </p>
                </div>
                {loadingSuggestions && (
                  <span className="text-xs text-muted-foreground animate-pulse">
                    Menghitung usulan...
                  </span>
                )}
              </div>

              <div className="overflow-x-auto rounded border border-border bg-card">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-muted/50 font-semibold text-muted-foreground">
                    <tr>
                      <th className="p-2.5">Akun</th>
                      <th className="p-2.5 text-right w-36">Debit (Rp)</th>
                      <th className="p-2.5 text-right w-36">Kredit (Rp)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((row, idx) => (
                      <tr key={row.code} className="hover:bg-muted/10">
                        <td className="p-2.5">
                          <span className="font-mono text-[11px] text-muted-foreground mr-1.5 font-semibold">
                            {row.code}
                          </span>
                          <span className="font-medium text-foreground">{row.name}</span>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {row.memo}
                          </div>
                        </td>
                        <td className="p-2.5">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={row.debit ? new Intl.NumberFormat('id-ID').format(row.debit) : ''}
                            placeholder="0"
                            onChange={(e) =>
                              updateRowAmount(idx, 'debit', parseIDRInput(e.target.value))
                            }
                            className="w-full rounded border border-input bg-background px-2 py-1 text-right font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        <td className="p-2.5">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={row.credit ? new Intl.NumberFormat('id-ID').format(row.credit) : ''}
                            placeholder="0"
                            onChange={(e) =>
                              updateRowAmount(idx, 'credit', parseIDRInput(e.target.value))
                            }
                            className="w-full rounded border border-input bg-background px-2 py-1 text-right font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-border bg-muted/40 font-semibold">
                    <tr>
                      <td className="p-2.5 text-foreground">Total Subtotal</td>
                      <td className="p-2.5 text-right font-mono text-foreground">
                        {formatIDR(totalDebit)}
                      </td>
                      <td className="p-2.5 text-right font-mono text-foreground">
                        {formatIDR(totalCredit)}
                      </td>
                    </tr>
                    <tr className="text-muted-foreground text-[11px]">
                      <td className="p-2.5 italic">
                        Penyeimbang: 3-2000 Laba Ditahan (otomatis)
                      </td>
                      <td className="p-2.5 text-right font-mono italic">
                        {balanceDiff < 0 ? formatIDR(Math.abs(balanceDiff)) : '-'}
                      </td>
                      <td className="p-2.5 text-right font-mono italic">
                        {balanceDiff > 0 ? formatIDR(balanceDiff) : '-'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <label className="flex items-center gap-2 pt-1 text-xs text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeOpeningBalance}
                  onChange={(e) => setIncludeOpeningBalance(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                />
                <span>
                  Langsung bukukan saldo awal di atas ke Jurnal Umum saat aktivasi
                </span>
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={submitting}
            >
              Batal
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? 'Memproses...' : 'Aktifkan Akuntansi'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
