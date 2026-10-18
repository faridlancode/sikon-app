import html2canvas from 'html2canvas';
import { jsPDF, GState } from 'jspdf';
import { nextPdfPageEnd } from './pdfPagination';

const WIDTH_MM = 186;
const HEIGHT_MM = 265;

async function prepareDocument(element: HTMLElement) {
  const host = document.createElement('div');
  host.className = 'pdf-capture-host';
  const clone = element.cloneNode(true) as HTMLElement;
  clone.classList.add('pdf-export-root');
  clone.querySelectorAll('.document-footer, [data-pdf-footer]').forEach((node) => node.remove());
  clone.querySelectorAll<HTMLElement>('span.rounded, span.rounded-full').forEach((el) => {
    el.style.display = 'inline-block';
    el.style.textAlign = 'center';
    el.style.verticalAlign = 'middle';
    el.style.boxSizing = 'border-box';
    el.style.lineHeight = '1';
    el.style.overflow = 'visible';
  });
  host.appendChild(clone);
  document.body.appendChild(host);
  try {
    await document.fonts.ready;
    await Promise.all(Array.from(clone.querySelectorAll('img')).map(async (img) => {
      if (!img.complete) await new Promise<void>((resolve) => {
        img.addEventListener('load', () => resolve(), { once: true });
        img.addEventListener('error', () => resolve(), { once: true });
      });
      await img.decode().catch(() => undefined);
    }));
    return { host, clone };
  } catch (error) {
    host.remove();
    throw error;
  }
}

/** Paginate measured rows/compact blocks, never whole tables or large sections. */
export async function downloadDocumentPdf(element: HTMLElement, filename: string) {
  const { host, clone } = await prepareDocument(element);
  try {
    // Render existing marks once per physical page, not into a sliced canvas.
    const watermarks = Array.from(clone.querySelectorAll('.document-watermark')).map((node) => ({
      text: node.textContent?.trim() || '',
      provisional: node.classList.contains('document-watermark-provisional'),
    })).filter((mark) => mark.text);
    // Deduplikasi watermark agar tidak tertumpuk berkali-kali jika dokumen memiliki banyak seksi
    const uniqueWatermarks = Array.from(
      new Map(watermarks.map((mark) => [mark.text, mark])).values()
    );
    clone.querySelectorAll('.document-watermark').forEach((node) => node.remove());
    const rect = clone.getBoundingClientRect();
    const pixelsPerMm = rect.width / WIDTH_MM;
    const pageHeight = HEIGHT_MM * pixelsPerMm;
    const blocks = Array.from(clone.querySelectorAll('tr, p, .signature-area, .pdf-keep, h1, h2, h3, h4, .document-watermark'))
      .map((node) => { const box = node.getBoundingClientRect(); return { top: box.top - rect.top, bottom: box.bottom - rect.top }; })
      .filter((box) => box.bottom - box.top < pageHeight);
    const starts = Array.from(clone.querySelectorAll('[data-pdf-section]'))
      .map((node) => node.getBoundingClientRect().top - rect.top).filter((top) => top > 1);
    // Scale 2 (integer Retina) memastikan garis border chip dan teks kecil tajam tanpa blur subpixel
    const canvas = await html2canvas(clone, { scale: 2, useCORS: true, logging: false, backgroundColor: getComputedStyle(clone).backgroundColor, windowWidth: 1024 });
    const scale = canvas.width / rect.width;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    let top = 0;
    let page = 0;
    while (top < rect.height - 1) {
      const bottom = nextPdfPageEnd(top, rect.height, pageHeight, blocks, starts);
      const startPixel = Math.round(top * scale);
      const endPixel = Math.round(bottom * scale);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = endPixel - startPixel;
      const context = slice.getContext('2d');
      if (!context) throw new Error('Tidak dapat menyiapkan halaman PDF.');
      context.drawImage(canvas, 0, startPixel, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
      if (page > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/jpeg', 0.96), 'JPEG', 12, 10, WIDTH_MM, slice.height / scale / pixelsPerMm);
      page++;
      top = bottom;
      slice.width = 0;
      slice.height = 0;
    }
    const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'short' });
    const tokenColor = (name: string) => {
      const swatch = document.createElement('span');
      swatch.style.color = `hsl(var(${name}))`;
      clone.appendChild(swatch);
      const channels = getComputedStyle(swatch).color.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [100, 116, 139];
      swatch.remove();
      return channels as [number, number, number];
    };
    for (let number = 1; number <= page; number++) {
      pdf.setPage(number);
      for (const mark of uniqueWatermarks) {
        pdf.saveGraphicsState();
        pdf.setGState(new GState({ opacity: mark.provisional ? 0.08 : 0.12 }));
        pdf.setTextColor(...tokenColor(mark.provisional ? '--document-muted' : '--document-paid'));
        pdf.setFont('helvetica', 'bold');
        // ASCII punctuation keeps built-in PDF fonts reliable.
        const text = mark.text.replace(/·/g, '-');
        pdf.setFontSize(mark.provisional ? 54 : 72);
        const width = pdf.getTextWidth(text);
        if (width > 150) pdf.setFontSize((pdf.getFontSize() * 150) / width);
        const textWidth = pdf.getTextWidth(text);
        const angle = 45;
        const radians = (angle * Math.PI) / 180;
        // Posisi tepat di tengah lembar A4 (105mm, 148.5mm)
        const x = 105 - (textWidth * Math.cos(radians)) / 2;
        const y = 148.5 + (textWidth * Math.sin(radians)) / 2;
        pdf.text(text, x, y, { angle });
        pdf.restoreGraphicsState();
      }
      pdf.setDrawColor(...tokenColor('--document-rule'));
      pdf.line(12, 280, 198, 280);
      pdf.setTextColor(...tokenColor('--document-muted'));
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.text(`SIKon | ${timestamp} WIB`, 12, 285);
      pdf.text(`Halaman ${number} / ${page}`, 198, 285, { align: 'right' });
    }
    pdf.save(filename);
  } finally {
    host.remove();
  }
}

/** Print an isolated document, not the app's hidden but still space-taking UI. */
export async function printDocument(element: HTMLElement, filename: string) {
  const frame = document.createElement('iframe');
  frame.className = 'document-print-frame';
  frame.title = 'Cetak dokumen';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) { frame.remove(); return; }
  doc.open();
  doc.write('<!doctype html><html><head></head><body></body></html>');
  doc.close();
  doc.title = filename.replace(/\.pdf$/, '');
  document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => doc.head.appendChild(node.cloneNode(true)));
  const content = element.cloneNode(true) as HTMLElement;
  content.classList.add('pdf-export-root');
  content.querySelectorAll('.document-footer, [data-pdf-footer]').forEach((node) => node.remove());
  doc.body.appendChild(content);
  const style = doc.createElement('style');
  style.textContent = `@page { size: A4 portrait; margin: 10mm 12mm 20mm; @bottom-left { content: "SIKon"; font: 8pt sans-serif; } @bottom-right { content: "Halaman " counter(page) " / " counter(pages); font: 8pt sans-serif; } } html, body { min-height: 0 !important; } body * { visibility: visible !important; } .pdf-export-root { width: 100% !important; } [data-pdf-section] { break-before: page; }`;
  doc.head.appendChild(style);
  await doc.fonts.ready;
  await Promise.all(Array.from(doc.images).map((img) => img.decode().catch(() => undefined)));
  win.addEventListener('afterprint', () => frame.remove(), { once: true });
  win.focus();
  win.print();
}