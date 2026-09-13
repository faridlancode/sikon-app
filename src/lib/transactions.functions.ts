import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Transaction = {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  occurred_on: string;
  title: string;
  notes: string | null;
};

const listSchema = z.object({
  from: z.string(),
  to: z.string(),
});

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(["income", "expense"]),
  amount: z.number().int().positive(),
  category: z.string().min(1),
  occurred_on: z.string().min(8),
  title: z.string().min(1).max(120),
  notes: z.string().max(1000).optional().nullable(),
});

export const listTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listSchema.parse(data))
  .handler(async ({ data, context }): Promise<Transaction[]> => {
    const { data: rows, error } = await context.supabase
      .from("transactions")
      .select("id, type, amount, category, occurred_on, title, notes")
      .gte("occurred_on", data.from)
      .lte("occurred_on", data.to)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (rows ?? []) as Transaction[];
  });

export const saveTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => upsertSchema.parse(data))
  .handler(async ({ data, context }) => {
    const payload = {
      type: data.type,
      amount: data.amount,
      category: data.category,
      occurred_on: data.occurred_on,
      title: data.title,
      notes: data.notes ?? null,
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
    return { id: inserted.id };
  });

export const deleteTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("transactions")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
