import React from 'react';
import {
  FileText,
  Building2,
  Wallet,
  Boxes,
  Users,
  CreditCard,
  Truck,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  Info,
} from 'lucide-react';
import Card from '../../ui/card';
import { formatIDR } from '../../../utils/formatCurrency';
import type { ReportNotesData } from '../../../types';

interface ReportNotesViewProps {
  data: ReportNotesData;
  asOf: string;
}

export default function ReportNotesView({ data, asOf }: ReportNotesViewProps) {
  const {
    cash_and_banks,
    inventories,
    customer_advances,
    employee_advances,
    fixed_assets,
    liabilities,
  } = data;

  return (
    <div className="space-y-6 text-xs text-foreground">
      {/* 1. Header & Ringkasan Tanggal */}
      <div className="bg-muted/40 p-4 rounded-xl border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Catatan Atas Laporan Keuangan (CALK)
          </h3>
          <p className="text-muted-foreground mt-0.5">
            Memberikan rincian penjelas, transparansi pos neraca, dan kebijakan akuntansi per {asOf}.
          </p>
        </div>
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
          Standar SAK EMKM Konveksi
        </span>
      </div>

      {/* 2. Bagian 1: Kebijakan Akuntansi Utama */}
      <Card className="p-5 border border-border space-y-3">
        <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
          <Info className="h-4 w-4 text-primary" />
          1. Kebijakan Akuntansi Utama
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-muted-foreground leading-relaxed pt-1">
          <div className="space-y-1 bg-muted/20 p-3 rounded-lg border border-border">
            <strong className="text-foreground block">a. Dasar Penyusunan & Tahun Fiskal</strong>
            <p>
              Laporan keuangan disusun menggunakan metode akrual ringan (light-accrual) berlandaskan prinsip double-entry. Tahun fiskal mengikuti tahun kalender (1 Januari sampai dengan 31 Desember).
            </p>
          </div>
          <div className="space-y-1 bg-muted/20 p-3 rounded-lg border border-border">
            <strong className="text-foreground block">b. Pengakuan Pendapatan</strong>
            <p>
              Pendapatan penjualan diakui secara penuh saat pesanan telah selesai diproduksi dan diserahkan/dikirim kepada pelanggan (status order <code>completed</code>). Pembayaran sebelum kirim dicatat sebagai Liabilitas Uang Muka.
            </p>
          </div>
          <div className="space-y-1 bg-muted/20 p-3 rounded-lg border border-border">
            <strong className="text-foreground block">c. Penilaian Persediaan Bahan Baku</strong>
            <p>
              Persediaan dinilai berdasarkan harga perolehan terakhir (metode periodik). HPP bahan baku dihitung dan disesuaikan pada saat Tutup Buku akhir bulan. Tidak ada pencatatan Barang Dalam Proses (WIP).
            </p>
          </div>
          <div className="space-y-1 bg-muted/20 p-3 rounded-lg border border-border">
            <strong className="text-foreground block">d. Aset Tetap & Penyusutan</strong>
            <p>
              Aset tetap dicatat sebesar harga perolehan dan disusutkan menggunakan metode garis lurus (straight-line) bulanan tanpa nilai sisa sepanjang taksiran masa manfaat ekonomis aset.
            </p>
          </div>
        </div>
      </Card>

      {/* 3. Bagian 2: Rincian Kas dan Bank */}
      <Card className="p-5 border border-border space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            2. Kas dan Setara Kas (Kas & Bank)
          </h4>
          <span className="font-mono font-bold text-foreground">
            Total: {formatIDR(cash_and_banks.total)}
          </span>
        </div>
        <p className="text-muted-foreground text-[11px]">
          Saldo riil uang tunai di kas operasional dan rekening bank per {asOf}:
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left">
            <thead className="bg-muted/50 border-b border-border font-semibold text-muted-foreground">
              <tr>
                <th className="p-2.5 pl-3">Kode Akun</th>
                <th className="p-2.5">Nama Akun / Rekening</th>
                <th className="p-2.5 pr-3 text-right">Saldo (Rp)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono">
              {cash_and_banks.rows.map((row) => (
                <tr key={row.account_id} className="hover:bg-muted/20">
                  <td className="p-2.5 pl-3 font-semibold text-primary">{row.code}</td>
                  <td className="p-2.5 font-sans text-foreground">{row.name}</td>
                  <td className="p-2.5 pr-3 text-right font-bold">{formatIDR(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 4. Bagian 3: Rincian Persediaan Bahan Baku */}
      <Card className="p-5 border border-border space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
          <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
            <Boxes className="h-4 w-4 text-primary" />
            3. Persediaan Bahan Baku
          </h4>
          <div className="flex items-center gap-2 font-mono">
            {inventories.is_estimate ? (
              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 text-[10px] font-sans font-semibold">
                Estimasi Fisik Saat Ini
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 text-[10px] font-sans font-semibold">
                Snapshot Tutup Bulan ({inventories.snapshot_date})
              </span>
            )}
            <span className="font-bold text-foreground">
              Total: {formatIDR(inventories.total)}
            </span>
          </div>
        </div>
        <p className="text-muted-foreground text-[11px]">
          Rincian fisik dan valuasi stok kain, kancing, benang, dan aksesoris di gudang:
        </p>
        <div className="overflow-x-auto rounded-lg border border-border max-h-60 overflow-y-auto">
          <table className="w-full text-left">
            <thead className="bg-muted/50 border-b border-border font-semibold text-muted-foreground sticky top-0">
              <tr>
                <th className="p-2.5 pl-3">Nama Material</th>
                <th className="p-2.5 text-center">Satuan</th>
                <th className="p-2.5 text-right">Stok Fisik</th>
                <th className="p-2.5 text-right">Harga Satuan</th>
                <th className="p-2.5 pr-3 text-right">Nilai Total (Rp)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono">
              {inventories.rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-3 text-center text-muted-foreground italic font-sans">
                    Tidak ada data stok bahan.
                  </td>
                </tr>
              ) : (
                inventories.rows.map((row, idx) => (
                  <tr key={row.id || idx} className="hover:bg-muted/20">
                    <td className="p-2.5 pl-3 font-sans font-medium text-foreground">{row.name}</td>
                    <td className="p-2.5 text-center font-sans text-muted-foreground">{row.unit || '-'}</td>
                    <td className="p-2.5 text-right">{row.stock_qty ?? 0}</td>
                    <td className="p-2.5 text-right">{formatIDR(row.price ?? 0)}</td>
                    <td className="p-2.5 pr-3 text-right font-bold">{formatIDR(row.total_value ?? 0)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 5. Bagian 4: Rincian Uang Muka Pelanggan */}
      <Card className="p-5 border border-border space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            4. Uang Muka Pelanggan (Liabilitas Pesanan Aktif)
          </h4>
          <span className="font-mono font-bold text-foreground">
            Total: {formatIDR(customer_advances.total)}
          </span>
        </div>
        <p className="text-muted-foreground text-[11px]">
          Uang muka dan pembayaran parsial dari pelanggan untuk pesanan yang masih dalam proses produksi:
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left">
            <thead className="bg-muted/50 border-b border-border font-semibold text-muted-foreground">
              <tr>
                <th className="p-2.5 pl-3">No. Order</th>
                <th className="p-2.5">Pelanggan</th>
                <th className="p-2.5 text-right">DP Diterima</th>
                <th className="p-2.5 text-right">Pelepasan / Refund</th>
                <th className="p-2.5 pr-3 text-right">Sisa Uang Muka (Rp)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono">
              {customer_advances.rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-3 text-center text-muted-foreground italic font-sans">
                    Tidak ada uang muka pelanggan yang sedang mengendap.
                  </td>
                </tr>
              ) : (
                customer_advances.rows.map((row) => (
                  <tr key={row.order_id} className="hover:bg-muted/20">
                    <td className="p-2.5 pl-3 font-semibold text-primary">{row.order_number}</td>
                    <td className="p-2.5 font-sans text-foreground">{row.customer_name}</td>
                    <td className="p-2.5 text-right">{formatIDR(row.deposit_received)}</td>
                    <td className="p-2.5 text-right text-muted-foreground">{formatIDR(row.released)}</td>
                    <td className="p-2.5 pr-3 text-right font-bold text-foreground">{formatIDR(row.net_advance)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 6. Bagian 5: Jadwal Aset Tetap */}
      <Card className="p-5 border border-border space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
            <Truck className="h-4 w-4 text-primary" />
            5. Jadwal Aset Tetap & Akumulasi Penyusutan
          </h4>
          <span className="font-mono font-bold text-foreground">
            Nilai Buku: {formatIDR(fixed_assets.totals.book_value)}
          </span>
        </div>
        <p className="text-muted-foreground text-[11px]">
          Daftar harga perolehan, akumulasi penyusutan hingga tanggal laporan, dan nilai buku bersih:
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left">
            <thead className="bg-muted/50 border-b border-border font-semibold text-muted-foreground">
              <tr>
                <th className="p-2.5 pl-3">Kelompok Aset Tetap</th>
                <th className="p-2.5 text-center">Unit</th>
                <th className="p-2.5 text-right">Harga Perolehan</th>
                <th className="p-2.5 text-right">Akumulasi Penyusutan</th>
                <th className="p-2.5 pr-3 text-right">Nilai Buku Bersih (Rp)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono">
              {fixed_assets.rows.map((row) => (
                <tr key={row.asset_class} className="hover:bg-muted/20">
                  <td className="p-2.5 pl-3 font-sans font-semibold text-foreground">{row.label}</td>
                  <td className="p-2.5 text-center font-sans text-muted-foreground">{row.count} unit</td>
                  <td className="p-2.5 text-right">{formatIDR(row.cost)}</td>
                  <td className="p-2.5 text-right text-destructive">
                    {row.accumulated > 0 ? `(${formatIDR(row.accumulated)})` : formatIDR(0)}
                  </td>
                  <td className="p-2.5 pr-3 text-right font-bold text-foreground">
                    {formatIDR(row.book_value)}
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/40 font-bold border-t border-border">
                <td className="p-2.5 pl-3 font-sans font-bold">Total Seluruh Aset Tetap</td>
                <td className="p-2.5 text-center font-sans">
                  {fixed_assets.rows.reduce((sum, r) => sum + r.count, 0)} unit
                </td>
                <td className="p-2.5 text-right">{formatIDR(fixed_assets.totals.cost)}</td>
                <td className="p-2.5 text-right text-destructive">
                  {fixed_assets.totals.accumulated > 0
                    ? `(${formatIDR(fixed_assets.totals.accumulated)})`
                    : formatIDR(0)}
                </td>
                <td className="p-2.5 pr-3 text-right font-bold text-primary">
                  {formatIDR(fixed_assets.totals.book_value)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* 7. Bagian 6: Uang Muka Karyawan & Hutang Pihak Ketiga */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Uang Muka Karyawan */}
        <Card className="p-4 border border-border space-y-2">
          <div className="flex items-center justify-between border-b border-border pb-1.5">
            <h5 className="font-bold text-xs text-foreground flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5 text-primary" />
              6. Uang Muka Karyawan (Purchasing)
            </h5>
            <span className="font-mono font-bold text-xs">
              {formatIDR(employee_advances.total)}
            </span>
          </div>
          {employee_advances.rows.length === 0 ? (
            <p className="text-muted-foreground italic text-[11px] py-2">
              Tidak ada uang muka purchasing yang belum di-SPJ-kan.
            </p>
          ) : (
            <ul className="divide-y divide-border text-[11px] font-mono">
              {employee_advances.rows.map((row) => (
                <li key={row.staff_id} className="py-1.5 flex justify-between items-center">
                  <span className="font-sans text-foreground">{row.staff_name} ({row.count} transaksi)</span>
                  <span className="font-bold">{formatIDR(row.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Hutang Pihak Ketiga */}
        <Card className="p-4 border border-border space-y-2">
          <div className="flex items-center justify-between border-b border-border pb-1.5">
            <h5 className="font-bold text-xs text-foreground flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-primary" />
              7. Hutang Pihak Ketiga (Kewajiban)
            </h5>
            <span className="font-mono font-bold text-xs">
              {formatIDR(liabilities.total)}
            </span>
          </div>
          {liabilities.rows.length === 0 ? (
            <p className="text-muted-foreground italic text-[11px] py-2">
              Tidak ada kewajiban atau hutang pihak ketiga tercatat per tanggal ini.
            </p>
          ) : (
            <ul className="divide-y divide-border text-[11px] font-mono">
              {liabilities.rows.map((row) => (
                <li key={row.account_id} className="py-1.5 flex justify-between items-center">
                  <span className="font-sans text-foreground">[{row.code}] {row.name}</span>
                  <span className="font-bold">{formatIDR(row.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
