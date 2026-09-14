import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { SalesDialog } from "@/components/sales-dialog";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIDR, RANGE_OPTIONS, type RangeValue } from "@/lib/finance";
import {
  deleteSales,
  listSales,
  listSalesPerformance,
  type SalesPerson,
} from "@/lib/sikon.functions";

const RANGE_VALUES = RANGE_OPTIONS.map((o) => o.value);

export const Route = createFileRoute("/_authenticated/sales")({
  head: () => ({
    meta: [
      { title: "Sales — SIKon" },
      {
        name: "description",
        content: "Kelola data sales dan pantau performa penjualan tiap sales.",
      },
      { property: "og:title", content: "Sales — SIKon" },
      {
        property: "og:description",
        content: "Kelola data sales dan pantau performa penjualan tiap sales.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { range: RangeValue } => ({
    range: RANGE_VALUES.includes(search['range'] as RangeValue)
      ? (search['range'] as RangeValue)
      : "30d",
  }),
  component: SalesPage,
});

function SalesPage() {
  const { user } = Route.useRouteContext();
  const { range } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchSales = useServerFn(listSales);
  const fetchPerformance = useServerFn(listSalesPerformance);
  const removeSales = useServerFn(deleteSales);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SalesPerson | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SalesPerson | null>(null);

  const { data: people = [], isLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: () => fetchSales(),
  });
  const { data: performance = [] } = useQuery({
    queryKey: ["sales-performance"],
    queryFn: () => fetchPerformance(),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["sales"] });
    queryClient.invalidateQueries({ queryKey: ["sales-performance"] });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await removeSales({ data: { id: pendingDelete.id } });
      toast.success("Sales dihapus");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menghapus sales");
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <AppShell
      title="Sales"
      email={user.email ?? ""}
      range={range}
      onRangeChange={(value) => navigate({ to: "/sales", search: { range: value } })}
    >
      <div className="mb-4 flex justify-end">
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="mr-1 size-4" /> Tambah sales
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daftar Sales</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Telepon</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px] text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      Memuat data...
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && people.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      Belum ada sales.
                    </TableCell>
                  </TableRow>
                )}
                {people.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell className="font-medium">{person.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {person.phone ?? "-"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          person.is_active
                            ? "border-success/30 bg-success/10 text-success"
                            : "border-border bg-muted text-muted-foreground"
                        }
                      >
                        {person.is_active ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Edit"
                        onClick={() => {
                          setEditing(person);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Hapus"
                        onClick={() => setPendingDelete(person)}
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Performa Sales</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sales</TableHead>
                  <TableHead className="text-right">Pesanan</TableHead>
                  <TableHead className="text-right">Omzet</TableHead>
                  <TableHead className="text-right">Piutang</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {performance.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      Belum ada data performa.
                    </TableCell>
                  </TableRow>
                )}
                {performance.map((row) => (
                  <TableRow key={row.sales_id}>
                    <TableCell className="font-medium">{row.sales_name}</TableCell>
                    <TableCell className="text-right">{row.total_orders}</TableCell>
                    <TableCell className="text-right">{formatIDR(row.total_revenue)}</TableCell>
                    <TableCell className="text-right text-destructive">
                      {formatIDR(row.total_outstanding)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <SalesDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        person={editing}
        onSaved={refresh}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus sales ini?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.name} akan dihapus dari daftar sales.
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
