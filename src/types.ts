export type CategoryType = "income" | "expense";

export interface TransactionCategory {
  id: string;
  name: string;
  type: CategoryType;
  account_id?: string | null;
  accounts?: { id: string; code: string; name: string } | null;
  user_id?: string;
  created_at?: string;
}

// Backward compatibility alias
export type Category = TransactionCategory;

export interface ProductCategory {
  id: string;
  name: string;
  user_id?: string;
}

export interface Transaction {
  id: number | string;
  title: string;
  amount: number | string;
  type: "income" | "expense";
  transaction_date: string;
  description?: string | null;
  category_id?: number | string | null;
  cash_account_id?: string | null;
  counter_account_id?: string | null;
  order_id?: number | string | null;
  purchasing_report_id?: string | null;
  supplier_purchase_id?: string | null;
  items_summary?: string | null;
  transaction_categories?: {
    name?: string | null;
  } | null;
  categories?: {
    name?: string | null;
  } | null;
  orders?: {
    order_id?: number | string | null;
    customer_name?: string | null;
    po_batch_id?: string | null;
    po_batches?: {
      id: string;
      name: string;
      code?: string | null;
      status?: string | null;
    } | null;
  } | null;
}

export interface Order {
  id: number | string;
  order_date: string;
  grand_total: number | string;
  paid_amount?: number | string;
  remaining_amount?: number | string;
  total_qty?: number | string;
  order_type?: "satuan" | "prioritas";
  is_order_type_manual_override?: boolean;
  status?: string;
  created_at?: string;
  customer_name?: string | null;
  po_batch_id?: string | null;
  po_code?: string | null;
  po_name?: string | null;
  po_status?: "open" | "closed" | null;
  released_early_at?: string | null;
  is_rekap_done?: boolean;
  [key: string]: unknown;
}

export interface PoBatch {
  id: string;
  user_id: string;
  code: string;
  name: string;
  period_year: number;
  period_month: number;
  seq_in_month?: number | null;
  start_date: string;
  end_date: string;
  status: "open" | "closed";
  quota_qty?: number | null;
  note?: string | null;
  closed_at?: string | null;
  closed_by?: string | null;
  close_early_reason?: string | null;
  close_note?: string | null;
  close_snapshot?: Record<string, unknown> | null;
  is_legacy?: boolean;
  reopen_count?: number;
  created_at?: string;
}

export interface PoBatchSummary extends PoBatch {
  order_count: number;
  total_qty: number;
  total_price: number;
  quota_used_pct: number | null;
}

export interface CurrentPoResponse {
  batch: PoBatch;
  seconds_remaining: number;
  end_timestamp: string;
  order_count: number;
  total_qty: number;
  total_price: number;
  has_past_open_batches: boolean;
}

export interface PoDailyPoCumulative {
  batch_id: string;
  name: string;
  code: string;
  status: 'open' | 'closed';
  start_date: string;
  end_date: string;
  period_year: number;
  period_month: number;
  quota_qty: number | null;
  today_orders: number;
  today_pcs: number;
  cum_orders: number;
  cum_pcs: number;
  cum_price: number;
  cum_paid: number;
  quota_used_pct: number | null;
}

export interface SalesCategoryMatrixItem {
  sales_name: string;
  category_name: string;
  total_pcs: number;
  total_price: number;
}

export interface UnpaidOrderItem {
  id: string;
  order_id: string;
  customer_name: string;
  sales_name: string;
  order_date: string;
  total_pcs: number;
  grand_total: number;
  paid_amount: number;
  remaining_amount: number;
}

export interface PastUnpaidPoItem {
  batch_id: string;
  name: string;
  code: string;
  status: string;
  start_date: string;
  end_date: string;
  total_orders: number;
  unpaid_orders_count: number;
  total_booking_and_ongkir: number;
  total_paid: number;
  remaining_amount: number;
  unpaid_orders?: UnpaidOrderItem[];
}

export interface ProductionProgressOrderItem {
  id: string;
  order_id: string;
  order_date: string;
  customer_name: string;
  sales_name: string;
  total_pcs: number;
  total_price: number;
  production_status: string;
  items_summary: string;
  cutting_completed_pcs: number;
  cutting_status: string;
  sewing_completed_pcs: number;
  sewing_status: string;
  qc_passed_pcs: number;
  qc_status: string;
}

export interface PoDailyReport {
  date: string;
  today_summary?: {
    order_count: number;
    total_pcs: number;
    total_price: number;
    total_ongkir: number;
    payment_received: number;
  };
  summary: {
    order_count: number;
    total_pcs: number;
    total_price: number;
    total_ongkir: number;
    payment_received: number;
  };
  sales_category_matrix?: SalesCategoryMatrixItem[];
  past_unpaid_pos?: PastUnpaidPoItem[];
  by_sales?: Array<{
    sales_id: string | null;
    sales_name: string;
    order_count: number;
    total_pcs: number;
    total_price: number;
  }>;
  sales_breakdown: Array<{
    sales_id: string | null;
    sales_name: string;
    order_count: number;
    total_pcs: number;
    total_price: number;
  }>;
  by_category?: Array<{
    category: string;
    total_pcs: number;
    total_price: number;
  }>;
  product_category_breakdown: Array<{
    category: string;
    total_pcs: number;
    total_price: number;
  }>;
  orders: Array<{
    id: string;
    order_id: string;
    order_date: string;
    customer_name: string;
    customer_phone: string | null;
    sales_name: string;
    po_name?: string | null;
    total_pcs: number;
    total_price: number;
    ongkir: number;
    payment_status: string;
    production_status: string;
  }>;
  pos?: PoDailyPoCumulative[];
  po?: {
    id: string;
    code: string;
    start_date: string;
    end_date: string;
    status: 'open' | 'closed';
  } | null;
  cumulative_since_monday?: {
    from_date: string;
    to_date: string;
    order_count: number;
    total_pcs: number;
    total_price: number;
    payment_received: number;
  };
  full_week_po?: {
    order_count: number;
    total_pcs: number;
    total_price: number;
  };
}

