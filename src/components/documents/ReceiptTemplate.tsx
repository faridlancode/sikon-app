import React from 'react';
import { Building2 } from 'lucide-react';
import SignatureArea from './SignatureArea';
import { formatIDR } from '../../utils/formatCurrency';
import { formatDateID } from '../../utils/dateHelpers';
import { terbilangRupiah } from '../../utils/terbilang';
import { useCompanySettings } from '../../hooks/useCompanySettings';
import type { Receipt, PrintSignatureMode } from '../../types';

interface ReceiptTemplateProps {
  receipt: Receipt;
  printMode: PrintSignatureMode;
}

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  dp: 'Uang Muka (DP)',
  pelunasan: 'Pelunasan',
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  transfer: 'Transfer Bank',
  cash: 'Tunai (Cash)',
  qris: 'QRIS',
  lainnya: 'Lainnya',
};

export default function ReceiptTemplate({
  receipt,
  printMode,
}: ReceiptTemplateProps) {
  const { profile } = useCompanySettings();

  const typeLabel =
    PAYMENT_TYPE_LABEL[receipt.payment_type] || receipt.payment_type.toUpperCase();
  const methodLabel =
    PAYMENT_METHOD_LABEL[receipt.payment_method || ''] ||
    receipt.payment_method ||
    'Transfer Bank';

  return (
    <div className="space-y-6 text-slate-900 bg-white">
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
            KWITANSI
          </h2>
          <span className="inline-block mt-0.5 px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-emerald-800 text-white">
            TANDA BUKTI PEMBAYARAN
          </span>
          <p className="text-xs font-mono font-bold text-slate-700 mt-1">
            {receipt.receipt_no}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Tanggal: {formatDateID(receipt.receipt_date)}
          </p>
        </div>
      </div>

      {/* 2. RINCIAN BUKTI PENERIMAAN UANG */}
      <div className="rounded-xl border border-slate-300 divide-y divide-slate-200 text-xs break-inside-avoid print:break-inside-avoid">
        <div className="grid grid-cols-4 p-3.5 bg-slate-50/50 items-center">
          <span className="font-semibold text-slate-600">Telah Diterima Dari</span>
          <span className="col-span-3 font-bold text-slate-900 text-sm">
            : {receipt.customer_name}
          </span>
        </div>

        <div className="grid grid-cols-4 p-3.5 items-start">
          <span className="font-semibold text-slate-600">Uang Sejumlah</span>
          <div className="col-span-3 italic font-serif text-slate-800 text-xs bg-slate-100/70 p-2.5 rounded-lg border border-slate-200">
            "{terbilangRupiah(receipt.amount)}"
          </div>
        </div>

        <div className="grid grid-cols-4 p-3.5 items-center">
          <span className="font-semibold text-slate-600">Untuk Pembayaran</span>
          <span className="col-span-3 text-slate-800 font-medium">
            : {receipt.description || `Pembayaran ${typeLabel} Pesanan ${receipt.order_code}`}
          </span>
        </div>

        <div className="grid grid-cols-4 p-3.5 items-center">
          <span className="font-semibold text-slate-600">No. Rujukan Pesanan</span>
          <span className="col-span-3 font-mono font-bold text-slate-900">
            : {receipt.order_code}
          </span>
        </div>

        <div className="grid grid-cols-4 p-3.5 items-center">
          <span className="font-semibold text-slate-600">Metode Pembayaran</span>
          <span className="col-span-3 text-slate-800">
            : {methodLabel} ({typeLabel})
          </span>
        </div>
      </div>

      {/* 3. KOTAK NOMINAL JUMLAH */}
      <div className="space-y-1.5 p-4 rounded-xl bg-slate-50 border border-slate-200 break-inside-avoid print:break-inside-avoid">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Jumlah Diterima:
        </p>
        <div className="inline-block px-5 py-3 rounded-xl bg-slate-900 text-white font-mono font-black text-2xl shadow-xs">
          {formatIDR(receipt.amount)}
        </div>
        <p className="text-[10px] text-slate-400 italic mt-1">
          * Kwitansi ini sah apabila bukti transfer telah terverifikasi atau dana tunai diterima.
        </p>
      </div>

      {/* 4. AREA TANDA TANGAN */}
      <div className="break-inside-avoid print:break-inside-avoid">
        <SignatureArea
          mode={printMode}
          signatureUrl={profile.signatureUrl}
          stampUrl={profile.stampUrl}
          leftTitle="Diserahkan oleh (Pembayar),"
          leftSigner={receipt.customer_name}
          leftRole="Pelanggan"
          rightTitle="Diterima oleh (Kasir / Keuangan),"
          rightSigner={profile.companyName || 'PT Mad Ali Indonesia'}
          rightRole="Penerima Pembayaran"
        />
      </div>
    </div>
  );
}
