import React from 'react';
import { Building2 } from 'lucide-react';
import SignatureArea from './SignatureArea';
import { formatIDR } from '../../utils/formatCurrency';
import { formatDateID } from '../../utils/dateHelpers';
import { terbilangRupiah } from '../../utils/terbilang';
import { useCompanySettings } from '../../hooks/useCompanySettings';
import { useMaterials } from '../../hooks/useMaterials';
import type { Quotation, PrintSignatureMode } from '../../types';

interface QuotationTemplateProps {
  quotation: Quotation;
  printMode: PrintSignatureMode;
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

export default function QuotationTemplate({
  quotation,
  printMode,
}: QuotationTemplateProps) {
  const { profile } = useCompanySettings();
  const { materials } = useMaterials();

  const items = quotation.quotation_items || [];
  const totalAmount = items.reduce(
    (sum, item) => sum + (Number(item.subtotal) || (Number(item.qty) || 0) * (Number(item.unit_price) || 0)),
    0
  );

  const dpAmount = quotation.dp_percent
    ? Math.round((totalAmount * Number(quotation.dp_percent)) / 100)
    : null;

  return (
    <div className="document-template space-y-6 text-foreground bg-card">
      {/* 1. KOP SURAT PERUSAHAAN */}
      <div className="document-letterhead flex items-start justify-between border-b-2 border-border pb-4">
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
          <h2 className="text-lg font-black tracking-normal text-foreground uppercase">
            Surat Penawaran
          </h2>
          <span
            className="inline-block text-center align-middle font-bold uppercase rounded leading-none mt-1 bg-foreground text-primary-foreground"
            style={{ padding: '4px 8px 3px 8px', fontSize: '10px' }}
          >
            {quotation.status === 'accepted' ? 'DISETUJUI' : quotation.status === 'rejected' ? 'DITOLAK' : quotation.status === 'sent' ? 'PENAWARAN RESMI' : 'DRAFT PENAWARAN'}
          </span>
          <p className="text-xs font-mono font-bold text-foreground mt-1">
            {quotation.quotation_no}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Tanggal: {formatDateID(quotation.quotation_date)}
          </p>
          {quotation.valid_until && (
            <p className="text-[11px] text-muted-foreground">
              Berlaku s/d: {formatDateID(quotation.valid_until)}
            </p>
          )}
        </div>
      </div>

      {/* 2. INFORMASI TUJUAN & PENANGGUNG JAWAB */}
      <div className="grid grid-cols-2 gap-4 text-xs bg-muted p-4 rounded-xl border border-border">
        <div>
          <p className="font-semibold text-muted-foreground uppercase tracking-normal text-[10px]">
            Kepada Yth:
          </p>
          <p className="font-bold text-foreground text-sm mt-0.5">
            {quotation.customer_name}
          </p>
          {quotation.customer_company && (
            <p className="font-medium text-foreground mt-0.5">
              {quotation.customer_company}
            </p>
          )}
          {quotation.customer_address && (
            <p className="text-muted-foreground mt-0.5 leading-relaxed whitespace-pre-line">
              {quotation.customer_address}
            </p>
          )}
        </div>

        <div className="text-right">
          <p className="font-semibold text-muted-foreground uppercase tracking-normal text-[10px]">
            Dari:
          </p>
          <p className="font-bold text-foreground text-sm mt-0.5">
            {profile.companyName || 'PT Mad Ali Indonesia'}
          </p>
          {quotation.sales?.name && (
            <p className="text-foreground mt-0.5">
              Sales: <span className="font-semibold">{quotation.sales.name}</span>
              {quotation.sales.phone ? ` (${quotation.sales.phone})` : ''}
            </p>
          )}
        </div>
      </div>

      {/* 3. TABEL ITEM PENAWARAN */}
      <div className="overflow-visible print:overflow-visible">
        <table className="w-full text-xs border border-border">
          <thead className="print:table-header-group">
            <tr className="bg-muted text-foreground border-b border-border font-bold uppercase text-[10px]">
              <th className="py-2.5 px-3 text-center w-10 border-r border-border">No</th>
              <th className="py-2.5 px-3 text-left border-r border-border">Deskripsi Barang & Spesifikasi</th>
              <th className="py-2.5 px-3 text-center w-16 border-r border-border">Qty</th>
              <th className="py-2.5 px-3 text-center w-16 border-r border-border">Satuan</th>
              <th className="py-2.5 px-3 text-right w-28 border-r border-border">Harga Satuan</th>
              <th className="py-2.5 px-3 text-right w-32">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.map((item, idx) => {
              const breakdownStr = formatSizeBreakdown(item.size_breakdown);
              const subtotal = Number(item.subtotal) || (Number(item.qty) || 0) * (Number(item.unit_price) || 0);
              const autoMaterialSpecs = item.material
                ? [
                    item.material.composition ? `Komposisi: ${item.material.composition}` : '',
                    item.material.description ? `Deskripsi: ${item.material.description}` : '',
                    item.material.care_instruction ? `Perawatan: ${item.material.care_instruction}` : '',
                  ]
                    .filter(Boolean)
                    .join(' | ')
                : '';

              // Fallback jika item.material belum ter-join dan fabric_specs belum terisi
              const matchedMat = !item.fabric_specs && !autoMaterialSpecs
                ? (item.material_id
                    ? materials.find((m) => m.id === item.material_id)
                    : (item.fabric_type
                        ? materials.find(
                            (m) =>
                              m.name.trim().toLowerCase() === item.fabric_type.trim().toLowerCase() ||
                              item.fabric_type.toLowerCase().includes(m.name.toLowerCase()) ||
                              m.name.toLowerCase().includes(item.fabric_type.toLowerCase())
                          )
                        : null))
                : null;

              const fallbackMaterialSpecs = matchedMat
                ? [
                    matchedMat.composition ? `Komposisi: ${matchedMat.composition}` : '',
                    matchedMat.description ? `Deskripsi: ${matchedMat.description}` : '',
                    matchedMat.care_instruction ? `Perawatan: ${matchedMat.care_instruction}` : '',
                  ]
                    .filter(Boolean)
                    .join(' | ')
                : '';

              const finalFabricSpecs = item.fabric_specs || autoMaterialSpecs || fallbackMaterialSpecs;

              return (
                <tr key={item.id || idx} className="hover:bg-muted/50 break-inside-avoid print:break-inside-avoid">
                  <td className="py-2.5 px-3 text-center font-medium text-muted-foreground border-r border-border align-top">
                    {idx + 1}
                  </td>
                  <td className="py-2.5 px-3 border-r border-border space-y-1 align-top">
                    <p className="font-bold text-foreground text-xs">{item.product_name}</p>

                    {(item.fabric_type || item.fabric_color) && (
                      <p className="text-[11px] text-muted-foreground">
                        Bahan: <span className="font-medium text-foreground">{[item.fabric_type, item.fabric_color].filter(Boolean).join(' - ')}</span>
                      </p>
                    )}

                    {finalFabricSpecs && (
                      <div className="text-[10px] text-foreground bg-muted p-1.5 rounded border border-border leading-relaxed mt-1">
                        <span className="font-bold text-foreground">Spesifikasi Kain: </span>
                        <span>{finalFabricSpecs}</span>
                      </div>
                    )}

                    {item.sewing_notes && (
                      <p className="text-[11px] text-muted-foreground">
                        Jahitan: <span className="text-foreground">{item.sewing_notes}</span>
                      </p>
                    )}

                    {item.embroidery_notes && (
                      <p className="text-[11px] text-muted-foreground">
                        Bordir: <span className="text-foreground">{item.embroidery_notes}</span>
                      </p>
                    )}

                    {item.print_notes && (
                      <p className="text-[11px] text-muted-foreground">
                        Sablon/Print: <span className="text-foreground">{item.print_notes}</span>
                      </p>
                    )}

                    {breakdownStr && (
                      <span
                        className="inline-block text-center align-middle font-mono bg-muted rounded text-foreground leading-none"
                        style={{ padding: '3px 6px 2px 6px', fontSize: '11px' }}
                      >
                        Ukuran: {breakdownStr}
                      </span>
                    )}

                    {item.item_notes && (
                      <p className="text-[11px] italic text-muted-foreground">
                        Catatan: {item.item_notes}
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
          <tfoot className="break-inside-avoid print:break-inside-avoid">
            <tr className="bg-muted font-bold border-t-2 border-border">
              <td colSpan={5} className="py-2.5 px-3 text-right uppercase text-xs">
                Total Penawaran:
              </td>
              <td className="py-2.5 px-3 text-right font-mono text-sm font-black text-foreground">
                {formatIDR(totalAmount)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 4. TERBILANG */}
      <div className="bg-muted border border-border rounded-lg p-3 text-xs break-inside-avoid print:break-inside-avoid">
        <span className="font-semibold text-muted-foreground uppercase tracking-normal text-[10px] block">
          Terbilang:
        </span>
        <p className="font-medium italic text-foreground mt-0.5">
          {terbilangRupiah(totalAmount)}
        </p>
      </div>

      {/* 5. SYARAT PEMBAYARAN & KETERANGAN */}
      <div className="grid grid-cols-2 gap-4 text-xs break-inside-avoid print:break-inside-avoid">
        <div className="border border-border rounded-lg p-3 space-y-2">
          <h4 className="font-bold text-foreground uppercase text-[10px] tracking-normal border-b border-border pb-1">
            Syarat Pembayaran & Ketentuan
          </h4>
          {quotation.dp_percent ? (
            <p className="text-foreground">
              • Uang Muka (DP): <span className="font-bold">{quotation.dp_percent}%</span>
              {dpAmount ? ` (${formatIDR(dpAmount)})` : ''}
            </p>
          ) : null}
          {quotation.payment_terms && (
            <p className="text-foreground whitespace-pre-line leading-relaxed">
              • {quotation.payment_terms}
            </p>
          )}
          {quotation.lead_time && (
            <p className="text-foreground">
              • Estimasi Waktu: <span className="font-semibold">{quotation.lead_time}</span>
            </p>
          )}
        </div>

        <div className="border border-border rounded-lg p-3 space-y-2">
          <h4 className="font-bold text-foreground uppercase text-[10px] tracking-normal border-b border-border pb-1">
            Rekening Pembayaran
          </h4>
          {quotation.bank_account ? (
            <div className="space-y-0.5 text-foreground">
              <p>Bank: <span className="font-bold">{quotation.bank_account.bank_name}</span></p>
              <p>No. Rekening: <span className="font-mono font-bold text-foreground">{quotation.bank_account.account_number}</span></p>
              <p>Atas Nama: <span className="font-semibold">{quotation.bank_account.account_holder_name}</span></p>
            </div>
          ) : (
            <p className="text-muted-foreground italic">
              Pembayaran dapat ditransfer ke rekening resmi PT Mad Ali Indonesia.
            </p>
          )}

          {quotation.notes && (
            <div className="pt-2 border-t border-border">
              <span className="font-semibold text-muted-foreground text-[10px] block">Catatan:</span>
              <p className="text-muted-foreground whitespace-pre-line italic mt-0.5">
                {quotation.notes}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 6. AREA TANDA TANGAN */}
      <div className="break-inside-avoid print:break-inside-avoid">
        <SignatureArea
          mode={printMode}
          signatureUrl={profile.signatureUrl}
          stampUrl={profile.stampUrl}
          leftTitle="Disetujui oleh (Pelanggan),"
          leftSigner={quotation.customer_name}
          leftRole={quotation.customer_company || 'Pelanggan'}
          rightTitle="Hormat kami,"
          rightSigner={profile.companyName || 'PT Mad Ali Indonesia'}
          rightRole={quotation.sales?.name ? `Sales: ${quotation.sales.name}` : 'Pimpinan / Manajemen'}
        />
      </div>
    </div>
  );
}
