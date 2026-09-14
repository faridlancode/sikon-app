export default function Badge({ type }) {
  const isIncome = type === 'income';

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm ${isIncome
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-rose-200 bg-rose-50 text-rose-700'
        }`}
    >
      {isIncome ? 'Pemasukan' : 'Pengeluaran'}
    </span>
  );
}
