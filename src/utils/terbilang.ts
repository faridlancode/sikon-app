/**
 * Utilitas konversi angka ke teks terbilang dalam bahasa Indonesia.
 */

const SATUAN = [
  '',
  'satu',
  'dua',
  'tiga',
  'empat',
  'lima',
  'enam',
  'tujuh',
  'delapan',
  'sembilan',
  'sepuluh',
  'sebelas',
];

export function terbilang(n: number): string {
  const num = Math.floor(Math.abs(n));

  if (num === 0) return 'nol';
  if (num < 12) return SATUAN[num];
  if (num < 20) return terbilang(num - 10) + ' belas';
  if (num < 100) return terbilang(Math.floor(num / 10)) + ' puluh ' + (num % 10 !== 0 ? SATUAN[num % 10] : '');
  if (num < 200) return 'seratus ' + (num - 100 !== 0 ? terbilang(num - 100) : '');
  if (num < 1000) return terbilang(Math.floor(num / 100)) + ' ratus ' + (num % 100 !== 0 ? terbilang(num % 100) : '');
  if (num < 2000) return 'seribu ' + (num - 1000 !== 0 ? terbilang(num - 1000) : '');
  if (num < 1000000) return terbilang(Math.floor(num / 1000)) + ' ribu ' + (num % 1000 !== 0 ? terbilang(num % 1000) : '');
  if (num < 1000000000) return terbilang(Math.floor(num / 1000000)) + ' juta ' + (num % 1000000 !== 0 ? terbilang(num % 1000000) : '');
  if (num < 1000000000000) return terbilang(Math.floor(num / 1000000000)) + ' miliar ' + (num % 1000000000 !== 0 ? terbilang(num % 1000000000) : '');
  if (num < 1000000000000000) return terbilang(Math.floor(num / 1000000000000)) + ' triliun ' + (num % 1000000000000 !== 0 ? terbilang(num % 1000000000000) : '');

  return num.toString();
}

/**
 * Mengubah nominal angka menjadi format terbilang resmi dengan akhiran "rupiah" dan kapitalisasi awal.
 * Contoh: 8500000 -> "Delapan juta lima ratus ribu rupiah"
 */
export function terbilangRupiah(amount: number): string {
  if (isNaN(amount) || amount === 0) return 'Nol rupiah';
  const prefix = amount < 0 ? 'Minus ' : '';
  const kata = terbilang(amount).replace(/\s+/g, ' ').trim();
  const hasil = kata.charAt(0).toUpperCase() + kata.slice(1) + ' rupiah';
  return prefix + hasil;
}
