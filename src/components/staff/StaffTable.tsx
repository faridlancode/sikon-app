import { Pencil, Trash2, UserCheck } from 'lucide-react';
import type { Staff } from '../../types';

interface StaffTableProps {
  staff: Staff[];
  onEdit: (person: Staff) => void;
  onDelete: (person: Staff) => void;
}

function getRoleBadge(role?: string | null) {
  switch (role) {
    case 'Purchasing':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'Gudang':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'Produksi':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'Driver':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

export default function StaffTable({ staff, onEdit, onDelete }: StaffTableProps) {
  if (staff.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <UserCheck className="h-5 w-5 text-slate-400" />
        </div>
        <p className="mt-3 text-sm font-medium text-slate-600">Belum ada data staf</p>
        <p className="mt-1 text-xs text-slate-400">Tambahkan data staf untuk alur Purchasing, Gudang, dan operasional konveksi.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/80">
            <tr className="border-b border-border text-left text-[11px] font-semibold text-muted-foreground">
              <th className="px-4 py-3">Nama Staf</th>
              <th className="px-4 py-3">Peran / Divisi</th>
              <th className="px-4 py-3">No. HP / WA</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {staff.map((person) => (
              <tr key={person.id} className="group transition-colors hover:bg-slate-50/80">
                <td className="px-4 py-3.5 font-semibold text-slate-900">{person.name}</td>
                <td className="px-4 py-3.5">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${getRoleBadge(
                      person.role
                    )}`}
                  >
                    {person.role || 'Umum'}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-slate-500">{person.phone || '—'}</td>
                <td className="px-4 py-3.5">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm ${
                      person.is_active
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-slate-100 text-slate-600'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${person.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    {person.is_active ? 'Aktif' : 'Nonaktif'}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => onEdit(person)}
                      className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      title="Edit staf"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onDelete(person)}
                      className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                      title="Hapus staf"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
