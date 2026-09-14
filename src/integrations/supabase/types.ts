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
      categories: {
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
      company_settings: {
        Row: {
          saldo_awal: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          saldo_awal?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          saldo_awal?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          bahan: string | null
          created_at: string | null
          id: string
          name_item: string
          order_id: string
          price: number
          qty: number
          total_price: number
          user_id: string
        }
        Insert: {
          bahan?: string | null
          created_at?: string | null
          id?: string
          name_item: string
          order_id: string
          price?: number
          qty?: number
          total_price?: number
          user_id: string
        }
        Update: {
          bahan?: string | null
          created_at?: string | null
          id?: string
          name_item?: string
          order_id?: string
          price?: number
          qty?: number
          total_price?: number
          user_id?: string
        }
        Relationships: [
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
          created_at: string | null
          customer_name: string
          id: string
          ongkir: number
          order_date: string
          order_id: string
          sales_id: string | null
          status: string
          total_price: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          customer_name: string
          id?: string
          ongkir?: number
          order_date?: string
          order_id: string
          sales_id?: string | null
          status?: string
          total_price?: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          customer_name?: string
          id?: string
          ongkir?: number
          order_date?: string
          order_id?: string
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
            referencedRelation: "categories"
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
    }
    Views: {
      orders_with_balance: {
        Row: {
          created_at: string | null
          customer_name: string | null
          grand_total: number | null
          id: string | null
          ongkir: number | null
          order_date: string | null
          order_id: string | null
          paid_amount: number | null
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
      delete_order_payment: {
        Args: { p_payment_id: string }
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
