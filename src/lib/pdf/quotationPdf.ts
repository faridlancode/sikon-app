/**
 * quotationPdf.ts
 *
 * Generator PDF Surat Penawaran Resmi (A4 portrait) menggunakan jsPDF + jspdf-autotable.
 * Mengikuti arsitektur invoicePdf.ts: presisi milimeter, output vektor, typography elegan,
 * format surat penawaran formal bisnis modern (Kop Surat resmi, Nomor/Lampiran/Perihal,
 * salam pembuka, tabel rincian item dengan spesifikasi teknis ringkas, section deskripsi
 * & keunggulan bahan di luar tabel, terbilang, syarat & pembayaran rapi anti-overflow,
 * penutup, dan tanda tangan 2 pihak).
 */
import jsPDF, { GState } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Quotation, QuotationItem, CompanyProfile } from '../../types';

// ── helpers ──────────────────────────────────────────────────────────────────
const rp = (n: number | string | null | undefined) =>
  'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso ?? '-';
  }
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

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL'];
function formatSizeBreakdown(breakdown?: Record<string, number> | null): string {
  if (!breakdown || typeof breakdown !== 'object') return '';
  const entries = Object.entries(breakdown);
  if (entries.length === 0) return '';
  entries.sort(([sizeA], [sizeB]) => {
    const idxA = SIZE_ORDER.indexOf(sizeA.toUpperCase());
    const idxB = SIZE_ORDER.indexOf(sizeB.toUpperCase());
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return sizeA.localeCompare(sizeB);
  });
  return entries.map(([size, qty]) => `${size}: ${qty}`).join(' | ');
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
  } catch {
    return null;
  }
}

// ── warna ────────────────────────────────────────────────────────────────────
const C_DARK   = [30, 41, 59] as [number, number, number];    // Slate 800
const C_INK    = [15, 23, 42] as [number, number, number];    // Slate 900
const C_MUTED  = [100, 116, 139] as [number, number, number]; // Slate 500
const C_SLATE  = [71, 85, 105] as [number, number, number];   // Slate 600
const C_WHITE  = [255, 255, 255] as [number, number, number];
const C_ROW    = [248, 250, 252] as [number, number, number]; // Slate 50
const C_BORDER = [226, 232, 240] as [number, number, number]; // Slate 200

export type SignatureMode = 'none' | 'signature_only' | 'signature_and_stamp';

