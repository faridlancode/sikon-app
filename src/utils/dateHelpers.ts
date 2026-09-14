export function formatDateID(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(`${dateStr}T00:00:00`);
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Nama bulan singkat (Jan, Feb, ...) dari tanggal ISO "YYYY-MM-DD" */
export function monthLabelID(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  return new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(date);
}

/** Key "YYYY-MM" untuk pengelompokan per bulan */
export function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}
