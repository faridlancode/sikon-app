export type CategoryType = "income" | "expense";

export interface Category {
  id: number | string;
  name: string;
  type: CategoryType;
  user_id?: string;
}

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
  source_type: 'initial' | 'purchase' | 'order_consumption' | 'manual' | null;
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
