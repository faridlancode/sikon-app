import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAuth } from "@/lib/db/auth-middleware";

export type OrderStatus = "belum_lunas" | "lunas";

export type Order = {
  id: string;
  order_id: string;
  customer_name: string;
  sales_id: string | null;
  sales_name: string | null;
  order_date: string;
  total_price: number;
  ongkir: number;
  grand_total: number;
  paid_amount: number;
  remaining_amount: number;
  status: OrderStatus;
};

export type OrderItem = {
  id: string;
  name_item: string;
  bahan: string | null;
  qty: number;
  price: number;
  total_price: number;
};

export type OrderPayment = {
  id: string;
  amount: number;
  payment_type: string;
  payment_method: string | null;
  payment_date: string;
};

export type SalesPerson = {
  id: string;
  name: string;
  phone: string | null;
  is_active: boolean;
};

export type SalesPerformance = {
  sales_id: string;
  sales_name: string;
  is_active: boolean;
  total_orders: number;
  total_revenue: number;
  total_paid: number;
  total_outstanding: number;
};

const num = (value: unknown) => Number(value ?? 0);

/* ---------------------------------- orders --------------------------------- */

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<Order[]> => {
    const { data, error } = await context.supabase
      .from("orders_with_balance")
      .select("*")
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row['id']),
      order_id: String(row['order_id']),
      customer_name: String(row['customer_name']),
      sales_id: (row['sales_id'] as string | null) ?? null,
      sales_name: (row['sales_name'] as string | null) ?? null,
      order_date: String(row['order_date']),
      total_price: num(row['total_price']),
      ongkir: num(row['ongkir']),
      grand_total: num(row['grand_total']),
      paid_amount: num(row['paid_amount']),
      remaining_amount: num(row['remaining_amount']),
      status: (row['status'] as OrderStatus) ?? "belum_lunas",
    }));
  });

const itemSchema = z.object({
  name_item: z.string().min(1).max(255),
  bahan: z.string().max(255).nullable().optional(),
  qty: z.number().positive(),
  price: z.number().min(0),
});

const orderSchema = z.object({
  id: z.string().uuid().optional(),
  customer_name: z.string().min(1).max(255),
  sales_id: z.string().uuid().nullable().optional(),
  order_date: z.string().min(8),
  ongkir: z.number().min(0),
  items: z.array(itemSchema).min(1),
});

export const saveOrder = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => orderSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orderPayload = {
      customer_name: data.customer_name,
      sales_id: data.sales_id ?? null,
      order_date: data.order_date,
      ongkir: data.ongkir,
    };

    let orderId = data.id;

    if (orderId) {
      const { error } = await supabase.from("orders").update(orderPayload).eq("id", orderId);
      if (error) throw new Error(error.message);
      const { error: delError } = await supabase
        .from("order_items")
        .delete()
        .eq("order_id", orderId);
      if (delError) throw new Error(delError.message);
    } else {
      const { data: created, error } = await supabase
        .from("orders")
        .insert({ ...orderPayload, user_id: userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      orderId = created.id as string;
    }

    const { error: itemsError } = await supabase.from("order_items").insert(
      data.items.map((item) => ({
        order_id: orderId,
        user_id: userId,
        name_item: item.name_item,
        bahan: item.bahan ?? null,
        qty: item.qty,
        price: item.price,
        total_price: item.qty * item.price,
      })),
    );
    if (itemsError) throw new Error(itemsError.message);

    return { id: orderId };
  });

export const deleteOrder = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("orders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getOrderDetail = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(
    async ({ data, context }): Promise<{ items: OrderItem[]; payments: OrderPayment[] }> => {
      const [itemsRes, paymentsRes] = await Promise.all([
        context.supabase
          .from("order_items")
          .select("id, name_item, bahan, qty, price, total_price")
          .eq("order_id", data.id)
          .order("created_at", { ascending: true }),
        context.supabase
          .from("order_payments")
          .select("id, amount, payment_type, payment_method, payment_date")
          .eq("order_id", data.id)
          .order("payment_date", { ascending: true }),
      ]);

      if (itemsRes.error) throw new Error(itemsRes.error.message);
      if (paymentsRes.error) throw new Error(paymentsRes.error.message);

      return {
        items: (itemsRes.data ?? []).map((item: Record<string, unknown>) => ({
          id: String(item['id']),
          name_item: String(item['name_item']),
          bahan: (item['bahan'] as string | null) ?? null,
          qty: num(item['qty']),
          price: num(item['price']),
          total_price: num(item['total_price']),
        })),
        payments: (paymentsRes.data ?? []).map((row: Record<string, unknown>) => ({
          id: String(row['id']),
          amount: num(row['amount']),
          payment_type: String(row['payment_type']),
          payment_method: (row['payment_method'] as string | null) ?? null,
          payment_date: String(row['payment_date']),
        })),
      };
    },
  );

export const recordPayment = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        order_id: z.string().uuid(),
        amount: z.number().positive(),
        payment_type: z.enum(["dp", "pelunasan"]),
        payment_method: z.string().max(50).nullable().optional(),
        payment_date: z.string().min(8),
        category_id: z.string().uuid().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("record_order_payment", {
      p_order_id: data.order_id,
      p_amount: data.amount,
      p_payment_type: data.payment_type,
      p_payment_date: data.payment_date,
      p_payment_method: data.payment_method ?? null,
      p_category_id: data.category_id ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePayment = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("delete_order_payment", {
      p_payment_id: data.id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------------------------- sales ---------------------------------- */

export const listSales = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<SalesPerson[]> => {
    const { data, error } = await context.supabase
      .from("sales")
      .select("id, name, phone, is_active")
      .order("name", { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []) as SalesPerson[];
  });

export const saveSales = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(255),
        phone: z.string().max(50).nullable().optional(),
        is_active: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const payload = {
      name: data.name,
      phone: data.phone ?? null,
      is_active: data.is_active,
    };

    if (data.id) {
      const { error } = await context.supabase.from("sales").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("sales")
        .insert({ ...payload, user_id: context.userId });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteSales = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("sales").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSalesPerformance = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<SalesPerformance[]> => {
    const { data, error } = await context.supabase
      .from("sales_performance")
      .select("*")
      .order("total_revenue", { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []).map((row: Record<string, unknown>) => ({
      sales_id: String(row['sales_id']),
      sales_name: String(row['sales_name']),
      is_active: Boolean(row['is_active']),
      total_orders: num(row['total_orders']),
      total_revenue: num(row['total_revenue']),
      total_paid: num(row['total_paid']),
      total_outstanding: num(row['total_outstanding']),
    }));
  });

/* ---------------------------- company settings ---------------------------- */

export const getSaldoAwal = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<number> => {
    const { data, error } = await context.supabase
      .from("company_settings")
      .select("saldo_awal")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return num(data?.['saldo_awal']);
  });

export const updateSaldoAwal = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ saldo_awal: z.number().min(0) }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("company_settings").upsert({
      user_id: context.userId,
      saldo_awal: data.saldo_awal,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
