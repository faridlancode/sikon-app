import React from "react";
import { Building2 } from "lucide-react";
import SignatureArea from "./SignatureArea";
import { formatIDR } from "../../utils/formatCurrency";
import { formatDateID } from "../../utils/dateHelpers";
import { terbilangRupiah } from "../../utils/terbilang";
import { useCompanySettings } from "../../hooks/useCompanySettings";
import { useMaterials } from "../../hooks/useMaterials";
import type { Quotation, PrintSignatureMode } from "../../types";

interface QuotationTemplateProps {
  quotation: Quotation;
  printMode: PrintSignatureMode;
}

const SIZE_ORDER = ["XS","S","M","L","XL","XXL","2XL","3XL","4XL","5XL"];

function formatSizeBreakdown(breakdown?: Record<string, number> | null): string {
  if (!breakdown || typeof breakdown !== "object") return "";
  const entries = Object.entries(breakdown);
  if (entries.length === 0) return "";
  entries.sort(([sizeA], [sizeB]) => {
    const idxA = SIZE_ORDER.indexOf(sizeA.toUpperCase());
    const idxB = SIZE_ORDER.indexOf(sizeB.toUpperCase());
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return sizeA.localeCompare(sizeB);
  });
  return entries.map(([size, qty]) => `${size}: ${qty}`).join(" | ");
}

