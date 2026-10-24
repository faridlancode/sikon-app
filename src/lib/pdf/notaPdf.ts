/**
 * notaPdf.ts
 *
 * Generator PDF Nota Pesanan Lunas (A4 portrait) menggunakan jsPDF + jspdf-autotable.
 */
import jsPDF, { GState } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Nota, CompanyProfile } from '../../types';

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
const C_ROW   = [248, 250, 252] as [number, number, number];

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  dp: 'DP',
  pelunasan: 'Pelunasan',
};
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  transfer: 'Transfer Bank',
  cash: 'Tunai',
  qris: 'QRIS',
  lainnya: 'Lainnya',
};

export type SignatureMode = 'none' | 'signature_only' | 'signature_and_stamp';

// ── MAIN GENERATOR ────────────────────────────────────────────────────────────
export async function generateNotaPdf(
  nota: Nota,
  profile?: Partial<CompanyProfile>,
  signatureMode: SignatureMode = 'none'
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();   // 210
  const H = doc.internal.pageSize.getHeight();  // 297
  const M = 20;
  const companyName = profile?.companyName || 'Konveksi';
  const snap = nota.snapshot;

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
  doc.rect(0, 0, W, 44, 'F');

  if (logoData) {
    try { doc.addImage(logoData, 'PNG', M - 4, 8, 20, 20, undefined, 'FAST'); } catch { /**/ }
  }

  const nameX = logoData ? M + 18 : M;
  doc.setTextColor(...C_WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(companyName.toUpperCase(), nameX, 16);
  if (profile?.address) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(203, 213, 225);
    const addr = doc.splitTextToSize(profile.address, 90);
    doc.text(addr, nameX, 22);
  }
  if (profile?.phone) {
    doc.setFontSize(7);
    doc.setTextColor(203, 213, 225);
    doc.text(`Telp: ${profile.phone}`, nameX, profile.address ? 28 : 22);
  }

  // Judul kanan
  doc.setTextColor(...C_WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('NOTA', W - M, 16, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(nota.nota_no, W - M, 29, { align: 'right' });

  // ── Info dokumen ──────────────────────────────────────────────────────────
  let y = 52;

  // Kiri: kepada
  doc.setTextColor(...C_MUTED);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text('KEPADA:', M, y);
  doc.setTextColor(...C_INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(nota.customer_name, M, y + 6);

  // Kanan: tanggal + no order (digabung di header info)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C_MUTED);
  doc.text('Tanggal Nota:', W - M - 60, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C_INK);
  doc.text(fmtDate(nota.nota_date), W - M, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C_MUTED);
  doc.text('No. Order:', W - M - 60, y + 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C_INK);
  doc.text(nota.order_code, W - M, y + 7, { align: 'right' });

  y += 18;
  doc.setDrawColor(226, 232, 240);
  doc.line(M, y, W - M, y);
  y += 6;

  // ── Tabel Barang ──────────────────────────────────────────────────────────
  const items = snap.items || [];
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['No', 'Nama Barang / Jasa', 'Qty', 'Harga/Unit', 'Subtotal']],
    body: items.map((it, i) => [
      i + 1,
      [it.name, it.description].filter(Boolean).join('\n'),
      it.qty,
      rp(it.unit_price),
      rp(it.subtotal ?? (it.qty * Number(it.unit_price))),
    ]),
    headStyles: { fillColor: C_DARK, textColor: C_WHITE, fontSize: 8, fontStyle: 'bold', cellPadding: 3.5 },
    bodyStyles: { fontSize: 9, cellPadding: 3, textColor: C_INK },
    alternateRowStyles: { fillColor: C_ROW },
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 },
      2: { halign: 'center', cellWidth: 18 },
      3: { halign: 'right', cellWidth: 36 },
      4: { halign: 'right', cellWidth: 36, fontStyle: 'bold' },
    },
    styles: { lineColor: [226, 232, 240], lineWidth: 0.2 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Total ─────────────────────────────────────────────────────────────────
  const itemTotal = items.reduce((s, it) => s + (it.subtotal ?? (it.qty * Number(it.unit_price))), 0);
  const ongkir = Number(snap.ongkir) || 0;
  const grandTotal = Number(nota.grand_total) || 0;
  const paidAmount = Number(nota.paid_amount) || 0;

  const sumLabelX = W - M - 80;
  const sumValX = W - M;

  const summaryRows: [string, string][] = [
    ['Subtotal Barang', rp(itemTotal)],
    ...(ongkir > 0 ? [['Ongkir / Pengiriman', rp(ongkir)] as [string, string]] : []),
    ['Grand Total', rp(grandTotal)],
    ['Total Dibayar', rp(paidAmount)],
  ];

  summaryRows.forEach(([label, val]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...C_MUTED);
    doc.text(label, sumLabelX, y);
    doc.setTextColor(...C_INK);
    doc.text(val, sumValX, y, { align: 'right' });
    y += 7;
  });

  // Divider tipis sebelum sisa
  doc.setDrawColor(226, 232, 240);
  doc.line(sumLabelX - 4, y, W - M, y);
  y += 1;

  const sisa = grandTotal - paidAmount;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  const sisaColor = sisa <= 0
    ? [C_GREEN[0], C_GREEN[1], C_GREEN[2]] as [number, number, number]
    : [190, 28, 45] as [number, number, number];
  doc.setTextColor(...C_DARK);
  doc.text(sisa <= 0 ? 'STATUS' : 'SISA BAYAR', sumLabelX, y + 7);
  doc.setTextColor(...sisaColor);
  doc.setFontSize(10);
  doc.text(sisa <= 0 ? 'LUNAS' : rp(sisa), sumValX, y + 7, { align: 'right' });
  y += 15;

  // ── Riwayat Pembayaran ────────────────────────────────────────────────────
  const payments = snap.payments || [];
  if (payments.length > 0) {
    // Garis pemisah jelas
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.line(M, y, W - M, y);
    doc.setLineWidth(0.2);
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C_MUTED);
    doc.text('RIWAYAT PEMBAYARAN', M, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Tanggal', 'Jenis', 'Metode', 'Jumlah']],
      body: payments.map(p => [
        fmtDate(p.date),
        PAYMENT_TYPE_LABEL[p.type] || p.type,
        PAYMENT_METHOD_LABEL[p.method || ''] || p.method || '-',
        rp(p.amount),
      ]),
      headStyles: { fillColor: [71, 85, 105], textColor: C_WHITE, fontSize: 7.5, fontStyle: 'bold', cellPadding: 2.5 },
      bodyStyles: { fontSize: 8.5, cellPadding: 2.5, textColor: C_INK },
      alternateRowStyles: { fillColor: C_ROW },
      columnStyles: {
        0: { cellWidth: 36 },
        1: { cellWidth: 28, halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'right', fontStyle: 'bold' },
      },
      styles: { lineColor: [226, 232, 240], lineWidth: 0.2 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Catatan ───────────────────────────────────────────────────────────────
  if (nota.notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C_DARK);
    doc.text('CATATAN:', M, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C_MUTED);
    const noteLines = doc.splitTextToSize(nota.notes, W - 2 * M);
    doc.text(noteLines, M, y + 6);
    y += noteLines.length * 4 + 10;
  }

  // ── Watermark LUNAS (miring, center background) ──────────────────────────
  if (sisa <= 0) {
    doc.saveGraphicsState();
    doc.setGState(new GState({ opacity: 0.09 }));
    doc.setFontSize(85);
    doc.setTextColor(...C_GREEN);
    doc.text('LUNAS', W / 2, H / 2 + 15, { align: 'center', angle: 15 });
    doc.restoreGraphicsState();
  }

  // ── Tanda tangan (mengikuti konten, tidak fixed) ─────────────────────────
  // TTD selalu di dekat footer, minimal 6mm dari konten terakhir
  // Math.max → jika konten pendek, TTD tetap turun ke H-52 (tidak melayang di tengah)
  const sigY = Math.max(y + 6, H - 52);
  const sigLX = W - M - 55;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C_MUTED);
  doc.text(`Tasikmalaya, ${fmtDate(nota.nota_date)}`, sigLX, sigY);
  doc.text(companyName, sigLX, sigY + 5);

  if (withSignature && signatureData) {
    try {
      if (withStamp && stampData) {
        try {
          doc.saveGraphicsState();
          doc.setGState(new GState({ opacity: 0.7 }));
          doc.addImage(stampData, 'PNG', sigLX - 8, sigY + 3, 34, 34, undefined, 'FAST');
          doc.restoreGraphicsState();
        } catch { /**/ }
      }
      doc.addImage(signatureData, 'PNG', sigLX + 4, sigY + 7, 38, 16, undefined, 'FAST');
    } catch { /**/ }
  }

  doc.setDrawColor(203, 213, 225);
  doc.line(sigLX, sigY + 26, W - M, sigY + 26);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C_INK);
  doc.text('Manager', (sigLX + W - M) / 2, sigY + 32, { align: 'center' });

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.setDrawColor(...C_MUTED);
  doc.line(M, H - 14, W - M, H - 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...C_MUTED);
  doc.text(`${companyName} · Nota ini merupakan bukti transaksi yang sah`, M, H - 7);
  const ts = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });
  doc.text(`Dicetak: ${ts} WIB`, W - M, H - 9, { align: 'right' });

  return doc;
}

export async function getNotaPdfBlobUrl(
  nota: Nota,
  profile?: Partial<CompanyProfile>,
  signatureMode: SignatureMode = 'none'
): Promise<string> {
  const doc = await generateNotaPdf(nota, profile, signatureMode);
  return URL.createObjectURL(doc.output('blob'));
}

export function downloadNotaPdf(
  nota: Nota,
  profile?: Partial<CompanyProfile>,
  signatureMode: SignatureMode = 'none'
) {
  return generateNotaPdf(nota, profile, signatureMode).then(doc => {
    const name = (nota.customer_name || 'Customer').replace(/\s+/g, '_');
    doc.save(`Nota-${name}-${nota.order_code}.pdf`);
  });
}
