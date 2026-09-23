export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      cash_advances: {
        Row: {
          amount: number
          created_at: string | null
          date_given: string
          id: string
          purpose: string | null
          staff_id: string
          status: string
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          date_given?: string
          id?: string
          purpose?: string | null
          staff_id: string
          status?: string
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          date_given?: string
          id?: string
          purpose?: string | null
          staff_id?: string
          status?: string
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_advances_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_advances_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_categories: {
        Row: {
          created_at: string | null
          id: string
          name: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      company_bank_accounts: {
        Row: {
          account_holder_name: string
          account_number: string
          bank_name: string
          created_at: string | null
          id: string
          is_primary: boolean
          user_id: string
        }
        Insert: {
          account_holder_name: string
          account_number: string
          bank_name: string
          created_at?: string | null
          id?: string
          is_primary?: boolean
          user_id: string
        }
        Update: {
          account_holder_name?: string
          account_number?: string
          bank_name?: string
          created_at?: string | null
          id?: string
          is_primary?: boolean
          user_id?: string
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          address: string | null
          company_name: string | null
          logo_url: string | null
          phone: string | null
          saldo_awal: number
          signature_url: string | null
          stamp_url: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          company_name?: string | null
          logo_url?: string | null
          phone?: string | null
          saldo_awal?: number
          signature_url?: string | null
          stamp_url?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          company_name?: string | null
          logo_url?: string | null
          phone?: string | null
          saldo_awal?: number
          signature_url?: string | null
          stamp_url?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      material_categories: {
        Row: {
          created_at: string | null
          id: string
          is_fabric: boolean
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_fabric?: boolean
          name: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_fabric?: boolean
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      material_colors: {
        Row: {
          color_code: string | null
          color_name: string
          created_at: string | null
          id: string
          is_active: boolean
          material_id: string
          minimum_stock: number
          stock_qty: number
          user_id: string
        }
        Insert: {
          color_code?: string | null
          color_name: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          material_id: string
          minimum_stock?: number
          stock_qty?: number
          user_id: string
        }
        Update: {
          color_code?: string | null
          color_name?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          material_id?: string
          minimum_stock?: number
          stock_qty?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_colors_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          care_instruction: string | null
          category_id: string | null
          composition: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean
          minimum_stock: number
          name: string
          price: number
          stock_qty: number
          unit: string
          user_id: string
        }
        Insert: {
          care_instruction?: string | null
          category_id?: string | null
          composition?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          minimum_stock?: number
          name: string
          price?: number
          stock_qty?: number
          unit: string
          user_id: string
        }
        Update: {
          care_instruction?: string | null
          category_id?: string | null
          composition?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          minimum_stock?: number
          name?: string
          price?: number
          stock_qty?: number
          unit?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "material_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_fabrics: {
        Row: {
          created_at: string | null
          id: string
          line_cost_snapshot: number
          material_color_id: string | null
          material_id: string
          order_item_id: string
          price_snapshot: number
          product_fabric_slot_id: string | null
          usage_qty_snapshot: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          line_cost_snapshot: number
          material_color_id?: string | null
          material_id: string
          order_item_id: string
          price_snapshot: number
          product_fabric_slot_id?: string | null
          usage_qty_snapshot: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          line_cost_snapshot?: number
          material_color_id?: string | null
          material_id?: string
          order_item_id?: string
          price_snapshot?: number
          product_fabric_slot_id?: string | null
          usage_qty_snapshot?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_item_fabrics_material_color_id_fkey"
            columns: ["material_color_id"]
            isOneToOne: false
            referencedRelation: "material_colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_fabrics_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_fabrics_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_fabrics_product_fabric_slot_id_fkey"
            columns: ["product_fabric_slot_id"]
            isOneToOne: false
            referencedRelation: "product_fabric_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          bahan: string | null
          category_id: string | null
          created_at: string | null
          embroidery_cost_per_unit: number
          embroidery_details: Json | null
          hpp_per_unit_snapshot: number | null
          hpp_total_snapshot: number | null
          id: string
          name_item: string
          order_id: string
          price: number
          product_id: string | null
          qty: number
          total_price: number
          user_id: string
        }
        Insert: {
          bahan?: string | null
          category_id?: string | null
          created_at?: string | null
          embroidery_cost_per_unit?: number
          embroidery_details?: Json | null
          hpp_per_unit_snapshot?: number | null
          hpp_total_snapshot?: number | null
          id?: string
          name_item: string
          order_id: string
          price?: number
          product_id?: string | null
          qty?: number
          total_price?: number
          user_id: string
        }
        Update: {
          bahan?: string | null
          category_id?: string | null
          created_at?: string | null
          embroidery_cost_per_unit?: number
          embroidery_details?: Json | null
          hpp_per_unit_snapshot?: number | null
          hpp_total_snapshot?: number | null
          id?: string
          name_item?: string
          order_id?: string
          price?: number
          product_id?: string | null
          qty?: number
          total_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_with_balance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payments: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          order_id: string
          payment_date: string
          payment_method: string | null
          payment_type: string
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          order_id: string
          payment_date?: string
          payment_method?: string | null
          payment_type: string
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          order_id?: string
          payment_date?: string
          payment_method?: string | null
          payment_type?: string
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_with_balance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          bonus_paid: boolean
          created_at: string | null
          customer_name: string
          id: string
          ongkir: number
          order_date: string
          order_id: string
          production_status: string
          sales_id: string | null
          status: string
          total_price: number
          user_id: string
        }
        Insert: {
          bonus_paid?: boolean
          created_at?: string | null
          customer_name: string
          id?: string
          ongkir?: number
          order_date?: string
          order_id: string
          production_status?: string
          sales_id?: string | null
          status?: string
          total_price?: number
          user_id: string
        }
        Update: {
          bonus_paid?: boolean
          created_at?: string | null
          customer_name?: string
          id?: string
          ongkir?: number
          order_date?: string
          order_id?: string
          production_status?: string
          sales_id?: string | null
          status?: string
          total_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "sales_performance"
            referencedColumns: ["sales_id"]
          },
        ]
      }
      payroll_items: {
        Row: {
          allowances: number
          attendance_days: number
          base_amount: number
          created_at: string | null
          daily_rate: number
          deductions: number
          id: string
          notes: string | null
          payroll_id: string
          piecework_amount: number
          sales_bonus_amount: number
          sales_bonus_percentage: number
          sales_potential_bonus: number
          sales_total_qty: number
          staff_id: string
          take_home_pay: number
          user_id: string
          wage_type: string
        }
        Insert: {
          allowances?: number
          attendance_days?: number
          base_amount?: number
          created_at?: string | null
          daily_rate?: number
          deductions?: number
          id?: string
          notes?: string | null
          payroll_id: string
          piecework_amount?: number
          sales_bonus_amount?: number
          sales_bonus_percentage?: number
          sales_potential_bonus?: number
          sales_total_qty?: number
          staff_id: string
          take_home_pay?: number
          user_id: string
          wage_type: string
        }
        Update: {
          allowances?: number
          attendance_days?: number
          base_amount?: number
          created_at?: string | null
          daily_rate?: number
          deductions?: number
          id?: string
          notes?: string | null
          payroll_id?: string
          piecework_amount?: number
          sales_bonus_amount?: number
          sales_bonus_percentage?: number
          sales_potential_bonus?: number
          sales_total_qty?: number
          staff_id?: string
          take_home_pay?: number
          user_id?: string
          wage_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_items_payroll_id_fkey"
            columns: ["payroll_id"]
            isOneToOne: false
            referencedRelation: "weekly_payrolls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      piecework_tasks: {
        Row: {
          completed_at: string | null
          created_at: string | null
          id: string
          notes: string | null
          order_id: string | null
          paid_at: string | null
          payroll_id: string | null
          product_id: string | null
          qty: number
          rate_per_unit: number
          staff_id: string
          status: string
          task_type: string
          total_wage: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          paid_at?: string | null
          payroll_id?: string | null
          product_id?: string | null
          qty: number
          rate_per_unit: number
          staff_id: string
          status?: string
          task_type: string
          total_wage: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          paid_at?: string | null
          payroll_id?: string | null
          product_id?: string | null
          qty?: number
          rate_per_unit?: number
          staff_id?: string
          status?: string
          task_type?: string
          total_wage?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "piecework_tasks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piecework_tasks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_with_balance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piecework_tasks_payroll_id_fkey"
            columns: ["payroll_id"]
            isOneToOne: false
            referencedRelation: "weekly_payrolls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piecework_tasks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piecework_tasks_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      product_fabric_slots: {
        Row: {
          created_at: string | null
          fabric_category_id: string | null
          id: string
          label: string
          product_id: string
          unit: string
          usage_qty: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          fabric_category_id?: string | null
          id?: string
          label?: string
          product_id: string
          unit?: string
          usage_qty: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          fabric_category_id?: string | null
          id?: string
          label?: string
          product_id?: string
          unit?: string
          usage_qty?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_fabric_slots_fabric_category_id_fkey"
            columns: ["fabric_category_id"]
            isOneToOne: false
            referencedRelation: "material_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_fabric_slots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_materials: {
        Row: {
          created_at: string | null
          id: string
          material_id: string
          product_id: string
          quantity: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          material_id: string
          product_id: string
          quantity: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          material_id?: string
          product_id?: string
          quantity?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_materials_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_materials_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          created_at: string | null
          cutting_cost_per_pcs: number
          default_price: number
          description: string | null
          id: string
          is_active: boolean
          name: string
          sales_bonus_per_pcs: number
          sewing_cost_per_pcs: number
          user_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          cutting_cost_per_pcs?: number
          default_price?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sales_bonus_per_pcs?: number
          sewing_cost_per_pcs?: number
          user_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          cutting_cost_per_pcs?: number
          default_price?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sales_bonus_per_pcs?: number
          sewing_cost_per_pcs?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      purchasing_report_items: {
        Row: {
          category_id: string | null
          created_at: string | null
          description: string | null
          id: string
          material_color_id: string | null
          material_id: string | null
          quantity: number
          receipt_photo_url: string | null
          report_id: string
          stock_request_id: string | null
          supplier_name: string | null
          total_price: number
          unit: string
          unit_price: number
          user_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          material_color_id?: string | null
          material_id?: string | null
          quantity: number
          receipt_photo_url?: string | null
          report_id: string
          stock_request_id?: string | null
          supplier_name?: string | null
          total_price: number
          unit: string
          unit_price: number
          user_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          material_color_id?: string | null
          material_id?: string | null
          quantity?: number
          receipt_photo_url?: string | null
          report_id?: string
          stock_request_id?: string | null
          supplier_name?: string | null
          total_price?: number
          unit?: string
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchasing_report_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "transaction_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchasing_report_items_material_color_id_fkey"
            columns: ["material_color_id"]
            isOneToOne: false
            referencedRelation: "material_colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchasing_report_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchasing_report_items_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "purchasing_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchasing_report_items_stock_request_id_fkey"
            columns: ["stock_request_id"]
            isOneToOne: false
            referencedRelation: "stock_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      purchasing_reports: {
        Row: {
          approved_at: string | null
          cash_advance_id: string | null
          created_at: string | null
          id: string
          notes: string | null
          report_date: string
          service_fee: number
          staff_id: string
          status: string
          submitted_at: string | null
          total_amount: number
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          cash_advance_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          report_date?: string
          service_fee?: number
          staff_id: string
          status?: string
          submitted_at?: string | null
          total_amount?: number
          user_id: string
        }
        Update: {
          approved_at?: string | null
          cash_advance_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          report_date?: string
          service_fee?: number
          staff_id?: string
          status?: string
          submitted_at?: string | null
          total_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchasing_reports_cash_advance_id_fkey"
            columns: ["cash_advance_id"]
            isOneToOne: false
            referencedRelation: "cash_advances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchasing_reports_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          created_at: string | null
          daily_rate: number
          id: string
          is_active: boolean
          name: string
          phone: string | null
          role: string | null
          sales_id: string | null
          user_id: string
          wage_type: string
        }
        Insert: {
          created_at?: string | null
          daily_rate?: number
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          role?: string | null
          sales_id?: string | null
          user_id: string
          wage_type?: string
        }
        Update: {
          created_at?: string | null
          daily_rate?: number
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          role?: string | null
          sales_id?: string | null
          user_id?: string
          wage_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "sales_performance"
            referencedColumns: ["sales_id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          confirmed_at: string | null
          created_at: string | null
          id: string
          material_color_id: string | null
          material_id: string
          movement_type: string
          notes: string | null
          qty: number
          source_id: string | null
          source_type: string | null
          status: string
          unit: string
          user_id: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string | null
          id?: string
          material_color_id?: string | null
          material_id: string
          movement_type: string
          notes?: string | null
          qty: number
          source_id?: string | null
          source_type?: string | null
          status?: string
          unit: string
          user_id: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string | null
          id?: string
          material_color_id?: string | null
          material_id?: string
          movement_type?: string
          notes?: string | null
          qty?: number
          source_id?: string | null
          source_type?: string | null
          status?: string
          unit?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_material_color_id_fkey"
            columns: ["material_color_id"]
            isOneToOne: false
            referencedRelation: "material_colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_requests: {
        Row: {
          created_at: string | null
          fulfilled_date: string | null
          fulfillment_type: string | null
          id: string
          material_color_id: string | null
          material_id: string
          purchasing_report_id: string | null
          quantity_needed: number
          reason: string | null
          requested_by: string | null
          requested_date: string
          status: string
          supplier_purchase_id: string | null
          unit: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          fulfilled_date?: string | null
          fulfillment_type?: string | null
          id?: string
          material_color_id?: string | null
          material_id: string
          purchasing_report_id?: string | null
          quantity_needed: number
          reason?: string | null
          requested_by?: string | null
          requested_date?: string
          status?: string
          supplier_purchase_id?: string | null
          unit: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          fulfilled_date?: string | null
          fulfillment_type?: string | null
          id?: string
          material_color_id?: string | null
          material_id?: string
          purchasing_report_id?: string | null
          quantity_needed?: number
          reason?: string | null
          requested_by?: string | null
          requested_date?: string
          status?: string
          supplier_purchase_id?: string | null
          unit?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_requests_material_color_id_fkey"
            columns: ["material_color_id"]
            isOneToOne: false
            referencedRelation: "material_colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_requests_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_requests_purchasing_report_id_fkey"
            columns: ["purchasing_report_id"]
            isOneToOne: false
            referencedRelation: "purchasing_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_requests_supplier_purchase_id_fkey"
            columns: ["supplier_purchase_id"]
            isOneToOne: false
            referencedRelation: "supplier_purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_purchase_items: {
        Row: {
          category_id: string | null
          created_at: string | null
          id: string
          material_color_id: string | null
          material_id: string
          purchase_id: string
          quantity: number
          stock_request_id: string | null
          total_price: number
          unit: string
          unit_price: number
          user_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          id?: string
          material_color_id?: string | null
          material_id: string
          purchase_id: string
          quantity: number
          stock_request_id?: string | null
          total_price: number
          unit: string
          unit_price: number
          user_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          id?: string
          material_color_id?: string | null
          material_id?: string
          purchase_id?: string
          quantity?: number
          stock_request_id?: string | null
          total_price?: number
          unit?: string
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_purchase_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "transaction_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_items_material_color_id_fkey"
            columns: ["material_color_id"]
            isOneToOne: false
            referencedRelation: "material_colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "supplier_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_items_stock_request_id_fkey"
            columns: ["stock_request_id"]
            isOneToOne: false
            referencedRelation: "stock_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_purchases: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          payment_date: string
          received_date: string | null
          requested_by: string | null
          status: string
          supplier_name: string
          total_amount: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          received_date?: string | null
          requested_by?: string | null
          status?: string
          supplier_name: string
          total_amount?: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          received_date?: string | null
          requested_by?: string | null
          status?: string
          supplier_name?: string
          total_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_purchases_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string | null
          description: string | null
          id: string
          order_id: string | null
          title: string
          transaction_date: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          order_id?: string | null
          title: string
          transaction_date?: string
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          order_id?: string | null
          title?: string
          transaction_date?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "transaction_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_with_balance"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_payrolls: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          payment_date: string
          period_end: string
          period_start: string
          sales_below_target_scheme: string
          sales_target_qty: number
          status: string
          total_amount: number
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_date: string
          period_end: string
          period_start: string
          sales_below_target_scheme?: string
          sales_target_qty?: number
          status?: string
          total_amount?: number
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          period_end?: string
          period_start?: string
          sales_below_target_scheme?: string
          sales_target_qty?: number
          status?: string
          total_amount?: number
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_payrolls_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      orders_with_balance: {
        Row: {
          bonus_paid: boolean | null
          created_at: string | null
          customer_name: string | null
          grand_total: number | null
          id: string | null
          ongkir: number | null
          order_date: string | null
          order_id: string | null
          paid_amount: number | null
          production_status: string | null
          remaining_amount: number | null
          sales_id: string | null
          sales_name: string | null
          status: string | null
          total_price: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "sales_performance"
            referencedColumns: ["sales_id"]
          },
        ]
      }
      sales_performance: {
        Row: {
          is_active: boolean | null
          sales_id: string | null
          sales_name: string | null
          total_orders: number | null
          total_outstanding: number | null
          total_paid: number | null
          total_revenue: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      approve_purchasing_report: {
        Args: { p_report_id: string }
        Returns: undefined
      }
      cancel_stock_movement: {
        Args: { p_movement_id: string }
        Returns: undefined
      }
      confirm_stock_movement: {
        Args: { p_movement_id: string }
        Returns: undefined
      }
      create_supplier_purchase: {
        Args: {
          p_items: Json
          p_payment_date: string
          p_requested_by: string
          p_supplier_name: string
        }
        Returns: {
          created_at: string | null
          id: string
          notes: string | null
          payment_date: string
          received_date: string | null
          requested_by: string | null
          status: string
          supplier_name: string
          total_amount: number
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "supplier_purchases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_order_payment: {
        Args: { p_payment_id: string }
        Returns: undefined
      }
      give_cash_advance: {
        Args: {
          p_amount: number
          p_date?: string
          p_purpose?: string
          p_staff_id: string
        }
        Returns: {
          amount: number
          created_at: string | null
          date_given: string
          id: string
          purpose: string | null
          staff_id: string
          status: string
          transaction_id: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_advances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pay_weekly_payroll: { Args: { p_payroll_id: string }; Returns: Json }
      receive_supplier_purchase: {
        Args: { p_purchase_id: string }
        Returns: undefined
      }
      recompute_order_status: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      record_order_payment: {
        Args: {
          p_amount: number
          p_category_id?: string
          p_order_id: string
          p_payment_date?: string
          p_payment_method?: string
          p_payment_type: string
        }
        Returns: {
          amount: number
          created_at: string | null
          id: string
          order_id: string
          payment_date: string
          payment_method: string | null
          payment_type: string
          transaction_id: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "order_payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_purchasing_report: {
        Args: { p_reason?: string; p_report_id: string }
        Returns: undefined
      }
      update_owner_email: { Args: { p_new_email: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