export interface PoCloseSnapshot {
  schema_version: number;
  closed_at: string;
  closed_by: string;
  is_early: boolean;
  close_early_reason: string | null;
  close_note: string | null;
  batch?: {
    name?: string;
    code?: string;
    start_date?: string;
    end_date?: string;
    quota_qty?: number | null;
  };
  summary: {
    total_orders: number;
    total_pcs: number;
    unit_orders: number;
    unit_pcs: number;
    priority_orders: number;
    priority_pcs: number;
    total_price: number;
    total_ongkir: number;
    total_paid: number;
    total_remaining: number;
    quota_qty?: number | null;
    quota_used_pct?: number | null;
  };
  sales_category_matrix?: SalesCategoryMatrixItem[];
  production_progress_orders?: ProductionProgressOrderItem[];
  sales_breakdown: Array<{
    sales_id: string | null;
    sales_name: string;
    order_count: number;
    total_pcs: number;
    total_price: number;
  }>;
  category_breakdown: Array<{
    category: string;
    total_pcs: number;
    total_price: number;
  }>;
  product_breakdown: Array<{
    product_id: string;
    product_name: string;
    category: string;
    total_pcs: number;
    total_price: number;
  }>;
  fabric_requirements?: Array<{
    material_id: string;
    material_name: string;
    color_id: string;
    color_name: string;
    required_meters: number;
    stock_meters_at_close: number;
    shortage_meters: number;
  }>;
  orders: Array<{
    id: string;
    order_id: string;
    order_date: string;
    order_type: string;
    customer_name: string;
    sales_name: string;
    total_pcs: number;
    total_price: number;
    ongkir: number;
    payment_status: string;
    production_status: string;
  }>;
}

export interface PoCloseReport {
  batch: {
    id: string;
    code: string;
    name?: string;
    start_date: string;
    end_date: string;
    status: 'open' | 'closed';
    quota_qty?: number | null;
    closed_at: string | null;
    closed_by_name: string;
    close_early_reason: string | null;
    close_note: string | null;
    is_legacy: boolean;
  };
  is_closed: boolean;
  close_snapshot: PoCloseSnapshot | null;
  live_status: {
    payment: {
      paid_amount: number;
      remaining_receivable: number;
      fully_paid_orders: number;
    };
    production: {
      total_order_pcs: number;
      cutting_completed_pcs: number;
      cutting_pct: number;
      sewing_completed_pcs: number;
      sewing_pct: number;
      qc_passed_pcs: number;
      qc_pct: number;
    };
  };
}

export interface PoMonthlyBatchSummary {
  batch_id: string;
  code: string;
  name?: string;
  seq_in_month?: number | null;
  start_date: string;
  end_date: string;
  status: string;
  quota_qty?: number | null;
  quota_used_pct?: number | null;
  order_count: number;
  total_pcs: number;
  booking_value: number;
  total_ongkir: number;
  paid_amount: number;
  receivable_amount: number;
  shipped_order_count: number;
  shipped_order_value: number;
  hpp_total_estimate: number;
  estimated_margin: number;
  actual_piecework_wage: number;
  material_purchases: number;
}

export interface PoMonthlyReport {
  year: number;
  month: number;
  month_name: string;
  po_batches: PoMonthlyBatchSummary[];
  sales_category_matrix?: SalesCategoryMatrixItem[];
  unlinked_piecework_wage: number;
  unlinked_material_purchases?: number;
  totals: {
    po_count: number;
    order_count: number;
    total_pcs: number;
    booking_value: number;
    total_ongkir: number;
    paid_amount: number;
    receivable_amount: number;
    shipped_order_count: number;
    shipped_order_value: number;
    hpp_total_estimate: number;
    estimated_margin: number;
    actual_piecework_wage: number;
    material_purchases: number;
    total_quota_qty?: number;
    total_quota_realized_pcs?: number;
    quota_used_pct?: number | null;
  };
  previous_month_comparison: {
    previous_year: number;
    previous_month: number;
    totals: {
      order_count: number;
      total_pcs: number;
      booking_value: number;
      estimated_margin: number;
    };
    diff: {
      order_count_diff: number;
      total_pcs_diff: number;
      booking_value_diff: number;
      estimated_margin_diff: number;
    };
  };
  reconciliation: {
    recognized_revenue_4_1000: number;
    recognized_revenue_4_1100: number;
    total_recognized_revenue: number;
    booking_value_difference: number;
    notes: string;
  };
}

export interface PoPurchaseListItem {
  material_id: string;
  material_name: string;
  material_color_id: string | null;
  color_name: string | null;
  unit: string;
  total_quantity_needed: number;
  total_quantity_fulfilled: number;
  total_request_count: number;
  status_breakdown: {
    draft_auto: number;
    pending: number;
    in_progress: number;
    fulfilled: number;
    cancelled: number;
  };
}

