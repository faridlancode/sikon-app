import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import Button from '../ui/button';
import { formatIDR } from '../../utils/formatCurrency';
import { startOfMonthISO, endOfMonthISO } from '../../utils/dateHelpers';
import type { AccountingSettings, TrialBalanceRow } from '../../types';

interface TrialBalanceTabProps {
  settings: AccountingSettings | null;
  getTrialBalance: (from: string, to: string) => Promise<TrialBalanceRow[]>;
}

export default function TrialBalanceTab({
  settings,
  getTrialBalance,
}: TrialBalanceTabProps) {
  const defaultTo = endOfMonthISO();
  const defaultFrom = settings?.books_start_date || startOfMonthISO();

  const [fromDate, setFromDate] = useState<string>(defaultFrom);
  const [toDate, setToDate] = useState<string>(defaultTo);
  const [rows, setRows] = useState<TrialBalanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getTrialBalance(fromDate, toDate);
      setRows(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Gagal memuat neraca saldo.');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, getTrialBalance]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Hitung nilai bersih per akun:
  // Saldo awal bersih (netOpen) dan saldo akhir bersih (netClose) ditampilkan satu sisi (bersih).
  // Mutasi periode tetap ditampilkan per debit & kredit bruto.
  const processedRows = useMemo(() => {
    return rows.map((row) => {
      const openDr = Number(row.opening_debit) || 0;
      const openCr = Number(row.opening_credit) || 0;
      const netOpen = openDr - openCr;
      const netOpenDr = netOpen > 0 ? netOpen : 0;
      const netOpenCr = netOpen < 0 ? Math.abs(netOpen) : 0;

      const perDr = Number(row.period_debit) || 0;
      const perCr = Number(row.period_credit) || 0;

      const closeDr = Number(row.closing_debit) || 0;
      const closeCr = Number(row.closing_credit) || 0;
      const netClose = closeDr - closeCr;
      const netCloseDr = netClose > 0 ? netClose : 0;
      const netCloseCr = netClose < 0 ? Math.abs(netClose) : 0;

      return {
        ...row,
        netOpenDr,
        netOpenCr,
        perDr,
        perCr,
        netCloseDr,
        netCloseCr,
      };
    });
  }, [rows]);

  // Hitung total dari nilai bersih
  const totals = useMemo(() => {
    return processedRows.reduce(
      (acc, r) => {
        acc.openDr += r.netOpenDr;
        acc.openCr += r.netOpenCr;
        acc.perDr += r.perDr;
        acc.perCr += r.perCr;
        acc.closeDr += r.netCloseDr;
        acc.closeCr += r.netCloseCr;
        return acc;
      },
      { openDr: 0, openCr: 0, perDr: 0, perCr: 0, closeDr: 0, closeCr: 0 }
    );
  }, [processedRows]);

  const balanceDiff = Math.abs(totals.closeDr - totals.closeCr);
  const isBalanced = balanceDiff < 0.01;

  return (
    <div className="space-y-4">
      {/* Header bar: Filter & Lencana Status */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Calendar className="h-4 w-4" /> Periode:
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-md border border-input bg-background px-2.5 py-1 text-xs shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-xs text-muted-foreground">s.d.</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-md border border-input bg-background px-2.5 py-1 text-xs shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={fetchReport}
              disabled={loading}
              className="h-8 gap-1.5 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Segarkan
            </Button>
          </div>
        </div>

        {/* Lencana Keseimbangan */}
        <div className="flex items-center gap-2">
          {isBalanced ? (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success-soft px-3 py-1 text-xs font-semibold text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Seimbang</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive-soft px-3 py-1 text-xs font-semibold text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>Tidak Seimbang (Selisih {formatIDR(balanceDiff)})</span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive-soft p-3 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabel Neraca Saldo */}
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/50 font-semibold text-muted-foreground">
              <tr>
                <th rowSpan={2} className="px-3 py-2.5">
                  Kode Akun
                </th>
                <th rowSpan={2} className="px-3 py-2.5">
                  Nama Akun
                </th>
                <th colSpan={2} className="border-b border-border/60 px-3 py-1.5 text-center">
                  Saldo Awal
                </th>
                <th colSpan={2} className="border-b border-border/60 px-3 py-1.5 text-center">
                  Mutasi Periode
                </th>
                <th colSpan={2} className="border-b border-border/60 px-3 py-1.5 text-center">
                  Saldo Akhir
                </th>
              </tr>
              <tr className="border-b border-border">
                <th className="px-3 py-1.5 text-right">Debit</th>
                <th className="px-3 py-1.5 text-right">Kredit</th>
                <th className="px-3 py-1.5 text-right">Debit</th>
                <th className="px-3 py-1.5 text-right">Kredit</th>
                <th className="px-3 py-1.5 text-right">Debit</th>
                <th className="px-3 py-1.5 text-right">Kredit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    Memuat data neraca saldo...
                  </td>
                </tr>
              ) : processedRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    Tidak ada transaksi atau mutasi akun pada periode ini.
                  </td>
                </tr>
              ) : (
                processedRows.map((row) => (
                  <tr key={row.account_id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-mono font-medium text-foreground">
                      {row.code}
                    </td>
                    <td className="px-3 py-2 font-medium text-foreground">
                      {row.name}
                    </td>
                    {/* Saldo Awal Bersih (satu sisi) */}
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                      {row.netOpenDr > 0 ? formatIDR(row.netOpenDr) : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                      {row.netOpenCr > 0 ? formatIDR(row.netOpenCr) : '-'}
                    </td>
                    {/* Mutasi Periode */}
                    <td className="px-3 py-2 text-right font-mono text-foreground">
                      {row.perDr > 0 ? formatIDR(row.perDr) : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-foreground">
                      {row.perCr > 0 ? formatIDR(row.perCr) : '-'}
                    </td>
                    {/* Saldo Akhir Bersih (satu sisi) */}
                    <td className="px-3 py-2 text-right font-mono font-semibold text-foreground">
                      {row.netCloseDr > 0 ? formatIDR(row.netCloseDr) : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-foreground">
                      {row.netCloseCr > 0 ? formatIDR(row.netCloseCr) : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {processedRows.length > 0 && (
              <tfoot className="border-t-2 border-border bg-muted/60 font-semibold text-foreground">
                <tr>
                  <td colSpan={2} className="px-3 py-2.5 text-right uppercase tracking-wider">
                    Total
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {formatIDR(totals.openDr)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {formatIDR(totals.openCr)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {formatIDR(totals.perDr)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {formatIDR(totals.perCr)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-primary font-bold">
                    {formatIDR(totals.closeDr)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-primary font-bold">
                    {formatIDR(totals.closeCr)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
