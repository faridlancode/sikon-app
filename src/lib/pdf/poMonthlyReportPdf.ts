/**
 * poMonthlyReportPdf.ts
 *
 * Generator PDF Laporan Bulanan Batch PO menggunakan jsPDF + jspdf-autotable.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PoMonthlyReport, CompanyProfile } from '../../types';

// ── helpers ──────────────────────────────────────────────────────────────────
const rp = (n: number | string | null | undefined) =>
  'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return iso ?? '-'; }
}

function diff(n: number) {
  if (n === 0) return '=';
  return (n > 0 ? '+' : '') + n.toLocaleString('id-ID');
}
function diffRp(n: number) {
  if (n === 0) return '=';
  return (n > 0 ? '+' : '') + rp(n);
}

// ── warna ────────────────────────────────────────────────────────────────────
const C_HEADER   = [30, 41, 59] as [number, number, number];
const C_WHITE    = [255, 255, 255] as [number, number, number];
const C_MUTED    = [100, 116, 139] as [number, number, number];
const C_EMERALD  = [5, 150, 105] as [number, number, number];
const C_ROSE     = [225, 29, 72] as [number, number, number];
const C_INDIGO   = [79, 70, 229] as [number, number, number];
const C_ROW_ALT  = [248, 250, 252] as [number, number, number];
const C_INK      = [15, 23, 42] as [number, number, number];

// ── shared ───────────────────────────────────────────────────────────────────
function drawSectionTitle(doc: jsPDF, text: string, y: number, W: number) {
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y - 4, W - 28, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C_HEADER);
  doc.text(text.toUpperCase(), 16, y + 2);
  return y + 10;
}

function drawFooter(doc: jsPDF, pageNum: number, totalPages: number, W: number, H: number) {
  doc.setDrawColor(...C_MUTED);
  doc.line(14, H - 12, W - 14, H - 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...C_MUTED);
  doc.text('SIKon · Laporan Bulanan Batch PO', 14, H - 7);
  doc.text(`Halaman ${pageNum} / ${totalPages}`, W - 14, H - 7, { align: 'right' });
}

// ── MAIN GENERATOR ────────────────────────────────────────────────────────────
export async function generatePoMonthlyReportPdf(
  report: PoMonthlyReport,
  profile?: Partial<CompanyProfile>
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  const t = report.totals;
  const periodeLabel = `${report.month_name} ${report.year}`;

  // ── Logo ─────────────────────────────────────────────────────────────────
  if (profile?.logoUrl) {
    try {
      const res = await fetch(profile.logoUrl);
      if (res.ok) {
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((ok, fail) => {
          const r = new FileReader();
          r.onload = () => ok(r.result as string);
          r.onerror = fail;
          r.readAsDataURL(blob);
        });
        doc.addImage(dataUrl, 'PNG', M, 6, 20, 20, undefined, 'FAST');
      }
    } catch { /* tidak fatal */ }
  }

  // ── Header ───────────────────────────────────────────────────────────────
  doc.setFillColor(...C_HEADER);
  doc.rect(0, 0, W, 40, 'F');
  doc.setTextColor(...C_WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('SIKon Konveksi', M + (profile?.logoUrl ? 22 : 0), 15);
  doc.setFontSize(12);
  doc.text('LAPORAN BULANAN BATCH PO', W - M, 12, { align: 'right' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Periode: ${periodeLabel}`, W - M, 22, { align: 'right' });
  doc.text(`Total ${t.po_count} Batch PO`, W - M, 30, { align: 'right' });
  const ts = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });
  doc.setFontSize(8);
  doc.setTextColor(...C_MUTED);
  doc.text(`Dicetak: ${ts} WIB`, M + (profile?.logoUrl ? 22 : 0), 28);

  let y = 48;

  // ── Ringkasan Eksekutif (4 kotak) ────────────────────────────────────────
  y = drawSectionTitle(doc, `Ringkasan Eksekutif — ${periodeLabel}`, y, W);
  const cards = [
    { label: 'Total Pesanan', val: `${t.order_count} order`, sub: `${t.total_pcs} pcs dipesan` },
    { label: 'Nilai Booking', val: rp(t.booking_value), sub: `Terbayar: ${rp(t.paid_amount)}` },
    { label: 'Sisa Piutang', val: rp(t.receivable_amount), sub: `dari ${t.po_count} PO` },
    { label: 'Est. Margin Kotor', val: rp(t.estimated_margin), sub: `HPP Est: ${rp(t.hpp_total_estimate)}` },
  ];
  const colW = (W - 2 * M) / cards.length;
  cards.forEach(({ label, val, sub }, i) => {
    const x = M + i * colW;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x + 1, y, colW - 2, 22, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C_MUTED);
    doc.text(label, x + colW / 2, y + 6, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...(i === 2 ? C_ROSE : i === 3 ? C_INDIGO : C_INK));
    doc.text(val, x + colW / 2, y + 14, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C_MUTED);
    doc.text(sub, x + colW / 2, y + 20, { align: 'center' });
  });
  y += 28;

  // ── Perbandingan Bulan Sebelumnya ─────────────────────────────────────────
  const prev = report.previous_month_comparison;
  if (prev) {
    y = drawSectionTitle(doc, `Perbandingan vs Bulan Sebelumnya (${prev.previous_month}/${prev.previous_year})`, y, W);
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Metrik', 'Bulan Ini', 'Bulan Lalu', 'Selisih']],
      body: [
        ['Jumlah Order', `${t.order_count}`, `${prev.totals.order_count}`, diff(prev.diff.order_count_diff)],
        ['Total Pcs', `${t.total_pcs}`, `${prev.totals.total_pcs}`, diff(prev.diff.total_pcs_diff)],
        ['Nilai Booking', rp(t.booking_value), rp(prev.totals.booking_value), diffRp(prev.diff.booking_value_diff)],
        ['Est. Margin', rp(t.estimated_margin), rp(prev.totals.estimated_margin), diffRp(prev.diff.estimated_margin_diff)],
      ],
      headStyles: { fillColor: C_HEADER, textColor: C_WHITE, fontSize: 7.5, fontStyle: 'bold', cellPadding: 3 },
      bodyStyles: { fontSize: 8, cellPadding: 2.5, textColor: C_INK },
      alternateRowStyles: { fillColor: C_ROW_ALT },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: C_MUTED },
        1: { halign: 'right' },
        2: { halign: 'right', textColor: C_MUTED },
        3: { halign: 'right', fontStyle: 'bold' },
      },
      styles: { lineColor: [226, 232, 240], lineWidth: 0.2 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Tabel Kinerja per Batch PO ────────────────────────────────────────────
  if (report.po_batches.length > 0) {
    if (y > H - 70) { doc.addPage(); y = 20; }
    y = drawSectionTitle(doc, 'Kinerja Finansial & Operasional per Batch PO', y, W);
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Batch PO', 'Kode', 'Periode', 'Status', 'Kuota', 'Order/Pcs', 'Nilai Booking', 'Terbayar', 'Sisa Piutang', 'Est. Margin', 'Borongan', 'Bahan']],
      body: report.po_batches.map(po => [
        po.name || po.code,
        po.code,
        `${fmtDate(po.start_date)} – ${fmtDate(po.end_date)}`,
        po.status.toUpperCase(),
        po.quota_qty != null && po.quota_qty > 0 ? `${po.quota_qty} pcs (${po.quota_used_pct ?? 0}%)` : '-',
        `${po.order_count} / ${po.total_pcs}`,
        rp(po.booking_value),
        rp(po.paid_amount),
        rp(po.receivable_amount),
        rp(po.estimated_margin),
        rp(po.actual_piecework_wage),
        rp(po.material_purchases),
      ]),
      foot: [[
        'TOTAL', '', '', `${t.po_count} PO`,
        t.total_quota_qty ? `${t.total_quota_qty} pcs (${t.quota_used_pct ?? 0}%)` : '-',
        `${t.order_count} / ${t.total_pcs}`,
        rp(t.booking_value),
        rp(t.paid_amount),
        rp(t.receivable_amount ?? report.po_batches.reduce((s, p) => s + (Number(p.receivable_amount) || 0), 0)),
        rp(t.estimated_margin),
        rp(t.actual_piecework_wage),
        rp(t.material_purchases),
      ]],
      headStyles: { fillColor: C_HEADER, textColor: C_WHITE, fontSize: 7, fontStyle: 'bold', cellPadding: 2.5 },
      bodyStyles: { fontSize: 7.5, cellPadding: 2, textColor: C_INK },
      footStyles: { fillColor: [241, 245, 249], textColor: C_INK, fontStyle: 'bold', fontSize: 7.5, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: C_ROW_ALT },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 30 },
        1: { cellWidth: 18 },
        2: { cellWidth: 30 },
        3: { halign: 'center', cellWidth: 14 },
        4: { halign: 'center' },
        5: { halign: 'center' },
        6: { halign: 'right' },
        7: { halign: 'right', textColor: C_EMERALD },
        8: { halign: 'right', textColor: C_ROSE },
        9: { halign: 'right', textColor: C_INDIGO },
        10: { halign: 'right' },
        11: { halign: 'right' },
      },
      styles: { lineColor: [226, 232, 240], lineWidth: 0.2 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Sales × Kategori Matrix ───────────────────────────────────────────────
  const matrix = report.sales_category_matrix ?? [];
  if (matrix.length > 0) {
    if (y > H - 60) { doc.addPage(); y = 20; }
    y = drawSectionTitle(doc, `Rincian Pesanan per Sales & Kategori — ${periodeLabel}`, y, W);

    const catSet = new Set<string>();
    const salesMap = new Map<string, Record<string, { pcs: number; price: number }>>();
    for (const item of matrix) {
      const cat = item.category_name || 'Lainnya';
      const sales = item.sales_name || 'Tanpa Sales';
      catSet.add(cat);
      if (!salesMap.has(sales)) salesMap.set(sales, {});
      const m = salesMap.get(sales)!;
      if (!m[cat]) m[cat] = { pcs: 0, price: 0 };
      m[cat].pcs += Number(item.total_pcs) || 0;
      m[cat].price += Number(item.total_price) || 0;
    }
    const cats = Array.from(catSet).sort();
    const head = ['No', 'Sales (CS)', ...cats.map(c => `${c} (pcs)`), 'Total Pcs', 'Total Nilai'];
    const body: (string | number)[][] = [];
    let totPcs = 0, totPrice = 0;
    const catTotPcs: number[] = cats.map(() => 0);

    Array.from(salesMap.entries()).forEach(([sales, catData], idx) => {
      const row: (string | number)[] = [idx + 1, sales];
      let rowPcs = 0, rowPrice = 0;
      cats.forEach((cat, ci) => {
        const pcs = catData[cat]?.pcs ?? 0;
        row.push(pcs > 0 ? pcs : '-');
        catTotPcs[ci] += pcs;
        rowPcs += pcs;
        rowPrice += catData[cat]?.price ?? 0;
      });
      row.push(rowPcs, rp(rowPrice));
      totPcs += rowPcs;
      totPrice += rowPrice;
      body.push(row);
    });

    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [head],
      body,
      foot: [['', 'TOTAL', ...catTotPcs.map(String), String(totPcs), rp(totPrice)]],
      headStyles: { fillColor: C_HEADER, textColor: C_WHITE, fontSize: 7.5, fontStyle: 'bold', cellPadding: 3 },
      bodyStyles: { fontSize: 8, cellPadding: 2.5, textColor: C_INK },
      footStyles: { fillColor: [241, 245, 249], textColor: C_INK, fontStyle: 'bold', fontSize: 8, cellPadding: 3 },
      alternateRowStyles: { fillColor: C_ROW_ALT },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        [head.length - 1]: { halign: 'right', textColor: C_EMERALD },
        [head.length - 2]: { halign: 'right', fontStyle: 'bold' },
      },
      styles: { lineColor: [226, 232, 240], lineWidth: 0.2 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Rekonsiliasi Jurnal ───────────────────────────────────────────────────
  const rec = report.reconciliation;
  if (rec) {
    if (y > H - 40) { doc.addPage(); y = 20; }
    y = drawSectionTitle(doc, 'Rekonsiliasi Pengakuan Pendapatan Jurnal (Bulan Kalender)', y, W);
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      body: [
        ['Pendapatan Diakui di Jurnal (Akun 4-1000 & 4-1100)', rp(rec.total_recognized_revenue)],
        ['Nilai Booking Batch PO', rp(t.booking_value)],
        ['Selisih Booking vs Jurnal', rp(rec.booking_value_difference)],
        ['Catatan', rec.notes],
      ],
      columnStyles: {
        0: { fontStyle: 'bold', textColor: C_MUTED, cellWidth: 100, fontSize: 7.5 },
        1: { halign: 'right', fontSize: 8, fontStyle: 'bold', textColor: C_INK },
      },
      styles: { cellPadding: 2.5, lineColor: [226, 232, 240], lineWidth: 0.2 },
      theme: 'grid',
    });
  }

  // ── Footer di semua halaman ───────────────────────────────────────────────
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(doc, p, totalPages, W, H);
  }

  return doc;
}

export function downloadPoMonthlyReportPdf(report: PoMonthlyReport, profile?: Partial<CompanyProfile>) {
  return generatePoMonthlyReportPdf(report, profile).then(doc => {
    const m = String(report.month).padStart(2, '0');
    doc.save(`Laporan_Bulanan_PO_${report.year}_${m}.pdf`);
  });
}
