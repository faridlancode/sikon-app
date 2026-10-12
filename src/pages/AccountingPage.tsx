import { useState } from 'react';
import {
  BookOpen,
  LayoutDashboard,
  CheckCircle2,
  AlertCircle,
  X,
  Scale,
  BookMarked,
  ListTree,
  FileSpreadsheet,
  Lock,
  Building2,
} from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import Button from '../components/ui/button';
import AccountingSummaryTab from '../components/accounting/AccountingSummaryTab';
import GeneralJournalTab from '../components/accounting/GeneralJournalTab';
import TrialBalanceTab from '../components/accounting/TrialBalanceTab';
import GeneralLedgerTab from '../components/accounting/GeneralLedgerTab';
import ChartOfAccountsTab from '../components/accounting/ChartOfAccountsTab';
import FinancialReportsTab from '../components/accounting/reports/FinancialReportsTab';
import ClosingPeriodTab from '../components/accounting/ClosingPeriodTab';
import FixedAssetsTab from '../components/accounting/FixedAssetsTab';
import { useAccounting } from '../hooks/useAccounting';

type AccountingTab =
  | 'summary'
  | 'reports'
  | 'closing'
  | 'journal'
  | 'trial_balance'
  | 'ledger'
  | 'fixed_assets'
  | 'accounts';

