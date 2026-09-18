import { useEffect, useRef, useState } from 'react';
import { X, Wallet } from 'lucide-react';
import { inputClass } from '../ui/FormField';
import Button from '../ui/button';
import { useStaff } from '../../hooks/useStaff';
import { formatIDRInput, parseIDRInput } from '../../utils/formatCurrency';

interface CashAdvanceModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    staff_id: string;
    amount: number;
    purpose?: string;
    date?: string;
  }) => Promise<void>;
  defaultStaffId?: string;
}

export default function CashAdvanceModal({
  open,
  onClose,
  onSubmit,
  defaultStaffId,
}: CashAdvanceModalProps) {
  const { activeStaff } = useStaff();
  const [staffId, setStaffId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [purpose, setPurpose] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const activeStaffRef = useRef(activeStaff);
  useEffect(() => { activeStaffRef.current = activeStaff; }, [activeStaff]);

  const prevOpenRef = useRef(false);
  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;
    if (!justOpened) return;
    const staff = activeStaffRef.current;
    setStaffId(defaultStaffId || (staff.length > 0 ? staff[0].id : ''));
    setAmount('');
    setDate(new Date().toISOString().split('T')[0]);
    setPurpose('');
    setError('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultStaffId]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const amountNumber = parseIDRInput(amount);
    if (!staffId) return setError('Pilih staf purchasing yang menerima uang muka.');
    if (!amountNumber || amountNumber <= 0) return setError('Nominal uang muka harus lebih dari 0.');

    setSubmitting(true);
    try {
      await onSubmit({
        staff_id: staffId,
        amount: amountNumber,
        purpose: purpose.trim() || undefined,
        date,
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memberikan uang muka.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Beri Uang Muka SPJ</h2>
              <p className="text-[11px] text-muted-foreground">Kasbon belanja purchasing ke staf</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Penerima (Staf Purchasing)</span>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className={inputClass}
            >
              <option value="">-- Pilih Staf --</option>
              {activeStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.role || 'Staf'})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Nominal Uang Muka (Rp)</span>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(formatIDRInput(e.target.value))}
              placeholder="mis. 500.000"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Tanggal Penyerahan</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Keperluan / Catatan</span>
            <textarea
              rows={2}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="mis. Belanja kancing & resleting di Pasar Tanah Abang"
              className={inputClass}
            />
          </label>

          <div className="rounded-lg bg-amber-50/70 p-3 text-xs text-amber-800 border border-amber-200/60">
            <p className="font-semibold">Info Keuangan:</p>
            <p className="mt-0.5 text-[11px] leading-relaxed">
              Nominal ini akan langsung tercatat sebagai transaksi pengeluaran (kategori: Uang Muka Purchasing). Saat SPJ di-approve, transaksi reversal otomatis dibuat.
            </p>
          </div>

          {error && <div className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</div>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Menyimpan...' : 'Serahkan Uang Muka'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
