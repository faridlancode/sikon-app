import { useState } from 'react';
import { Plus, Pencil, Trash2, Landmark, Star } from 'lucide-react';
import Card from '../ui/card';
import Button from '../ui/button';
import BankAccountModal from './BankAccountModal';
import { useCompanyBankAccounts } from '../../hooks/useCompanyBankAccounts';
import type { BankAccount } from '../../types';

export default function BankAccountsCard() {
  const { accounts, loading, addAccount, updateAccount, deleteAccount } = useCompanyBankAccounts();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);

  function openAddModal() {
    setEditingAccount(null);
    setModalOpen(true);
  }

  function openEditModal(account: BankAccount) {
    setEditingAccount(account);
    setModalOpen(true);
  }

  async function handleSubmit(payload: Omit<BankAccount, 'id'>) {
    if (editingAccount) {
      await updateAccount(editingAccount.id, payload);
    } else {
      await addAccount(payload);
    }
  }

  async function handleDelete(account: BankAccount) {
    if (!window.confirm(`Hapus rekening ${account.bank_name} - ${account.account_number}?`)) return;
    await deleteAccount(account.id);
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Rekening Bank</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Bisa lebih dari satu, tampil di invoice/dokumen.</p>
        </div>
        <Button size="sm" onClick={openAddModal}>
          <Plus className="h-4 w-4" />
          Tambah
        </Button>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-8 text-center">
            <Landmark className="h-5 w-5 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">Belum ada rekening bank.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="group flex items-center justify-between rounded-lg border border-border px-3.5 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Landmark className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      {account.bank_name}
                      {account.is_primary && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                          <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                          Utama
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {account.account_number} · a.n. {account.account_holder_name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => openEditModal(account)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                    title="Edit rekening"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(account)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                    title="Hapus rekening"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <BankAccountModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
        editingAccount={editingAccount}
      />
    </Card>
  );
}