export interface PoPurchaseListResponse {
  po_batch: {
    id: string;
    code: string;
    name: string | null;
    status: 'open' | 'closed';
  };
  items: PoPurchaseListItem[];
}

export interface SalesPerson {
  id: number | string;
  name: string;
  phone?: string | null;
  is_active?: boolean;
  user_id?: string;
}

export interface EmbroiderySpot {
  id: string;
  location: string;
  cost: number;
}

export interface EmbroideryDetails {
  mode: "none" | "flat" | "spots";
  flatCost?: number;
  spots?: EmbroiderySpot[];
  totalPerUnit: number;
}

export interface OrderItem {
  id?: number | string;
  order_id?: number | string;
  product_id?: string | null;
  product_name?: string;
  name_item?: string;
  bahan?: string | null;
  quantity?: number;
  qty?: number;
  price?: number | string;
  subtotal?: number | string;
  total_price?: number | string;
  hpp_per_unit_snapshot?: number | null;
  hpp_total_snapshot?: number | null;
  embroidery_cost_per_unit?: number | null;
  embroidery_details?: EmbroideryDetails | null;
  order_item_fabrics?: any[];
  bomMaterials?: { material_id: string; quantity: number }[];
  user_id?: string;
  ready_for_sewing_at?: string | null; // diisi saat bordir selesai, item masuk pool jahit
  cutting_completed_at?: string | null; // diisi saat item selesai dipotong (event-driven)
  cutting_qty?: number | null; // qty aktual potong
  [key: string]: unknown;
}

export interface PaymentPayload {
  amount: number | string;
  paymentType: string;
  paymentDate: string;
  paymentMethod?: string | null;
}

export interface CompanyProfile {
  companyName: string;
  address: string;
  phone: string;
  logoUrl: string | null;
  stampUrl: string | null;
  signatureUrl: string | null;
  saldoAwal: number;
  sewing_satuan_surcharge?: number;
  po_gate_production?: boolean;
}

export interface BankAccount {
  id: string;
  bank_name: string;
  account_number: string;
  account_holder_name: string;
  is_primary: boolean;
  user_id?: string;
}

export interface MaterialCategory {
  id: string;
  name: string;
  is_fabric: boolean;
  user_id?: string;
}

export interface MaterialPurchaseUnit {
  id: string;
  name: string;
  conversion_rate: number | null;
  is_variable: boolean;
  is_primary: boolean;
  is_active: boolean;
}

export interface Material {
  id: string;
  category_id: string | null;
  name: string;
  brand?: string | null;
  purchase_unit?: string | null;
  conversion_rate?: number;
  purchase_units?: MaterialPurchaseUnit[];
  unit: string;
  price: number;
  stock_qty?: number;
  minimum_stock?: number;
  composition: string | null;
  care_instruction: string | null;
  description: string | null;
  is_active: boolean;
  is_floor_stock?: boolean;
  scrap_qty?: number;
  user_id?: string;
  // Joined field (via select dengan join ke material_categories)
  material_categories?: { name: string; is_fabric: boolean } | null;
}

export interface MaterialColor {
  id: string;
  material_id: string;
  color_name: string;
  color_code: string | null;
  stock_qty?: number;
  minimum_stock?: number;
  is_active: boolean;
  user_id?: string;
}

export interface ProductMaterialLine {
  id?: string; // undefined kalau baris baru belum tersimpan
  material_id: string;
  quantity: number;
  materials?: { name: string; unit: string; price: number };
}

export interface ProductFabricSlot {
  id?: string;
  fabric_category_id: string | null;
  label: string;
  usage_qty: number;
  unit: string;
  material_categories?: { name: string } | null;
}

export interface Product {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  default_price?: number;
  price_satuan?: number | null;
  price_prioritas?: number | null;
  sewing_cost_per_pcs: number;
  cutting_cost_per_pcs: number;
  consumables_allowance?: number;
  sales_bonus_per_pcs?: number;
  is_active: boolean;
  user_id?: string;
  // Joined field
  product_categories?: { name: string } | null;
}

export interface ProductWithBom extends Product {
  materials: (ProductMaterialLine & {
    materials?: { name: string; unit: string; price: number };
  })[];
  fabricSlots: ProductFabricSlot[];
}

/** Kain + warna yang dipilih user untuk 1 slot, dipakai di form Order */
export interface FabricSelection {
  slotId: string;
  slotLabel: string;
  usageQty: number;
  materialId: string;
  materialColorId: string | null;
  price?: number;
  lineCost?: number;
}

/** Hasil kalkulasi HPP, dipakai untuk tampilan & untuk snapshot ke order_items */
export interface HppBreakdown {
  sewingCost: number;
  cuttingCost: number;
  fixedMaterialsCost: number;
  fabricCost: number;
  consumablesCost: number;
  embroideryCost: number;
  hppPerUnit: number;
  fabricLines: {
    slotId: string;
    slotLabel: string;
    materialId: string;
    materialColorId: string | null;
    usageQty: number;
    price: number;
    lineCost: number;
  }[];
}

