/**
 * receiptPdf.ts
 *
 * Generator PDF Kwitansi Pembayaran (A4 landscape) menggunakan jsPDF.
 * Layout landscape karena kwitansi biasanya lebih lebar dari tinggi.
 */
import jsPDF, { GState } from 'jspdf';
import type { Receipt, CompanyProfile } from '../../types';

// ── helpers ──────────────────────────────────────────────────────────────────
const rp = (n: number | string | null | undefined) =>
  'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  } catch { return iso ?? '-'; }
}

function terbilang(n: number): string {
  const satuan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  const convert = (v: number): string => {
    if (v < 12) return satuan[v];
    if (v < 20) return satuan[v - 10] + ' Belas';
    if (v < 100) return satuan[Math.floor(v / 10)] + ' Puluh' + (v % 10 ? ' ' + convert(v % 10) : '');
    if (v < 200) return 'Seratus' + (v % 100 ? ' ' + convert(v % 100) : '');
    if (v < 1000) return satuan[Math.floor(v / 100)] + ' Ratus' + (v % 100 ? ' ' + convert(v % 100) : '');
    if (v < 2000) return 'Seribu' + (v % 1000 ? ' ' + convert(v % 1000) : '');
    if (v < 1e6) return convert(Math.floor(v / 1e3)) + ' Ribu' + (v % 1e3 ? ' ' + convert(v % 1e3) : '');
    if (v < 1e9) return convert(Math.floor(v / 1e6)) + ' Juta' + (v % 1e6 ? ' ' + convert(v % 1e6) : '');
    return convert(Math.floor(v / 1e9)) + ' Miliar' + (v % 1e9 ? ' ' + convert(v % 1e9) : '');
  };
  return convert(Math.round(n)) + ' Rupiah';
}

async function loadImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise<string>((ok, fail) => {
      const r = new FileReader();
      r.onload = () => ok(r.result as string);
      r.onerror = fail;
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

// ── warna ────────────────────────────────────────────────────────────────────
const C_DARK  = [30, 41, 59] as [number, number, number];
const C_WHITE = [255, 255, 255] as [number, number, number];
const C_MUTED = [100, 116, 139] as [number, number, number];
const C_INK   = [15, 23, 42] as [number, number, number];
const C_GREEN = [5, 150, 105] as [number, number, number];

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  dp: 'Uang Muka (DP)',
  pelunasan: 'Pelunasan',
};
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  transfer: 'Transfer Bank',
  cash: 'Tunai (Cash)',
  qris: 'QRIS',
  lainnya: 'Lainnya',
};

export type SignatureMode = 'none' | 'signature_only' | 'signature_and_stamp';

