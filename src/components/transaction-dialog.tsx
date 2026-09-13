import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Textarea } from "@/components/ui/textarea";
import { todayISO, type TxType } from "@/lib/finance";
import {
  createCategory,
  listCategories,
  saveTransaction,
  type Transaction,
} from "@/lib/transactions.functions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction | null;
  onSaved: () => void;
};

const NEW_CATEGORY = "__new__";

export function TransactionDialog({ open, onOpenChange, transaction, onSaved }: Props) {
  const save = useServerFn(saveTransaction);
  const addCategory = useServerFn(createCategory);
  const fetchCategories = useServerFn(listCategories);
  const queryClient = useQueryClient();

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => fetchCategories(),
  });

  const [type, setType] = useState<TxType>("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [newCategory, setNewCategory] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayISO());
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const options = categories.filter((c) => !c.type || c.type === type);

  useEffect(() => {
    if (!open) return;
    setNewCategory("");
    if (transaction) {
      setType(transaction.type);
      setAmount(String(transaction.amount));
      setCategoryId(transaction.category_id ?? "");
      setOccurredOn(transaction.occurred_on);
      setTitle(transaction.title);
      setNotes(transaction.notes ?? "");
    } else {
      setType("expense");
      setAmount("");
      setCategoryId("");
      setOccurredOn(todayISO());
      setTitle("");
      setNotes("");
    }
  }, [open, transaction]);

  function handleTypeChange(next: TxType) {
    setType(next);
    const stillValid = categories.some(
      (c) => c.id === categoryId && (!c.type || c.type === next),
    );
    if (!stillValid) setCategoryId("");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsedAmount = Number(amount.replace(/[^\d]/g, ""));
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error("Masukkan jumlah yang valid");
      return;
    }
    setSaving(true);
    try {
      let resolvedCategoryId: string | null = categoryId || null;
      if (categoryId === NEW_CATEGORY) {
        const name = newCategory.trim();
        if (!name) {
          toast.error("Masukkan nama kategori baru");
          setSaving(false);
          return;
        }
        const created = await addCategory({ data: { name, type } });
        resolvedCategoryId = created.id;
        queryClient.invalidateQueries({ queryKey: ["categories"] });
      }

      await save({
        data: {
          ...(transaction ? { id: transaction.id } : {}),
          type,
          amount: parsedAmount,
          category_id: resolvedCategoryId,
          occurred_on: occurredOn,
          title: title.trim(),
          notes: notes.trim() ? notes.trim() : null,
        },
      });
      toast.success(transaction ? "Transaksi diperbarui" : "Transaksi ditambahkan");
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan transaksi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{transaction ? "Edit transaksi" : "Tambah transaksi"}</DialogTitle>
          <DialogDescription>Semua jumlah dicatat dalam Rupiah (IDR).</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Jenis</Label>
              <Select value={type} onValueChange={(v) => handleTypeChange(v as TxType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Pemasukan</SelectItem>
                  <SelectItem value="expense">Pengeluaran</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Jumlah (Rp)</Label>
              <Input
                id="amount"
                inputMode="numeric"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="150000"
              />
            </div>
            <div className="space-y-2">
              <Label>Kategori</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_CATEGORY}>+ Kategori baru</SelectItem>
                </SelectContent>
              </Select>
              {categoryId === NEW_CATEGORY && (
                <Input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Nama kategori baru"
                  maxLength={100}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Tanggal</Label>
              <Input
                id="date"
                type="date"
                required
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">Judul</Label>
            <Input
              id="title"
              required
              maxLength={255}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contoh: Belanja bulanan"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Catatan</Label>
            <Textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opsional"
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
