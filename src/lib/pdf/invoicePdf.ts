/**
 * invoicePdf.ts
 *
 * Generator PDF Invoice Penagihan (A4 portrait) menggunakan jsPDF + jspdf-autotable.
 * Metode: programmatic drawing — presisi milimeter, output vektor, teks bisa diseleksi.
 */
import jsPDF, { GState } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Invoice, CompanyProfile } from '../../types';

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
    if (v < 1e12) return convert(Math.floor(v / 1e9)) + ' Miliar' + (v % 1e9 ? ' ' + convert(v % 1e9) : '');
    return convert(Math.floor(v / 1e12)) + ' Triliun' + (v % 1e12 ? ' ' + convert(v % 1e12) : '');
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
const C_DARK   = [30, 41, 59] as [number, number, number];
const C_WHITE  = [255, 255, 255] as [number, number, number];
const C_MUTED  = [100, 116, 139] as [number, number, number];
const C_ROSE   = [225, 29, 72] as [number, number, number];
const C_GREEN  = [34, 197, 94] as [number, number, number];
const C_INK    = [15, 23, 42] as [number, number, number];
const C_ROW    = [248, 250, 252] as [number, number, number];

const INVOICE_TYPE_LABEL: Record<string, string> = {
  dp: 'INVOICE UANG MUKA (DP)',
  pelunasan: 'INVOICE PELUNASAN',
  penuh: 'INVOICE',
};

export type SignatureMode = 'none' | 'signature_only' | 'signature_and_stamp';

