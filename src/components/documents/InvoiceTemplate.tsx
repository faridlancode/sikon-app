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
    <div className="relative space-y-6 text-slate-900 bg-white">
      {/* WATERMARK LUNAS */}
      {isPaid && (
        <div className="pointer-events-none select-none absolute inset-0 flex items-center justify-center z-10">
          <div className="transform -rotate-12 rounded-3xl border-8 border-dashed border-emerald-600/20 px-12 py-5 text-center">
            <span className="block font-black tracking-[0.25em] text-emerald-600/20 text-7xl sm:text-8xl uppercase font-mono">
              LUNAS
            </span>
            <p className="mt-1 font-mono text-xs font-bold tracking-[0.3em] text-emerald-600/25 uppercase">
              PAID IN FULL · TERBAYAR LUNAS
            </p>
          </div>
        </div>
      )}

      {/* 1. KOP SURAT PERUSAHAAN */}
      <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
        <div className="flex items-center gap-4">
          {profile.logoUrl ? (
            <img
              src={profile.logoUrl}
              alt="Logo Perusahaan"
              className="h-16 w-16 object-contain"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <Building2 className="h-8 w-8" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">
              {profile.companyName || 'PT Mad Ali Indonesia'}
            </h1>
            <p className="text-xs text-slate-600 mt-0.5 max-w-md">
              {profile.address || 'Konveksi & Apparel Custom Berkualitas'}
            </p>
            {profile.phone && (
              <p className="text-xs text-slate-600 mt-0.5">Telp/WA: {profile.phone}</p>
            )}
          </div>
        </div>

        <div className="text-right">
          <h2 className="text-xl font-black tracking-wider text-slate-900 uppercase">
            INVOICE
          </h2>
          <span
            className={`inline-block mt-0.5 px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
              isPaid ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-white'
            }`}
          >
            {isPaid ? 'LUNAS' : `TAGIHAN ${invoiceTypeLabel}`}
          </span>
          <p className="text-xs font-mono font-bold text-slate-700 mt-1">
            {invoice.invoice_no}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Tanggal: {formatDateID(invoice.invoice_date)}
          </p>
          {invoice.due_date && (
            <p className="text-[11px] font-medium text-rose-600">
              Jatuh Tempo: {formatDateID(invoice.due_date)}
            </p>
          )}
        </div>
      </div>

      {/* 2. INFORMASI TUJUAN & RUJUKAN */}
      <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200 break-inside-avoid print:break-inside-avoid">
        <div>
          <p className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">
            Ditagihkan Kepada:
          </p>
          <p className="font-bold text-slate-900 text-sm mt-0.5">
            {invoice.customer_name}
          </p>
          {invoice.customer_address && (
            <p className="text-slate-600 mt-0.5 leading-relaxed whitespace-pre-line">
              {invoice.customer_address}
            </p>
          )}
        </div>

        <div className="text-right space-y-1">
          <p className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">
            Informasi Rujukan:
          </p>
          {invoice.order?.order_id && (
            <p className="text-slate-700">
              No. Pesanan: <span className="font-bold font-mono text-slate-900">{invoice.order.order_id}</span>
            </p>
          )}
          {invoice.quotation?.quotation_no && (
            <p className="text-slate-700">
              No. Penawaran: <span className="font-bold font-mono text-slate-900">{invoice.quotation.quotation_no}</span>
            </p>
          )}
          <p className="text-[11px] text-slate-500">
            Sumber: <span className="capitalize font-medium text-slate-700">{invoice.source_type}</span>
          </p>
        </div>
      </div>

      {/* 3. TABEL ITEM TAGIHAN */}
      <div className="overflow-visible print:overflow-visible">
        <table className="w-full text-xs border border-slate-300">
          <thead className="print:table-header-group">
            <tr className="bg-slate-100 text-slate-900 border-b border-slate-300 font-bold uppercase text-[10px]">
              <th className="py-2.5 px-3 text-center w-10 border-r border-slate-300">No</th>
              <th className="py-2.5 px-3 text-left border-r border-slate-300">Deskripsi Barang / Pekerjaan</th>
              <th className="py-2.5 px-3 text-center w-16 border-r border-slate-300">Qty</th>
              <th className="py-2.5 px-3 text-center w-16 border-r border-slate-300">Satuan</th>
              <th className="py-2.5 px-3 text-right w-28 border-r border-slate-300">Harga Satuan</th>
              <th className="py-2.5 px-3 text-right w-32">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.map((item, idx) => {
              const subtotal = Number(item.subtotal) || (Number(item.qty) || 0) * (Number(item.unit_price) || 0);

              return (
                <tr key={item.id || idx} className="hover:bg-slate-50/50 break-inside-avoid print:break-inside-avoid">
                  <td className="py-2.5 px-3 text-center font-medium text-slate-500 border-r border-slate-200 align-top">
                    {idx + 1}
                  </td>
                  <td className="py-2.5 px-3 border-r border-slate-200 space-y-0.5 align-top">
                    <p className="font-bold text-slate-900 text-xs">{item.product_name}</p>
                    {cleanInvoiceDescription(item.description) && (
                      <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-line">
                        {cleanInvoiceDescription(item.description)}
                      </p>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center font-medium border-r border-slate-200 align-top">
                    {item.qty}
                  </td>
                  <td className="py-2.5 px-3 text-center text-slate-600 border-r border-slate-200 align-top">
                    {item.unit || 'pcs'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-medium border-r border-slate-200 align-top">
                    {formatIDR(item.unit_price)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 align-top">
                    {formatIDR(subtotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 4. REKAPITULASI BIAYA & JUMLAH DITAGIH */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start break-inside-avoid print:break-inside-avoid">
        {/* Kolom Kiri: Rekening Pembayaran & Catatan */}
        <div className="space-y-4 text-xs">
          {bank ? (
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-1">
              <p className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                Pembayaran Ditransfer Ke:
              </p>
              <p className="font-semibold text-slate-800 text-sm">
                Bank {bank.bank_name}
              </p>
              <p className="font-mono font-bold text-base text-primary">
                {bank.account_number}
              </p>
              <p className="text-slate-600">a.n. {bank.account_holder_name}</p>
            </div>
          ) : (
            <div className="p-3 rounded-lg border border-dashed border-slate-300 text-slate-500 italic">
              Metode transfer bank sesuai kesepakatan pemesanan.
            </div>
          )}

          {/* Catatan Penting: hanya tampil jika belum lunas */}
          {invoice.notes && !isPaid && (
            <div className="p-3 rounded-lg bg-amber-50/60 border border-amber-200/80 text-amber-900 space-y-1 break-inside-avoid print:break-inside-avoid">
              <p className="font-bold text-[11px] uppercase tracking-wider">
                Catatan Penting:
              </p>
              <p className="text-xs leading-relaxed whitespace-pre-line">
                {invoice.notes}
              </p>
            </div>
          )}
        </div>

        {/* Kolom Kanan: Rincian Subtotal, Ongkir, DP & Total Bersih */}
        <div className="space-y-2 text-xs border border-slate-200 rounded-xl p-4 bg-slate-50/80">
          <div className="flex justify-between py-1 border-b border-slate-200">
            <span className="text-slate-600">Subtotal Barang / Pekerjaan</span>
            <span className="font-mono font-bold text-slate-900">
              {formatIDR(invoice.subtotal)}
            </span>
          </div>

          {Number(invoice.shipping_cost) > 0 && (
            <div className="flex justify-between py-1 border-b border-slate-200">
              <span className="text-slate-600">Biaya Pengiriman (Ongkir)</span>
              <span className="font-mono font-bold text-slate-900">
                {formatIDR(invoice.shipping_cost)}
              </span>
            </div>
          )}

          <div className="flex justify-between py-1.5 border-b border-slate-300 font-semibold text-slate-800">
            <span>Total Nilai Pesanan</span>
            <span className="font-mono font-bold text-slate-900">
              {formatIDR(invoice.grand_total)}
            </span>
          </div>

          {Number(invoice.paid_amount) > 0 && (
            <div className="flex justify-between py-1 border-b border-slate-200 text-emerald-700">
              <span>Pembayaran Sebelumnya (DP)</span>
              <span className="font-mono font-bold">
                - {formatIDR(invoice.paid_amount)}
              </span>
            </div>
          )}

          {/* TOTAL DITAGIH */}
          <div
            className={`flex justify-between items-center py-2.5 px-3 rounded-lg mt-2 ${
              isPaid ? 'bg-emerald-800 text-white' : 'bg-slate-900 text-white'
            }`}
          >
            <div>
              <span className="block font-black text-xs uppercase tracking-wider text-slate-200">
                {isPaid ? 'STATUS TAGIHAN' : `JUMLAH DITAGIH (${invoiceTypeLabel})`}
              </span>
              {isPaid && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-200 block">
                  ✓ LUNAS
                </span>
              )}
            </div>
            <span className="text-base font-black font-mono text-emerald-300">
              {formatIDR(invoice.amount_due)}
            </span>
          </div>

          {invoice.amount_due > 0 && (
            <div className="pt-2 text-right">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                Terbilang:
              </p>
              <p className="text-xs font-semibold italic text-slate-800 leading-snug">
                {terbilangRupiah(invoice.amount_due)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 5. AREA TANDA TANGAN */}
      <div className="pt-4 border-t border-slate-200 break-inside-avoid print:break-inside-avoid">
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
