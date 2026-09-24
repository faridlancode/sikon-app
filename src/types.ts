export type CategoryType = "income" | "expense";

export interface TransactionCategory {
  id: string;
  name: string;
  type: CategoryType;
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
  order_id?: number | string | null;
  transaction_categories?: {
    name?: string | null;
  } | null;
  categories?: {
    name?: string | null;
  } | null;
  orders?: {
    order_id?: number | string | null;
    customer_name?: string | null;
  } | null;
}

export interface Order {
  id: number | string;
  order_date: string;
  grand_total: number | string;
  paid_amount?: number | string;
  remaining_amount?: number | string;
  total_qty?: number | string;
  status?: string;
  created_at?: string;
  customer_name?: string | null;
  [key: string]: unknown;
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
  ready_for_sewing_at?: string | null;  // diisi saat bordir selesai, item masuk pool jahit
  cutting_completed_at?: string | null; // diisi saat item selesai dipotong (event-driven)
  cutting_qty?: number | null;          // qty aktual potong
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

export interface Material {
  id: string;
  category_id: string | null;
  name: string;
  unit: string;
  price: number;
  stock_qty?: number;
  minimum_stock?: number;
  composition: string | null;
  care_instruction: string | null;
  description: string | null;
  is_active: boolean;
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
  sewing_cost_per_pcs: number;
  cutting_cost_per_pcs: number;
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
  movement_type: 'in' | 'out' | 'adjustment';
  source_type:
    | 'initial'
    | 'purchase'
    | 'order_consumption'
    | 'manual'
    | 'purchasing_report'
    | 'supplier_purchase'
    | 'adjustment'
    | null;
  source_id: string | null;
  qty: number;
  unit: string;
  notes: string | null;
  status: 'pending' | 'confirmed' | 'cancelled';
  confirmed_at: string | null;
  created_at: string;
  // joined
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
  status: 'unpaid' | 'paid';
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
  wage_type?: 'attendance' | 'piecework' | 'sales';
  daily_rate?: number;
  sales_id?: string | null;
  is_active: boolean;
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
  reason: string | null;
  status: 'pending' | 'in_progress' | 'fulfilled' | 'cancelled';
  fulfillment_type: 'spj' | 'supplier_purchase' | null;
  requested_date: string;
  fulfilled_date: string | null;
  purchasing_report_id?: string | null;
  supplier_purchase_id?: string | null;
  created_at?: string;
  // joined
  staff?: { id: string; name: string; role?: string | null } | null;
  materials?: {
    id: string;
    name: string;
    unit: string;
    stock_qty?: number;
    material_categories?: { name: string; is_fabric: boolean } | null;
  } | null;
  material_colors?: {
    id: string;
    color_name: string;
    color_code?: string | null;
  } | null;
}

export interface CashAdvance {
  id: string;
  user_id?: string;
  staff_id: string;
  amount: number;
  purpose: string | null;
  date_given: string;
  status: 'outstanding' | 'settled';
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
  unit_price: number;
  total_price: number;
  receipt_photo_url?: string | null;
  created_at?: string;
  // joined
  materials?: { id: string; name: string; unit: string } | null;
  material_colors?: { id: string; color_name: string } | null;
  transaction_categories?: { id: string; name: string } | null;
  categories?: { id: string; name: string } | null;
  stock_requests?: { id: string; quantity_needed: number; unit: string; reason?: string | null } | null;
}

export interface PurchasingReport {
  id: string;
  user_id?: string;
  staff_id: string;
  cash_advance_id?: string | null;
  report_date: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  total_amount: number;
  service_fee?: number | null;  // Biaya jasa belanja / transport (opsional)
  notes?: string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  created_at?: string;
  // joined
  staff?: { id: string; name: string; phone?: string | null; role?: string | null } | null;
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
  status: 'ordered' | 'received';
  total_amount: number;
  notes?: string | null;
  created_at?: string;
  // joined
  staff?: { id: string; name: string; role?: string | null } | null;
  supplier_purchase_items?: SupplierPurchaseItem[];
}

// ── Payroll & Piecework Types ─────────────────────────────

export interface PieceworkTask {
  id: string;
  user_id?: string;
  staff_id: string;
  order_id?: string | null;
  product_id?: string | null;
  task_type: 'cutting' | 'sewing' | 'finishing' | 'other';
  qty: number;
  rate_per_unit: number;
  total_wage: number;
  notes?: string | null;
  status: 'pending' | 'completed' | 'paid' | 'paid_manual';
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
  orders?: { id: string; order_id?: string; customer_name?: string | null } | null;
  products?: { id: string; name: string; cutting_cost_per_pcs?: number; sewing_cost_per_pcs?: number } | null;
}

export interface PayrollItem {
  id?: string;
  user_id?: string;
  payroll_id?: string;
  staff_id: string;
  wage_type: 'attendance' | 'piecework' | 'sales';
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
  sales_below_target_scheme: 'none' | 'half';
  status: 'draft' | 'paid';
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
  status: 'assigned' | 'in_progress' | 'completed';
  created_at?: string;
  // joined
  staff?: { id: string; name: string; role?: string | null } | null;
  order_items?: {
    id: string;
    name_item: string;
    qty: number;
    ready_for_sewing_at?: string | null;
    orders?: { id: string; order_id: string; customer_name?: string | null } | null;
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
  status: 'assigned' | 'done';
  notes?: string | null;
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
  status: 'draft' | 'confirmed';
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
  orders?: { id: string; order_id: string; customer_name?: string | null } | null;
}

// ── Order Milestone Timeline Types (§8) ────────────────────

export type OrderStageName =
  | 'quotation'
  | 'rekap'
  | 'potong'
  | 'bordir'
  | 'jahit'
  | 'finishing'
  | 'qc'
  | 'packaging'
  | 'pelunasan'
  | 'kirim';

export type OrderStageStatus = 'pending' | 'in_progress' | 'done';

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
  stage: 'finishing' | 'qc' | 'packaging';
  staff_id: string;
  qty: number;
  logged_at: string;
  notes?: string | null;
  staff?: { id: string; name: string; role?: string | null } | null;
  order_items?: { id: string; name_item: string } | null;
}

