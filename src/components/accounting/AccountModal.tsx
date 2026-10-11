import { useState, useEffect } from 'react';
import { X, Plus, AlertCircle, Save } from 'lucide-react';
import Button from '../ui/button';
import type { Account, AccountType, ReportGroup } from '../../types';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountToEdit: Account | null;
  onSave: (payload: {
    code: string;
    name: string;
    account_type: AccountType;
    report_group: ReportGroup;
    is_cash?: boolean;
    cash_flow_activity?: 'operating' | 'investing' | 'financing';
  }) => Promise<void>;
  onUpdateName?: (accountId: string, newName: string) => Promise<void>;
}

// Opsi report_group per account_type sesuai constraint database (tanpa suspense)
const REPORT_GROUP_OPTIONS: Record<
  AccountType,
  { value: ReportGroup; label: string }[]
> = {
  asset: [
    { value: 'current_asset', label: 'Aset Lancar (Current Asset)' },
    { value: 'fixed_asset', label: 'Aset Tetap (Fixed Asset)' },
    { value: 'contra_asset', label: 'Kontra Aset / Akumulasi Penyusutan' },
  ],
  liability: [
    { value: 'current_liability', label: 'Liabilitas Lancar (Current Liability)' },
  ],
  equity: [{ value: 'equity', label: 'Ekuitas / Modal (Equity)' }],
  revenue: [
    { value: 'revenue', label: 'Pendapatan Usaha (Revenue)' },
    { value: 'other', label: 'Pendapatan Lain-lain (Other Income)' },
  ],
  expense: [
    { value: 'cogs', label: 'Beban Pokok Penjualan (HPP / COGS)' },
    { value: 'opex', label: 'Beban Operasional (Opex)' },
    { value: 'other', label: 'Beban Lain-lain (Other Expense)' },
  ],
};

export default function AccountModal({
  isOpen,
  onClose,
  accountToEdit,
  onSave,
  onUpdateName,
}: AccountModalProps) {
  const isEditing = Boolean(accountToEdit);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('asset');
  const [reportGroup, setReportGroup] = useState<ReportGroup>('current_asset');
  const [isCash, setIsCash] = useState(false);
  const [cashFlowActivity, setCashFlowActivity] = useState<
    'operating' | 'investing' | 'financing'
  >('operating');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (accountToEdit) {
      setCode(accountToEdit.code);
      setName(accountToEdit.name);
      setAccountType(accountToEdit.account_type);
      setReportGroup(accountToEdit.report_group);
      setIsCash(Boolean(accountToEdit.is_cash));
      setCashFlowActivity(
        (accountToEdit.cash_flow_activity as any) || 'operating'
      );
    } else {
      setCode('');
      setName('');
      setAccountType('asset');
      setReportGroup('current_asset');
      setIsCash(false);
      setCashFlowActivity('operating');
    }
    setError(null);
  }, [accountToEdit, isOpen]);

  // Saat tipe akun berubah, sesuaikan report_group default
  function handleTypeChange(newType: AccountType) {
    setAccountType(newType);
    const validGroups = REPORT_GROUP_OPTIONS[newType];
    if (validGroups && validGroups.length > 0) {
      setReportGroup(validGroups[0].value);
    }
    if (newType !== 'asset') {
      setIsCash(false);
    }
  }

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Nama akun wajib diisi.');
      return;
    }

    setSaving(true);
    try {
      if (isEditing && accountToEdit) {
        if (onUpdateName) {
          await onUpdateName(accountToEdit.id, name);
        }
      } else {
        if (!code.trim()) {
          setError('Kode akun wajib diisi.');
          setSaving(false);
          return;
        }
        await onSave({
          code,
          name,
          account_type: accountType,
          report_group: reportGroup,
          is_cash: accountType === 'asset' ? isCash : false,
          cash_flow_activity: cashFlowActivity,
        });
      }
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Gagal menyimpan akun.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl border border-border bg-card shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
              {isEditing ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {isEditing ? 'Ubah Nama Akun' : 'Tambah Akun Baru'}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                {isEditing
                  ? `Kode Akun: ${accountToEdit?.code}`
                  : 'Bagan Akun Standar (Chart of Accounts)'}
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive-soft p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!isEditing && (
            <>
              {/* Tipe Akun */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Tipe Akun <span className="text-destructive">*</span>
                </label>
                <select
                  value={accountType}
                  onChange={(e) => handleTypeChange(e.target.value as AccountType)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="asset">Aset (Asset)</option>
                  <option value="liability">Liabilitas / Kewajiban (Liability)</option>
                  <option value="equity">Ekuitas / Modal (Equity)</option>
                  <option value="revenue">Pendapatan (Revenue)</option>
                  <option value="expense">Beban (Expense)</option>
                </select>
              </div>

              {/* Kelompok Laporan */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Kelompok Laporan <span className="text-destructive">*</span>
                </label>
                <select
                  value={reportGroup}
                  onChange={(e) => setReportGroup(e.target.value as ReportGroup)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {(REPORT_GROUP_OPTIONS[accountType] || []).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Kode Akun */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Kode Akun <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: 1-1300 atau 6-3100"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs font-mono shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                />
              </div>
            </>
          )}

          {/* Nama Akun */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Nama Akun <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              placeholder="Contoh: Piutang Karyawan, Biaya Internet"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              required
            />
          </div>

          {!isEditing && accountType === 'asset' && (
            <div className="space-y-3 pt-1 border-t border-border">
              {/* Checkbox Kas/Bank */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_cash_checkbox"
                  checked={isCash}
                  onChange={(e) => setIsCash(e.target.checked)}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                />
                <label
                  htmlFor="is_cash_checkbox"
                  className="text-xs font-medium text-foreground cursor-pointer"
                >
                  Akun Kas atau Bank (dapat dipilih sebagai metode pembayaran)
                </label>
              </div>

              {/* Aktivitas Arus Kas */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Aktivitas Arus Kas Default
                </label>
                <select
                  value={cashFlowActivity}
                  onChange={(e) =>
                    setCashFlowActivity(
                      e.target.value as 'operating' | 'investing' | 'financing'
                    )
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="operating">Operasi (Operating)</option>
                  <option value="investing">Investasi (Investing)</option>
                  <option value="financing">Pendanaan (Financing)</option>
                </select>
              </div>
            </div>
          )}

          {/* Footer Form */}
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={saving}
              className="text-xs"
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={saving}
              className="text-xs gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
