import { describe, expect, test } from 'bun:test';
import { nextPdfPageEnd } from './pdfPagination';

describe('A4 pagination', () => {
  test('an exact page does not create an empty trailing page', () => {
    expect(nextPdfPageEnd(0, 265, 265, [], [])).toBe(265);
  });
  test('keeps a crossing item row together', () => {
    expect(nextPdfPageEnd(0, 500, 265, [{ top: 250, bottom: 280 }], [])).toBe(250);
  });
  test('an oversized block cannot prevent pagination from advancing', () => {
    expect(nextPdfPageEnd(0, 600, 265, [{ top: 0, bottom: 600 }], [])).toBe(265);
  });
  test('a report section starts on its own page without a blank page at an exact boundary', () => {
    expect(nextPdfPageEnd(0, 600, 265, [], [265])).toBe(265);
    expect(nextPdfPageEnd(265, 600, 265, [], [265, 500])).toBe(500);
  });
});