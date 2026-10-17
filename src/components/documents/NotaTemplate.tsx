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
            NOTA PESANAN
          </h2>
          <span className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-success text-primary-foreground">
            <CheckCircle2 className="h-3 w-3" /> LUNAS
          </span>
          <p className="text-xs font-mono font-bold text-foreground mt-1">
            {nota.nota_no}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Tanggal: {formatDateID(nota.nota_date)}
          </p>
        </div>
      </div>

      {/* 2. TUJUAN & RUJUKAN */}
      <div className="grid grid-cols-2 gap-4 text-xs bg-muted p-4 rounded-xl border border-border">
        <div>
          <p className="font-semibold text-muted-foreground uppercase tracking-normal text-[10px]">
            Kepada Yth:
          </p>
          <p className="font-bold text-foreground text-sm mt-0.5">
            {nota.customer_name}
          </p>
        </div>

        <div className="text-right space-y-1">
          <p className="font-semibold text-muted-foreground uppercase tracking-normal text-[10px]">
            No. Rujukan Pesanan:
          </p>
          <p className="font-mono font-bold text-foreground text-sm">
            {nota.order_code}
          </p>
        </div>
      </div>

      {/* 3. TABEL ITEM PESANAN */}
      <div className="overflow-visible print:overflow-visible">
        <table className="w-full text-xs border border-border">
          <thead className="print:table-header-group">
            <tr className="bg-muted text-foreground border-b border-border font-bold uppercase text-[10px]">
              <th className="py-2.5 px-3 text-center w-10 border-r border-border">No</th>
              <th className="py-2.5 px-3 text-left border-r border-border">Nama Barang / Pesanan</th>
              <th className="py-2.5 px-3 text-center w-20 border-r border-border">Qty</th>
              <th className="py-2.5 px-3 text-right w-32 border-r border-border">Harga Satuan</th>
              <th className="py-2.5 px-3 text-right w-36">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.map((item, idx) => (
              <tr key={idx} className="hover:bg-muted/50 break-inside-avoid print:break-inside-avoid">
                <td className="py-2.5 px-3 text-center font-medium text-muted-foreground border-r border-border">
                  {idx + 1}
                </td>
                <td className="py-2.5 px-3 border-r border-border font-semibold text-foreground">
                  {item.name}
                </td>
                <td className="py-2.5 px-3 text-center font-medium border-r border-border">
                  {item.qty} pcs
                </td>
                <td className="py-2.5 px-3 text-right font-mono border-r border-border">
                  {formatIDR(item.unit_price)}
                </td>
                <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground">
                  {formatIDR(item.subtotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 4. REKAPITULASI BIAYA & RIWAYAT PEMBAYARAN */}
      <div className="grid grid-cols-2 gap-6 items-start break-inside-avoid print:break-inside-avoid">
        {/* Kolom Kiri: Riwayat Pembayaran Masuk */}
        <div className="space-y-2 text-xs">
          <p className="font-bold text-foreground text-[11px] uppercase tracking-normal">
            Riwayat Pembayaran Masuk:
          </p>
          <div className="rounded-lg border border-border divide-y divide-slate-100 overflow-hidden">
            {payments.length === 0 ? (
              <p className="p-2.5 text-muted-foreground italic text-center">Tidak ada rincian pembayaran</p>
            ) : (
              payments.map((p, pIdx) => (
                <div key={pIdx} className="p-2.5 flex justify-between items-center bg-muted/50">
                  <div>
                    <span className="font-semibold text-foreground">
                      {PAYMENT_TYPE_LABEL[p.type] || p.type}
                    </span>
                    <span className="text-[11px] text-muted-foreground block">
                      {formatDateID(p.date)} · {PAYMENT_METHOD_LABEL[p.method || ''] || p.method || 'Transfer'}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-success">
                    {formatIDR(p.amount)}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="p-2.5 rounded-lg bg-muted border border-border text-[11px] text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">Ketentuan & Kebijakan Retur:</p>
            <p className="leading-relaxed">
              Barang yang sudah dibeli dapat ditukar atau diperbaiki jika terdapat cacat produksi konveksi dalam kurun waktu 7 (tujuh) hari sejak barang diterima dengan melampirkan nota asli ini.
            </p>
          </div>
        </div>

        {/* Kolom Kanan: Rincian Total */}
        <div className="space-y-2">
          <div className="rounded-xl border border-border bg-muted p-4 space-y-2 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal Item:</span>
              <span className="font-mono font-medium">{formatIDR(itemsSubtotal)}</span>
            </div>

            {ongkir > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Ongkos Kirim:</span>
                <span className="font-mono font-medium">{formatIDR(ongkir)}</span>
              </div>
            )}

            <div className="border-t border-border pt-2 flex justify-between font-bold text-foreground text-sm">
              <span>Total Pesanan:</span>
              <span className="font-mono">{formatIDR(nota.grand_total)}</span>
            </div>

            <div className="flex justify-between font-bold text-success">
              <span>Total Terbayar:</span>
              <span className="font-mono">{formatIDR(nota.paid_amount)}</span>
            </div>

            <div className="border-t border-border pt-2 flex justify-between font-bold text-foreground">
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
