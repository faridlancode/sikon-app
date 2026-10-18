export interface PdfBlock { top: number; bottom: number }

export function nextPdfPageEnd(top: number, height: number, pageHeight: number, blocks: PdfBlock[], sectionStarts: number[]) {
  let bottom = Math.min(top + pageHeight, height);
  const nextSection = sectionStarts.find((start) => start > top + 2 && start < bottom - 1);
  if (nextSection !== undefined) bottom = nextSection;
  for (let attempt = 0; attempt < blocks.length; attempt++) {
    const crossing = blocks.find((box) => box.bottom - box.top < pageHeight && box.top > top + 1 && box.top < bottom && box.bottom > bottom + 1);
    if (!crossing) break;
    bottom = crossing.top;
  }
  return bottom <= top + 1 ? Math.min(top + pageHeight, height) : bottom;
}