// ── MAIN GENERATOR ────────────────────────────────────────────────────────────
export async function generateQuotationPdf(
  quotation: Quotation,
  profile?: Partial<CompanyProfile>,
  signatureMode: SignatureMode = 'none',
  keterangan?: string
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();   // 210 mm
  const H = doc.internal.pageSize.getHeight();  // 297 mm
  const M = 18; // Margin 18 mm
  const contentWidth = W - 2 * M;

  const companyName = profile?.companyName || 'CV. WIJAYA FAMILY TASIKMALAYA';

  // ── Load Gambar (Logo, TTD, Cap) ──────────────────────────────────────────
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

  // ── 1. KOP SURAT FORMAL ──────────────────────────────────────────────────
  const headerY = 14;
  const logoSize = 20;

  if (logoData) {
    try {
      doc.addImage(logoData, 'PNG', M, headerY, logoSize, logoSize, undefined, 'FAST');
    } catch { /**/ }
  }

  const textStartX = logoData ? M + logoSize + 4 : M;
  const textAreaWidth = W - textStartX - M;

  // Nama Perusahaan
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...C_DARK);
  doc.text(companyName.toUpperCase(), textStartX, headerY + 5);

  // Alamat & Kontak
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C_MUTED);

  let curY = headerY + 10;
  if (profile?.address) {
    const addrLines = doc.splitTextToSize(profile.address, textAreaWidth);
    doc.text(addrLines, textStartX, curY);
    curY += addrLines.length * 3.8;
  }

  const contactParts: string[] = [];
  if (profile?.phone) contactParts.push(`Telp: ${profile.phone}`);
  contactParts.push('AHU-0024761-AH.01.16 Tahun 2024');

  if (contactParts.length > 0) {
    doc.text(contactParts.join('  ·  '), textStartX, curY);
    curY += 4;
  }

  // Garis Pembatas Kop Surat Resmi (Ganda: Tebal di atas, Tipis di bawah)
  const lineY = Math.max(curY + 2, headerY + logoSize + 2);
  doc.setDrawColor(...C_DARK);
  doc.setLineWidth(0.8);
  doc.line(M, lineY, W - M, lineY);

  doc.setLineWidth(0.2);
  doc.line(M, lineY + 1.2, W - M, lineY + 1.2);

  // ── 2. JUDUL SURAT PENAWARAN (Tanpa nomor redundan di bawah judul) ────────
  let y = lineY + 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...C_INK);
  doc.text('SURAT PENAWARAN', W / 2, y, { align: 'center' });

  // Underline judul surat
  const titleWidth = doc.getTextWidth('SURAT PENAWARAN');
  doc.setDrawColor(...C_INK);
  doc.setLineWidth(0.3);
  doc.line(W / 2 - titleWidth / 2, y + 1.2, W / 2 + titleWidth / 2, y + 1.2);

  // Langsung lanjut ke metadata tanpa nomor berulang di tengah
  y += 6.5;

  // ── 3. METADATA SURAT (Nomor, Lampiran, Perihal, & Kepada) ───────────────
  const metaStartY = y;
  const leftColX = M;
  const rightColX = W / 2 + 8;

  // Sisi Kiri: Nomor, Lampiran, Perihal
  const items = quotation.quotation_items || [];
  const perihalItemName = items.length > 0 ? items.map(i => i.product_name).slice(0, 2).join(' & ') : 'Seragam';
  const perihalText = `Penawaran Pembuatan ${perihalItemName}${items.length > 2 ? ' dll.' : ''}`;

  const metaRows = [
    ['Nomor', ':', quotation.quotation_no],
    ['Lampiran', ':', '-'],
    ['Perihal', ':', perihalText],
  ];

  metaRows.forEach(([lbl, col, val], idx) => {
    const rowY = metaStartY + idx * 5.6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...C_MUTED);
    doc.text(lbl, leftColX, rowY);
    doc.text(col, leftColX + 18, rowY);
    doc.setTextColor(...C_INK);
    if (lbl === 'Perihal') doc.setFont('helvetica', 'bold');
    doc.text(val, leftColX + 22, rowY);
  });

  // Sisi Kanan: Kepada Yth.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...C_MUTED);
  doc.text(`Tasikmalaya, ${fmtDate(quotation.quotation_date)}`, rightColX, metaStartY);

  doc.text('Kepada Yth.', rightColX, metaStartY + 5.6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C_INK);
  doc.setFontSize(9);
  doc.text(quotation.customer_company || quotation.customer_name, rightColX, metaStartY + 11);

  let nextY = metaStartY + 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C_MUTED);

  if (quotation.customer_company && quotation.customer_name) {
    doc.text(`Up. ${quotation.customer_name}`, rightColX, nextY);
    nextY += 4.4;
  }

  if (quotation.customer_address) {
    const addr = doc.splitTextToSize(quotation.customer_address, W - rightColX - M);
    doc.text(addr, rightColX, nextY);
    nextY += addr.length * 4.0;
  }

  doc.text('di Tempat', rightColX, nextY);
  nextY += 5;

  y = Math.max(metaStartY + 19, nextY) + 3;

  // ── 4. SALAM PEMBUKA & PARAGRAF PENGANTAR ────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...C_INK);
  doc.text('Dengan hormat,', M, y);
  y += 5.2;

  const introText =
    `Menindaklanjuti rencana dan kebutuhan pengadaan seragam, bersama surat ini kami ${companyName} ` +
    `sebagai perusahaan yang bergerak di bidang produksi konveksi dan garment seragam kantor, bermaksud menyampaikan penawaran ` +
    `harga dan spesifikasi untuk ${quotation.customer_company || quotation.customer_name}. ` +
    `Adapun rincian item, spesifikasi, dan harga yang kami tawarkan adalah sebagai berikut:`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...C_INK);
  const introLines = doc.splitTextToSize(introText, contentWidth - 6);
  doc.text(introLines, M, y, { lineHeightFactor: 1.35 });
  y += introLines.length * 4.6 + 3.5;

  // ── 5. DATA ITEM & TABEL AUTOTABLE ───────────────────────────────────────
  // Siapkan data teknis ringkas di tabel (detail naratif dipindah ke luar tabel)
  interface ItemParsedData {
    name: string;
    bullets: string[];
  }

  const parsedItems: ItemParsedData[] = items.map((it: QuotationItem) => {
    const bullets: string[] = [];

    // Bahan ringkas
    const matName = it.fabric_type || it.material?.name;
    const matColor = it.fabric_color;
    if (matName || matColor) {
      bullets.push(`• Bahan: ${[matName, matColor ? `(${matColor})` : ''].filter(Boolean).join(' ')}`);
    }

    // Komposisi ringkas
    if (it.material?.composition) {
      bullets.push(`• Komposisi: ${it.material.composition}`);
    }

    // Catatan bordir / jahitan / sablon ringkas
    if (it.embroidery_notes) {
      bullets.push(`• Bordir: ${it.embroidery_notes}`);
    }
    if (it.sewing_notes) {
      bullets.push(`• Jahitan: ${it.sewing_notes}`);
    }
    if (it.print_notes) {
      bullets.push(`• Sablon: ${it.print_notes}`);
    }

    // Breakdown ukuran
    const breakdownStr = formatSizeBreakdown(it.size_breakdown);
    if (breakdownStr) {
      bullets.push(`• Ukuran: ${breakdownStr}`);
    }

    // Catatan item
    if (it.item_notes) {
      bullets.push(`• Catatan: ${it.item_notes}`);
    }

    return {
      name: it.product_name,
      bullets,
    };
  });

  const tableBody = items.map((it: QuotationItem, i: number) => {
    const subtotal = Number(it.subtotal) || (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
    const parsed = parsedItems[i];

    // Placeholder text agar autoTable menghitung tinggi baris secara akurat
    const rowLines = [parsed.name, ...parsed.bullets];

    return [
      (i + 1).toString(),
      rowLines.join('\n'),
      String(it.qty || 1),
      it.unit || 'pcs',
      rp(it.unit_price),
      rp(subtotal),
    ];
  });

  const totalAmount = items.reduce(
    (sum, it) => sum + (Number(it.subtotal) || (Number(it.qty) || 0) * (Number(it.unit_price) || 0)),
    0
  );

  autoTable(doc, {
    startY: y,
    head: [['No', 'Nama Item & Spesifikasi', 'Qty', 'Satuan', 'Harga Satuan', 'Total']],
    body: tableBody,
    // Footer terintegrasi tanpa bingkai hitam terpisah
    foot: [
      [
        {
          content: 'TOTAL PENAWARAN',
          colSpan: 5,
          styles: {
            halign: 'right',
            fontStyle: 'bold',
            fontSize: 8.5,
            textColor: C_INK,
            cellPadding: 3.5,
          },
        },
        {
          content: rp(totalAmount),
          styles: {
            halign: 'right',
            fontStyle: 'bold',
            fontSize: 9,
            textColor: C_INK,
            cellPadding: 3.5,
          },
        },
      ],
    ],
    headStyles: {
      fillColor: C_DARK,
      textColor: C_WHITE,
      fontSize: 8,
      fontStyle: 'bold',
      cellPadding: 3.5,
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 8,
      textColor: C_INK,
      cellPadding: 3,
      lineColor: C_BORDER,
      lineWidth: 0.2,
    },
    alternateRowStyles: {
      fillColor: C_ROW,
    },
    footStyles: {
      fillColor: [248, 250, 252],
      textColor: C_INK,
      cellPadding: 3.5,
      lineColor: C_BORDER,
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 14 }, // Dilebarkan agar header 'No' tidak terpotong 'N - o'
      1: { halign: 'left' },                 // Spesifikasi item
      2: { halign: 'center', cellWidth: 15 },
      3: { halign: 'center', cellWidth: 15 },
      4: { halign: 'right', cellWidth: 28 },
      5: { halign: 'right', cellWidth: 30 },
    },
    styles: {
      overflow: 'linebreak',
      cellPadding: 3,
    },
    margin: { top: 18, left: M, right: M, bottom: 14 },
    // Custom drawing kolom nama item: Nama Bold, spesifikasi bullet normal Slate 600
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 1) {
        const itemData = parsedItems[data.row.index];
        if (!itemData) return;

        // Tutup area teks default dengan background baris
        const isAlt = data.row.index % 2 === 1;
        doc.setFillColor(isAlt ? 248 : 255, isAlt ? 250 : 255, isAlt ? 252 : 255);
        doc.rect(data.cell.x + 0.1, data.cell.y + 0.1, data.cell.width - 0.2, data.cell.height - 0.2, 'F');

        // Gambar Nama Item (Tebal / Bold)
        let cellY = data.cell.y + 4.2;
        const cellX = data.cell.x + 3;
        const maxW = data.cell.width - 6;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...C_INK);
        doc.text(itemData.name, cellX, cellY);
        cellY += 4.0;

        // Gambar Bullet Points Spesifikasi Teknis (Font 7.5pt, Warna #475569)
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...C_SLATE);

        itemData.bullets.forEach((bullet) => {
          const bLines = doc.splitTextToSize(bullet, maxW);
          doc.text(bLines, cellX, cellY);
          cellY += bLines.length * 3.4;
        });
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 4;

  // ── 6. BOX TERBILANG ─────────────────────────────────────────────────────
  // Cek apakah sisa halaman muat untuk blok bawah; jika tidak muat, buat halaman baru
  if (y + 90 > H - 15) {
    doc.addPage();
    y = 20;
  }

  doc.setFillColor(...C_ROW);
  doc.setDrawColor(...C_BORDER);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, y, contentWidth, 7.5, 1, 1, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...C_MUTED);
  doc.text('TERBILANG:', M + 3, y + 4.8);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...C_INK);
  doc.text(terbilang(totalAmount), M + 23, y + 4.8);

  y += 11;

  // ── 7. SECTION BARU: DESKRIPSI & KEUNGGULAN BAHAN ────────────────────────
  // Mengumpulkan narasi kain di luar tabel agar tabel tetap bersih dan rapi
  const narrativeFeatures: { label: string; text: string }[] = [];

  // Cari apakah ada narasi spesifikasi dari item
  const customSpecs = items
    .map(i => i.fabric_specs || i.material?.description)
    .filter(Boolean) as string[];

  if (customSpecs.length > 0) {
    narrativeFeatures.push({
      label: 'Bahan & Spesifikasi Kain',
      text: customSpecs[0],
    });
  } else {
    // Default narasi kualitas unggulan sesuai standar perusahaan
    narrativeFeatures.push({
      label: 'Kemeja & Celana / Bahan Pilihan',
      text: 'Bahan menggunakan drill premium berkualitas unggulan yang kuat, awet, dan rapi dari campuran serat katun dan poliester pilihan. Tekstur kokoh, tidak mudah kusut, namun tetap adem dan nyaman saat menyerap keringat.',
    });
  }

  narrativeFeatures.push({
    label: 'Bordir Komputer',
    text: 'Bordir menggunakan sistem komputerisasi presisi tinggi sehingga hasil cetakan rapi, detail tajam, dan memiliki tekstur timbul.',
  });

  narrativeFeatures.push({
    label: 'Kualitas Benang',
    text: 'Benang bordir menggunakan benang poliester pilihan dengan warna lebih cerah dan ketahanan warna yang awet.',
  });

  // Instruksi perawatan kain dipindahkan ke sini
  const careInstructions = items
    .map(i => i.material?.care_instruction)
    .filter(Boolean) as string[];

  if (careInstructions.length > 0) {
    narrativeFeatures.push({
      label: 'Instruksi Perawatan Kain',
      text: careInstructions[0],
    });
  }

  // Hitung tinggi kotak deskripsi bahan secara dinamis
  const descBoxPadding = 3.5;
  const descInnerWidth = contentWidth - 8;
  let descTextHeight = 0;

  narrativeFeatures.forEach(feat => {
    const fullLine = `• ${feat.label} : ${feat.text}`;
    const lines = doc.splitTextToSize(fullLine, descInnerWidth);
    descTextHeight += lines.length * 3.6 + 1.2;
  });

  const descCardHeight = Math.max(descTextHeight + 9, 24);

  // Jika tidak muat di halaman saat ini bersama dengan syarat & tanda tangan, break page
  if (y + descCardHeight + 50 > H - 15) {
    doc.addPage();
    y = 20;
  }

  doc.setFillColor(...C_WHITE);
  doc.setDrawColor(...C_BORDER);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, y, contentWidth, descCardHeight, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C_DARK);
  doc.text('DESKRIPSI & KEUNGGULAN BAHAN', M + descBoxPadding, y + 5.5);

  doc.setDrawColor(...C_BORDER);
  doc.line(M + descBoxPadding, y + 7.2, M + contentWidth - descBoxPadding, y + 7.2);

  let descY = y + 11.2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C_SLATE);

  narrativeFeatures.forEach(feat => {
    const fullLine = `• ${feat.label} : ${feat.text}`;
    const lines = doc.splitTextToSize(fullLine, descInnerWidth);
    doc.text(lines, M + descBoxPadding, descY);
    descY += lines.length * 3.6 + 1.2;
  });

  y += descCardHeight + 5;

  // ── 8. SYARAT & KETENTUAN + REKENING PEMBAYARAN ──────────────────────────
  const halfWidth = (contentWidth - 6) / 2;
  const innerBoxWidth = halfWidth - 7;

  // 8a. Siapkan poin Syarat & Ketentuan (Poin DP tidak duplikat)
  const termsList: string[] = [];

  // Poin DP (Hanya satu, tidak berulang)
  if (quotation.dp_percent) {
    termsList.push(`• Uang Muka (DP): ${quotation.dp_percent}% saat pemesanan disetujui`);
  } else if (
    !quotation.payment_terms ||
    (!quotation.payment_terms.toLowerCase().includes('dp') && !quotation.payment_terms.toLowerCase().includes('uang muka'))
  ) {
    termsList.push('• Uang Muka (DP): 50% di muka saat pemesanan disetujui');
  }

  // Ongkir
  termsList.push('• Harga di atas belum termasuk ongkos kirim');

  // Estimasi Pengerjaan / Lead Time (Word wrap aman, tidak tembus)
  if (quotation.lead_time) {
    termsList.push(`• Estimasi pengerjaan: ${quotation.lead_time}`);
  } else {
    termsList.push('• Estimasi pengerjaan: 14 – 21 hari kerja setelah persetujuan sampel & DP');
  }

  // Masa Berlaku Penawaran
  if (quotation.valid_until) {
    termsList.push(`• Masa berlaku penawaran s/d: ${fmtDate(quotation.valid_until)}`);
  }

  // Payment terms tambahan jika bukan duplikasi DP
  if (quotation.payment_terms) {
    const pt = quotation.payment_terms.trim();
    const isDup = (quotation.dp_percent || termsList[0].includes('50%')) &&
      (pt.toLowerCase().startsWith('dp ') || pt.toLowerCase().startsWith('dp:'));
    if (!isDup) {
      termsList.push(`• ${pt}`);
    }
  }

  // 8b. Siapkan Rekening Pembayaran (Format satu jajar: "Nama_BANK No_rek Nama_rek")
  const accountsList: string[] = [];

  if (quotation.bank_account) {
    accountsList.push(
      `• ${quotation.bank_account.bank_name} ${quotation.bank_account.account_number} a/n ${quotation.bank_account.account_holder_name}`
    );
  } else {
    // Rekening resmi CV. Wijaya Family Tasikmalaya
    accountsList.push('• BRI 0161-01-001461-56-4 a/n CV. WIJAYA FAMILY TASIKMALAYA');
    accountsList.push('• Mandiri 177-00-1160048-0 a/n CV. WIJAYA FAMILY TASIKMALAYA');
    accountsList.push('• BCA 054-1447333 a/n WIJAYA FAMILY TASIKMALAYA');
    accountsList.push('• BNI 1286168970 a/n CV. WIJAYA FAMILY TASIKMALAYA');
  }

  // Hitung tinggi kedua kotak secara dinamis berdasarkan baris word wrap
  let totalTermLines = 0;
  termsList.forEach(t => {
    totalTermLines += doc.splitTextToSize(t, innerBoxWidth).length;
  });
  const termBoxH = 11 + totalTermLines * 3.8 + termsList.length * 0.8;

  let totalAccLines = 0;
  accountsList.forEach(a => {
    totalAccLines += doc.splitTextToSize(a, innerBoxWidth).length;
  });
  const accBoxH = 11 + totalAccLines * 3.8 + accountsList.length * 0.8;

  const cardHeight = Math.max(termBoxH, accBoxH, 36);

  // Box Kiri: Syarat & Ketentuan (Word Wrap aman di dalam innerBoxWidth)
  doc.setFillColor(...C_WHITE);
  doc.setDrawColor(...C_BORDER);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, y, halfWidth, cardHeight, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C_DARK);
  doc.text('SYARAT & KETENTUAN', M + 3.5, y + 5.5);

  doc.setDrawColor(...C_BORDER);
  doc.line(M + 3.5, y + 7.2, M + halfWidth - 3.5, y + 7.2);

  let termY = y + 11.2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C_INK);

  termsList.forEach(term => {
    const lines = doc.splitTextToSize(term, innerBoxWidth);
    doc.text(lines, M + 3.5, termY);
    termY += lines.length * 3.8 + 0.8;
  });

  // Box Kanan: Rekening Pembayaran (Format satu jajar per bank)
  const rightCardX = M + halfWidth + 6;
  doc.setFillColor(...C_WHITE);
  doc.setDrawColor(...C_BORDER);
  doc.roundedRect(rightCardX, y, halfWidth, cardHeight, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C_DARK);
  doc.text('REKENING PEMBAYARAN', rightCardX + 3.5, y + 5.5);

  doc.setDrawColor(...C_BORDER);
  doc.line(rightCardX + 3.5, y + 7.2, rightCardX + halfWidth - 3.5, y + 7.2);

  let bankY = y + 11.2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C_INK);

  accountsList.forEach(acc => {
    const lines = doc.splitTextToSize(acc, innerBoxWidth);
    doc.text(lines, rightCardX + 3.5, bankY);
    bankY += lines.length * 3.8 + 0.8;
  });

  y += cardHeight + 4.5;

  // Catatan Tambahan (jika ada)
  const additionalNotes = keterangan?.trim() || quotation.notes?.trim();
  if (additionalNotes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C_MUTED);
    doc.text('Catatan Tambahan:', M, y);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...C_INK);
    const nLines = doc.splitTextToSize(additionalNotes, contentWidth);
    doc.text(nLines, M, y + 4);
    y += nLines.length * 3.8 + 5;
  }

  // ── 9. SALAM PENUTUP & TANDA TANGAN (Word wrap lega, jarak rapat) ─────────
  const closingText =
    'Demikian surat penawaran ini kami sampaikan. Besar harapan kami agar penawaran ini dapat dipertimbangkan ' +
    'dan diterima dengan baik sehingga terjalin kerjasama yang saling menguntungkan. Atas perhatian dan kepercayaan ' +
    'Bapak/Ibu, kami ucapkan terima kasih.';

  // SET FONT DAN SIZE DULU sebelum splitTextToSize agar kalkulasi wrap 100% presisi
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...C_INK);

  // Berikan margin kanan ekstra aman (contentWidth - 6 = 168mm) agar tidak mepet ke tepi kanan
  const closeLines = doc.splitTextToSize(closingText, contentWidth - 6);

  // Cek apakah paragraf penutup dan tanda tangan muat bersama-sama
  const neededClosingBlock = closeLines.length * 4.6 + 38;
  if (y + neededClosingBlock > H - 14) {
    doc.addPage();
    y = 20;
  }

  doc.text(closeLines, M, y, { lineHeightFactor: 1.35 });

  // Jarak penutup ke tanda tangan dibuat rapat dan seimbang
  y += closeLines.length * 4.6 + 3.5;

  // ── 10. AREA TANDA TANGAN (DUA PIHAK) ────────────────────────────────────
  const sigStartY = y;
  const leftSigX = M + 8;
  const rightSigX = W - M - 60;

  // Kolom Kiri: Pihak Pemesan / Menyetujui
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C_MUTED);
  doc.text('Menyetujui,', leftSigX, sigStartY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C_INK);
  doc.text('Pihak Pemesan / Customer', leftSigX, sigStartY + 4.5);

  // Garis tanda tangan customer
  doc.setDrawColor(...C_BORDER);
  doc.line(leftSigX, sigStartY + 23, leftSigX + 48, sigStartY + 23);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(quotation.customer_name, leftSigX, sigStartY + 27.5);
  if (quotation.customer_company) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C_MUTED);
    doc.text(quotation.customer_company, leftSigX, sigStartY + 31.5);
  }

  // Kolom Kanan: Pihak Perusahaan / Hormat Kami
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C_MUTED);
  doc.text(`Tasikmalaya, ${fmtDate(quotation.quotation_date)}`, rightSigX, sigStartY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C_INK);
  doc.text('Hormat kami,', rightSigX, sigStartY + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(companyName, rightSigX, sigStartY + 8.5);

  // Digital Stamp & Signature (jika aktif)
  if (withStamp && stampData) {
    try {
      doc.saveGraphicsState();
      doc.setGState(new GState({ opacity: 0.65 }));
      doc.addImage(stampData, 'PNG', rightSigX - 6, sigStartY + 5, 24, 24, undefined, 'FAST');
      doc.restoreGraphicsState();
    } catch { /**/ }
  }

  if (withSignature && signatureData) {
    try {
      doc.addImage(signatureData, 'PNG', rightSigX + 4, sigStartY + 7.5, 28, 13, undefined, 'FAST');
    } catch { /**/ }
  }

  // Garis tanda tangan perusahaan
  doc.setDrawColor(...C_BORDER);
  doc.line(rightSigX, sigStartY + 23, rightSigX + 52, sigStartY + 23);

  const signerName = quotation.sales?.name || 'Yusri Siti Aisyah, S.Ak';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...C_INK);
  doc.text(signerName, rightSigX, sigStartY + 27.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C_MUTED);
  doc.text(quotation.sales?.name ? 'Sales & Marketing' : 'Bagian Pemasaran / Manajemen', rightSigX, sigStartY + 31.5);

  // ── 11. HEADER HALAMAN LANJUTAN & FOOTER ─────────────────────────────────
  const pageCount = (doc as any).internal.getNumberOfPages();
  const printTimestamp = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Header Halaman Lanjutan (jika dokumen lebih dari 1 halaman, tampilkan di hal 2 ke atas)
    if (i > 1) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...C_MUTED);
      doc.text(`Surat Penawaran No. ${quotation.quotation_no}`, M, 10);
      doc.text(`Hal. ${i} dari ${pageCount}`, W - M, 10, { align: 'right' });

      doc.setDrawColor(...C_BORDER);
      doc.setLineWidth(0.2);
      doc.line(M, 12.5, W - M, 12.5);
    }

    // Garis pemisah footer
    doc.setDrawColor(...C_BORDER);
    doc.setLineWidth(0.2);
    doc.line(M, H - 10, W - M, H - 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...C_MUTED);
    doc.text(
      `${companyName} · Dokumen Resmi Surat Penawaran Harga · Dicetak: ${printTimestamp} WIB`,
      M,
      H - 6.5
    );
    doc.text(`Halaman ${i} dari ${pageCount}`, W - M, H - 6.5, { align: 'right' });
  }

  return doc;
}

// ── Helpers untuk UI & Integrasi ─────────────────────────────────────────────

/** Buat Blob URL untuk pratinjau di <iframe> / PdfPreviewDialog */
export async function getQuotationPdfBlobUrl(
  quotation: Quotation,
  profile?: Partial<CompanyProfile>,
  signatureMode: SignatureMode = 'none',
  keterangan?: string
): Promise<string> {
  const doc = await generateQuotationPdf(quotation, profile, signatureMode, keterangan);
  return URL.createObjectURL(doc.output('blob'));
}

/** Langsung download file PDF Surat Penawaran */
export async function downloadQuotationPdf(
  quotation: Quotation,
  profile?: Partial<CompanyProfile>,
  signatureMode: SignatureMode = 'none',
  keterangan?: string
): Promise<void> {
  const doc = await generateQuotationPdf(quotation, profile, signatureMode, keterangan);
  const safeName = (quotation.customer_name || quotation.customer_company || 'Customer').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeNo = (quotation.quotation_no || 'Draft').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Surat_Penawaran-${safeName}-${safeNo}.pdf`);
}
