import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Calendar,
  Lock,
  Wallet,
  BookOpen,
  Sparkles,
  Layers,
  RefreshCw,
} from 'lucide-react';
import Card from '../ui/card';
import Button from '../ui/button';
import ActivateAccountingModal from './ActivateAccountingModal';
import { useFinancialStatements } from '../../hooks/useFinancialStatements';
import { todayISO } from '../../utils/dateHelpers';
import { formatIDR } from '../../utils/formatCurrency';
import type {
  AccountingSettings,
  Account,
  OpeningBalanceSuggestion,
  AccountingCheck,
} from '../../types';

interface AccountingSummaryTabProps {
  settings: AccountingSettings | null;
  accounts: Account[];
  hasJournals?: boolean;
  onActivate: (booksStartDate: string, openingLines?: any[]) => Promise<void>;
  getOpeningBalanceSuggestion: (
    booksStartDate: string
  ) => Promise<OpeningBalanceSuggestion[]>;
}

export default function AccountingSummaryTab({
  settings,
  accounts,
  hasJournals = false,
  onActivate,
  getOpeningBalanceSuggestion,
}: AccountingSummaryTabProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const isEnabled = settings?.enabled ?? false;
  const booksStartDate = settings?.books_start_date ?? null;
  const lockedThrough = settings?.locked_through ?? null;

  const totalAccounts = accounts.length;
  const activeAccounts = accounts.filter((a) => a.is_active).length;
  const cashAccounts = accounts.filter((a) => a.is_cash).length;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner Status Akuntansi */}
      <Card className="p-6 border border-border">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                isEnabled
                  ? 'bg-success-soft text-success border border-success/20'
                  : 'bg-muted text-muted-foreground border border-border'
              }`}
            >
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">
                  Status Sistem Akuntansi
                </h3>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    isEnabled
                      ? 'bg-success-soft text-success border border-success/20'
                      : 'bg-muted text-muted-foreground border border-border'
                  }`}
                >
                  {isEnabled ? 'Aktif' : 'Belum Aktif'}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {isEnabled
                  ? 'Pencatatan jurnal umum otomatis dan manual berpasangan (double-entry) aktif.'
                  : 'Sistem akuntansi belum diaktifkan. Klik tombol di kanan untuk menginisialisasi bagan akun dan tanggal pembukuan.'}
              </p>
            </div>
          </div>

          <div>
            {!isEnabled ? (
              <Button
                onClick={() => setModalOpen(true)}
                variant="default"
                size="sm"
                className="gap-2 shrink-0"
              >
                <Sparkles className="h-4 w-4" />
                Aktifkan Akuntansi
              </Button>
            ) : !hasJournals ? (
              <Button
                onClick={() => setModalOpen(true)}
                variant="outline"
                size="sm"
                className="gap-2 shrink-0"
              >
                <Sparkles className="h-4 w-4" />
                Ubah Tanggal Mulai Pembukuan
              </Button>
            ) : null}
          </div>
        </div>

        {/* Info Grid */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3 border-t border-border pt-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                Tanggal Mulai Pembukuan
              </p>
              <p className="text-sm font-semibold text-foreground">
                {formatDate(booksStartDate)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                Periode Terkunci
              </p>
              <p className="text-sm font-semibold text-foreground">
                {lockedThrough ? formatDate(lockedThrough) : 'Belum ada kunci'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Wallet className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                Akun Kas / Bank Standar
              </p>
              <p className="text-sm font-semibold text-foreground">
                1-1200 (Bank)
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Ringkasan Bagan Akun (COA) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4 border border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Bagan Akun</p>
              <p className="text-lg font-bold text-foreground">
                {totalAccounts} Akun
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success-soft text-success">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Akun Aktif</p>
              <p className="text-lg font-bold text-foreground">
                {activeAccounts} Akun
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Akun Likuid (Kas & Bank)</p>
              <p className="text-lg font-bold text-foreground">
                {cashAccounts} Akun
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Panel Cek Konsistensi & Integritas Akuntansi */}
      {isEnabled && (
        <AccountingChecksPanel />
      )}

      {/* Modal Aktivasi */}
      <ActivateAccountingModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onActivate={onActivate}
        getOpeningBalanceSuggestion={getOpeningBalanceSuggestion}
      />
    </div>
  );
}

function AccountingChecksPanel() {
  const [checks, setChecks] = useState<AccountingCheck[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { getAccountingChecks } = useFinancialStatements();

  const loadChecks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAccountingChecks(todayISO());
      setChecks(data);
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Gagal memuat cek konsistensi.');
    } finally {
      setLoading(false);
    }
  }, [getAccountingChecks]);

  useEffect(() => {
    loadChecks();
  }, [loadChecks]);

  const okCount = checks.filter((c) => c.severity === 'ok').length;
  const warnCount = checks.filter((c) => c.severity === 'warn').length;
  const errorCount = checks.filter((c) => c.severity === 'error').length;

  return (
    <Card className="p-6 border border-border space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-foreground">
              Pemeriksaan Konsistensi & Integritas Data
            </h4>
            <span className="text-[11px] text-muted-foreground font-mono">
              ({checks.length > 0 ? `${checks.length} Aturan Audit` : 'Audit Integritas'})
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pemeriksaan otomatis sinkronisasi jurnal, saldo kas, uang muka, persediaan, aset tetap, dan periode buku.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="inline-flex items-center rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-bold text-success border border-success/20">
              {okCount} Lolos
            </span>
            {warnCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-950 dark:text-amber-100 border border-amber-500/30">
                {warnCount} Perhatian
              </span>
            )}
            {errorCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-destructive-soft px-2 py-0.5 text-[11px] font-bold text-destructive border border-destructive/20">
                {errorCount} Error
              </span>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={loadChecks}
            disabled={loading}
            className="h-8 gap-1.5 text-xs ml-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Periksa Ulang
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          Memeriksa seluruh aturan konsistensi akuntansi...
        </div>
      ) : error ? (
        <div className="p-4 rounded-lg bg-destructive-soft text-destructive text-xs">
          {error}
        </div>
      ) : checks.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          Belum ada data pemeriksaan yang tersedia.
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
          {checks.map((c) => {
            const isOk = c.severity === 'ok';
            const isWarn = c.severity === 'warn';
            const isErr = c.severity === 'error';

            return (
              <div
                key={c.code}
                className="p-3.5 hover:bg-muted/10 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        isOk
                          ? 'bg-success-soft text-success border border-success/20'
                          : isWarn
                          ? 'bg-amber-500/15 text-amber-950 dark:text-amber-100 border border-amber-500/30'
                          : 'bg-destructive-soft text-destructive border border-destructive/20'
                      }`}
                    >
                      {isOk ? 'OK' : isWarn ? 'PERHATIAN' : 'ERROR'}
                    </span>
                    <span className="font-semibold text-foreground">{c.label}</span>
                    <span className="font-mono text-muted-foreground text-[10px]">
                      ({c.code})
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{c.hint}</p>
                </div>

                <div className="flex items-center gap-4 shrink-0 font-mono text-right text-[11px]">
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Harapan:</span>
                    <span className="font-medium text-foreground">{formatIDR(c.expected)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Aktual:</span>
                    <span className="font-medium text-foreground">{formatIDR(c.actual)}</span>
                  </div>
                  {c.diff !== 0 && (
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Selisih:</span>
                      <span className={`font-bold ${isErr ? 'text-destructive' : 'text-amber-600'}`}>
                        {formatIDR(c.diff)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
