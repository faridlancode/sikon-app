import React from 'react';
import { Building2, CheckCircle2 } from 'lucide-react';
import SignatureArea from './SignatureArea';
import { formatIDR } from '../../utils/formatCurrency';
import { formatDateID } from '../../utils/dateHelpers';
import { useCompanySettings } from '../../hooks/useCompanySettings';
import type { Nota, PrintSignatureMode } from '../../types';

interface NotaTemplateProps {
  nota: Nota;
  printMode: PrintSignatureMode;
}

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  dp: 'DP (Uang Muka)',
  pelunasan: 'Pelunasan',
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  transfer: 'Transfer Bank',
  cash: 'Tunai',
  qris: 'QRIS',
  lainnya: 'Lainnya',
};

export default function NotaTemplate({
  nota,
  printMode,
}: NotaTemplateProps) {
  const { profile } = useCompanySettings();

  const snapshot = nota.snapshot || { items: [], payments: [], ongkir: 0 };
  const items = snapshot.items || [];
  const payments = snapshot.payments || [];
  const ongkir = Number(snapshot.ongkir) || 0;

  const itemsSubtotal = items.reduce(
    (sum, it) => sum + (Number(it.subtotal) || Number(it.qty) * Number(it.unit_price) || 0),
    0
  );

  const isPaid =
    Number(nota.paid_amount) >= Number(nota.grand_total) ||
    Number(nota.grand_total) - Number(nota.paid_amount) <= 0;

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
            NOTA PESANAN
          </h2>
          <span className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-emerald-700 text-white">
            <CheckCircle2 className="h-3 w-3" /> LUNAS
          </span>
          <p className="text-xs font-mono font-bold text-slate-700 mt-1">
            {nota.nota_no}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Tanggal: {formatDateID(nota.nota_date)}
          </p>
        </div>
      </div>

      {/* 2. TUJUAN & RUJUKAN */}
      <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div>
          <p className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">
            Kepada Yth:
          </p>
          <p className="font-bold text-slate-900 text-sm mt-0.5">
            {nota.customer_name}
          </p>
        </div>

        <div className="text-right space-y-1">
          <p className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">
            No. Rujukan Pesanan:
          </p>
          <p className="font-mono font-bold text-slate-900 text-sm">
            {nota.order_code}
          </p>
        </div>
      </div>

      {/* 3. TABEL ITEM PESANAN */}
      <div className="overflow-visible print:overflow-visible">
        <table className="w-full text-xs border border-slate-300">
          <thead className="print:table-header-group">
            <tr className="bg-slate-100 text-slate-900 border-b border-slate-300 font-bold uppercase text-[10px]">
              <th className="py-2.5 px-3 text-center w-10 border-r border-slate-300">No</th>
              <th className="py-2.5 px-3 text-left border-r border-slate-300">Nama Barang / Pesanan</th>
              <th className="py-2.5 px-3 text-center w-20 border-r border-slate-300">Qty</th>
              <th className="py-2.5 px-3 text-right w-32 border-r border-slate-300">Harga Satuan</th>
              <th className="py-2.5 px-3 text-right w-36">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.map((item, idx) => (
              <tr key={idx} className="hover:bg-slate-50/50 break-inside-avoid print:break-inside-avoid">
                <td className="py-2.5 px-3 text-center font-medium text-slate-500 border-r border-slate-200">
                  {idx + 1}
                </td>
                <td className="py-2.5 px-3 border-r border-slate-200 font-semibold text-slate-900">
                  {item.name}
                </td>
                <td className="py-2.5 px-3 text-center font-medium border-r border-slate-200">
                  {item.qty} pcs
                </td>
                <td className="py-2.5 px-3 text-right font-mono border-r border-slate-200">
                  {formatIDR(item.unit_price)}
                </td>
                <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                  {formatIDR(item.subtotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 4. REKAPITULASI BIAYA & RIWAYAT PEMBAYARAN */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start break-inside-avoid print:break-inside-avoid">
        {/* Kolom Kiri: Riwayat Pembayaran Masuk */}
        <div className="space-y-2 text-xs">
          <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">
            Riwayat Pembayaran Masuk:
          </p>
          <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {payments.length === 0 ? (
              <p className="p-2.5 text-slate-400 italic text-center">Tidak ada rincian pembayaran</p>
            ) : (
              payments.map((p, pIdx) => (
                <div key={pIdx} className="p-2.5 flex justify-between items-center bg-slate-50/50">
                  <div>
                    <span className="font-semibold text-slate-800">
                      {PAYMENT_TYPE_LABEL[p.type] || p.type}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      {formatDateID(p.date)} · {PAYMENT_METHOD_LABEL[p.method || ''] || p.method || 'Transfer'}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-emerald-700">
                    {formatIDR(p.amount)}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
            <p className="font-semibold text-slate-700">Ketentuan & Kebijakan Retur:</p>
            <p className="leading-relaxed">
              Barang yang sudah dibeli dapat ditukar atau diperbaiki jika terdapat cacat produksi konveksi dalam kurun waktu 7 (tujuh) hari sejak barang diterima dengan melampirkan nota asli ini.
            </p>
          </div>
        </div>

        {/* Kolom Kanan: Rincian Total */}
        <div className="space-y-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal Item:</span>
              <span className="font-mono font-medium">{formatIDR(itemsSubtotal)}</span>
            </div>

            {ongkir > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Ongkos Kirim:</span>
                <span className="font-mono font-medium">{formatIDR(ongkir)}</span>
              </div>
            )}

            <div className="border-t border-slate-300 pt-2 flex justify-between font-bold text-slate-900 text-sm">
              <span>Total Pesanan:</span>
              <span className="font-mono">{formatIDR(nota.grand_total)}</span>
            </div>

            <div className="flex justify-between font-bold text-emerald-700">
              <span>Total Terbayar:</span>
              <span className="font-mono">{formatIDR(nota.paid_amount)}</span>
            </div>

            <div className="border-t border-slate-300 pt-2 flex justify-between font-bold text-slate-800">
              <span>Sisa Tagihan:</span>
              <span className="font-mono">Rp 0 (LUNAS)</span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. DUA AREA TANDA TANGAN: PENERIMA & PENGIRIM */}
      <div className="break-inside-avoid print:break-inside-avoid">
        <SignatureArea
          mode={printMode}
          signatureUrl={profile.signatureUrl}
          stampUrl={profile.stampUrl}
          leftTitle="Tanda Tangan Penerima / Pelanggan,"
          leftSigner={nota.customer_name}
          leftRole="Pelanggan"
          rightTitle="Bagian Pengiriman / Gudang,"
          rightSigner={profile.companyName || 'PT Mad Ali Indonesia'}
          rightRole="Pengirim"
        />
      </div>
    </div>
  );
}