export interface StockMovement {
  id: string;
  user_id?: string;
  material_id: string;
  material_color_id: string | null;
  movement_type: "in" | "out" | "adjustment";
  source_type:
    | "initial"
    | "purchase"
    | "order_consumption"
    | "manual"
    | "purchasing_report"
    | "supplier_purchase"
    | "adjustment"
    | "floor_stock"
    | "stock_request"
    | null;
  source_id: string | null;
  source_line_id?: string | null;
  sewing_assignment_id?: string | null;
  cutting_assignment_id?: string | null;
  qty: number;
  unit: string;
  notes: string | null;
  status: "pending" | "confirmed" | "cancelled";
  confirmed_at: string | null;
  taken_by?: string | null;
  recorded_by?: string | null;
  created_at: string;
  // joined
  taken_by_staff?: { id: string; name: string; role?: string | null } | null;
  recorded_by_staff?: { id: string; name: string; role?: string | null } | null;
  materials?: {
    id?: string;
    name: string;
    unit: string;
    stock_qty?: number;
    minimum_stock?: number;
    category_id?: string | null;
    material_categories?: { name: string; is_fabric: boolean } | null;
  } | null;
  material_colors?: {
    id?: string;
    color_name: string;
    color_code?: string | null;
    stock_qty?: number;
    minimum_stock?: number;
  } | null;
}

export interface PurchaseReceiptItem {
  id: string;
  user_id?: string;
  purchase_receipt_id: string;
  stock_movement_id: string | null;
  material_id: string;
  material_color_id: string | null;
  qty: number;
  unit: string;
  unit_price: number;
  total_price: number;
  created_at?: string;
  // joined
  materials?: { name: string; unit?: string } | null;
  material_colors?: { color_name: string } | null;
}

export interface PurchaseReceipt {
  id: string;
  user_id?: string;
  supplier_name: string | null;
  total_amount: number;
  notes: string | null;
  received_date: string;
  status: "unpaid" | "paid";
  paid_date: string | null;
  transaction_id: string | null;
  created_at: string;
  // joined
  purchase_receipt_items?: PurchaseReceiptItem[];
}

// ── Purchasing & Warehouse Types ─────────────────────────────

export interface Staff {
  id: string;
  user_id?: string;
  name: string;
  phone?: string | null;
  role?: string | null;
  wage_type?: "attendance" | "piecework" | "sales";
  daily_rate?: number;
  sales_id?: string | null;
  is_active: boolean;
  last_priority_assigned_at?: string | null;
  priority_orders_count?: number;
  created_at?: string;
}

export interface StockRequest {
  id: string;
  user_id?: string;
  requested_by: string | null;
  material_id: string;
  material_color_id: string | null;
  quantity_needed: number;
  unit: string;
  conversion_rate?: number;
  is_variable_unit?: boolean;
  estimated_price?: number | null;
  reason: string | null;
  status:
    | "draft_auto"
    | "pending"
    | "approved"
    | "rejected"
    | "in_progress"
    | "fulfilled"
    | "cancelled";
  fulfillment_type: "spj" | "supplier_purchase";
  requested_date: string;
  fulfilled_date: string | null;
  purchasing_report_id?: string | null;
  supplier_purchase_id?: string | null;
  source_type?: "manual" | "auto_order";
  source_order_id?: string | null;
  source_order_item_id?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  rejected_reason?: string | null;
  goods_received_at?: string | null;
  preferred_store?: string | null;
  batch_id?: string | null;
  po_batch_id?: string | null;
  created_at?: string;
  // joined
  staff?: { id: string; name: string; role?: string | null } | null;
  approved_by_staff?: { id: string; name: string; role?: string | null } | null;
  orders?: { id: string; order_id: string; customer_name: string } | null;
  order_items?: { id: string; name_item: string; qty: number } | null;
  materials?: {
    id: string;
    name: string;
    unit: string;
    price?: number;
    stock_qty?: number;
    material_categories?: { name: string; is_fabric: boolean } | null;
  } | null;
  material_colors?: {
    id: string;
    color_name: string;
    color_code?: string | null;
    stock_qty?: number;
  } | null;
  po_batches?: {
    id: string;
    name: string;
    code: string;
    status: string;
    start_date?: string;
    end_date?: string;
  } | null;
}

export interface CashAdvance {
  id: string;
  user_id?: string;
  staff_id: string;
  amount: number;
  purpose: string | null;
  date_given: string;
  status: "outstanding" | "settled";
  transaction_id: string | null;
  created_at?: string;
  // joined
  staff?: { id: string; name: string; role?: string | null } | null;
}

export interface PurchasingReportItem {
  id?: string;
  user_id?: string;
  report_id?: string;
  stock_request_id?: string | null;
  material_id?: string | null;
  material_color_id?: string | null;
  category_id?: string | null;
  description?: string | null;
  supplier_name?: string | null;
  quantity: number;
  unit: string;
  conversion_rate?: number;
  is_variable_unit?: boolean;
  base_quantity?: number | null;
  unit_price: number;
  total_price: number;
  receipt_photo_url?: string | null;
  created_at?: string;
  // joined
  materials?: { id: string; name: string; unit: string } | null;
  material_colors?: { id: string; color_name: string } | null;
  transaction_categories?: { id: string; name: string } | null;
  categories?: { id: string; name: string } | null;
  stock_requests?: {
    id: string;
    quantity_needed: number;
    unit: string;
    reason?: string | null;
  } | null;
}

