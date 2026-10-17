import React from 'react';
import { Building2 } from 'lucide-react';
import SignatureArea from './SignatureArea';
import { formatIDR } from '../../utils/formatCurrency';
import { formatDateID } from '../../utils/dateHelpers';
import { terbilangRupiah } from '../../utils/terbilang';
import { useCompanySettings } from '../../hooks/useCompanySettings';
import type { Invoice, PrintSignatureMode } from '../../types';

function cleanInvoiceDescription(desc?: string | null): string {
  if (!desc) return '';
  return desc
    .split(/\s*\|\s*|\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.toLowerCase().startsWith('spesifikasi:'))
    .join(' | ');
}

interface InvoiceTemplateProps {
  invoice: Invoice;
  printMode: PrintSignatureMode;
}

export default function InvoiceTemplate({
  invoice,
  printMode,
}: InvoiceTemplateProps) {
  const { profile } = useCompanySettings();

  const items = invoice.invoice_items || [];
  const bank = invoice.bank_account;

  const invoiceTypeLabel =
    invoice.invoice_type === 'dp'
      ? 'UANG MUKA (DP)'
      : invoice.invoice_type === 'pelunasan'
      ? 'PELUNASAN'
      : 'PENUH';

  const isPaid =
    invoice.status === 'paid' ||
    (Number(invoice.amount_due) <= 0 && Number(invoice.grand_total) > 0);

  return (
    <div className="relative document-template space-y-6 text-foreground bg-card">
      {isPaid && <div className="document-watermark" aria-label="Status pembayaran lunas">LUNAS</div>}

      {/* 1. KOP SURAT PERUSAHAAN */}
      <div className="flex items-start justify-between border-b-2 border-border pb-4">
        <div className="flex items-center gap-4">
          {profile.logoUrl ? (
            <img
              src={profile.logoUrl}
              alt="Logo Perusahaan"
              className="h-16 w-16 object-contain"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted text-foreground">
              <Building2 className="h-8 w-8" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-black tracking-normal text-foreground uppercase">
              {profile.companyName || 'PT Mad Ali Indonesia'}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
              {profile.address || 'Konveksi & Apparel Custom Berkualitas'}
            </p>
            {profile.phone && (
              <p className="text-xs text-muted-foreground mt-0.5">Telp/WA: {profile.phone}</p>
            )}
          </div>
        </div>

        <div className="text-right">
          <h2 className="text-xl font-black tracking-normal text-foreground uppercase">
            INVOICE
          </h2>
          <span
            className={`inline-block mt-0.5 px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
              isPaid ? 'bg-success text-primary-foreground' : 'bg-foreground text-primary-foreground'
            }`}
          >
            {isPaid ? 'LUNAS' : `TAGIHAN ${invoiceTypeLabel}`}
          </span>
          <p className="text-xs font-mono font-bold text-foreground mt-1">
            {invoice.invoice_no}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Tanggal: {formatDateID(invoice.invoice_date)}
          </p>
          {invoice.due_date && (
            <p className="text-[11px] font-medium text-destructive">
              Jatuh Tempo: {formatDateID(invoice.due_date)}
            </p>
          )}
        </div>
      </div>

      {/* 2. INFORMASI TUJUAN & RUJUKAN */}
      <div className="grid grid-cols-2 gap-4 text-xs bg-muted p-4 rounded-xl border border-border break-inside-avoid print:break-inside-avoid">
        <div>
          <p className="font-semibold text-muted-foreground uppercase tracking-normal text-[10px]">
            Ditagihkan Kepada:
          </p>
          <p className="font-bold text-foreground text-sm mt-0.5">
            {invoice.customer_name}
          </p>
          {invoice.customer_address && (
            <p className="text-muted-foreground mt-0.5 leading-relaxed whitespace-pre-line">
              {invoice.customer_address}
            </p>
          )}
        </div>

        <div className="text-right space-y-1">
          <p className="font-semibold text-muted-foreground uppercase tracking-normal text-[10px]">
            Informasi Rujukan:
          </p>
          {invoice.order?.order_id && (
            <p className="text-foreground">
              No. Pesanan: <span className="font-bold font-mono text-foreground">{invoice.order.order_id}</span>
            </p>
          )}
          {invoice.quotation?.quotation_no && (
            <p className="text-foreground">
              No. Penawaran: <span className="font-bold font-mono text-foreground">{invoice.quotation.quotation_no}</span>
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Sumber: <span className="capitalize font-medium text-foreground">{invoice.source_type}</span>
          </p>
        </div>
      </div>

      {/* 3. TABEL ITEM TAGIHAN */}
      <div className="overflow-visible print:overflow-visible">
        <table className="w-full text-xs border border-border">
          <thead className="print:table-header-group">
            <tr className="bg-muted text-foreground border-b border-border font-bold uppercase text-[10px]">
              <th className="py-2.5 px-3 text-center w-10 border-r border-border">No</th>
              <th className="py-2.5 px-3 text-left border-r border-border">Deskripsi Barang / Pekerjaan</th>
              <th className="py-2.5 px-3 text-center w-16 border-r border-border">Qty</th>
              <th className="py-2.5 px-3 text-center w-16 border-r border-border">Satuan</th>
              <th className="py-2.5 px-3 text-right w-28 border-r border-border">Harga Satuan</th>
              <th className="py-2.5 px-3 text-right w-32">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.map((item, idx) => {
              const subtotal = Number(item.subtotal) || (Number(item.qty) || 0) * (Number(item.unit_price) || 0);

              return (
                <tr key={item.id || idx} className="hover:bg-muted/50 break-inside-avoid print:break-inside-avoid">
                  <td className="py-2.5 px-3 text-center font-medium text-muted-foreground border-r border-border align-top">
                    {idx + 1}
                  </td>
                  <td className="py-2.5 px-3 border-r border-border space-y-0.5 align-top">
                    <p className="font-bold text-foreground text-xs">{item.product_name}</p>
                    {cleanInvoiceDescription(item.description) && (
                      <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-line">
                        {cleanInvoiceDescription(item.description)}
                      </p>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center font-medium border-r border-border align-top">
                    {item.qty}
                  </td>
                  <td className="py-2.5 px-3 text-center text-muted-foreground border-r border-border align-top">
                    {item.unit || 'pcs'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-medium border-r border-border align-top">
                    {formatIDR(item.unit_price)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground align-top">
                    {formatIDR(subtotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 4. REKAPITULASI BIAYA & JUMLAH DITAGIH */}
      <div className="grid grid-cols-2 gap-6 items-start break-inside-avoid print:break-inside-avoid">
        {/* Kolom Kiri: Rekening Pembayaran & Catatan */}
        <div className="space-y-4 text-xs">
          {bank ? (
            <div className="p-3 rounded-lg border border-border bg-muted space-y-1">
              <p className="font-bold text-foreground text-xs uppercase tracking-normal">
                Pembayaran Ditransfer Ke:
              </p>
              <p className="font-semibold text-foreground text-sm">
                Bank {bank.bank_name}
              </p>
              <p className="font-mono font-bold text-base text-primary">
                {bank.account_number}
              </p>
              <p className="text-muted-foreground">a.n. {bank.account_holder_name}</p>
            </div>
          ) : (
            <div className="p-3 rounded-lg border border-dashed border-border text-muted-foreground italic">
              Metode transfer bank sesuai kesepakatan pemesanan.
            </div>
          )}

          {/* Catatan Penting: hanya tampil jika belum lunas */}
          {invoice.notes && !isPaid && (
            <div className="p-3 rounded-lg bg-warning-soft/60 border border-warning/80 text-warning space-y-1 break-inside-avoid print:break-inside-avoid">
              <p className="font-bold text-[11px] uppercase tracking-normal">
                Catatan Penting:
              </p>
              <p className="text-xs leading-relaxed whitespace-pre-line">
                {invoice.notes}
              </p>
            </div>
          )}
        </div>

        {/* Kolom Kanan: Rincian Subtotal, Ongkir, DP & Total Bersih */}
        <div className="space-y-2 text-xs border border-border rounded-xl p-4 bg-muted/80">
          <div className="flex justify-between py-1 border-b border-border">
            <span className="text-muted-foreground">Subtotal Barang / Pekerjaan</span>
            <span className="font-mono font-bold text-foreground">
              {formatIDR(invoice.subtotal)}
            </span>
          </div>

          {Number(invoice.shipping_cost) > 0 && (
            <div className="flex justify-between py-1 border-b border-border">
              <span className="text-muted-foreground">Biaya Pengiriman (Ongkir)</span>
              <span className="font-mono font-bold text-foreground">
                {formatIDR(invoice.shipping_cost)}
              </span>
            </div>
          )}

          <div className="flex justify-between py-1.5 border-b border-border font-semibold text-foreground">
            <span>Total Nilai Pesanan</span>
            <span className="font-mono font-bold text-foreground">
              {formatIDR(invoice.grand_total)}
            </span>
          </div>

          {Number(invoice.paid_amount) > 0 && (
            <div className="flex justify-between py-1 border-b border-border text-success">
              <span>Pembayaran Sebelumnya (DP)</span>
              <span className="font-mono font-bold">
                - {formatIDR(invoice.paid_amount)}
              </span>
            </div>
          )}

          {/* TOTAL DITAGIH */}
          <div
            className={`flex justify-between items-center py-2.5 px-3 rounded-lg mt-2 ${
              isPaid ? 'bg-success text-primary-foreground' : 'bg-foreground text-primary-foreground'
            }`}
          >
            <div>
              <span className="block font-black text-xs uppercase tracking-normal text-border">
                {isPaid ? 'STATUS TAGIHAN' : `JUMLAH DITAGIH (${invoiceTypeLabel})`}
              </span>
              {isPaid && (
                <span className="text-[10px] font-bold uppercase tracking-normal text-success-soft block">
                  ✓ LUNAS
                </span>
              )}
            </div>
            <span className="text-base font-black font-mono text-success">
              {formatIDR(invoice.amount_due)}
            </span>
          </div>

          {invoice.amount_due > 0 && (
            <div className="pt-2 text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-normal font-semibold">
                Terbilang:
              </p>
              <p className="text-xs font-semibold italic text-foreground leading-snug">
                {terbilangRupiah(invoice.amount_due)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 5. AREA TANDA TANGAN */}
      <div className="pt-4 border-t border-border break-inside-avoid print:break-inside-avoid">
        <SignatureArea
          mode={printMode}
          signatureUrl={profile.signatureUrl}
          stampUrl={profile.stampUrl}
          leftTitle="Diterima oleh (Pelanggan),"
          leftSigner={invoice.customer_name}
          leftRole="Pelanggan"
          rightTitle="Hormat kami,"
          rightSigner={profile.companyName || 'PT Mad Ali Indonesia'}
          rightRole="Bagian Keuangan / Penagihan"
        />
      </div>
    </div>
  );
}