// ── MAIN GENERATOR ────────────────────────────────────────────────────────────
export async function generateReceiptPdf(
  receipt: Receipt,
  profile?: Partial<CompanyProfile>,
  signatureMode: SignatureMode = 'none'
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();   // 297
  const H = doc.internal.pageSize.getHeight();  // 210
  const M = 18;
  const companyName = profile?.companyName || 'Konveksi';

  // ── Load gambar (logo, signature, stamp) ───────────────────────────────────
  let logoData: string | null = null;
  let signatureData: string | null = null;
  let stampData: string | null = null;

  const withSignature = signatureMode === 'signature_only' || signatureMode === 'signature_and_stamp';
  const withStamp = signatureMode === 'signature_and_stamp';

  await Promise.all([
    profile?.logoUrl ? loadImage(profile.logoUrl).then(d => { logoData = d; }).catch(() => {}) : Promise.resolve(),
    withSignature && profile?.signatureUrl ? loadImage(profile.signatureUrl).then(d => { signatureData = d; }).catch(() => {}) : Promise.resolve(),
    withStamp && profile?.stampUrl ? loadImage(profile.stampUrl).then(d => { stampData = d; }).catch(() => {}) : Promise.resolve(),
  ]);

  // ── Header ───────────────────────────────────────────────────────────────
  doc.setFillColor(...C_DARK);
  doc.rect(0, 0, W, 34, 'F');

  if (logoData) {
    try { doc.addImage(logoData, 'PNG', M - 4, 7, 18, 18, undefined, 'FAST'); } catch { /**/ }
  }

  const nameX = logoData ? M + 17 : M;
  doc.setTextColor(...C_WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(companyName.toUpperCase(), nameX, 15);
  if (profile?.address) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(203, 213, 225);
    doc.text(profile.address.split('\n')[0], nameX, 21);
  }
  if (profile?.phone) {
    doc.setFontSize(6.5);
    doc.setTextColor(203, 213, 225);
    doc.text(`Telp: ${profile.phone}`, nameX, profile.address ? 26 : 21);
  }

  // Judul di kanan atas
  doc.setTextColor(...C_WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('KWITANSI', W - M, 16, { align: 'right' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(receipt.receipt_no, W - M, 24, { align: 'right' });

  let y = 42;

  // ── Hitung tinggi konten & TTD untuk distribusi vertikal penuh ─────────────
  // sigY fixed di H-58 agar TTD+Manager selalu di area bawah
  const sigY   = H - 58;
  const footer = H - 12;

  // Garis vertikal pemisah 2 kolom
  const colL  = M;
  const colR  = W / 2 + 4;
  const colRW = W / 2 - M - 4;
  const lblW  = 50;

  const typeLabel   = PAYMENT_TYPE_LABEL[receipt.payment_type] || receipt.payment_type;
  const methodLabel = PAYMENT_METHOD_LABEL[receipt.payment_method || ''] || receipt.payment_method || 'Transfer Bank';

  // Semua baris kolom kiri
  const dataRows: [string, string][] = [
    ['No.', receipt.receipt_no],
    ['Sudah Diterima Dari', receipt.customer_name],
    ['Banyaknya Uang', rp(receipt.amount)],
    ['Untuk Pembayaran', `${typeLabel} — Order ${receipt.order_code}`],
    ['Metode Pembayaran', methodLabel],
    ['Tanggal', fmtDate(receipt.receipt_date)],
  ];
  if (receipt.description) {
    dataRows.push(['Keterangan', receipt.description]);
  }

  // Estimasi tinggi baris kiri: baris pendek ~10mm, baris multi-line lebih
  const rowHeights = dataRows.map(([, val]) => {
    const lines = doc.splitTextToSize(val, W / 2 - M - lblW - 8);
    return lines.length > 1 ? lines.length * 5.5 + 2 : 10;
  });
  const leftColH = rowHeights.reduce((a, b) => a + b, 0);

  // Ruang dari y awal sampai garis TTD
  const contentZone = sigY - y - 4;          // zona untuk seluruh konten 2-kolom
  const rightColH   = 32 + 10;               // box(26) + padding(6) + terbilang(~10)
  const totalContentH = Math.max(leftColH, rightColH);

  // Gap ekstra yang bisa didistribusikan ke antara baris (supaya mengisi ruang)
  const extraSpace = Math.max(0, contentZone - totalContentH);
  const rowGap     = dataRows.length > 1
    ? extraSpace / (dataRows.length - 1)
    : 0;

  // ── Kolom Kiri: baris distribusi penuh ───────────────────────────────────
  let ly = y;
  dataRows.forEach(([label, val], idx) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C_MUTED);
    doc.text(label, colL, ly);
    doc.text(':', colL + lblW, ly);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C_INK);
    const lines = doc.splitTextToSize(val, W / 2 - M - lblW - 8);
    doc.text(lines, colL + lblW + 4, ly);
    // Jika baris "Banyaknya Uang", beri highlight ringan
    if (label === 'Banyaknya Uang') {
      doc.setFillColor(236, 253, 245);
      doc.roundedRect(colL + lblW + 1, ly - 5, W / 2 - M - lblW - 6, 9, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...C_INK);
      doc.text(lines, colL + lblW + 4, ly);
    }
    ly += rowHeights[idx] + rowGap;
  });

  // ── Kolom Kanan: Box Total ditengah zona konten ──────────────────────────
  const boxY = y + (contentZone - rightColH) / 2;   // vertikal-center di zona

  doc.setFillColor(244, 246, 250);
  doc.roundedRect(colR, boxY, colRW, 26, 3, 3, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...C_MUTED);
  doc.text('JUMLAH PEMBAYARAN', colR + 5, boxY + 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...C_DARK);
  doc.text(rp(receipt.amount), colR + 5, boxY + 20);

  // Terbilang di bawah box
  const terbilangText = doc.splitTextToSize(`# ${terbilang(receipt.amount)} #`, colRW);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(...C_MUTED);
  doc.text(terbilangText, colR, boxY + 32);

  // Garis vertikal pemisah tengah (sepanjang zona konten)
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(W / 2, y - 2, W / 2, sigY - 4);
  doc.setLineWidth(0.2);

  // ── Watermark LUNAS ───────────────────────────────────────────────────────
  doc.saveGraphicsState();
  doc.setGState(new GState({ opacity: 0.07 }));
  doc.setFontSize(75);
  doc.setTextColor(...C_GREEN);
  doc.text('LUNAS', W / 2, H / 2 + 10, { align: 'center', angle: 15 });
  doc.restoreGraphicsState();

  // ── Divider sebelum TTD ───────────────────────────────────────────────────
  doc.setDrawColor(226, 232, 240);
  doc.line(M, sigY - 4, W - M, sigY - 4);

  // ── Tanda Tangan ─────────────────────────────────────────────────────────
  const sigLX = W - M - 54;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C_MUTED);
  doc.text(`Tasikmalaya, ${fmtDate(receipt.receipt_date)}`, sigLX, sigY);
  doc.text(companyName, sigLX, sigY + 5);

  if (withSignature && signatureData) {
    try {
      if (withStamp && stampData) {
        try {
          doc.saveGraphicsState();
          doc.setGState(new GState({ opacity: 0.7 }));
          doc.addImage(stampData, 'PNG', sigLX - 6, sigY + 3, 32, 32, undefined, 'FAST');
          doc.restoreGraphicsState();
        } catch { /**/ }
      }
      doc.addImage(signatureData, 'PNG', sigLX + 4, sigY + 7, 36, 15, undefined, 'FAST');
    } catch { /**/ }
  }

  doc.setDrawColor(203, 213, 225);
  doc.line(sigLX, sigY + 26, W - M, sigY + 26);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C_INK);
  doc.text('Manager', (sigLX + W - M) / 2, sigY + 31, { align: 'center' });

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.setDrawColor(...C_MUTED);
  doc.line(M, footer, W - M, footer);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...C_MUTED);
  doc.text(`${companyName} · Kwitansi ini merupakan bukti pembayaran yang sah`, M, H - 7);
  const ts = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });
  doc.text(`Dicetak: ${ts} WIB`, W - M, H - 7, { align: 'right' });

  return doc;
}

export async function getReceiptPdfBlobUrl(
  receipt: Receipt,
  profile?: Partial<CompanyProfile>,
  signatureMode: SignatureMode = 'none'
): Promise<string> {
  const doc = await generateReceiptPdf(receipt, profile, signatureMode);
  return URL.createObjectURL(doc.output('blob'));
}

export function downloadReceiptPdf(
  receipt: Receipt,
  profile?: Partial<CompanyProfile>,
  signatureMode: SignatureMode = 'none'
) {
  return generateReceiptPdf(receipt, profile, signatureMode).then(doc => {
    const name = (receipt.customer_name || 'Customer').replace(/\s+/g, '_');
    doc.save(`Kwitansi-${name}-${receipt.payment_type}.pdf`);
  });
}