export interface PurchasingReport {
  id: string;
  user_id?: string;
  staff_id: string;
  cash_advance_id?: string | null;
  report_date: string;
  status:
    | "disbursed"
    | "submitted"
    | "financially_approved"
    | "goods_received"
    | "rejected"
    | "draft"
    | "approved";
  total_amount: number;
  service_fee?: number | null; // Biaya jasa belanja / transport (opsional)
  notes?: string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  received_by?: string | null;
  received_at?: string | null;
  created_at?: string;
  // joined
  staff?: {
    id: string;
    name: string;
    phone?: string | null;
    role?: string | null;
  } | null;
  received_by_staff?: { id: string; name: string; role?: string | null } | null;
  cash_advances?: CashAdvance | null;
  purchasing_report_items?: PurchasingReportItem[];
}

export interface SupplierPurchaseItem {
  id?: string;
  user_id?: string;
  purchase_id?: string;
  stock_request_id?: string | null;
  material_id: string;
  material_color_id?: string | null;
  category_id: string;
  quantity: number;
  unit: string;
  conversion_rate?: number;
  is_variable_unit?: boolean;
  base_quantity?: number | null;
  unit_price: number;
  total_price: number;
  created_at?: string;
  // joined
  materials?: { id: string; name: string; unit: string } | null;
  material_colors?: { id: string; color_name: string } | null;
  transaction_categories?: { id: string; name: string } | null;
  categories?: { id: string; name: string } | null;
}

export interface SupplierPurchase {
  id: string;
  user_id?: string;
  requested_by?: string | null;
  supplier_name: string;
  payment_date: string;
  received_date?: string | null;
  status: "ordered" | "received";
  total_amount: number;
  notes?: string | null;
  payment_proof_url?: string | null;
  proof_uploaded_by?: string | null;
  proof_uploaded_at?: string | null;
  created_at?: string;
  // joined
  staff?: { id: string; name: string; role?: string | null } | null;
  proof_uploaded_by_staff?: {
    id: string;
    name: string;
    role?: string | null;
  } | null;
  supplier_purchase_items?: SupplierPurchaseItem[];
}

// ── Payroll & Piecework Types ─────────────────────────────

export interface PieceworkTask {
  id: string;
  user_id?: string;
  staff_id: string;
  order_id?: string | null;
  product_id?: string | null;
  task_type: "cutting" | "sewing" | "finishing" | "other";
  qty: number;
  rate_per_unit: number;
  total_wage: number;
  notes?: string | null;
  status: "pending" | "completed" | "paid" | "paid_manual";
  completed_at?: string | null;
  payroll_id?: string | null;
  paid_at?: string | null;
  // Kolom worklog jahit
  sewing_assignment_id?: string | null;
  // Kolom worklog potong (legacy & new)
  cutting_report_line_id?: string | null;
  order_item_id?: string | null;
  // Kolom susulan cash
  manual_paid_at?: string | null;
  manual_paid_note?: string | null;
  created_at?: string;
  // joined
  staff?: { id: string; name: string; role?: string | null } | null;
  orders?: {
    id: string;
    order_id?: string;
    customer_name?: string | null;
  } | null;
  products?: {
    id: string;
    name: string;
    cutting_cost_per_pcs?: number;
    sewing_cost_per_pcs?: number;
  } | null;
}

export interface PayrollItem {
  id?: string;
  user_id?: string;
  payroll_id?: string;
  staff_id: string;
  wage_type: "attendance" | "piecework" | "sales";
  attendance_days: number;
  daily_rate: number;
  base_amount: number;
  piecework_amount: number;
  sales_total_qty: number;
  sales_potential_bonus: number;
  sales_bonus_percentage: number;
  sales_bonus_amount: number;
  allowances: number;
  deductions: number;
  take_home_pay: number;
  notes?: string | null;
  created_at?: string;
  // joined
  staff?: Staff | null;
}

export interface WeeklyPayroll {
  id: string;
  user_id?: string;
  period_start: string;
  period_end: string;
  payment_date: string;
  total_amount: number;
  sales_target_qty: number;
  sales_below_target_scheme: "none" | "half";
  status: "draft" | "paid";
  transaction_id?: string | null;
  notes?: string | null;
  created_at?: string;
  payroll_items?: PayrollItem[];
}

// ── Worklog Jahit Types ───────────────────────────────────

export interface SewingDistributionBatch {
  id: string;
  user_id?: string;
  distributed_at: string;
  pool_qty_total: number;
  staff_count: number;
  notes?: string | null;
  distribution_mode?: 'auto' | 'manual';
  target_order_type?: 'all' | 'satuan' | 'prioritas';
  target_order_id?: string | null;
  created_at?: string;
  // joined
  sewing_assignments?: SewingAssignment[];
}

export interface SewingAssignment {
  id: string;
  user_id?: string;
  order_item_id: string;
  staff_id: string;
  batch_id?: string | null;
  assigned_qty: number;
  sewn_qty: number;
  qc_passed_qty: number;
  qc_rejected_qty: number;
  applied_sewing_rate?: number | null;
  status: "assigned" | "in_progress" | "completed";
  material_dispatched_at?: string | null;
  notes?: string | null;
  created_at?: string;
  // joined
  staff?: { id: string; name: string; role?: string | null; last_priority_assigned_at?: string | null; priority_orders_count?: number } | null;
  order_items?: {
    id: string;
    name_item: string;
    qty: number;
    ready_for_sewing_at?: string | null;
    orders?: {
      id: string;
      order_id: string;
      customer_name?: string | null;
      order_type?: string | null;
    } | null;
    products?: { id: string; name: string; sewing_cost_per_pcs: number } | null;
  } | null;
  qc_checks?: QcCheck[];
  piecework_tasks?: PieceworkTask[];
}

