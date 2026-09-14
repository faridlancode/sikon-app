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
import { Switch } from "@/components/ui/switch";
import { saveSales, type SalesPerson } from "@/lib/sikon.functions";

export function SalesDialog({
  open,
  onOpenChange,
  person,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: SalesPerson | null;
  onSaved: () => void;
}) {
  const submit = useServerFn(saveSales);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(person?.name ?? "");
    setPhone(person?.phone ?? "");
    setActive(person?.is_active ?? true);
  }, [open, person]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) { toast.error("Nama sales wajib diisi"); return; }
    setSaving(true);
    try {
      await submit({
        data: {
          ...(person ? { id: person.id } : {}),
          name: name.trim(),
          phone: phone.trim() || null,
          is_active: active,
        },
      });
      toast.success(person ? "Sales diperbarui" : "Sales ditambahkan");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan sales");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{person ? "Edit Sales" : "Sales Baru"}</DialogTitle>
          <DialogDescription>Data sales dipakai untuk laporan performa.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sales-name">Nama</Label>
            <Input id="sales-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sales-phone">No. telepon</Label>
            <Input
              id="sales-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08xxxxxxxxxx"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label htmlFor="sales-active">Aktif</Label>
            <Switch id="sales-active" checked={active} onCheckedChange={setActive} />
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
