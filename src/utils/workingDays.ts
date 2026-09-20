/**
 * Hitung jumlah hari kerja dalam rentang tanggal (inclusive).
 * Kalender kerja: Senin–Sabtu masuk, Minggu libur.
 *
 * @param startDate - Format 'YYYY-MM-DD'
 * @param endDate   - Format 'YYYY-MM-DD'
 * @returns Jumlah hari kerja (Senin=1 ... Sabtu=6, Minggu=0 dikecualikan)
 */
export function countWorkingDays(startDate: string, endDate: string): number {
  let count = 0;
  const current = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  while (current <= end) {
    if (current.getDay() !== 0) count += 1; // 0 = Minggu
    current.setDate(current.getDate() + 1);
  }
  return count;
}
