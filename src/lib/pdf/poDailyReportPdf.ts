/**
 * poDailyReportPdf.ts
 *
 * Generator PDF Laporan Harian Batch PO menggunakan jsPDF + jspdf-autotable.
 * Metode: programmatic drawing — teks dan tabel digambar dengan koordinat mm,
 * bukan screenshot HTML. Hasilnya vektor tajam dan file kecil.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PoDailyReport, CompanyProfile } from '../../types';

// ── helpers ─────────────────────────────────────────────────────────────────
const rp = (n: number | string | null | undefined) =>
  'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  } catch { return iso; }
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    pending: 'Belum Bayar', partial: 'DP', paid: 'Lunas',
    not_started: 'Belum', cutting: 'Potong', sewing: 'Jahit',
    qc: 'QC', done: 'Selesai', shipped: 'Kirim',
  };
  return map[s] ?? s;
}

// ── warna SIKon ─────────────────────────────────────────────────────────────
const C_HEADER   = [30, 41, 59] as [number, number, number];   // slate-900
const C_WHITE    = [255, 255, 255] as [number, number, number];
const C_MUTED    = [100, 116, 139] as [number, number, number]; // slate-500
const C_ROSE     = [225, 29, 72] as [number, number, number];   // rose-600
const C_EMERALD  = [5, 150, 105] as [number, number, number];   // emerald-600
const C_INDIGO   = [79, 70, 229] as [number, number, number];   // indigo-600
const C_ROW_ALT  = [248, 250, 252] as [number, number, number]; // slate-50
const C_INK      = [15, 23, 42] as [number, number, number];    // slate-950

// ── shared drawing helpers ───────────────────────────────────────────────────
function drawHeaderBar(doc: jsPDF, title: string, subtitle: string, W: number) {
  doc.setFillColor(...C_HEADER);
  doc.rect(0, 0, W, 40, 'F');
  doc.setTextColor(...C_WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('SIKon Konveksi', 14, 15);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(title, W - 14, 12, { align: 'right' });
  doc.setFontSize(9);
  doc.text(subtitle, W - 14, 20, { align: 'right' });
  const ts = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short',
  });
  doc.setFontSize(8);
  doc.setTextColor(...C_MUTED);
  doc.text(`Dicetak: ${ts} WIB`, W - 14, 28, { align: 'right' });
  doc.text('LAPORAN HARIAN BATCH PO', 14, 28);
}

function drawSectionTitle(doc: jsPDF, text: string, y: number, W: number) {
  doc.setFillColor(241, 245, 249); // slate-100
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
  doc.text('SIKon · Laporan Harian Batch PO', 14, H - 7);
  doc.text(`Halaman ${pageNum} / ${totalPages}`, W - 14, H - 7, { align: 'right' });
}

// ── MAIN GENERATOR ───────────────────────────────────────────────────────────
export async function generatePoDailyReportPdf(
  report: PoDailyReport,
  profile?: Partial<CompanyProfile>
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();  // 297
  const H = doc.internal.pageSize.getHeight(); // 210
  const M = 14;

  // ── Logo perusahaan (opsional) ───────────────────────────────────────────
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
    } catch { /* logo gagal dimuat — tidak menggagalkan PDF */ }
  }

  // ── Header ───────────────────────────────────────────────────────────────
  const dateLabel = fmtDate(report.date);
  drawHeaderBar(doc, `LAPORAN HARIAN — ${dateLabel}`, '', W);

  let y = 48;

  // ── Ringkasan Hari Ini ────────────────────────────────────────────────────
  y = drawSectionTitle(doc, 'Ringkasan Hari Ini', y, W);
  const s = report.today_summary ?? report.summary;
  const summaryItems = [
    ['Order Masuk', `${s.order_count} order`],
    ['Total Pcs', `${s.total_pcs} pcs`],
    ['Nilai Pesanan', rp(s.total_price)],
    ['Ongkir', rp(s.total_ongkir)],
    ['Pembayaran Masuk', rp(s.payment_received)],
  ];
  const colW = (W - 2 * M) / summaryItems.length;
  summaryItems.forEach(([label, val], i) => {
    const x = M + i * colW;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x + 1, y, colW - 2, 18, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C_MUTED);
    doc.text(label, x + colW / 2, y + 5.5, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...C_INK);
    doc.text(val, x + colW / 2, y + 13, { align: 'center' });
  });
  y += 24;

  // ── Kumulatif per Batch PO ────────────────────────────────────────────────
  if (report.pos && report.pos.length > 0) {
    y = drawSectionTitle(doc, `Kumulatif per Batch PO s.d. ${dateLabel}`, y, W);
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Batch PO', 'Kode', 'Status', 'Order Hari Ini', 'Kumulatif Order', 'Kumulatif Pcs', 'Kuota', 'Kumulatif Nilai', 'Kumulatif Bayar']],
      body: report.pos.map(p => [
        p.name,
        p.code,
        p.status.toUpperCase(),
        `${p.today_orders} order (${p.today_pcs} pcs)`,
        `${p.cum_orders} order`,
        `${p.cum_pcs} pcs`,
        p.quota_qty != null && p.quota_qty > 0 ? `${p.quota_qty} pcs (${p.quota_used_pct ?? 0}%)` : '-',
        rp(p.cum_price),
        rp(p.cum_paid),
      ]),
      headStyles: { fillColor: C_HEADER, textColor: C_WHITE, fontSize: 7.5, fontStyle: 'bold', cellPadding: 3 },
      bodyStyles: { fontSize: 8, cellPadding: 2.5, textColor: C_INK },
      alternateRowStyles: { fillColor: C_ROW_ALT },
      columnStyles: {
        0: { fontStyle: 'bold' },
        2: { halign: 'center', fontStyle: 'bold' },
        3: { halign: 'center' },
        4: { halign: 'center' },
        5: { halign: 'center' },
        6: { halign: 'center' },
        7: { halign: 'right' },
        8: { halign: 'right', textColor: C_EMERALD },
      },
      styles: { lineColor: [226, 232, 240], lineWidth: 0.2 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Rincian per Sales × Kategori (matrix) ────────────────────────────────
  if (report.sales_category_matrix && report.sales_category_matrix.length > 0) {
    if (y > H - 60) { doc.addPage(); y = 20; }
    y = drawSectionTitle(doc, 'Rincian Pesanan per Sales & Kategori', y, W);

    // build matrix
    const catSet = new Set<string>();
    const salesMap = new Map<string, Record<string, { pcs: number; price: number }>>();
    for (const item of report.sales_category_matrix) {
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

  // ── Daftar Pesanan ────────────────────────────────────────────────────────
  if (report.orders && report.orders.length > 0) {
    if (y > H - 60) { doc.addPage(); y = 20; }
    y = drawSectionTitle(doc, `Daftar Pesanan (${report.orders.length} order)`, y, W);
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['No', 'Tgl Order', 'Customer', 'Sales/CS', 'Pcs', 'Nilai', 'Ongkir', 'Status Bayar', 'Status Prod.']],
      body: report.orders.map((o, i) => [
        i + 1,
        fmtDate(o.order_date),
        o.customer_name,
        o.sales_name || '-',
        o.total_pcs,
        rp(o.total_price),
        o.ongkir > 0 ? rp(o.ongkir) : '-',
        statusLabel(o.payment_status),
        statusLabel(o.production_status),
      ]),
      headStyles: { fillColor: C_HEADER, textColor: C_WHITE, fontSize: 7.5, fontStyle: 'bold', cellPadding: 3 },
      bodyStyles: { fontSize: 7.5, cellPadding: 2.5, textColor: C_INK },
      alternateRowStyles: { fillColor: C_ROW_ALT },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { cellWidth: 26 },
        4: { halign: 'center' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'center' },
        8: { halign: 'center' },
      },
      styles: { lineColor: [226, 232, 240], lineWidth: 0.2 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Sisa Pelunasan PO Sebelumnya ─────────────────────────────────────────
  if (report.past_unpaid_pos && report.past_unpaid_pos.length > 0) {
    if (y > H - 50) { doc.addPage(); y = 20; }
    y = drawSectionTitle(doc, 'Sisa Pelunasan dari PO Sebelumnya', y, W);
    for (const po of report.past_unpaid_pos) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...C_INK);
      doc.text(`${po.name || po.code} (${po.code}) — ${po.total_orders} order, sisa: ${rp(po.remaining_amount)}`, M, y + 3);
      y += 7;

      if (po.unpaid_orders && po.unpaid_orders.length > 0) {
        autoTable(doc, {
          startY: y,
          margin: { left: M, right: M },
          head: [['Customer', 'Sales', 'Tgl Order', 'Pcs', 'Grand Total', 'Terbayar', 'Sisa']],
          body: po.unpaid_orders.map(o => [
            o.customer_name,
            o.sales_name || '-',
            fmtDate(o.order_date),
            o.total_pcs,
            rp(o.grand_total),
            rp(o.paid_amount),
            rp(o.remaining_amount),
          ]),
          headStyles: { fillColor: [71, 85, 105], textColor: C_WHITE, fontSize: 7, fontStyle: 'bold', cellPadding: 2 },
          bodyStyles: { fontSize: 7.5, cellPadding: 2, textColor: C_INK },
          alternateRowStyles: { fillColor: C_ROW_ALT },
          columnStyles: {
            3: { halign: 'center' },
            4: { halign: 'right' },
            5: { halign: 'right' },
            6: { halign: 'right', textColor: C_ROSE, fontStyle: 'bold' },
          },
          styles: { lineColor: [226, 232, 240], lineWidth: 0.2 },
        });
        y = (doc as any).lastAutoTable.finalY + 6;
      }
    }
  }

  // ── Footer di semua halaman ───────────────────────────────────────────────
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(doc, p, totalPages, W, H);
  }

  return doc;
}

export function downloadPoDailyReportPdf(report: PoDailyReport, profile?: Partial<CompanyProfile>) {
  return generatePoDailyReportPdf(report, profile).then(doc => {
    const d = report.date.replace(/-/g, '');
    doc.save(`Laporan_Harian_PO_${d}.pdf`);
  });
}
