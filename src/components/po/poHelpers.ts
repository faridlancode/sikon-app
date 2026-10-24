import { PoBatch } from '../../types';

export const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export const MONTH_SHORT_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agt',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

/**
 * Format label PO manusiawi: contoh "PO 2 Oktober 2026", fallback ke kode PO
 */
export function getPoLabel(batch?: { name?: string | null; code?: string | null } | null): string {
  if (!batch) return '-';
  if (batch.name && batch.name.trim() !== '') {
    return batch.name.trim();
  }
  return batch.code || '-';
}

/**
 * Format rentang tanggal: contoh "12 Okt 2026 – 18 Okt 2026"
 */
export function formatPoDateRange(startDateStr?: string, endDateStr?: string): string {
  if (!startDateStr || !endDateStr) return '-';
  try {
    const [sy, sm, sd] = startDateStr.split('-').map(Number);
    const [ey, em, ed] = endDateStr.split('-').map(Number);

    const sMonth = MONTH_SHORT_ID[sm - 1] || '';
    const eMonth = MONTH_SHORT_ID[em - 1] || '';

    if (sy === ey && sm === em) {
      return `${sd} – ${ed} ${sMonth} ${ey}`;
    }
    if (sy === ey) {
      return `${sd} ${sMonth} – ${ed} ${eMonth} ${ey}`;
    }
    return `${sd} ${sMonth} ${sy} – ${ed} ${eMonth} ${ey}`;
  } catch {
    return `${startDateStr} – ${endDateStr}`;
  }
}

/**
 * Format hitung mundur dari sisa detik menuju batas tanggal selesai PO
 */
export function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return 'PO telah melewati batas tanggal selesai';

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days} hari ${hours} jam ${minutes} menit`;
  }
  if (hours > 0) {
    return `${hours} jam ${minutes} menit ${seconds} detik`;
  }
  return `${minutes} menit ${seconds} detik`;
}