export default function AccountingPage() {
  const [activeTab, setActiveTab] = useState<AccountingTab>('summary');
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Navigasi dari laporan ke buku besar
  const [ledgerTargetAccount, setLedgerTargetAccount] = useState<string | null>(null);
  const [ledgerTargetFrom, setLedgerTargetFrom] = useState<string | null>(null);
  const [ledgerTargetTo, setLedgerTargetTo] = useState<string | null>(null);

  const {
    settings,
    accounts,
    journalEntries,
    loading,
    error: hookError,
    fetchSettings,
    fetchJournalEntries,
    activateAccounting,
    getOpeningBalanceSuggestion,
    postOpeningBalance,
    createManualJournal,
    reverseJournal,
    getTrialBalance,
    getGeneralLedger,
    createAccount,
    updateAccountName,
    toggleAccountActive,
    deleteAccount,
  } = useAccounting();

  function showNotification(type: 'success' | 'error', message: string) {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 6000);
  }

  async function handleActivateAccounting(
    booksStartDate: string,
    openingLines?: any[]
  ) {
    try {
      await activateAccounting(booksStartDate);
      if (openingLines && openingLines.length > 0) {
        await postOpeningBalance(booksStartDate, openingLines);
      }
      showNotification(
        'success',
        `Sistem akuntansi berhasil diaktifkan dengan tanggal mulai pembukuan ${booksStartDate}.`
      );
      setActiveTab('journal');
    } catch (err: any) {
      console.error(err);
      showNotification(
        'error',
        err.message || 'Gagal mengaktifkan sistem akuntansi.'
      );
      throw err;
    }
  }

  async function handleCreateManualJournal(entry: {
    entry_date: string;
    description: string;
    lines: {
      account_id: string;
      debit: number;
      credit: number;
      memo?: string;
    }[];
  }) {
    try {
      await createManualJournal(entry);
      showNotification('success', 'Jurnal manual berhasil disimpan.');
    } catch (err: any) {
      console.error(err);
      showNotification(
        'error',
        err.message || 'Gagal menyimpan jurnal manual.'
      );
      throw err;
    }
  }

  async function handleReverseJournal(entryId: string, reason: string) {
    try {
      await reverseJournal(entryId, reason);
      showNotification(
        'success',
        'Jurnal berhasil dibalik dengan jurnal pembalik baru.'
      );
    } catch (err: any) {
      console.error(err);
      showNotification(
        'error',
        err.message || 'Gagal membalik jurnal manual.'
      );
      throw err;
    }
  }

  async function handleCreateAccount(payload: any) {
    try {
      await createAccount(payload);
      showNotification(
        'success',
        `Akun ${payload.code} - ${payload.name} berhasil ditambahkan.`
      );
    } catch (err: any) {
      console.error(err);
      showNotification('error', err.message || 'Gagal menambahkan akun.');
      throw err;
    }
  }

  async function handleUpdateAccountName(accountId: string, newName: string) {
    try {
      await updateAccountName(accountId, newName);
      showNotification('success', 'Nama akun berhasil diperbarui.');
    } catch (err: any) {
      console.error(err);
      showNotification('error', err.message || 'Gagal memperbarui nama akun.');
      throw err;
    }
  }

  async function handleToggleAccountActive(
    accountId: string,
    isActive: boolean
  ) {
    try {
      await toggleAccountActive(accountId, isActive);
      showNotification(
        'success',
        `Akun berhasil ${isActive ? 'diaktifkan' : 'dinonaktifkan'}.`
      );
    } catch (err: any) {
      console.error(err);
      showNotification('error', err.message || 'Gagal mengubah status akun.');
      throw err;
    }
  }

  async function handleDeleteAccount(accountId: string) {
    try {
      await deleteAccount(accountId);
      showNotification('success', 'Akun berhasil dihapus.');
    } catch (err: any) {
      console.error(err);
      // Tampilkan pesan error database apa adanya
      showNotification('error', err.message || 'Gagal menghapus akun.');
      throw err;
    }
  }

  return (
    <AppShell
      title="Akuntansi & Pembukuan"
      subtitle="Sistem pembukuan berpasangan (double-entry), bagan akun standar (COA), dan jurnal umum keuangan"
    >
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-xs font-semibold text-primary">
          <Scale className="h-4 w-4" /> Modul Keuangan & Akuntansi
        </div>

        {/* Notifikasi Banner */}
        {notification && (
          <div
            className={`flex items-center gap-3 rounded-lg p-4 text-sm font-medium shadow-sm ${
              notification.type === 'success'
                ? 'bg-success-soft text-success border border-success/20'
                : 'bg-destructive-soft text-destructive border border-destructive/20'
            }`}
          >
            {notification.type === 'success' ? (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-soft">
                <CheckCircle2 className="h-4 w-4 text-success" />
              </div>
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive-soft">
                <AlertCircle className="h-4 w-4 text-destructive" />
              </div>
            )}
            <span className="flex-1">{notification.message}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setNotification(null)}
              className="h-8 w-8 shrink-0 p-0"
              aria-label="Tutup notifikasi"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {hookError && !notification && (
          <div className="flex items-center gap-3 rounded-lg p-3 text-xs font-medium border border-destructive/20 bg-destructive-soft text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{hookError}</span>
          </div>
        )}

        {/* Tab Navigation mengikuti pola PayrollPage.tsx */}
        <div
          className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1 shadow-soft"
          role="group"
          aria-label="Bagian akuntansi"
        >
          {[
            {
              id: 'summary' as const,
              label: 'Ringkasan',
              icon: LayoutDashboard,
              count: null,
            },
            {
              id: 'reports' as const,
              label: 'Laporan',
              icon: FileSpreadsheet,
              count: null,
            },
            {
              id: 'closing' as const,
              label: 'Tutup Buku',
              icon: Lock,
              count: null,
            },
            {
              id: 'journal' as const,
              label: 'Jurnal Umum',
              icon: BookOpen,
              count: journalEntries.length,
            },
            {
              id: 'trial_balance' as const,
              label: 'Neraca Saldo',
              icon: Scale,
              count: null,
            },
            {
              id: 'ledger' as const,
              label: 'Buku Besar',
              icon: BookMarked,
              count: null,
            },
            {
              id: 'fixed_assets' as const,
              label: 'Aset Tetap',
              icon: Building2,
              count: null,
            },
            {
              id: 'accounts' as const,
              label: 'Akun (COA)',
              icon: ListTree,
              count: accounts.length,
            },
          ].map(({ id, label, icon: Icon, count }) => (
            <Button
              key={id}
              variant={activeTab === id ? 'default' : 'ghost'}
              size="sm"
              aria-pressed={activeTab === id}
              onClick={() => setActiveTab(id)}
              className="h-9 shrink-0 gap-2 px-3 text-xs"
            >
              <Icon className="h-4 w-4" />
              {label}
              {count !== null && count !== undefined && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    activeTab === id
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {count}
                </span>
              )}
            </Button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'summary' && (
          <AccountingSummaryTab
            settings={settings}
            accounts={accounts}
            hasJournals={journalEntries.length > 0}
            onActivate={handleActivateAccounting}
            getOpeningBalanceSuggestion={getOpeningBalanceSuggestion}
          />
        )}

        {activeTab === 'reports' && (
          <FinancialReportsTab
            settings={settings}
            onOpenLedger={(accountId, from, to) => {
              setLedgerTargetAccount(accountId);
              setLedgerTargetFrom(from);
              setLedgerTargetTo(to);
              setActiveTab('ledger');
            }}
            onGoToClosing={() => setActiveTab('closing')}
            onGoToSuspense={() => {
              const suspense = accounts.find((a) => a.code === '9-9999');
              if (suspense) {
                setLedgerTargetAccount(suspense.id);
              }
              setActiveTab('ledger');
            }}
          />
        )}

        {activeTab === 'closing' && (
          <ClosingPeriodTab
            settings={settings}
            onRefreshSettings={fetchSettings}
          />
        )}

        {activeTab === 'journal' && (
          <GeneralJournalTab
            entries={journalEntries}
            accounts={accounts}
            loading={loading}
            onFilterChange={fetchJournalEntries}
            onCreateManualJournal={handleCreateManualJournal}
            onReverseJournal={handleReverseJournal}
          />
        )}

        {activeTab === 'trial_balance' && (
          <TrialBalanceTab
            settings={settings}
            getTrialBalance={getTrialBalance}
          />
        )}

        {activeTab === 'ledger' && (
          <GeneralLedgerTab
            settings={settings}
            accounts={accounts}
            getGeneralLedger={getGeneralLedger}
            getTrialBalance={getTrialBalance}
            targetAccountId={ledgerTargetAccount}
            targetFromDate={ledgerTargetFrom}
            targetToDate={ledgerTargetTo}
          />
        )}

        {activeTab === 'fixed_assets' && (
          <FixedAssetsTab
            booksStartDate={settings?.books_start_date || null}
            onNavigateToJournal={(_entryNo) => {
              setActiveTab('journal');
            }}
          />
        )}

        {activeTab === 'accounts' && (
          <ChartOfAccountsTab
            accounts={accounts}
            loading={loading}
            getTrialBalance={getTrialBalance}
            onCreateAccount={handleCreateAccount}
            onUpdateAccountName={handleUpdateAccountName}
            onToggleAccountActive={handleToggleAccountActive}
            onDeleteAccount={handleDeleteAccount}
          />
        )}
      </div>
    </AppShell>
  );
}