export interface QcCheck {
  id: string;
  user_id?: string;
  sewing_assignment_id: string;
  checked_at: string;
  passed_qty: number;
  rejected_qty: number;
  notes?: string | null;
}

// ── Worklog Potong Types (Event-Driven per-item) ───────────

export interface CuttingAssignment {
  id: string;
  user_id?: string;
  order_item_id: string;
  staff_id: string;
  assigned_at: string;
  status: "assigned" | "done";
  notes?: string | null;
  material_dispatched_at?: string | null;
  dispatch_notes?: string | null;
  force_started?: boolean;
  force_reason?: string | null;
  // joined
  order_items?: {
    id: string;
    order_id: string;
    product_id?: string | null;
    name_item: string;
    qty: number;
    cutting_completed_at?: string | null;
    cutting_qty?: number | null;
    orders?: {
      id: string;
      order_id: string;
      customer_name?: string | null;
      production_status?: string;
      order_date?: string;
      released_early_at?: string | null;
      po_batch_id?: string | null;
      po_batches?: {
        id: string;
        name: string;
        code: string;
        start_date: string;
        end_date: string;
        status: string;
      } | null;
    } | null;
    products?: {
      id: string;
      name: string;
      cutting_cost_per_pcs: number;
    } | null;
  } | null;
  staff?: { id: string; name: string; role?: string | null } | null;
}

// Deprecated (legacy weekly report models - keep for backwards compatibility)
export interface CuttingWeeklyReport {
  id: string;
  user_id?: string;
  staff_id: string;
  period_start: string;
  period_end: string;
  report_date: string;
  total_qty: number;
  status: "draft" | "confirmed";
  notes?: string | null;
  created_at?: string;
  staff?: { id: string; name: string; role?: string | null } | null;
  cutting_report_lines?: CuttingReportLine[];
}

export interface CuttingReportLine {
  id: string;
  user_id?: string;
  report_id: string;
  order_id: string;
  reported_qty: number;
  expected_qty: number;
  notes?: string | null;
  orders?: {
    id: string;
    order_id: string;
    customer_name?: string | null;
  } | null;
}

// ── Order Milestone Timeline Types (§8) ────────────────────

export type OrderStageName =
  | "quotation"
  | "rekap"
  | "potong"
  | "bordir"
  | "jahit"
  | "finishing"
  | "qc"
  | "packaging"
  | "pelunasan"
  | "kirim";

export type OrderStageStatus = "pending" | "in_progress" | "done";

export interface OrderStageEvent {
  id: string;
  user_id?: string;
  order_id: string;
  stage: OrderStageName;
  status: OrderStageStatus;
  completed_at?: string | null;
  staff_id?: string | null;
  notes?: string | null;
  updated_at?: string;
  staff?: { id: string; name: string } | null;
}

export interface StageWorkLog {
  id: string;
  user_id?: string;
  order_id: string;
  order_item_id?: string | null;
  stage: "finishing" | "qc" | "packaging";
  staff_id: string;
  qty: number;
  logged_at: string;
  notes?: string | null;
  staff?: { id: string; name: string; role?: string | null } | null;
  order_items?: { id: string; name_item: string } | null;
}

// =========================================================================
// AKUNTANSI (Fase A)
// =========================================================================

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export type ReportGroup =
  | 'current_asset'
  | 'fixed_asset'
  | 'contra_asset'
  | 'suspense'
  | 'current_liability'
  | 'equity'
  | 'revenue'
  | 'cogs'
  | 'opex'
  | 'other';

export interface Account {
  id: string;
  user_id?: string;
  code: string;
  name: string;
  account_type: AccountType;
  report_group: ReportGroup;
  is_cash?: boolean;
  cash_flow_activity?: 'operating' | 'investing' | 'financing' | null;
  is_active: boolean;
  is_system: boolean;
  description?: string | null;
  created_at?: string;
}

