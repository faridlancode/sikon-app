import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  BookMarked,
  Calendar,
  AlertCircle,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import Button from '../ui/button';
import { formatIDR } from '../../utils/formatCurrency';
import { todayISO, startOfMonthISO } from '../../utils/dateHelpers';
import JournalDetailModal from './JournalDetailModal';
import type {
  Account,
  AccountingSettings,
  GeneralLedgerRow,
  TrialBalanceRow,
} from '../../types';

interface GeneralLedgerTabProps {
  settings: AccountingSettings | null;
  accounts: Account[];
  getGeneralLedger: (
    accountId: string,
    from: string,
    to: string
  ) => Promise<GeneralLedgerRow[]>;
  getTrialBalance: (from: string, to: string) => Promise<TrialBalanceRow[]>;
  targetAccountId?: string | null;
  targetFromDate?: string | null;
  targetToDate?: string | null;
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  asset: 'Aset',
  liability: 'Liabilitas',
  equity: 'Ekuitas',
  revenue: 'Pendapatan',
  expense: 'Beban',
};

const REPORT_GROUP_LABELS: Record<string, string> = {
  current_asset: 'Aset Lancar',
  fixed_asset: 'Aset Tetap',
  contra_asset: 'Kontra Aset',
  suspense: 'Penampung Sementara',
  current_liability: 'Liabilitas Lancar',
  equity: 'Ekuitas',
  revenue: 'Pendapatan Usaha',
  cogs: 'HPP',
  opex: 'Beban Operasional',
  other: 'Lain-lain',
};