export default function QuotationTemplate({ quotation, printMode }: QuotationTemplateProps) {
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
  const today = formatDateID(quotation.quotation_date);

  const H1: React.CSSProperties = { fontSize: "20px", fontWeight: 900, letterSpacing: "0.5px", margin: 0, color: "#1e2d3b", fontFamily: "Arial,sans-serif", textTransform: "uppercase" };
  const ink: React.CSSProperties = { color: "#1e2d3b" };
  const muted: React.CSSProperties = { color: "#475569" };
  const borderLight = "1px solid #e2e8f0";
  const borderMed  = "1px solid #cbd5e1";
  const headerBg: React.CSSProperties = { background: "#1e2d3b", color: "white" };

  return (
    <div className="document-template text-foreground bg-card text-sm" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>

      {/* KOP SURAT */}
      <div style={{ borderBottom: "3px solid #1e2d3b", paddingBottom: "12px", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ flexShrink: 0 }}>
            {profile.logoUrl ? (
              <img src={profile.logoUrl} alt="Logo" style={{ height: "64px", width: "64px", objectFit: "contain" }} />
            ) : (
              <div style={{ height: "60px", width: "60px", background: "#1e2d3b", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Building2 style={{ color: "white", width: "32px", height: "32px" }} />
              </div>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={H1}>{profile.companyName || "CV. WIJAYA FAMILY TASIKMALAYA"}</h1>
            {profile.address && <p style={{ fontSize: "11px", ...muted, marginTop: "2px", marginBottom: 0 }}>{profile.address}</p>}
            {profile.phone && <p style={{ fontSize: "11px", ...muted, marginTop: "2px", marginBottom: 0 }}>Telp: {profile.phone}</p>}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ display: "inline-block", ...headerBg, fontFamily: "Arial,sans-serif", fontWeight: 700, fontSize: "11px", padding: "4px 12px", borderRadius: "4px", letterSpacing: "1px", textTransform: "uppercase" }}>
              {quotation.status === "accepted" ? "DISETUJUI" : quotation.status === "rejected" ? "DITOLAK" : quotation.status === "sent" ? "RESMI" : "DRAFT"}
            </div>
            <p style={{ fontSize: "11px", fontFamily: "monospace", fontWeight: 700, ...ink, marginTop: "4px", marginBottom: 0 }}>{quotation.quotation_no}</p>
          </div>
        </div>
      </div>

      {/* JUDUL */}
      <div style={{ textAlign: "center", marginBottom: "20px" }}>
        <h2 style={{ fontSize: "16px", fontWeight: 900, letterSpacing: "2px", textDecoration: "underline", textTransform: "uppercase", fontFamily: "Arial,sans-serif", ...ink, margin: 0 }}>
          SURAT PENAWARAN
        </h2>
        <p style={{ fontSize: "12px", color: "#64748b", marginTop: "4px", marginBottom: 0 }}>
          Nomor: {quotation.quotation_no}
        </p>
      </div>

      {/* NOMOR / KEPADA */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "20px" }}>
        <div style={{ fontSize: "12px", lineHeight: "1.9" }}>
          <table style={{ borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ width: "90px", verticalAlign: "top", ...muted }}>Nomor</td>
                <td style={{ width: "12px", ...muted }}>:</td>
                <td style={{ fontWeight: 600, ...ink }}>{quotation.quotation_no}</td>
              </tr>
              <tr>
                <td style={{ verticalAlign: "top", ...muted }}>Lampiran</td>
                <td style={{ ...muted }}>:</td>
                <td style={{ ...ink }}>-</td>
              </tr>
              <tr>
                <td style={{ verticalAlign: "top", ...muted }}>Perihal</td>
                <td style={{ ...muted }}>:</td>
                <td style={{ fontWeight: 700, ...ink }}>Penawaran {items.length > 0 ? items.map(i => i.product_name).join(", ") : "Seragam"}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: "12px", lineHeight: "1.9" }}>
          <p style={{ margin: 0, ...muted }}>Kepada Yth,</p>
          <p style={{ margin: 0, fontWeight: 700, ...ink, fontSize: "13px" }}>
            {quotation.customer_company ? `${quotation.customer_name} — ${quotation.customer_company}` : quotation.customer_name}
          </p>
          {quotation.customer_address && (
            <p style={{ margin: 0, ...muted, whiteSpace: "pre-line" }}>{quotation.customer_address}</p>
          )}
          <p style={{ margin: 0, ...muted, marginTop: "4px" }}>di Tempat</p>
        </div>
      </div>

      {/* SALAM PEMBUKA */}
      <div style={{ fontSize: "12px", marginBottom: "14px", lineHeight: "1.8", textAlign: "justify" }}>
        <p style={{ margin: 0 }}>Dengan hormat,</p>
        <p style={{ margin: 0, textIndent: "2em", marginTop: "4px" }}>
          Bersama surat ini, kami <strong>{profile.companyName || "CV. WIJAYA FAMILY TASIKMALAYA"}</strong> sebagai perusahaan yang bergerak di bidang produksi seragam kantor dan konveksi, bermaksud menyampaikan penawaran harga pembuatan seragam kepada <strong>{quotation.customer_company || quotation.customer_name}</strong>. Adapun spesifikasi dan rincian harga yang kami tawarkan adalah sebagai berikut:
        </p>
      </div>

      {/* TABEL ITEM */}
      <div style={{ marginBottom: "16px" }} className="overflow-visible print:overflow-visible">
        <p style={{ fontSize: "12px", fontWeight: 700, marginBottom: "6px", ...ink, fontFamily: "Arial,sans-serif" }}>Rincian Penawaran:</p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", border: borderMed }}>
          <thead>
            <tr style={headerBg} className="print:table-header-group">
              {["No","Deskripsi Barang & Spesifikasi","Qty","Satuan","Harga Satuan","Subtotal"].map((h, i) => (
                <th key={h} style={{ padding: "7px 10px", textAlign: i === 0 || i === 2 || i === 3 ? "center" : i >= 4 ? "right" : "left", borderRight: i < 5 ? "1px solid #334155" : undefined, fontWeight: 700, fontSize: "10px", fontFamily: "Arial,sans-serif", letterSpacing: "0.3px", width: [36,undefined,56,52,110,120][i] ? `${[36,undefined,56,52,110,120][i]}px` : undefined }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const breakdownStr = formatSizeBreakdown(item.size_breakdown);
              const subtotal = Number(item.subtotal) || (Number(item.qty) || 0) * (Number(item.unit_price) || 0);
              const autoMat = item.material
                ? [item.material.composition && `Komposisi: ${item.material.composition}`, item.material.description && `Deskripsi: ${item.material.description}`, item.material.care_instruction && `Perawatan: ${item.material.care_instruction}`].filter(Boolean).join(" | ")
                : "";
              const matchedMat = !item.fabric_specs && !autoMat
                ? (item.material_id ? materials.find(m => m.id === item.material_id) : item.fabric_type ? materials.find(m => m.name.toLowerCase() === item.fabric_type!.toLowerCase() || item.fabric_type!.toLowerCase().includes(m.name.toLowerCase())) : null)
                : null;
              const fallbackMat = matchedMat ? [matchedMat.composition && `Komposisi: ${matchedMat.composition}`, matchedMat.description && `Deskripsi: ${matchedMat.description}`].filter(Boolean).join(" | ") : "";
              const specs = item.fabric_specs || autoMat || fallbackMat;
              return (
                <tr key={item.id || idx} style={{ background: idx % 2 === 1 ? "#f8fafc" : "white", borderBottom: borderLight }} className="break-inside-avoid print:break-inside-avoid">
                  <td style={{ padding: "8px 10px", textAlign: "center", color: "#64748b", borderRight: borderLight, verticalAlign: "top" }}>{idx + 1}</td>
                  <td style={{ padding: "8px 10px", borderRight: borderLight, verticalAlign: "top" }}>
                    <p style={{ fontWeight: 700, margin: 0, ...ink, fontSize: "12px" }}>{item.product_name}</p>
                    {(item.fabric_type || item.fabric_color) && (
                      <p style={{ fontSize: "11px", ...muted, margin: "2px 0 0 0" }}>Bahan: <span style={{ fontWeight: 600, ...ink }}>{[item.fabric_type, item.fabric_color].filter(Boolean).join(" — ")}</span></p>
                    )}
                    {specs && (
                      <div style={{ fontSize: "10px", color: "#334155", background: "#f1f5f9", border: borderLight, borderRadius: "3px", padding: "4px 6px", marginTop: "4px", lineHeight: "1.5" }}>
                        <span style={{ fontWeight: 700 }}>Spesifikasi Kain: </span>{specs}
                      </div>
                    )}
                    {item.sewing_notes && <p style={{ fontSize: "11px", ...muted, margin: "2px 0 0 0" }}>Jahitan: <span style={{ ...ink }}>{item.sewing_notes}</span></p>}
                    {item.embroidery_notes && <p style={{ fontSize: "11px", ...muted, margin: "2px 0 0 0" }}>Bordir: <span style={{ ...ink }}>{item.embroidery_notes}</span></p>}
                    {item.print_notes && <p style={{ fontSize: "11px", ...muted, margin: "2px 0 0 0" }}>Sablon: <span style={{ ...ink }}>{item.print_notes}</span></p>}
                    {breakdownStr && <p style={{ fontSize: "10px", fontFamily: "monospace", background: "#f8fafc", border: borderLight, borderRadius: "3px", padding: "2px 6px", marginTop: "4px", display: "inline-block" }}>Ukuran: {breakdownStr}</p>}
                    {item.item_notes && <p style={{ fontSize: "10px", fontStyle: "italic", color: "#64748b", margin: "2px 0 0 0" }}>Catatan: {item.item_notes}</p>}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 600, borderRight: borderLight, verticalAlign: "top" }}>{item.qty}</td>
                  <td style={{ padding: "8px 10px", textAlign: "center", ...muted, borderRight: borderLight, verticalAlign: "top" }}>{item.unit || "pcs"}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", fontWeight: 500, borderRight: borderLight, verticalAlign: "top" }}>{formatIDR(item.unit_price)}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, ...ink, verticalAlign: "top", fontSize: "12px" }}>{formatIDR(subtotal)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="break-inside-avoid print:break-inside-avoid">
            <tr style={{ background: "#f1f5f9", borderTop: "2px solid #1e2d3b" }}>
              <td colSpan={5} style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, fontSize: "11px", ...ink, fontFamily: "Arial,sans-serif", letterSpacing: "0.5px" }}>TOTAL PENAWARAN:</td>
              <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", fontWeight: 900, fontSize: "13px", ...ink }}>{formatIDR(totalAmount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* TERBILANG */}
      <div style={{ border: borderMed, borderRadius: "4px", padding: "8px 12px", marginBottom: "16px", background: "#f8fafc", fontSize: "11px" }} className="break-inside-avoid print:break-inside-avoid">
        <span style={{ fontWeight: 700, color: "#475569", fontSize: "10px", fontFamily: "Arial,sans-serif", textTransform: "uppercase", letterSpacing: "0.5px" }}>Terbilang:&nbsp;</span>
        <span style={{ fontStyle: "italic", ...ink }}>{terbilangRupiah(totalAmount)}</span>
      </div>

      {/* SYARAT & REKENING */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px", fontSize: "12px" }} className="break-inside-avoid print:break-inside-avoid">
        <div style={{ border: borderMed, borderRadius: "4px", padding: "10px 12px" }}>
          <h4 style={{ fontFamily: "Arial,sans-serif", fontWeight: 700, fontSize: "10px", letterSpacing: "0.5px", textTransform: "uppercase", borderBottom: borderLight, paddingBottom: "5px", marginBottom: "7px", ...ink }}>
            Syarat &amp; Ketentuan
          </h4>
          <div style={{ lineHeight: "1.8", color: "#334155" }}>
            {quotation.dp_percent ? <p style={{ margin: 0 }}>• Uang Muka (DP): <strong style={{ ...ink }}>{quotation.dp_percent}%</strong>{dpAmount ? ` — ${formatIDR(dpAmount)}` : ""}</p> : null}
            {quotation.payment_terms && <p style={{ margin: 0, whiteSpace: "pre-line" }}>• {quotation.payment_terms}</p>}
            {quotation.lead_time && <p style={{ margin: 0 }}>• Estimasi Waktu: <strong style={{ ...ink }}>{quotation.lead_time}</strong></p>}
            {quotation.valid_until && <p style={{ margin: 0 }}>• Harga berlaku s/d: <strong style={{ ...ink }}>{formatDateID(quotation.valid_until)}</strong></p>}
            {!quotation.dp_percent && !quotation.payment_terms && !quotation.lead_time && <p style={{ margin: 0, color: "#64748b", fontStyle: "italic" }}>—</p>}
          </div>
        </div>
        <div style={{ border: borderMed, borderRadius: "4px", padding: "10px 12px" }}>
          <h4 style={{ fontFamily: "Arial,sans-serif", fontWeight: 700, fontSize: "10px", letterSpacing: "0.5px", textTransform: "uppercase", borderBottom: borderLight, paddingBottom: "5px", marginBottom: "7px", ...ink }}>
            Rekening Pembayaran
          </h4>
          {quotation.bank_account ? (
            <div style={{ lineHeight: "1.8", color: "#334155" }}>
              <p style={{ margin: 0 }}>Bank: <strong style={{ ...ink }}>{quotation.bank_account.bank_name}</strong></p>
              <p style={{ margin: 0 }}>No. Rek: <strong style={{ fontFamily: "monospace", ...ink, fontSize: "13px" }}>{quotation.bank_account.account_number}</strong></p>
              <p style={{ margin: 0 }}>a/n: <strong style={{ ...ink }}>{quotation.bank_account.account_holder_name}</strong></p>
            </div>
          ) : (
            <p style={{ fontSize: "11px", color: "#64748b", fontStyle: "italic", margin: 0 }}>Pembayaran dapat ditransfer ke rekening resmi perusahaan.</p>
          )}
          {quotation.notes && (
            <div style={{ borderTop: borderLight, marginTop: "8px", paddingTop: "6px" }}>
              <span style={{ fontWeight: 700, color: "#475569", fontSize: "10px", display: "block" }}>Catatan:</span>
              <p style={{ margin: "2px 0 0 0", color: "#64748b", fontStyle: "italic", whiteSpace: "pre-line", fontSize: "11px" }}>{quotation.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* PENUTUP */}
      <div style={{ fontSize: "12px", lineHeight: "1.8", textAlign: "justify", marginBottom: "20px" }} className="break-inside-avoid print:break-inside-avoid">
        <p style={{ margin: 0 }}>Demikian surat penawaran ini kami sampaikan. Besar harapan kami agar penawaran ini dapat dipertimbangkan dan diterima. Atas perhatian dan kepercayaan Bapak/Ibu, kami ucapkan terima kasih.</p>
        <p style={{ margin: "8px 0 0 0" }}>Tasikmalaya, {today}</p>
      </div>

      {/* TANDA TANGAN */}
      <div className="break-inside-avoid print:break-inside-avoid">
        <SignatureArea
          mode={printMode}
          signatureUrl={profile.signatureUrl}
          stampUrl={profile.stampUrl}
          leftTitle="Menyetujui,"
          leftSigner={quotation.customer_name}
          leftRole={quotation.customer_company || "Pelanggan"}
          rightTitle="Hormat kami,"
          rightSigner={profile.companyName || "CV. Wijaya Family"}
          rightRole={quotation.sales?.name ? `Sales: ${quotation.sales.name}` : "Pimpinan / Manajemen"}
        />
      </div>
    </div>
  );
}