// ── MAIN GENERATOR ────────────────────────────────────────────────────────────
export async function generateInvoicePdf(
  invoice: Invoice,
  profile?: Partial<CompanyProfile>,
  signatureMode: SignatureMode = 'none',
  keterangan?: string
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();   // 210
  const H = doc.internal.pageSize.getHeight();  // 297
  const M = 20;
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

  // ── Header (dark bg, diperkecil) ─────────────────────────────────────────
  doc.setFillColor(...C_DARK);
  doc.rect(0, 0, W, 46, 'F');

  if (logoData) {
    try { doc.addImage(logoData, 'PNG', M - 4, 8, 20, 20, undefined, 'FAST'); } catch { /**/ }
  }

  const nameX = logoData ? M + 18 : M;
  doc.setTextColor(...C_WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(companyName.toUpperCase(), nameX, 17);

  if (profile?.address) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(203, 213, 225);
    const addr = doc.splitTextToSize(profile.address, 85);
    doc.text(addr, nameX, 23);
  }
  if (profile?.phone) {
    doc.setFontSize(7);
    doc.setTextColor(203, 213, 225);
    doc.text(`Telp: ${profile.phone}`, nameX, profile.address ? 29 : 23);
  }

  // Judul di kanan atas
  const typeTitle = INVOICE_TYPE_LABEL[invoice.invoice_type] || 'INVOICE';
  doc.setTextColor(...C_WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(typeTitle, W - M, 17, { align: 'right' });
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(invoice.invoice_no, W - M, 24, { align: 'right' });

  // ── Info tagihan ──────────────────────────────────────────────────────────
  let y = 53;

  // Kiri: alamat kepada
  doc.setTextColor(...C_MUTED);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text('TAGIHAN KEPADA:', M, y);
  doc.setTextColor(...C_INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(invoice.customer_name, M, y + 5);
  if (invoice.customer_address) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C_MUTED);
    const addr = doc.splitTextToSize(invoice.customer_address, 80);
    doc.text(addr, M, y + 11);
  }

  // Kanan: detail invoice
  const rightX = W - M;
  const labelX = W - M - 55;
  const rows = [
    ['Tanggal Invoice', fmtDate(invoice.invoice_date)],
    ['Jatuh Tempo', invoice.due_date ? fmtDate(invoice.due_date) : '-'],
    ['Status', invoice.status.toUpperCase()],
  ];
  rows.forEach(([label, val], i) => {
    const ry = y + i * 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C_MUTED);
    doc.text(label, labelX, ry);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C_INK);
    doc.text(val, rightX, ry, { align: 'right' });
  });

  y += 27;
  doc.setDrawColor(226, 232, 240);
  doc.line(M, y, W - M, y);
  y += 6;

  // ── Tabel Item ────────────────────────────────────────────────────────────
  const items = invoice.invoice_items || [];
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['No', 'Nama Barang / Jasa', 'Satuan', 'Qty', 'Harga/Unit', 'Subtotal']],
    body: items.map((it, i) => [
      i + 1,
      [it.product_name, it.description].filter(Boolean).join('\n'),
      it.unit || 'pcs',
      it.qty,
      rp(it.unit_price),
      rp((it.qty || 0) * (Number(it.unit_price) || 0)),
    ]),
    headStyles: { fillColor: C_DARK, textColor: C_WHITE, fontSize: 8, fontStyle: 'bold', cellPadding: 3.5 },
    bodyStyles: { fontSize: 8.5, cellPadding: 3, textColor: C_INK },
    alternateRowStyles: { fillColor: C_ROW },
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 },
      2: { halign: 'center', cellWidth: 18 },
      3: { halign: 'center', cellWidth: 16 },
      4: { halign: 'right', cellWidth: 32 },
      5: { halign: 'right', cellWidth: 32, fontStyle: 'bold' },
    },
    styles: { lineColor: [226, 232, 240], lineWidth: 0.2 },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Ringkasan keuangan (kanan) + Info Bank (kiri, sejajar) ────────────────
  const subtotal = items.reduce((s, it) => s + (it.qty || 0) * (Number(it.unit_price) || 0), 0);
  const ongkir = Number(invoice.shipping_cost) || 0;
  const grandTotal = Number(invoice.grand_total) || 0;
  const paidAmount = Number(invoice.paid_amount) || 0;
  const amountDue = Number(invoice.amount_due) || grandTotal - paidAmount;

  const summaryRows: [string, string][] = [
    ['Subtotal', rp(subtotal)],
    ...(ongkir > 0 ? [['Ongkir', rp(ongkir)] as [string, string]] : []),
    ['Total', rp(grandTotal)],
    ['Dibayar', rp(paidAmount)],
  ];

  // Bank info di kiri, sejajar baris summary
  const bank = invoice.bank_account;
  const sumStartY = y;
  const sumLabelX = W - M - 70;
  const sumValX = W - M;

  summaryRows.forEach(([label, val], i) => {
    const ry = sumStartY + i * 6.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C_MUTED);
    doc.text(label, sumLabelX, ry);
    doc.setTextColor(...C_INK);
    doc.text(val, sumValX, ry, { align: 'right' });
  });
  y = sumStartY + summaryRows.length * 6.5;

  // Divider tipis sebelum sisa tagihan
  doc.setDrawColor(226, 232, 240);
  doc.line(sumLabelX - 4, y, W - M, y);
  y += 1;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C_DARK);
  doc.text('SISA TAGIHAN', sumLabelX, y + 7);
  const dueColor = amountDue > 0
    ? [C_ROSE[0], C_ROSE[1], C_ROSE[2]] as [number, number, number]
    : [C_GREEN[0], C_GREEN[1], C_GREEN[2]] as [number, number, number];
  doc.setTextColor(...dueColor);
  doc.setFontSize(10);
  doc.text(rp(amountDue), sumValX, y + 7, { align: 'right' });
  y += 13;

  // Info bank (sejajar kiri summary)
  if (bank) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...C_DARK);
    doc.text('INFORMASI PEMBAYARAN:', M, sumStartY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C_INK);
    const bankLine = `${bank.bank_name}  ·  ${bank.account_number}  ·  a/n ${bank.account_holder_name}`;
    doc.text(bankLine, M, sumStartY + 6);
  }

  // Terbilang
  if (amountDue > 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(...C_MUTED);
    const terbilangText = doc.splitTextToSize(`Terbilang: ${terbilang(amountDue)}`, W - 2 * M);
    doc.text(terbilangText, M, y);
    y += terbilangText.length * 4 + 3;
  }

  // ── Keterangan ────────────────────────────────────────────────────────────
  if (keterangan?.trim()) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C_DARK);
    doc.text('KETERANGAN:', M, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C_MUTED);
    const ktLines = doc.splitTextToSize(keterangan.trim(), W / 2 - M);
    doc.text(ktLines, M, y + 5);
    y += ktLines.length * 4 + 8;
  }

  // ── Watermark LUNAS ───────────────────────────────────────────────────────
  if (amountDue <= 0) {
    doc.saveGraphicsState();
    doc.setGState(new GState({ opacity: 0.09 }));
    doc.setFontSize(85);
    doc.setTextColor(...C_GREEN);
    doc.text('LUNAS', W / 2, H / 2 + 15, { align: 'center', angle: 15 });
    doc.restoreGraphicsState();
  }

  // ── Area Tanda Tangan & Stempel ───────────────────────────────────────────
  // Math.min: ambil yang lebih kecil → TTD naik mengikuti konten jika konten pendek
  // Cap di H-54 agar TTD tidak overlap footer jika konten sangat panjang
  const sigBoxY = Math.min(y + 6, H - 54);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C_MUTED);
  const sigX = W - M - 52;
  doc.text(`Tasikmalaya, ${fmtDate(invoice.invoice_date)}`, sigX, sigBoxY);
  doc.text(companyName, sigX, sigBoxY + 5);

  if (withSignature && signatureData) {
    try {
      if (withStamp && stampData) {
        try {
          doc.saveGraphicsState();
          doc.setGState(new GState({ opacity: 0.7 }));
          doc.addImage(stampData, 'PNG', sigX - 8, sigBoxY + 3, 34, 34, undefined, 'FAST');
          doc.restoreGraphicsState();
        } catch { /**/ }
      }
      doc.addImage(signatureData, 'PNG', sigX + 4, sigBoxY + 7, 38, 16, undefined, 'FAST');
    } catch { /**/ }
  }

  // Garis tanda tangan
  doc.setDrawColor(203, 213, 225);
  doc.line(sigX, sigBoxY + 28, W - M, sigBoxY + 28);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C_INK);
  doc.text('Manager', (sigX + W - M) / 2, sigBoxY + 34, { align: 'center' });

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.setDrawColor(...C_MUTED);
  doc.line(M, H - 12, W - M, H - 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...C_MUTED);
  doc.text(`${companyName} · Dokumen ini dicetak secara elektronik`, M, H - 7);
  const ts = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });
  doc.text(`Dicetak: ${ts} WIB`, W - M, H - 7, { align: 'right' });

  return doc;
}

// ── Helpers untuk UI ──────────────────────────────────────────────────────────

/** Buat Blob URL untuk pratinjau di <iframe> */
export async function getInvoicePdfBlobUrl(
  invoice: Invoice,
  profile?: Partial<CompanyProfile>,
  signatureMode: SignatureMode = 'none',
  keterangan?: string
): Promise<string> {
  const doc = await generateInvoicePdf(invoice, profile, signatureMode, keterangan);
  return URL.createObjectURL(doc.output('blob'));
}

/** Langsung download file */
export function downloadInvoicePdf(
  invoice: Invoice,
  profile?: Partial<CompanyProfile>,
  signatureMode: SignatureMode = 'none',
  keterangan?: string
) {
  return generateInvoicePdf(invoice, profile, signatureMode, keterangan).then(doc => {
    const name = (invoice.customer_name || 'Customer').replace(/\s+/g, '_');
    doc.save(`Invoice-${name}-${invoice.invoice_no}.pdf`);
  });
}
