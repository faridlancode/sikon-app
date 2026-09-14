import { useServerFn } from "@tanstack/react-start";
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
import { recordPayment, type Order } from "@/lib/sikon.functions";

export function PaymentDialog({
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
  const submit = useServerFn(recordPayment);
  const [amount, setAmount] = useState("");
  const [paymentType, setPaymentType] = useState<"dp" | "pelunasan">("dp");
  const [method, setMethod] = useState("transfer");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !order) return;
    setAmount(String(order.remaining_amount));
    setPaymentType(order.paid_amount > 0 ? "pelunasan" : "dp");
    setMethod("transfer");
    setDate(new Date().toISOString().slice(0, 10));
  }, [open, order]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!order) return;
    const value = Number(amount);
    if (!value || value <= 0) return toast.error("Nominal pembayaran tidak valid");
    if (value > order.remaining_amount)
      return toast.error("Nominal melebihi sisa tagihan");

    setSaving(true);
    try {
      await submit({
        data: {
          order_id: order.id,
          amount: value,
          payment_type: paymentType,
          payment_method: method,
          payment_date: date,
        },
      });
      toast.success("Pembayaran dicatat");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mencatat pembayaran");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Catat Pembayaran</DialogTitle>
          <DialogDescription>
            {order
              ? `${order.order_id} — sisa tagihan ${formatIDR(order.remaining_amount)}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pay-amount">Nominal (Rp)</Label>
            <Input
              id="pay-amount"
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Jenis</Label>
              <Select
                value={paymentType}
                onValueChange={(value) => setPaymentType(value as "dp" | "pelunasan")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dp">DP</SelectItem>
                  <SelectItem value="pelunasan">Pelunasan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Metode</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transfer">Transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="qris">QRIS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-date">Tanggal bayar</Label>
            <Input
              id="pay-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
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
