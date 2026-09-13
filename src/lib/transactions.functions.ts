import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAuth } from "@/lib/db/auth-middleware";

export type Transaction = {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  category_id: string | null;
  occurred_on: string;
  title: string;
  notes: string | null;
};

export type Category = {
  id: string;
  name: string;
  type: "income" | "expense" | null;
};

const listSchema = z.object({
  from: z.string(),
  to: z.string(),
});

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(["income", "expense"]),
  amount: z.number().positive(),
  category_id: z.string().uuid().nullable().optional(),
  occurred_on: z.string().min(8),
  title: z.string().min(1).max(255),
  notes: z.string().max(1000).optional().nullable(),
});

type Row = {
  id: string;
  type: "income" | "expense";
  amount: number | string;
  transaction_date: string;
  title: string;
  description: string | null;
  category_id: string | null;
  categories: { name: string } | { name: string }[] | null;
};

function mapRow(row: Row): Transaction {
  const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
  return {
    id: row.id,
    type: row.type,
    amount: Number(row.amount),
    category: category?.name ?? "Tanpa kategori",
    category_id: row.category_id,
    occurred_on: row.transaction_date,
    title: row.title,
    notes: row.description,
  };
}

export const listCategories = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<Category[]> => {
    const { data, error } = await context.supabase
      .from("categories")
      .select("id, name, type")
      .order("name", { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []) as Category[];
  });

export const createCategory = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ name: z.string().min(1).max(100), type: z.enum(["income", "expense"]) })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<Category> => {
    const { data: inserted, error } = await context.supabase
      .from("categories")
      .insert({ name: data.name, type: data.type, user_id: context.userId })
      .select("id, name, type")
      .single();

    if (error) throw new Error(error.message);
    return inserted as Category;
  });

export const listTransactions = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => listSchema.parse(data))
  .handler(async ({ data, context }): Promise<Transaction[]> => {
    const { data: rows, error } = await context.supabase
      .from("transactions")
      .select("id, type, amount, transaction_date, title, description, category_id, categories(name)")
      .gte("transaction_date", data.from)
      .lte("transaction_date", data.to)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown as Row[]).map(mapRow);
  });

export const saveTransaction = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => upsertSchema.parse(data))
  .handler(async ({ data, context }) => {
    const payload = {
      type: data.type,
      amount: data.amount,
      category_id: data.category_id ?? null,
      transaction_date: data.occurred_on,
      title: data.title,
      description: data.notes ?? null,
      user_id: context.userId,
    };

    if (data.id) {
      const { error } = await context.supabase
        .from("transactions")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: inserted, error } = await context.supabase
      .from("transactions")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (inserted as { id: string }).id };
  });

export const deleteTransaction = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("transactions")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
