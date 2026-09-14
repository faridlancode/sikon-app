import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatIDR } from "@/lib/finance";
import {
  getOrderDetail,
  listSales,
  saveOrder,
  type Order,
} from "@/lib/sikon.functions";

type ItemDraft = { name_item: string; bahan: string; qty: string; price: string };

const emptyItem = (): ItemDraft => ({ name_item: "", bahan: "", qty: "1", price: "" });

export function OrderDialog({
  open,
  onOpenChange,
  order,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
  onSaved: () => void;
}) {
  const submit = useServerFn(saveOrder);
  const fetchDetail = useServerFn(getOrderDetail);
  const fetchSales = useServerFn(listSales);

  const { data: sales = [] } = useQuery({
    queryKey: ["sales"],
    queryFn: () => fetchSales(),
  });

  const [customer, setCustomer] = useState("");
  const [salesId, setSalesId] = useState("none");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [ongkir, setOngkir] = useState("0");
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCustomer(order?.customer_name ?? "");
    setSalesId(order?.sales_id ?? "none");
    setOrderDate(order?.order_date ?? new Date().toISOString().slice(0, 10));
    setOngkir(String(order?.ongkir ?? 0));
    setItems([emptyItem()]);

    if (order) {
      fetchDetail({ data: { id: order.id } })
        .then((detail) =>
          setItems(
            detail.items.length
              ? detail.items.map((item) => ({
                  name_item: item.name_item,
                  bahan: item.bahan ?? "",
                  qty: String(item.qty),
                  price: String(item.price),
                }))
              : [emptyItem()],
          ),
        )
        .catch(() => toast.error("Gagal memuat item pesanan"));
    }
  }, [open, order, fetchDetail]);

  const subtotal = items.reduce(
    (acc, item) => acc + (Number(item.qty) || 0) * (Number(item.price) || 0),
    0,
  );
  const grandTotal = subtotal + (Number(ongkir) || 0);

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const cleaned = items
      .filter((item) => item.name_item.trim())
      .map((item) => ({
        name_item: item.name_item.trim(),
        bahan: item.bahan.trim() || null,
        qty: Number(item.qty) || 0,
        price: Number(item.price) || 0,
      }));

    if (!customer.trim()) return toast.error("Nama customer wajib diisi");
    if (cleaned.length === 0) return toast.error("Tambahkan minimal satu item");
    if (cleaned.some((item) => item.qty <= 0)) return toast.error("Qty harus lebih dari 0");

    setSaving(true);
    try {
      await submit({
        data: {
          ...(order ? { id: order.id } : {}),
          customer_name: customer.trim(),
          sales_id: salesId === "none" ? null : salesId,
          order_date: orderDate,
          ongkir: Number(ongkir) || 0,
          items: cleaned,
        },
      });
      toast.success(order ? "Pesanan diperbarui" : "Pesanan dibuat");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan pesanan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{order ? "Edit Pesanan" : "Pesanan Baru"}</DialogTitle>
          <DialogDescription>
            Isi data customer dan daftar item yang dipesan.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="customer">Nama customer</Label>
              <Input
                id="customer"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder="Nama pembeli"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="order-date">Tanggal pesanan</Label>
              <Input
                id="order-date"
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Sales</Label>
              <Select value={salesId} onValueChange={setSalesId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tanpa sales</SelectItem>
                  {sales
                    .filter((person) => person.is_active)
                    .map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ongkir">Ongkir (Rp)</Label>
              <Input
                id="ongkir"
                type="number"
                min="0"
                value={ongkir}
                onChange={(e) => setOngkir(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Item pesanan</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setItems((prev) => [...prev, emptyItem()])}
              >
                <Plus className="mr-1 size-4" /> Item
              </Button>
            </div>

            {items.map((item, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1.4fr_1fr_70px_1fr_auto]">
                <Input
                  placeholder="Nama item"
                  value={item.name_item}
                  onChange={(e) => updateItem(index, { name_item: e.target.value })}
                />
                <Input
                  placeholder="Bahan"
                  value={item.bahan}
                  onChange={(e) => updateItem(index, { bahan: e.target.value })}
                />
                <Input
                  type="number"
                  min="1"
                  placeholder="Qty"
                  value={item.qty}
                  onChange={(e) => updateItem(index, { qty: e.target.value })}
                />
                <Input
                  type="number"
                  min="0"
                  placeholder="Harga"
                  value={item.price}
                  onChange={(e) => updateItem(index, { price: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Hapus item"
                  disabled={items.length === 1}
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}

            <div className="flex justify-between border-t border-border pt-2 text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{formatIDR(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Grand total</span>
              <span className="font-semibold">{formatIDR(grandTotal)}</span>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
