import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ListTree,
  Plus,
  Lock,
  Edit2,
  Trash2,
  Power,
  PowerOff,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import Button from '../ui/button';
import { formatIDR } from '../../utils/formatCurrency';
import { todayISO } from '../../utils/dateHelpers';
import AccountModal from './AccountModal';
import type {
  Account,
  AccountType,
  TrialBalanceRow,
} from '../../types';

interface ChartOfAccountsTabProps {
  accounts: Account[];
  loading: boolean;
  getTrialBalance: (from: string, to: string) => Promise<TrialBalanceRow[]>;
  onCreateAccount: (payload: any) => Promise<void>;
  onUpdateAccountName: (accountId: string, newName: string) => Promise<void>;
  onToggleAccountActive: (accountId: string, isActive: boolean) => Promise<void>;
  onDeleteAccount: (accountId: string) => Promise<void>;
}

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: '1. Aset',
  liability: '2. Liabilitas',
  equity: '3. Ekuitas / Modal',
  revenue: '4. Pendapatan',
  expense: '5 & 6. Beban',
};

const REPORT_GROUP_LABELS: Record<string, string> = {
  current_asset: 'Aset Lancar',
  fixed_asset: 'Aset Tetap',
  contra_asset: 'Kontra Aset',
  suspense: 'Penampung Sementara',
  current_liability: 'Liabilitas Lancar',
  equity: 'Ekuitas',
  revenue: 'Pendapatan Usaha',
  cogs: 'HPP (Beban Pokok Penjualan)',
  opex: 'Beban Operasional',
  other: 'Lain-lain',
};

