import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { TransactionDialog } from "@/components/transaction-dialog";
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
import {
  formatDate,
  formatIDR,
  RANGE_OPTIONS,
  resolveRange,
  type RangeValue,
} from "@/lib/finance";
import {
  deleteTransaction,
  listCategories,
  listTransactions,
  type Transaction,
} from "@/lib/transactions.functions";

const RANGE_VALUES = RANGE_OPTIONS.map((o) => o.value);

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({
    meta: [
      { title: "Transaksi — Arus Kas" },
      {
        name: "description",
        content: "Kelola, filter, ubah, dan hapus catatan pemasukan serta pengeluaran Anda.",
      },
      { property: "og:title", content: "Transaksi — Arus Kas" },
      {
        property: "og:description",
        content: "Kelola, filter, ubah, dan hapus catatan pemasukan serta pengeluaran Anda.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { range: RangeValue } => ({
    range: RANGE_VALUES.includes(search['range'] as RangeValue)
      ? (search['range'] as RangeValue)
      : "30d",
  }),
  component: TransactionsPage,
});

function TransactionsPage() {
  const { user } = Route.useRouteContext();
  const { range } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchTransactions = useServerFn(listTransactions);
  const removeTransaction = useServerFn(deleteTransaction);

  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);

  const { from, to } = resolveRange(range);
  const { data = [], isLoading } = useQuery({
    queryKey: ["transactions", from, to],
    queryFn: () => fetchTransactions({ data: { from, to } }),
  });

  const rows = useMemo(
    () =>
      data.filter(
        (row) =>
          (typeFilter === "all" || row.type === typeFilter) &&
          (categoryFilter === "all" || row.category === categoryFilter),
      ),
    [data, typeFilter, categoryFilter],
  );

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await removeTransaction({ data: { id: pendingDelete.id } });
      toast.success("Transaksi dihapus");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menghapus transaksi");
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <AppShell
      title="Transaksi"
      email={user.email ?? ""}
      range={range}
      onRangeChange={(value) => navigate({ to: "/transactions", search: { range: value } })}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua jenis</SelectItem>
            <SelectItem value="income">Pemasukan</SelectItem>
            <SelectItem value="expense">Pengeluaran</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua kategori</SelectItem>
            {ALL_CATEGORIES.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          className="ml-auto"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="mr-1 size-4" /> Tambah transaksi
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Judul</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
                <TableHead className="w-[100px] text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    Memuat data...
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    Belum ada transaksi. Tambahkan yang pertama.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.title}</div>
                    {row.notes && (
                      <div className="text-xs text-muted-foreground">{row.notes}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        row.type === "income"
                          ? "border-success/30 bg-success/10 text-success"
                          : "border-destructive/30 bg-destructive/10 text-destructive"
                      }
                    >
                      {row.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(row.occurred_on)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${
                      row.type === "income" ? "text-success" : "text-destructive"
                    }`}
                  >
                    {row.type === "income" ? "+" : "−"}
                    {formatIDR(row.amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit"
                      onClick={() => {
                        setEditing(row);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Hapus"
                      onClick={() => setPendingDelete(row)}
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

      <TransactionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        transaction={editing}
        onSaved={refresh}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus transaksi ini?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.title} akan dihapus permanen.
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
