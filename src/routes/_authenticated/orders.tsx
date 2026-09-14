import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Eye, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { OrderDetailDialog } from "@/components/order-detail-dialog";
import { OrderDialog } from "@/components/order-dialog";
import { PaymentDialog } from "@/components/payment-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatIDR, RANGE_OPTIONS, type RangeValue } from "@/lib/finance";
import { deleteOrder, listOrders, type Order } from "@/lib/sikon.functions";

const RANGE_VALUES = RANGE_OPTIONS.map((o) => o.value);

export const Route = createFileRoute("/_authenticated/orders")({
  head: () => ({
    meta: [
      { title: "Pesanan — SIKon" },
      {
        name: "description",
        content: "Kelola pesanan customer, item, status pembayaran, dan riwayat pelunasan.",
      },
      { property: "og:title", content: "Pesanan — SIKon" },
      {
        property: "og:description",
        content: "Kelola pesanan customer, item, status pembayaran, dan riwayat pelunasan.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { range: RangeValue } => ({
    range: RANGE_VALUES.includes(search['range'] as RangeValue)
      ? (search['range'] as RangeValue)
      : "30d",
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const { user } = Route.useRouteContext();
  const { range } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchOrders = useServerFn(listOrders);
  const removeOrder = useServerFn(deleteOrder);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [detail, setDetail] = useState<Order | null>(null);
  const [paying, setPaying] = useState<Order | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Order | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: () => fetchOrders(),
  });

  const rows = useMemo(
    () =>
      data.filter((order) => {
        const term = search.trim().toLowerCase();
        const matchTerm =
          !term ||
          order.customer_name.toLowerCase().includes(term) ||
          order.order_id.toLowerCase().includes(term);
        return matchTerm && (status === "all" || order.status === status);
      }),
    [data, search, status],
  );

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    queryClient.invalidateQueries({ queryKey: ["order-detail"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["sales-performance"] });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await removeOrder({ data: { id: pendingDelete.id } });
      toast.success("Pesanan dihapus");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menghapus pesanan");
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <AppShell
      title="Pesanan"
      email={user.email ?? ""}
      range={range}
      onRangeChange={(value) => navigate({ to: "/orders", search: { range: value } })}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="w-full sm:w-64"
          placeholder="Cari customer atau kode pesanan"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            <SelectItem value="belum_lunas">Belum lunas</SelectItem>
            <SelectItem value="lunas">Lunas</SelectItem>
          </SelectContent>
        </Select>
        <Button
          className="sm:ml-auto"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="mr-1 size-4" /> Pesanan baru
        </Button>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kode</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Sales</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead className="text-right">Grand total</TableHead>
                <TableHead className="text-right">Sisa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[160px] text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    Memuat data...
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    Belum ada pesanan.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.order_id}</TableCell>
                  <TableCell>{order.customer_name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {order.sales_name ?? "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(order.order_date)}
                  </TableCell>
                  <TableCell className="text-right">{formatIDR(order.grand_total)}</TableCell>
                  <TableCell
                    className={`text-right ${
                      order.remaining_amount > 0 ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {formatIDR(order.remaining_amount)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        order.status === "lunas"
                          ? "border-success/30 bg-success/10 text-success"
                          : "border-destructive/30 bg-destructive/10 text-destructive"
                      }
                    >
                      {order.status === "lunas" ? "Lunas" : "Belum lunas"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Detail"
                      onClick={() => setDetail(order)}
                    >
                      <Eye className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Bayar"
                      disabled={order.remaining_amount <= 0}
                      onClick={() => setPaying(order)}
                    >
                      <Wallet className="size-4 text-primary" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit"
                      onClick={() => {
                        setEditing(order);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Hapus"
                      onClick={() => setPendingDelete(order)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <OrderDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        order={editing}
        onSaved={refresh}
      />
      <OrderDetailDialog
        open={!!detail}
        onOpenChange={(open) => !open && setDetail(null)}
        order={detail}
        onChanged={refresh}
      />
      <PaymentDialog
        open={!!paying}
        onOpenChange={(open) => !open && setPaying(null)}
        order={paying}
        onSaved={refresh}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus pesanan ini?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.order_id} beserta item dan pembayarannya akan dihapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