export default function GeneralLedgerTab({
  settings,
  accounts,
  getGeneralLedger,
  getTrialBalance,
  targetAccountId,
  targetFromDate,
  targetToDate,
}: GeneralLedgerTabProps) {
  const defaultTo = targetToDate || todayISO();
  const defaultFrom =
    targetFromDate || settings?.books_start_date || startOfMonthISO();

  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    targetAccountId || ''
  );
  const [fromDate, setFromDate] = useState<string>(defaultFrom);
  const [toDate, setToDate] = useState<string>(defaultTo);

  const [ledgerRows, setLedgerRows] = useState<GeneralLedgerRow[]>([]);
  const [openingBalance, setOpeningBalance] = useState<{
    debit: number;
    credit: number;
    net: number;
  }>({ debit: 0, credit: 0, net: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Penanda apakah user sudah memilih akun sendiri secara manual
  const userSelectedManually = useRef(false);

  // Modal rincian jurnal sumber
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);

  // Sinkronisasi bila dibuka dari klik baris laporan keuangan
  useEffect(() => {
    if (targetAccountId) {
      setSelectedAccountId(targetAccountId);
      userSelectedManually.current = true;
    }
    if (targetFromDate) {
      setFromDate(targetFromDate);
    }
    if (targetToDate) {
      setToDate(targetToDate);
    }
  }, [targetAccountId, targetFromDate, targetToDate]);

  // Cari default akun awal saat accounts tersedia: cari yang punya mutasi atau Bank (1-1200)
  useEffect(() => {
    if (userSelectedManually.current || accounts.length === 0) return;

    let initialId = selectedAccountId;
    if (!initialId) {
      // Prioritas 1: Bank (1-1200)
      const bankAcct = accounts.find((a) => a.code === '1-1200');
      // Prioritas 2: Kas pertama
      const cashAcct = accounts.find((a) => a.is_cash);
      // Prioritas 3: Akun pertama
      initialId = bankAcct?.id || cashAcct?.id || accounts[0].id;
      setSelectedAccountId(initialId);
    }

    // Ambil trial balance untuk mengecek apakah ada akun dengan mutasi periode
    getTrialBalance(fromDate, toDate)
      .then((tbData) => {
        if (userSelectedManually.current) return;
        // Cari akun pertama yang memiliki mutasi periode atau saldo awal
        const activeTb = tbData.find(
          (r) =>
            Number(r.period_debit) > 0 ||
            Number(r.period_credit) > 0 ||
            Number(r.opening_debit) > 0 ||
            Number(r.opening_credit) > 0
        );
        if (activeTb) {
          const match = accounts.find((a) => a.id === activeTb.account_id);
          if (match) {
            setSelectedAccountId(match.id);
          }
        }
      })
      .catch((err) => {
        console.warn('Gagal memuat trial balance untuk auto-select akun buku besar:', err);
      });
  }, [accounts, fromDate, toDate, getTrialBalance]);

  const selectedAccount = useMemo(() => {
    return accounts.find((a) => a.id === selectedAccountId);
  }, [accounts, selectedAccountId]);

  const fetchLedger = useCallback(async () => {
    if (!selectedAccountId || !fromDate || !toDate) return;
    setLoading(true);
    setError(null);
    try {
      // Panggil paralel: general ledger dan trial balance untuk ambil opening balance akun ini
      const [ledgerData, tbData] = await Promise.all([
        getGeneralLedger(selectedAccountId, fromDate, toDate),
        getTrialBalance(fromDate, toDate),
      ]);

      setLedgerRows(ledgerData);

      // Cari baris akun di trial balance untuk opening debit & credit
      const acctTb = tbData.find((r) => r.account_id === selectedAccountId);
      if (acctTb) {
        const dr = Number(acctTb.opening_debit) || 0;
        const cr = Number(acctTb.opening_credit) || 0;
        setOpeningBalance({
          debit: dr,
          credit: cr,
          net: dr - cr,
        });
      } else {
        setOpeningBalance({ debit: 0, credit: 0, net: 0 });
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Gagal memuat buku besar.');
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId, fromDate, toDate, getGeneralLedger, getTrialBalance]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  // Format saldo berjalan dengan akhiran D atau K
  function formatBalanceWithSide(val: number) {
    if (val === 0) return 'Rp 0';
    const abs = Math.abs(val);
    const side = val >= 0 ? 'D' : 'K';
    return `${formatIDR(abs)} ${side}`;
  }

  // Hitung total mutasi
  const totalMutation = ledgerRows.reduce(
    (acc, row) => {
      acc.debit += Number(row.debit) || 0;
      acc.credit += Number(row.credit) || 0;
      return acc;
    },
    { debit: 0, credit: 0 }
  );

  return (
    <div className="space-y-4">
      {/* Filter bar: Pilih Akun & Rentang Tanggal */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {/* Pemilih Akun */}
          <div className="flex items-center gap-2">
            <BookMarked className="h-4 w-4 text-muted-foreground" />
            <div className="relative min-w-[240px]">
              <select
                value={selectedAccountId}
                onChange={(e) => {
                  userSelectedManually.current = true;
                  setSelectedAccountId(e.target.value);
                }}
                className="w-full rounded-md border border-input bg-background py-1.5 pl-3 pr-8 text-xs font-medium shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {accounts.map((acct) => (
                  <option key={acct.id} value={acct.id}>
                    {acct.code} - {acct.name} {!acct.is_active ? '(Nonaktif)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Filter Periode */}
          <div className="flex items-center gap-1.5 text-xs">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-md border border-input bg-background px-2.5 py-1 text-xs shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-muted-foreground">s.d.</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-md border border-input bg-background px-2.5 py-1 text-xs shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={fetchLedger}
              disabled={loading}
              className="h-8 gap-1.5 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Segarkan
            </Button>
          </div>
        </div>

        {/* Info ringkas akun terpilih */}
        {selectedAccount && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded bg-muted px-2 py-0.5 font-mono font-semibold text-foreground">
              {selectedAccount.code}
            </span>
            <span className="font-medium text-foreground">
              {ACCOUNT_TYPE_LABELS[selectedAccount.account_type] || selectedAccount.account_type}
            </span>
            <span>•</span>
            <span>
              {REPORT_GROUP_LABELS[selectedAccount.report_group] ||
                selectedAccount.report_group.replace(/_/g, ' ')}
            </span>
            {!selectedAccount.is_active && (
              <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                Nonaktif
              </span>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive-soft p-3 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabel Buku Besar */}
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/50 font-semibold text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 w-24">Tanggal</th>
                <th className="px-3 py-2.5 w-32">No. Jurnal</th>
                <th className="px-3 py-2.5">Uraian Transaksi</th>
                <th className="px-3 py-2.5">Memo Baris</th>
                <th className="px-3 py-2.5 text-right w-28">Debit</th>
                <th className="px-3 py-2.5 text-right w-28">Kredit</th>
                <th className="px-3 py-2.5 text-right w-36">Saldo Berjalan</th>
                <th className="px-3 py-2.5 text-center w-12">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    Memuat data buku besar...
                  </td>
                </tr>
              ) : (
                <>
                  {/* Baris Saldo Awal Periode */}
                  <tr className="bg-muted/20 font-medium">
                    <td className="px-3 py-2 text-muted-foreground font-mono">
                      {fromDate}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground font-mono">-</td>
                    <td className="px-3 py-2 text-foreground font-semibold">
                      Saldo Awal Periode
                    </td>
                    <td className="px-3 py-2 text-muted-foreground italic">-</td>
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                      {openingBalance.debit > 0 ? formatIDR(openingBalance.debit) : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                      {openingBalance.credit > 0 ? formatIDR(openingBalance.credit) : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-foreground">
                      {formatBalanceWithSide(openingBalance.net)}
                    </td>
                    <td></td>
                  </tr>

                  {/* Baris Mutasi Periode */}
                  {ledgerRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-muted-foreground">
                        Tidak ada mutasi jurnal untuk akun ini pada rentang periode yang dipilih.
                      </td>
                    </tr>
                  ) : (
                    ledgerRows.map((row, idx) => (
                      <tr
                        key={row.journal_entry_id + '-' + idx}
                        onClick={() => setActiveEntryId(row.journal_entry_id)}
                        className="hover:bg-muted/30 cursor-pointer transition-colors"
                        title="Klik untuk melihat rincian jurnal lengkap"
                      >
                        <td className="px-3 py-2 font-mono text-muted-foreground">
                          {row.entry_date}
                        </td>
                        <td className="px-3 py-2 font-mono font-medium text-foreground">
                          {row.entry_no}
                        </td>
                        <td className="px-3 py-2 font-medium text-foreground max-w-xs truncate">
                          {row.description}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground italic truncate max-w-[140px]">
                          {row.memo || '-'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-foreground">
                          {Number(row.debit) > 0 ? formatIDR(row.debit) : '-'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-foreground">
                          {Number(row.credit) > 0 ? formatIDR(row.credit) : '-'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-foreground">
                          {formatBalanceWithSide(Number(row.running_balance))}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground hover:text-primary hover:bg-muted"
                            title="Buka rincian jurnal"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </>
              )}
            </tbody>
            {ledgerRows.length > 0 && (
              <tfoot className="border-t-2 border-border bg-muted/60 font-semibold text-foreground">
                <tr>
                  <td colSpan={4} className="px-3 py-2.5 text-right uppercase tracking-wider">
                    Total Mutasi Periode
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {formatIDR(totalMutation.debit)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {formatIDR(totalMutation.credit)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-primary font-bold">
                    {ledgerRows.length > 0
                      ? formatBalanceWithSide(
                          Number(ledgerRows[ledgerRows.length - 1].running_balance)
                        )
                      : '-'}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Modal Rincian Jurnal Sumber */}
      <JournalDetailModal
        entryId={activeEntryId}
        onClose={() => setActiveEntryId(null)}
      />
    </div>
  );
}
