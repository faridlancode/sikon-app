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

export interface OrderItem {
  id?: number | string;
  order_id?: number | string;
  product_name?: string;
  quantity?: number;
  price?: number | string;
  subtotal?: number | string;
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
