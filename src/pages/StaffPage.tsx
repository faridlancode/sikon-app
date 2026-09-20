import { useMemo, useState } from 'react';
import { Plus, Search, UserCheck } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import Card from '../components/ui/card';
import Button from '../components/ui/button';
import StaffTable from '../components/staff/StaffTable';
import StaffModal from '../components/staff/StaffModal';
import { useStaff } from '../hooks/useStaff';
import { useSales } from '../hooks/useSales';
import type { Staff } from '../types';

const ROLE_FILTERS = ['Semua', 'Purchasing', 'Gudang', 'Penjahit', 'Tukang Potong', 'Sales', 'Produksi', 'Driver', 'Umum'];

export default function StaffPage() {
  const { staff, loading, addStaff, updateStaff, deleteStaff } = useStaff();
  const { activeSales } = useSales();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [selectedRole, setSelectedRole] = useState('Semua');
  const [search, setSearch] = useState('');

  const filteredStaff = useMemo(() => {
    return staff.filter((person) => {
      const matchRole = selectedRole === 'Semua' || (person.role || 'Umum') === selectedRole;
      const matchSearch =
        !search.trim() ||
        person.name.toLowerCase().includes(search.toLowerCase()) ||
        (person.phone && person.phone.includes(search));
      return matchRole && matchSearch;
    });
  }, [staff, selectedRole, search]);

  function openAddModal() {
    setEditingStaff(null);
    setModalOpen(true);
  }

  function openEditModal(person: Staff) {
    setEditingStaff(person);
    setModalOpen(true);
  }

  async function handleSubmit(payload: Partial<Staff>) {
    if (editingStaff) {
      await updateStaff(editingStaff.id, payload);
    } else {
      await addStaff(payload);
    }
  }

  async function handleDelete(person: Staff) {
    if (
      !window.confirm(
        `Hapus data staf "${person.name}"? Data SPJ atau pengajuan restock yang pernah terhubung dengan staf ini akan tetap tersimpan.`
      )
    ) {
      return;
    }
    await deleteStaff(person.id);
  }

  return (
    <AppShell
      title="Staf & Karyawan"
      subtitle="Kelola data personil internal untuk alur Purchasing, Gudang, dan operasional konveksi"
      actions={
        <Button onClick={openAddModal}>
          <Plus className="h-4 w-4" />
          Staf Baru
        </Button>
      }
    >
      <Card>
        {/* Filter bar */}
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Tab role filter */}
          <div className="flex flex-wrap items-center gap-1.5">
            {ROLE_FILTERS.map((role) => (
              <button
                key={role}
                onClick={() => setSelectedRole(role)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  selectedRole === role
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {role}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau no. HP..."
              className="w-full rounded-lg border border-input bg-background py-1.5 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          </div>
        ) : (
          <StaffTable staff={filteredStaff} onEdit={openEditModal} onDelete={handleDelete} />
        )}
      </Card>

      <StaffModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
        editingStaff={editingStaff}
        salesList={activeSales}
      />
    </AppShell>
  );
}