export interface AccountingSettings {
  user_id: string;
  enabled: boolean;
  books_start_date: string | null;
  locked_through: string | null;
  default_cash_account_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface JournalLine {
  id: string;
  entry_id: string;
  account_id: string;
  debit: number;
  credit: number;
  memo?: string | null;
  line_no: number;
  accounts?: {
    id?: string;
    code: string;
    name: string;
  } | null;
}

export interface JournalEntry {
  id: string;
  user_id?: string;
  entry_no: string;
  entry_date: string;
  description: string;
  source_type: string;
  source_id?: string | null;
  created_at: string;
  journal_lines?: JournalLine[];
}

export interface OpeningBalanceSuggestion {
  account_id: string;
  code: string;
  name: string;
  suggested_debit: number;
  suggested_credit: number;
  note: string;
}

export interface TrialBalanceRow {
  account_id: string;
  code: string;
  name: string;
  account_type: AccountType;
  report_group: string;
  opening_debit: number;
  opening_credit: number;
  period_debit: number;
  period_credit: number;
  closing_debit: number;
  closing_credit: number;
}

export interface GeneralLedgerRow {
  journal_entry_id: string;
  entry_no: string;
  entry_date: string;
  description: string;
  source_type: string;
  memo: string | null;
  debit: number;
  credit: number;
  running_balance: number;
}

// ── Financial Reports Types (Fase B) ──────────────────────

export interface ReportRow {
  account_id: string | null;
  code: string | null;
  name: string;
  amount: number;
  compare_amount: number | null;
  is_estimate?: boolean;
}

export interface ReportSection {
  key: string;
  label: string;
  rows: ReportRow[];
  total: number;
  compare_total?: number | null;
}

export interface IncomeStatementReport {
  meta: {
    from: string;
    to: string;
    compare_from?: string | null;
    compare_to?: string | null;
    status: 'locked' | 'open_estimate' | 'open_no_estimate';
    locked_through?: string | null;
    provisional: {
      applied: boolean;
      hpp_bahan: number;
      reason?: string | null;
    };
    clamped_from_books_start?: boolean;
  };
  sections: ReportSection[];
  totals: {
    gross_profit: number;
    gross_margin_pct?: number | null;
    net_profit: number;
    net_margin_pct?: number | null;
    compare_gross_profit?: number | null;
    compare_gross_margin_pct?: number | null;
    compare_net_profit?: number | null;
    compare_net_margin_pct?: number | null;
  };
}

export interface BalanceSheetReport {
  meta: {
    as_of: string;
    compare_as_of?: string | null;
    status: 'locked' | 'open_estimate' | 'open_no_estimate';
    locked_through?: string | null;
    provisional: {
      applied: boolean;
      diff: number;
    };
    balanced: boolean;
  };
  sections: ReportSection[];
  totals: {
    total_assets: number;
    total_liabilities: number;
    total_equity: number;
    total_liabilities_and_equity: number;
    difference: number;
    working_capital: number;
    current_ratio?: number | null;
  };
}

export interface CashFlowRow {
  key: string;
  name: string;
  amount: number;
  compare_amount?: number | null;
}

export interface CashFlowSection {
  key: 'operating' | 'investing' | 'financing';
  label: string;
  rows: CashFlowRow[];
  total: number;
  compare_total?: number | null;
}

export interface CashFlowReport {
  meta: {
    from: string;
    to: string;
    compare_from?: string | null;
    compare_to?: string | null;
    status: 'locked' | 'open';
    clamped_from_books_start?: boolean;
    reconciled: boolean;
  };
  sections: CashFlowSection[];
  totals: {
    net_operating: number;
    net_investing: number;
    net_financing: number;
    net_change: number;
    opening_cash: number;
    closing_cash: number;
    compare_net_operating?: number | null;
    compare_net_investing?: number | null;
    compare_net_financing?: number | null;
    compare_net_change?: number | null;
    compare_opening_cash?: number | null;
    compare_closing_cash?: number | null;
  };
}

export interface EquityChangesRow {
  key:
    | 'opening_equity'
    | 'net_profit'
    | 'capital_contributions'
    | 'drawings'
    | 'retained_earnings_adjustments'
    | 'closing_equity';
  label: string;
  amount: number;
}

export interface EquityChangesReport {
  meta: {
    from: string;
    to: string;
    status: 'locked' | 'open_estimate' | 'open_no_estimate';
    provisional?: {
      applied: boolean;
      hpp_bahan?: number;
      reason?: string | null;
    } | null;
    clamped_from_books_start?: boolean;
    reconciled: boolean;
  };
  rows: EquityChangesRow[];
  totals: {
    opening_equity: number;
    closing_equity: number;
    balance_sheet_equity: number;
    difference: number;
  };
}

export interface ReportNotesCashBankItem {
  account_id: string;
  code: string;
  name: string;
  amount: number;
}

export interface ReportNotesInventoryItem {
  id?: string;
  name: string;
  unit?: string;
  price?: number;
  stock_qty?: number;
  total_value?: number;
  color_stocks?: Array<{
    color_name: string;
    stock_qty: number;
    total_value: number;
  }>;
}

export interface ReportNotesCustomerAdvanceItem {
  order_id: string;
  order_number: string;
  customer_name: string;
  deposit_received: number;
  released: number;
  net_advance: number;
}

export interface ReportNotesEmployeeAdvanceItem {
  staff_id: string;
  staff_name: string;
  amount: number;
  count: number;
}

export interface ReportNotesFixedAssetItem {
  asset_class: string;
  label: string;
  cost: number;
  accumulated: number;
  book_value: number;
  count: number;
}

export interface ReportNotesLiabilityItem {
  account_id: string;
  code: string;
  name: string;
  amount: number;
}

export interface ReportNotesData {
  meta: {
    as_of: string;
    enabled: boolean;
    reason?: string;
  };
  cash_and_banks: {
    rows: ReportNotesCashBankItem[];
    total: number;
  };
  inventories: {
    is_estimate: boolean;
    snapshot_date?: string | null;
    rows: ReportNotesInventoryItem[];
    total: number;
  };
  customer_advances: {
    rows: ReportNotesCustomerAdvanceItem[];
    total: number;
  };
  employee_advances: {
    rows: ReportNotesEmployeeAdvanceItem[];
    total: number;
  };
  fixed_assets: {
    rows: ReportNotesFixedAssetItem[];
    totals: {
      cost: number;
      accumulated: number;
      book_value: number;
    };
  };
  liabilities: {
    rows: ReportNotesLiabilityItem[];
    total: number;
  };
}

export interface AccountingCheck {
  code: string;
  severity: 'ok' | 'warn' | 'error';
  label: string;
  expected: number;
  actual: number;
  diff: number;
  hint: string;
}

export interface DepreciationByClassPreview {
  asset_class: string;
  account_code: string;
  name: string;
  amount: number;
}

export interface ClosePreview {
  can_close: boolean;
  reason?: string | null;
  next_period_end?: string | null;
  locked_through?: string | null;
  inventory_balance: number;
  inventory_value: number;
  adjustment: number;
  depreciation?: number;
  depreciation_by_class?: DepreciationByClassPreview[];
}

// ── Fixed Assets Types (Fase C) ───────────────────────────

export type FixedAssetClass =
  | 'equipment'
  | 'vehicle'
  | 'furniture'
  | 'building'
  | 'mesin_peralatan'
  | 'kendaraan'
  | 'inventaris_perabot'
  | 'bangunan';

export type FixedAssetStatus = 'active' | 'disposed';

export interface FixedAssetRegisterItem {
  id: string;
  name: string;
  asset_class: FixedAssetClass;
  acquisition_date: string;
  cost: number;
  salvage_value: number;
  useful_life_months: number;
  status: FixedAssetStatus;
  disposed_at: string | null;
  notes: string | null;
  accumulated: number;
  book_value: number;
  depreciation_months_posted: number;
  monthly_depreciation: number;
  fully_depreciated: boolean;
  next_depreciation_period: string | null;
}

export interface FixedAssetDepreciationHistory {
  id: string;
  period: string;
  amount: number;
  journal_entry_id: string;
  entry_no?: string;
  entry_date?: string;
  created_at?: string;
}

// ── Dokumen Order Types (Surat Penawaran, Invoice, Kwitansi, Nota) ────────

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected';

export type PrintSignatureMode = 'none' | 'signature_only' | 'signature_and_stamp';

export interface QuotationItem {
  id?: string;
  quotation_id?: string;
  user_id?: string;
  sort_order: number;
  category_id?: string | null;
  product_id?: string | null;
  material_id?: string | null;
  material_color_id?: string | null;
  product_name: string;
  fabric_type?: string | null;
  fabric_color?: string | null;
  fabric_specs?: string | null;
  sewing_notes?: string | null;
  embroidery_notes?: string | null;
  print_notes?: string | null;
  size_breakdown?: Record<string, number> | null;
  qty: number;
  unit: string;
  unit_price: number;
  subtotal?: number;
  item_notes?: string | null;
  material?: {
    id: string;
    name: string;
    brand?: string | null;
    composition?: string | null;
    care_instruction?: string | null;
    description?: string | null;
  } | null;
}

export interface Quotation {
  id: string;
  user_id?: string;
  quotation_no: string;
  quotation_date: string;
  valid_until?: string | null;
  customer_name: string;
  customer_company?: string | null;
  customer_address?: string | null;
  sales_id?: string | null;
  dp_percent?: number | null;
  payment_terms?: string | null;
  lead_time?: string | null;
  bank_account_id?: string | null;
  notes?: string | null;
  status: QuotationStatus;
  order_id?: string | null;
  created_at?: string;
  updated_at?: string;
  // joined
  sales?: { id: string; name: string; phone?: string | null } | null;
  bank_account?: BankAccount | null;
  quotation_items?: QuotationItem[];
}

// ── Dokumen Order: Invoice Types (Fase 2) ───────────────────────────────────

export type InvoiceType = 'dp' | 'pelunasan' | 'penuh';
export type InvoiceSourceType = 'quotation' | 'order' | 'manual';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'cancelled';

export interface InvoiceItem {
  id?: string;
  invoice_id?: string;
  user_id?: string;
  sort_order: number;
  product_name: string;
  description?: string | null;
  qty: number;
  unit: string;
  unit_price: number;
  subtotal?: number;
}

export interface Invoice {
  id: string;
  user_id?: string;
  invoice_no: string;
  invoice_date: string;
  due_date?: string | null;
  invoice_type: InvoiceType;
  customer_name: string;
  customer_address?: string | null;
  source_type: InvoiceSourceType;
  quotation_id?: string | null;
  order_id?: string | null;
  subtotal: number;
  shipping_cost: number;
  grand_total: number;
  paid_amount: number;
  amount_due: number;
  bank_account_id?: string | null;
  notes?: string | null;
  status: InvoiceStatus;
  created_at?: string;
  updated_at?: string;
  // joined
  bank_account?: BankAccount | null;
  invoice_items?: InvoiceItem[];
  quotation?: {
    id: string;
    quotation_no: string;
  } | null;
  order?: {
    id: string;
    order_id?: string;
  } | null;
}

// ── Dokumen Order: Kwitansi & Nota Types (Fase 3) ─────────────────────────────

export interface Receipt {
  id: string;
  user_id?: string;
  receipt_no: string;
  receipt_date: string;
  order_id: string;
  payment_id: string;
  order_code: string;
  customer_name: string;
  amount: number;
  payment_type: 'dp' | 'pelunasan';
  payment_method?: string | null;
  description?: string | null;
  created_at?: string;
}

export interface NotaSnapshotItem {
  name: string;
  qty: number;
  unit_price: number;
  subtotal: number;
  description?: string | null;  // detail kain/warna/material
}

export interface NotaSnapshotPayment {
  date: string;
  type: string;
  method?: string | null;
  amount: number;
}

export interface NotaSnapshot {
  items: NotaSnapshotItem[];
  payments: NotaSnapshotPayment[];
  ongkir: number;
}

export interface Nota {
  id: string;
  user_id?: string;
  nota_no: string;
  nota_date: string;
  order_id: string;
  order_code: string;
  customer_name: string;
  grand_total: number;
  paid_amount: number;
  snapshot: NotaSnapshot;
  notes?: string | null;
  created_at?: string;
}

