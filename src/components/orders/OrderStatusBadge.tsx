export default function OrderStatusBadge({ status }) {
  const isLunas = status === 'lunas';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm ${isLunas
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-amber-200 bg-amber-50 text-amber-700'
        }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isLunas ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      {isLunas ? 'Lunas' : 'Belum Lunas'}
    </span>
  );
}
