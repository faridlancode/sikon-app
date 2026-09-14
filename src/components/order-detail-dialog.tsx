import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatIDR } from "@/lib/finance";
import { deletePayment, getOrderDetail, type Order } from "@/lib/sikon.functions";

export function OrderDetailDialog({
  open,
  onOpenChange,
  order,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
  onChanged: () => void;
}) {
  const fetchDetail = useServerFn(getOrderDetail);
  const removePayment = useServerFn(deletePayment);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["order-detail", order?.id],
    queryFn: () => fetchDetail({ data: { id: order!.id } }),
    enabled: open && !!order,
  });

  async function handleDeletePayment(id: string) {
    try {
      await removePayment({ data: { id } });
      toast.success("Pembayaran dihapus");
      await refetch();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menghapus pembayaran");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{order?.order_id ?? "Detail Pesanan"}</DialogTitle>
          <DialogDescription>
            {order ? `${order.customer_name} • ${formatDate(order.order_date)}` : ""}
          </DialogDescription>
        </DialogHeader>

        {order && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Info label="Grand total" value={formatIDR(order.grand_total)} />
            <Info label="Terbayar" value={formatIDR(order.paid_amount)} />
            <Info label="Sisa" value={formatIDR(order.remaining_amount)} />
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge
                variant="outline"
                className={
                  order.status === "lunas"
                    ? "mt-1 border-success/30 bg-success/10 text-success"
                    : "mt-1 border-destructive/30 bg-destructive/10 text-destructive"
                }
              >
                {order.status === "lunas" ? "Lunas" : "Belum lunas"}
              </Badge>
            </div>
          </div>
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold">Item pesanan</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Bahan</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Harga</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Memuat...
                  </TableCell>
                </TableRow>
              )}
              {data?.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name_item}</TableCell>
                  <TableCell className="text-muted-foreground">{item.bahan ?? "-"}</TableCell>
                  <TableCell className="text-right">{item.qty}</TableCell>
                  <TableCell className="text-right">{formatIDR(item.price)}</TableCell>
                  <TableCell className="text-right">{formatIDR(item.total_price)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Riwayat pembayaran</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead>Metode</TableHead>
                <TableHead className="text-right">Nominal</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.payments.length ?? 0) === 0 && !isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Belum ada pembayaran.
                  </TableCell>
                </TableRow>
              )}
              {data?.payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{formatDate(payment.payment_date)}</TableCell>
                  <TableCell className="uppercase">{payment.payment_type}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {payment.payment_method ?? "-"}
                  </TableCell>
                  <TableCell className="text-right font-medium text-success">
                    {formatIDR(payment.amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Hapus pembayaran"
                      onClick={() => handleDeletePayment(payment.id)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
