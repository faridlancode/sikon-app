export default function FormField({ label, children, error }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}
    </label>
  );
}

export const inputClass =
  'flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus:border-slate-300';