export default function ChartOfAccountsTab({
  accounts,
  loading,
  getTrialBalance,
  onCreateAccount,
  onUpdateAccountName,
  onToggleAccountActive,
  onDeleteAccount,
}: ChartOfAccountsTabProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  // Konfirmasi hapus state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Saldo akun dari trial balance s.d. hari ini
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchBalances = useCallback(async () => {
    setLoadingBalances(true);
    try {
      const today = todayISO();
      // Ambil saldo trial balance dari awal ('1970-01-01') s.d. hari ini
      const tbRows = await getTrialBalance('1970-01-01', today);
      const map: Record<string, number> = {};
      tbRows.forEach((r) => {
        const dr = Number(r.closing_debit) || 0;
        const cr = Number(r.closing_credit) || 0;
        // Saldo bersih (net debit - credit)
        map[r.account_id] = dr - cr;
      });
      setBalances(map);
    } catch (e: any) {
      console.error('Error fetching balances for COA:', e);
    } finally {
      setLoadingBalances(false);
    }
  }, [getTrialBalance]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  // Kelompokkan akun per account_type
  const groupedAccounts = useMemo(() => {
    const groups: Record<AccountType, Account[]> = {
      asset: [],
      liability: [],
      equity: [],
      revenue: [],
      expense: [],
    };

    accounts.forEach((acct) => {
      if (groups[acct.account_type]) {
        groups[acct.account_type].push(acct);
      }
    });

    // Urutkan per kode akun
    Object.keys(groups).forEach((key) => {
      groups[key as AccountType].sort((a, b) => a.code.localeCompare(b.code));
    });

    return groups;
  }, [accounts]);

  function formatBalance(acct: Account) {
    const net = balances[acct.id];
    if (net === undefined || net === 0) return '-';
    const abs = Math.abs(net);
    const side = net >= 0 ? 'D' : 'K';
    return `${formatIDR(abs)} ${side}`;
  }

  function handleOpenCreate() {
    setEditingAccount(null);
    setErrorMessage(null);
    setModalOpen(true);
  }

  function handleOpenEdit(acct: Account) {
    setEditingAccount(acct);
    setErrorMessage(null);
    setModalOpen(true);
  }

  async function handleToggleActive(acct: Account) {
    if (acct.is_system) return;
    setErrorMessage(null);
    try {
      await onToggleAccountActive(acct.id, !acct.is_active);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal mengubah status aktif akun.');
    }
  }

  function handleOpenDelete(acct: Account) {
    if (acct.is_system) return;
    setAccountToDelete(acct);
    setErrorMessage(null);
    setDeleteModalOpen(true);
  }

  async function handleConfirmDelete() {
    if (!accountToDelete) return;
    setDeleting(true);
    setErrorMessage(null);
    try {
      await onDeleteAccount(accountToDelete.id);
      setDeleteModalOpen(false);
      setAccountToDelete(null);
    } catch (err: any) {
      console.error(err);
      // Tampilkan pesan error database apa adanya sesuai aturan
      setErrorMessage(err.message || 'Gagal menghapus akun.');
      setDeleteModalOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  const accountTypes: AccountType[] = [
    'asset',
    'liability',
    'equity',
    'revenue',
    'expense',
  ];

  return (
    <div className="space-y-4">
      {/* Header bar: Tambah Akun & Refresh */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <ListTree className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">
            Bagan Akun Standar ({accounts.length} akun terdaftar)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchBalances}
            disabled={loadingBalances}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loadingBalances ? 'animate-spin' : ''}`}
            />
            Segarkan Saldo
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleOpenCreate}
            className="h-8 gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah Akun
          </Button>
        </div>
      </div>

      {errorMessage && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive-soft p-3 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Tabel Grup Akun */}
      <div className="space-y-6">
        {accountTypes.map((type) => {
          const acctList = groupedAccounts[type] || [];
          return (
            <div
              key={type}
              className="overflow-hidden rounded-lg border border-border bg-card shadow-soft"
            >
              <div className="border-b border-border bg-muted/40 px-4 py-2.5 font-semibold text-xs text-foreground flex items-center justify-between">
                <span>{ACCOUNT_TYPE_LABELS[type]}</span>
                <span className="text-muted-foreground text-[11px] font-normal">
                  {acctList.length} akun
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-muted/20 font-semibold text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 w-28">Kode</th>
                      <th className="px-3 py-2">Nama Akun</th>
                      <th className="px-3 py-2 w-36">Kelompok Laporan</th>
                      <th className="px-3 py-2 w-24 text-center">Status</th>
                      <th className="px-3 py-2 w-20 text-center">Sistem</th>
                      <th className="px-3 py-2 text-right w-36">Saldo Saat Ini</th>
                      <th className="px-3 py-2 text-center w-28">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {acctList.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-4 text-center text-muted-foreground">
                          Belum ada akun untuk kelompok ini.
                        </td>
                      </tr>
                    ) : (
                      acctList.map((acct) => (
                        <tr
                          key={acct.id}
                          className={`hover:bg-muted/20 transition-colors ${
                            !acct.is_active ? 'opacity-60 bg-muted/10' : ''
                          }`}
                        >
                          <td className="px-3 py-2 font-mono font-semibold text-foreground">
                            {acct.code}
                          </td>
                          <td className="px-3 py-2 font-medium text-foreground">
                            {acct.name}
                            {acct.is_cash && (
                              <span className="ml-2 rounded bg-primary/10 text-primary text-[10px] px-1.5 py-0.2 font-semibold">
                                Kas/Bank
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {REPORT_GROUP_LABELS[acct.report_group] ||
                              acct.report_group}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {acct.is_active ? (
                              <span className="inline-flex rounded-full bg-success-soft text-success px-2 py-0.5 text-[10px] font-semibold">
                                Aktif
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-destructive-soft text-destructive px-2 py-0.5 text-[10px] font-semibold">
                                Nonaktif
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {acct.is_system ? (
                              <span
                                className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                                title="Akun sistem standar — tidak dapat dihapus atau dinonaktifkan"
                              >
                                <Lock className="h-3 w-3 text-muted-foreground" />
                                Kunci
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-[10px]">
                                Kustom
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-medium text-foreground">
                            {formatBalance(acct)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {/* Ubah Nama */}
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(acct)}
                                className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
                                title="Ubah Nama Akun"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>

                              {/* Toggle Aktif/Nonaktif (hanya non-sistem) */}
                              {!acct.is_system && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleActive(acct)}
                                  className={`rounded p-1 hover:bg-muted ${
                                    acct.is_active
                                      ? 'text-success hover:text-destructive'
                                      : 'text-muted-foreground hover:text-success'
                                  }`}
                                  title={
                                    acct.is_active
                                      ? 'Nonaktifkan akun'
                                      : 'Aktifkan akun'
                                  }
                                >
                                  {acct.is_active ? (
                                    <Power className="h-3.5 w-3.5" />
                                  ) : (
                                    <PowerOff className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              )}

                              {/* Hapus (hanya non-sistem) */}
                              {!acct.is_system && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenDelete(acct)}
                                  className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive-soft"
                                  title="Hapus akun"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Tambah / Ubah Akun */}
      <AccountModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        accountToEdit={editingAccount}
        onSave={onCreateAccount}
        onUpdateName={onUpdateAccountName}
      />

      {/* Modal Konfirmasi Hapus Akun */}
      {deleteModalOpen && accountToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-lg space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive-soft text-destructive">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  Hapus Akun {accountToDelete.code}?
                </h4>
                <p className="text-xs text-muted-foreground">
                  {accountToDelete.name}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Akun hanya dapat dihapus jika belum pernah memiliki mutasi jurnal. Jika sudah pernah ada mutasi, database akan menolak penghapusan.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteModalOpen(false)}
                disabled={deleting}
                className="text-xs"
              >
                Batal
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="text-xs"
              >
                {deleting ? 'Menghapus...' : 'Ya, Hapus'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
