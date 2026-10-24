/**
 * poCloseReportPdf.ts
 *
 * Generator PDF Laporan Close Batch PO menggunakan jsPDF + jspdf-autotable.
 */
import jsPDF, { GState } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PoCloseReport, CompanyProfile } from '../../types';

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

// ── warna ────────────────────────────────────────────────────────────────────
const C_HEADER   = [30, 41, 59] as [number, number, number];
const C_WHITE    = [255, 255, 255] as [number, number, number];
const C_MUTED    = [100, 116, 139] as [number, number, number];
const C_ROSE     = [225, 29, 72] as [number, number, number];
const C_EMERALD  = [5, 150, 105] as [number, number, number];
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
  doc.text('SIKon · Laporan Close Batch PO', 14, H - 7);
  doc.text(`Halaman ${pageNum} / ${totalPages}`, W - 14, H - 7, { align: 'right' });
}

function pct(n: number) { return `${Math.round(n)}%`; }

// ── MAIN GENERATOR ────────────────────────────────────────────────────────────
export async function generatePoCloseReportPdf(
  report: PoCloseReport,
  profile?: Partial<CompanyProfile>
): Promise<jsPDF> {
  const snap = report.close_snapshot;
  const batch = report.batch;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;

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
    } catch { /* bukan error fatal */ }
  }

  // ── Header ───────────────────────────────────────────────────────────────
  doc.setFillColor(...C_HEADER);
  doc.rect(0, 0, W, 40, 'F');
  doc.setTextColor(...C_WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('SIKon Konveksi', M + (profile?.logoUrl ? 22 : 0), 15);
  const poTitle = batch.name || batch.code;
  doc.setFontSize(12);
  doc.text(`LAPORAN CLOSE BATCH PO`, W - M, 12, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(poTitle, W - M, 20, { align: 'right' });
  doc.text(`${batch.code}  •  ${fmtDate(batch.start_date)} – ${fmtDate(batch.end_date)}`, W - M, 28, { align: 'right' });
  const ts = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });
  doc.setFontSize(8);
  doc.setTextColor(...C_MUTED);
  doc.text(`Dicetak: ${ts} WIB`, M + (profile?.logoUrl ? 22 : 0), 28);

  // Stamp CLOSE
  doc.saveGraphicsState();
  doc.setGState(new GState({ opacity: 0.12 }));
  doc.setFontSize(80);
  doc.setTextColor(...C_EMERALD);
  doc.text('CLOSE', W / 2, H / 2, { align: 'center' });
  doc.restoreGraphicsState();

  let y = 48;

  // ── Info Batch ────────────────────────────────────────────────────────────
  y = drawSectionTitle(doc, 'Informasi Batch PO', y, W);
  const infoRows = [
    ['Nama', poTitle],
    ['Kode', batch.code],
    ['Periode', `${fmtDate(batch.start_date)} – ${fmtDate(batch.end_date)}`],
    ['Kuota', batch.quota_qty != null ? `${batch.quota_qty} pcs` : '-'],
    ['Ditutup oleh', batch.closed_by_name || '-'],
    ['Ditutup pada', fmtDate(batch.closed_at)],
    ['Catatan', batch.close_note || '-'],
  ];
  if (batch.close_early_reason) infoRows.push(['Alasan tutup awal', batch.close_early_reason]);

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    body: infoRows,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 40, textColor: C_MUTED, fontSize: 7.5 },
      1: { fontSize: 8, textColor: C_INK },
    },
    styles: { cellPadding: 2.5, lineColor: [226, 232, 240], lineWidth: 0.2 },
    theme: 'grid',
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Summary Keuangan & Produksi ───────────────────────────────────────────
  y = drawSectionTitle(doc, 'Ringkasan Keuangan & Produksi (Snapshot saat Close)', y, W);
  const sm = snap?.summary;
  const prod = report.live_status?.production;
  const pay = report.live_status?.payment;

  const summaryData = [
    ['Total Order', `${sm?.total_orders ?? '-'}`, 'Total Pcs', `${sm?.total_pcs ?? '-'} pcs`],
    ['Nilai Booking', rp(sm?.total_price), 'Total Ongkir', rp(sm?.total_ongkir)],
    ['Terbayar', rp(sm?.total_paid), 'Sisa Piutang', rp(sm?.total_remaining)],
    ['Pemotongan', pct(prod?.cutting_pct ?? 0), 'Jahit', pct(prod?.sewing_pct ?? 0)],
    ['QC Lulus', pct(prod?.qc_pct ?? 0), 'Order Lunas', `${pay?.fully_paid_orders ?? 0}`],
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['Keterangan', 'Nilai', 'Keterangan', 'Nilai']],
    body: summaryData,
    headStyles: { fillColor: C_HEADER, textColor: C_WHITE, fontSize: 7.5, fontStyle: 'bold', cellPadding: 2.5 },
    bodyStyles: { fontSize: 8, cellPadding: 2.5, textColor: C_INK },
    alternateRowStyles: { fillColor: C_ROW_ALT },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: C_MUTED, cellWidth: 50 },
      1: { fontStyle: 'bold', halign: 'right', textColor: C_INK },
      2: { fontStyle: 'bold', textColor: C_MUTED, cellWidth: 50 },
      3: { fontStyle: 'bold', halign: 'right', textColor: C_INK },
    },
    styles: { lineColor: [226, 232, 240], lineWidth: 0.2 },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Rincian per Sales × Kategori ─────────────────────────────────────────
  const matrix = snap?.sales_category_matrix ?? [];
  if (matrix.length > 0) {
    if (y > H - 60) { doc.addPage(); y = 20; }
    y = drawSectionTitle(doc, 'Rincian Pesanan per Sales & Kategori (Saat Close)', y, W);

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
        const price = catData[cat]?.price ?? 0;
        row.push(pcs > 0 ? pcs : '-');
        catTotPcs[ci] += pcs;
        rowPcs += pcs;
        rowPrice += price;
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

  // ── Daftar Semua Order ────────────────────────────────────────────────────
  const orders = snap?.orders ?? [];
  if (orders.length > 0) {
    if (y > H - 50) { doc.addPage(); y = 20; }
    y = drawSectionTitle(doc, `Daftar Pesanan (${orders.length} order)`, y, W);
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['No', 'Tgl Order', 'Customer', 'Sales', 'Tipe', 'Pcs', 'Nilai', 'Status Bayar', 'Status Prod.']],
      body: orders.map((o, i) => [
        i + 1,
        fmtDate(o.order_date),
        o.customer_name,
        o.sales_name || '-',
        o.order_type || '-',
        o.total_pcs,
        rp(o.total_price),
        o.payment_status,
        o.production_status,
      ]),
      headStyles: { fillColor: C_HEADER, textColor: C_WHITE, fontSize: 7.5, fontStyle: 'bold', cellPadding: 3 },
      bodyStyles: { fontSize: 7.5, cellPadding: 2.5, textColor: C_INK },
      alternateRowStyles: { fillColor: C_ROW_ALT },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { cellWidth: 26 },
        5: { halign: 'center' },
        6: { halign: 'right' },
        7: { halign: 'center' },
        8: { halign: 'center' },
      },
      styles: { lineColor: [226, 232, 240], lineWidth: 0.2 },
    });
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(doc, p, totalPages, W, H);
  }

  return doc;
}

export function downloadPoCloseReportPdf(report: PoCloseReport, profile?: Partial<CompanyProfile>) {
  return generatePoCloseReportPdf(report, profile).then(doc => {
    const code = report.batch.code.replace(/[^a-zA-Z0-9_-]/g, '_');
    doc.save(`Laporan_Close_PO_${code}.pdf`);
  });
}
