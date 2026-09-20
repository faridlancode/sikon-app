import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { WeeklyPayroll, PayrollItem, Staff, PieceworkTask } from "../types";

export function usePayroll() {
  const [payrolls, setPayrolls] = useState<WeeklyPayroll[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPayrolls = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("weekly_payrolls")
      .select(`
        *,
        payroll_items (
          *,
          staff:staff_id (
            id,
            name,
            role,
            phone,
            wage_type,
            daily_rate
          )
        )
      `)
      .order("period_end", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setPayrolls((data ?? []) as WeeklyPayroll[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPayrolls();
  }, [fetchPayrolls]);

  /**
   * Menghitung draft rincian payroll mingguan secara dinamis:
   * 1. Staf Borongan: akumulasi total_wage dari piecework_tasks (status: 'completed')
   * 2. Staf Absensi: hari masuk × daily_rate
   * 3. Staf Sales: DUAL-WAGE — gaji harian (attendance × daily_rate) DITAMBAH bonus penjualan.
   *    Bonus hanya dihitung dari order yang:
   *    - status = 'lunas' (sudah lunas)
   *    - production_status IN ('ready', 'completed') (pengerjaan sudah selesai)
   *    - bonus_paid = FALSE (belum pernah masuk hitungan payroll yang dibayar)
   *    Tidak ada filter tanggal — bonus cair saat syarat terpenuhi, bukan saat order dibuat.
   */
  async function calculateDraftPayroll(params: {
    periodStart: string;
    periodEnd: string;
    salesTargetQty: number;
    salesBelowScheme: "none" | "half";
    customAttendance?: Record<string, number>;
    customAllowances?: Record<string, number>;
    customDeductions?: Record<string, number>;
    customBonusOverrides?: Record<string, number>;
  }): Promise<{
    items: PayrollItem[];
    totalAmount: number;
    completedTasksByStaff: Record<string, PieceworkTask[]>;
    salesOrdersByStaff: Record<string, any[]>;
    bonusEligibleOrderIds: string[];
  }> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sesi login tidak ditemukan.");

    // 1. Ambil staf aktif
    const { data: staffList, error: staffErr } = await supabase
      .from("staff")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (staffErr) throw staffErr;
    const activeStaff = (staffList ?? []) as Staff[];

    // 2. Ambil semua piecework tasks yang statusnya 'completed'
    const { data: tasksData, error: taskErr } = await supabase
      .from("piecework_tasks")
      .select(`
        *,
        products (id, name, cutting_cost_per_pcs, sewing_cost_per_pcs),
        orders (id, order_id, customer_name)
      `)
      .eq("status", "completed");

    if (taskErr) throw taskErr;
    const completedTasks = (tasksData ?? []) as PieceworkTask[];

    const completedTasksByStaff: Record<string, PieceworkTask[]> = {};
    for (const t of completedTasks) {
      if (!completedTasksByStaff[t.staff_id]) {
        completedTasksByStaff[t.staff_id] = [];
      }
      completedTasksByStaff[t.staff_id].push(t);
    }

    // 3. Ambil order yang memenuhi syarat bonus sales:
    //    - status = 'lunas' (sudah lunas)
    //    - production_status IN ('ready', 'completed') (pengerjaan selesai)
    //    - bonus_paid = false (belum pernah masuk payroll yang sudah dibayar)
    //    TIDAK ada filter tanggal — bonus cair saat syarat terpenuhi, bukan saat order_date.
    const { data: ordersData, error: orderErr } = await supabase
      .from("orders")
      .select(`
        id,
        order_id,
        order_date,
        sales_id,
        customer_name,
        total_price,
        production_status,
        bonus_paid,
        order_items (
          id,
          qty,
          product_id,
          products (
            id,
            name,
            sales_bonus_per_pcs
          )
        )
      `)
      .eq("status", "lunas")
      .in("production_status", ["ready", "completed"])
      .eq("bonus_paid", false);

    if (orderErr) throw orderErr;
    const bonusEligibleOrders = ordersData ?? [];

    // Kumpulkan ID order yang eligible supaya bisa di-mark bonus_paid setelah payroll dibayar
    const bonusEligibleOrderIds = bonusEligibleOrders.map((o: any) => String(o.id));

    const salesOrdersByStaff: Record<string, any[]> = {};
    for (const ord of bonusEligibleOrders) {
      if (ord.sales_id) {
        if (!salesOrdersByStaff[ord.sales_id]) {
          salesOrdersByStaff[ord.sales_id] = [];
        }
        salesOrdersByStaff[ord.sales_id].push(ord);
      }
    }

    // 4. Kalkulasi per staf
    const items: PayrollItem[] = [];
    let grandTotal = 0;

    for (const s of activeStaff) {
      const wageType = s.wage_type || (
        s.role === "Penjahit" || s.role === "Tukang Potong"
          ? "piecework"
          : s.role === "Sales"
          ? "sales"
          : "attendance"
      );

      let attendanceDays = 0;
      let dailyRate = 0;
      let baseAmount = 0;
      let pieceworkAmount = 0;
      let salesTotalQty = 0;
      let salesPotentialBonus = 0;
      let salesBonusPercentage = 100;
      let salesBonusAmount = 0;

      if (wageType === "piecework") {
        const staffTasks = completedTasksByStaff[s.id] || [];
        pieceworkAmount = staffTasks.reduce((sum, t) => sum + Number(t.total_wage || 0), 0);
      } else if (wageType === "sales") {
        // DUAL-WAGE: sales dapat gaji harian JUGA (sama seperti attendance), + bonus penjualan.
        attendanceDays = params.customAttendance?.[s.id] ?? 6;
        dailyRate = Number(s.daily_rate || 0);
        baseAmount = attendanceDays * dailyRate;

        // Hitung bonus berdasarkan order yang memenuhi syarat (lunas + ready/completed + !bonus_paid)
        const salesId = s.sales_id || s.id;
        const staffOrders = salesOrdersByStaff[salesId] || [];

        for (const o of staffOrders) {
          for (const item of o.order_items || []) {
            const qty = Number(item.qty || 0);
            salesTotalQty += qty;
            const bonusPerPcs = Number(item.products?.sales_bonus_per_pcs || 0);
            salesPotentialBonus += qty * bonusPerPcs;
          }
        }

        // Cek target
        if (params.salesTargetQty > 0 && salesTotalQty < params.salesTargetQty) {
          salesBonusPercentage = params.salesBelowScheme === "half" ? 50 : 0;
        } else {
          salesBonusPercentage = 100;
        }

        if (params.customBonusOverrides && params.customBonusOverrides[s.id] !== undefined) {
          salesBonusAmount = params.customBonusOverrides[s.id];
        } else {
          salesBonusAmount = Math.round((salesPotentialBonus * salesBonusPercentage) / 100);
        }
      } else {
        // Attendance
        attendanceDays = params.customAttendance?.[s.id] ?? 6;
        dailyRate = Number(s.daily_rate || 0);
        baseAmount = attendanceDays * dailyRate;
      }

      const allowances = params.customAllowances?.[s.id] ?? 0;
      const deductions = params.customDeductions?.[s.id] ?? 0;
      // Sales: take_home_pay = base_amount (gaji harian) + sales_bonus_amount + allowances - deductions
      const takeHomePay = Math.max(
        0,
        baseAmount + pieceworkAmount + salesBonusAmount + allowances - deductions
      );

      grandTotal += takeHomePay;

      items.push({
        staff_id: s.id,
        wage_type: wageType,
        attendance_days: attendanceDays,
        daily_rate: dailyRate,
        base_amount: baseAmount,
        piecework_amount: pieceworkAmount,
        sales_total_qty: salesTotalQty,
        sales_potential_bonus: salesPotentialBonus,
        sales_bonus_percentage: salesBonusPercentage,
        sales_bonus_amount: salesBonusAmount,
        allowances,
        deductions,
        take_home_pay: takeHomePay,
        staff: s,
      });
    }

    return {
      items,
      totalAmount: grandTotal,
      completedTasksByStaff,
      salesOrdersByStaff,
      bonusEligibleOrderIds,
    };
  }

  async function createPayroll(payload: {
    period_start: string;
    period_end: string;
    payment_date: string;
    sales_target_qty: number;
    sales_below_target_scheme: "none" | "half";
    notes?: string;
    items: Omit<PayrollItem, "id" | "payroll_id" | "user_id" | "created_at" | "staff">[];
  }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sesi login tidak ditemukan.");

    const totalAmount = payload.items.reduce((sum, i) => sum + Number(i.take_home_pay), 0);

    // 1. Insert weekly_payrolls
    const { data: newPayroll, error: payrollErr } = await supabase
      .from("weekly_payrolls")
      .insert({
        user_id: user.id,
        period_start: payload.period_start,
        period_end: payload.period_end,
        payment_date: payload.payment_date,
        sales_target_qty: payload.sales_target_qty,
        sales_below_target_scheme: payload.sales_below_target_scheme,
        total_amount: totalAmount,
        notes: payload.notes || null,
        status: "draft",
      })
      .select()
      .single();

    if (payrollErr) throw payrollErr;

    // 2. Insert payroll_items
    const itemRows = payload.items.map((i) => ({
      ...i,
      payroll_id: newPayroll.id,
      user_id: user.id,
    }));

    const { error: itemsErr } = await supabase
      .from("payroll_items")
      .insert(itemRows);

    if (itemsErr) throw itemsErr;

    await fetchPayrolls();
    return newPayroll;
  }

  async function payPayroll(payrollId: string) {
    const { data, error: rpcError } = await supabase.rpc("pay_weekly_payroll", {
      p_payroll_id: payrollId,
    });

    if (rpcError) throw rpcError;
    await fetchPayrolls();
    return data;
  }

  async function deletePayroll(payrollId: string) {
    const { error: deleteError } = await supabase
      .from("weekly_payrolls")
      .delete()
      .eq("id", payrollId);

    if (deleteError) throw deleteError;
    await fetchPayrolls();
  }

  return {
    payrolls,
    loading,
    error,
    refetch: fetchPayrolls,
    calculateDraftPayroll,
    createPayroll,
    payPayroll,
    deletePayroll,
  };
}
