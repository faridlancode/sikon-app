import { useState } from 'react';
import { Plus } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import SalesTable from '../components/sales/SalesTable';
import SalesModal from '../components/sales/SalesModal';
import { useSales } from '../hooks/useSales';

export default function SalesPage() {
  const { sales, loading, addSales, updateSales, deleteSales } = useSales();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSales, setEditingSales] = useState(null);

  function openAddModal() {
    setEditingSales(null);
    setModalOpen(true);
  }

  function openEditModal(person) {
    setEditingSales(person);
    setModalOpen(true);
  }

  async function handleSubmit(payload) {
    if (editingSales) {
      await updateSales(editingSales.id, payload);
    } else {
      await addSales(payload);
    }
  }

  async function handleDelete(person) {
    if (
      !window.confirm(
        `Hapus sales "${person.name}"? Order yang sudah tercatat dengan sales ini akan tetap ada, tapi kolom sales-nya menjadi kosong.`
      )
    ) {
      return;
    }
    await deleteSales(person.id);
  }

  return (
    <AppShell
      title="Data Sales"
      subtitle="Kelola master data nama sales untuk digunakan saat membuat order"
      actions={
        <Button onClick={openAddModal}>
          <Plus className="h-4 w-4" />
          Tambah Sales
        </Button>
      }
    >
      <Card>
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <p className="text-sm font-semibold text-slate-900">{sales.length} Sales Terdaftar</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          </div>
        ) : (
          <SalesTable sales={sales} onEdit={openEditModal} onDelete={handleDelete} />
        )}
      </Card>

      <SalesModal open={modalOpen} onClose={() => setModalOpen(false)} onSubmit={handleSubmit} editingSales={editingSales} />
    </AppShell>
  );
}
