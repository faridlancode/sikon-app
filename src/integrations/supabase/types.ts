
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "accounting_settings": {
                  Row: {
                    "books_start_date": string | null,"created_at": string,"default_cash_account_id": string | null,"enabled": boolean,"id": string,"locked_through": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "books_start_date"?: string | null,"created_at"?: string,"default_cash_account_id"?: string | null,"enabled"?: boolean,"id"?: string,"locked_through"?: string | null,"user_id": string
                  }
                  Update: {
                    "books_start_date"?: string | null,"created_at"?: string,"default_cash_account_id"?: string | null,"enabled"?: boolean,"id"?: string,"locked_through"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "accounting_settings_default_cash_account_id_fkey"
      columns: ["default_cash_account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    }
                  ]
                },"accounts": {
                  Row: {
                    "account_type": string,"cash_flow_activity": string,"code": string,"created_at": string,"id": string,"is_active": boolean,"is_cash": boolean,"is_system": boolean,"name": string,"report_group": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_type": string,"cash_flow_activity"?: string,"code": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_cash"?: boolean,"is_system"?: boolean,"name": string,"report_group": string,"user_id": string
                  }
                  Update: {
                    "account_type"?: string,"cash_flow_activity"?: string,"code"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_cash"?: boolean,"is_system"?: boolean,"name"?: string,"report_group"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"cash_advances": {
                  Row: {
                    "amount": number,"created_at": string | null,"date_given": string,"id": string,"purpose": string | null,"staff_id": string,"status": string,"transaction_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string | null,"date_given"?: string,"id"?: string,"purpose"?: string | null,"staff_id": string,"status"?: string,"transaction_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string | null,"date_given"?: string,"id"?: string,"purpose"?: string | null,"staff_id"?: string,"status"?: string,"transaction_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cash_advances_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_advances_transaction_id_fkey"
      columns: ["transaction_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id"]
    }
                  ]
                },"company_bank_accounts": {
                  Row: {
                    "account_holder_name": string,"account_number": string,"bank_name": string,"created_at": string | null,"id": string,"is_primary": boolean,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_holder_name": string,"account_number": string,"bank_name": string,"created_at"?: string | null,"id"?: string,"is_primary"?: boolean,"user_id": string
                  }
                  Update: {
                    "account_holder_name"?: string,"account_number"?: string,"bank_name"?: string,"created_at"?: string | null,"id"?: string,"is_primary"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"company_settings": {
                  Row: {
                    "address": string | null,"company_name": string | null,"logo_url": string | null,"phone": string | null,"po_gate_production": boolean,"saldo_awal": number,"sewing_satuan_surcharge": number,"signature_url": string | null,"stamp_url": string | null,"updated_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"company_name"?: string | null,"logo_url"?: string | null,"phone"?: string | null,"po_gate_production"?: boolean,"saldo_awal"?: number,"sewing_satuan_surcharge"?: number,"signature_url"?: string | null,"stamp_url"?: string | null,"updated_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "address"?: string | null,"company_name"?: string | null,"logo_url"?: string | null,"phone"?: string | null,"po_gate_production"?: boolean,"saldo_awal"?: number,"sewing_satuan_surcharge"?: number,"signature_url"?: string | null,"stamp_url"?: string | null,"updated_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"cutting_assignments": {
                  Row: {
                    "assigned_at": string,"dispatch_notes": string | null,"force_reason": string | null,"force_started": boolean,"id": string,"material_dispatched_at": string | null,"notes": string | null,"order_id": string | null,"order_item_id": string,"staff_id": string,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_at"?: string,"dispatch_notes"?: string | null,"force_reason"?: string | null,"force_started"?: boolean,"id"?: string,"material_dispatched_at"?: string | null,"notes"?: string | null,"order_id"?: string | null,"order_item_id": string,"staff_id": string,"status"?: string,"user_id": string
                  }
                  Update: {
                    "assigned_at"?: string,"dispatch_notes"?: string | null,"force_reason"?: string | null,"force_started"?: boolean,"id"?: string,"material_dispatched_at"?: string | null,"notes"?: string | null,"order_id"?: string | null,"order_item_id"?: string,"staff_id"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cutting_assignments_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: true
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cutting_assignments_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"cutting_report_lines": {
                  Row: {
                    "expected_qty": number,"id": string,"notes": string | null,"order_id": string,"report_id": string,"reported_qty": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "expected_qty": number,"id"?: string,"notes"?: string | null,"order_id": string,"report_id": string,"reported_qty": number,"user_id": string
                  }
                  Update: {
                    "expected_qty"?: number,"id"?: string,"notes"?: string | null,"order_id"?: string,"report_id"?: string,"reported_qty"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cutting_report_lines_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cutting_report_lines_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders_with_balance"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cutting_report_lines_report_id_fkey"
      columns: ["report_id"]
isOneToOne: false
      referencedRelation: "cutting_weekly_reports"
      referencedColumns: ["id"]
    }
                  ]
                },"cutting_weekly_reports": {
                  Row: {
                    "created_at": string,"id": string,"notes": string | null,"period_end": string,"period_start": string,"report_date": string,"staff_id": string,"status": string,"total_qty": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"notes"?: string | null,"period_end": string,"period_start": string,"report_date"?: string,"staff_id": string,"status"?: string,"total_qty"?: number,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"notes"?: string | null,"period_end"?: string,"period_start"?: string,"report_date"?: string,"staff_id"?: string,"status"?: string,"total_qty"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cutting_weekly_reports_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"document_counters": {
                  Row: {
                    "doc_type": string,"last_seq": number,"user_id": string,"year_month": string
                  }
                  ComputedFields: never
                  Insert: {
                    "doc_type": string,"last_seq"?: number,"user_id": string,"year_month": string
                  }
                  Update: {
                    "doc_type"?: string,"last_seq"?: number,"user_id"?: string,"year_month"?: string
                  }
                  Relationships: [
                    
                  ]
                },"fixed_asset_depreciations": {
                  Row: {
                    "amount": number,"asset_id": string,"created_at": string,"id": string,"journal_entry_id": string,"period": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"asset_id": string,"created_at"?: string,"id"?: string,"journal_entry_id": string,"period": string,"user_id": string
                  }
                  Update: {
                    "amount"?: number,"asset_id"?: string,"created_at"?: string,"id"?: string,"journal_entry_id"?: string,"period"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fixed_asset_depreciations_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: false
      referencedRelation: "fixed_assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fixed_asset_depreciations_journal_entry_id_fkey"
      columns: ["journal_entry_id"]
isOneToOne: false
      referencedRelation: "journal_entries"
      referencedColumns: ["id"]
    }
                  ]
                },"fixed_assets": {
                  Row: {
                    "accumulated_account_id": string,"accumulated_at_start": number,"acquisition_date": string,"acquisition_transaction_id": string | null,"asset_account_id": string,"asset_class": string,"cost": number,"created_at": string,"disposal_transaction_id": string | null,"disposed_at": string | null,"expense_account_id": string,"id": string,"name": string,"notes": string | null,"salvage_value": number,"status": string,"useful_life_months": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accumulated_account_id": string,"accumulated_at_start"?: number,"acquisition_date": string,"acquisition_transaction_id"?: string | null,"asset_account_id": string,"asset_class": string,"cost": number,"created_at"?: string,"disposal_transaction_id"?: string | null,"disposed_at"?: string | null,"expense_account_id": string,"id"?: string,"name": string,"notes"?: string | null,"salvage_value"?: number,"status"?: string,"useful_life_months": number,"user_id": string
                  }
                  Update: {
                    "accumulated_account_id"?: string,"accumulated_at_start"?: number,"acquisition_date"?: string,"acquisition_transaction_id"?: string | null,"asset_account_id"?: string,"asset_class"?: string,"cost"?: number,"created_at"?: string,"disposal_transaction_id"?: string | null,"disposed_at"?: string | null,"expense_account_id"?: string,"id"?: string,"name"?: string,"notes"?: string | null,"salvage_value"?: number,"status"?: string,"useful_life_months"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fixed_assets_accumulated_account_id_fkey"
      columns: ["accumulated_account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fixed_assets_acquisition_transaction_id_fkey"
      columns: ["acquisition_transaction_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fixed_assets_asset_account_id_fkey"
      columns: ["asset_account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fixed_assets_disposal_transaction_id_fkey"
      columns: ["disposal_transaction_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fixed_assets_expense_account_id_fkey"
      columns: ["expense_account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    }
                  ]
                },"inventory_valuations": {
                  Row: {
                    "created_at": string,"detail": Json | null,"id": string,"journal_entry_id": string | null,"period_end": string,"total_value": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"detail"?: Json | null,"id"?: string,"journal_entry_id"?: string | null,"period_end": string,"total_value": number,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"detail"?: Json | null,"id"?: string,"journal_entry_id"?: string | null,"period_end"?: string,"total_value"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_valuations_journal_entry_id_fkey"
      columns: ["journal_entry_id"]
isOneToOne: false
      referencedRelation: "journal_entries"
      referencedColumns: ["id"]
    }
                  ]
                },"invoice_items": {
                  Row: {
                    "description": string | null,"id": string,"invoice_id": string,"product_name": string,"qty": number,"sort_order": number,"subtotal": number | null,"unit": string,"unit_price": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string | null,"id"?: string,"invoice_id": string,"product_name": string,"qty"?: number,"sort_order"?: number,"subtotal"?: never,"unit"?: string,"unit_price"?: number,"user_id": string
                  }
                  Update: {
                    "description"?: string | null,"id"?: string,"invoice_id"?: string,"product_name"?: string,"qty"?: number,"sort_order"?: number,"subtotal"?: never,"unit"?: string,"unit_price"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoice_items_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    }
                  ]
                },"invoices": {
                  Row: {
                    "amount_due": number,"bank_account_id": string | null,"created_at": string,"customer_address": string | null,"customer_name": string,"due_date": string | null,"grand_total": number | null,"id": string,"invoice_date": string,"invoice_no": string,"invoice_type": string,"notes": string | null,"order_id": string | null,"paid_amount": number,"quotation_id": string | null,"shipping_cost": number,"source_type": string,"status": string,"subtotal": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_due"?: number,"bank_account_id"?: string | null,"created_at"?: string,"customer_address"?: string | null,"customer_name": string,"due_date"?: string | null,"grand_total"?: never,"id"?: string,"invoice_date"?: string,"invoice_no": string,"invoice_type"?: string,"notes"?: string | null,"order_id"?: string | null,"paid_amount"?: number,"quotation_id"?: string | null,"shipping_cost"?: number,"source_type"?: string,"status"?: string,"subtotal"?: number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "amount_due"?: number,"bank_account_id"?: string | null,"created_at"?: string,"customer_address"?: string | null,"customer_name"?: string,"due_date"?: string | null,"grand_total"?: never,"id"?: string,"invoice_date"?: string,"invoice_no"?: string,"invoice_type"?: string,"notes"?: string | null,"order_id"?: string | null,"paid_amount"?: number,"quotation_id"?: string | null,"shipping_cost"?: number,"source_type"?: string,"status"?: string,"subtotal"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_bank_account_id_fkey"
      columns: ["bank_account_id"]
isOneToOne: false
      referencedRelation: "company_bank_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders_with_balance"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_quotation_id_fkey"
      columns: ["quotation_id"]
isOneToOne: false
      referencedRelation: "quotations"
      referencedColumns: ["id"]
    }
                  ]
                },"journal_entries": {
                  Row: {
                    "created_at": string,"description": string,"entry_date": string,"entry_no": string,"id": string,"reverses_entry_id": string | null,"source_id": string | null,"source_type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description": string,"entry_date": string,"entry_no": string,"id"?: string,"reverses_entry_id"?: string | null,"source_id"?: string | null,"source_type": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"entry_date"?: string,"entry_no"?: string,"id"?: string,"reverses_entry_id"?: string | null,"source_id"?: string | null,"source_type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "journal_entries_reverses_entry_id_fkey"
      columns: ["reverses_entry_id"]
isOneToOne: false
      referencedRelation: "journal_entries"
      referencedColumns: ["id"]
    }
                  ]
                },"journal_lines": {
                  Row: {
                    "account_id": string,"created_at": string,"credit": number,"debit": number,"entry_id": string,"id": string,"line_no": number,"memo": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"created_at"?: string,"credit"?: number,"debit"?: number,"entry_id": string,"id"?: string,"line_no": number,"memo"?: string | null
                  }
                  Update: {
                    "account_id"?: string,"created_at"?: string,"credit"?: number,"debit"?: number,"entry_id"?: string,"id"?: string,"line_no"?: number,"memo"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "journal_lines_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_lines_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "journal_entries"
      referencedColumns: ["id"]
    }
                  ]
                },"material_categories": {
                  Row: {
                    "created_at": string | null,"id": string,"is_fabric": boolean,"name": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"id"?: string,"is_fabric"?: boolean,"name": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"id"?: string,"is_fabric"?: boolean,"name"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"material_colors": {
                  Row: {
                    "color_code": string | null,"color_name": string,"created_at": string | null,"id": string,"is_active": boolean,"material_id": string,"minimum_stock": number,"stock_qty": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color_code"?: string | null,"color_name": string,"created_at"?: string | null,"id"?: string,"is_active"?: boolean,"material_id": string,"minimum_stock"?: number,"stock_qty"?: number,"user_id": string
                  }
                  Update: {
                    "color_code"?: string | null,"color_name"?: string,"created_at"?: string | null,"id"?: string,"is_active"?: boolean,"material_id"?: string,"minimum_stock"?: number,"stock_qty"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_colors_material_id_fkey"
      columns: ["material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["id"]
    }
                  ]
                },"material_defect_returns": {
                  Row: {
                    "created_at": string,"defect_reason": string,"disposition": string,"id": string,"is_replaced": boolean,"material_color_id": string | null,"material_id": string,"order_id": string | null,"qty": number,"received_by": string,"replacement_movement_id": string | null,"sewing_assignment_id": string | null,"staff_id": string,"unit": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"defect_reason": string,"disposition"?: string,"id"?: string,"is_replaced"?: boolean,"material_color_id"?: string | null,"material_id": string,"order_id"?: string | null,"qty": number,"received_by": string,"replacement_movement_id"?: string | null,"sewing_assignment_id"?: string | null,"staff_id": string,"unit": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"defect_reason"?: string,"disposition"?: string,"id"?: string,"is_replaced"?: boolean,"material_color_id"?: string | null,"material_id"?: string,"order_id"?: string | null,"qty"?: number,"received_by"?: string,"replacement_movement_id"?: string | null,"sewing_assignment_id"?: string | null,"staff_id"?: string,"unit"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_defect_returns_material_color_id_fkey"
      columns: ["material_color_id"]
isOneToOne: false
      referencedRelation: "material_colors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_defect_returns_material_id_fkey"
      columns: ["material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_defect_returns_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_defect_returns_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders_with_balance"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_defect_returns_received_by_fkey"
      columns: ["received_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_defect_returns_replacement_movement_id_fkey"
      columns: ["replacement_movement_id"]
isOneToOne: false
      referencedRelation: "stock_movements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_defect_returns_sewing_assignment_id_fkey"
      columns: ["sewing_assignment_id"]
isOneToOne: false
      referencedRelation: "sewing_assignments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_defect_returns_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"materials": {
                  Row: {
                    "brand": string | null,"care_instruction": string | null,"category_id": string | null,"composition": string | null,"conversion_rate": number,"created_at": string | null,"description": string | null,"id": string,"is_active": boolean,"is_floor_stock": boolean,"minimum_stock": number,"name": string,"price": number,"purchase_unit": string | null,"purchase_units": NonNullable<Json>,"scrap_qty": number,"stock_qty": number,"unit": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand"?: string | null,"care_instruction"?: string | null,"category_id"?: string | null,"composition"?: string | null,"conversion_rate"?: number,"created_at"?: string | null,"description"?: string | null,"id"?: string,"is_active"?: boolean,"is_floor_stock"?: boolean,"minimum_stock"?: number,"name": string,"price"?: number,"purchase_unit"?: string | null,"purchase_units"?: NonNullable<Json>,"scrap_qty"?: number,"stock_qty"?: number,"unit": string,"user_id": string
                  }
                  Update: {
                    "brand"?: string | null,"care_instruction"?: string | null,"category_id"?: string | null,"composition"?: string | null,"conversion_rate"?: number,"created_at"?: string | null,"description"?: string | null,"id"?: string,"is_active"?: boolean,"is_floor_stock"?: boolean,"minimum_stock"?: number,"name"?: string,"price"?: number,"purchase_unit"?: string | null,"purchase_units"?: NonNullable<Json>,"scrap_qty"?: number,"stock_qty"?: number,"unit"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "materials_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "material_categories"
      referencedColumns: ["id"]
    }
                  ]
                },"notas": {
                  Row: {
                    "created_at": string,"customer_name": string,"grand_total": number,"id": string,"nota_date": string,"nota_no": string,"notes": string | null,"order_code": string,"order_id": string,"paid_amount": number,"snapshot": NonNullable<Json>,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"customer_name": string,"grand_total": number,"id"?: string,"nota_date"?: string,"nota_no": string,"notes"?: string | null,"order_code": string,"order_id": string,"paid_amount": number,"snapshot": NonNullable<Json>,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"customer_name"?: string,"grand_total"?: number,"id"?: string,"nota_date"?: string,"nota_no"?: string,"notes"?: string | null,"order_code"?: string,"order_id"?: string,"paid_amount"?: number,"snapshot"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notas_order_id_fkey"
      columns: ["order_id"]
isOneToOne: true
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notas_order_id_fkey"
      columns: ["order_id"]
isOneToOne: true
      referencedRelation: "orders_with_balance"
      referencedColumns: ["id"]
    }
                  ]
                },"order_deposit_releases": {
                  Row: {
                    "amount": number,"created_at": string,"id": string,"kind": string,"notes": string | null,"order_id": string,"payment_method": string | null,"release_date": string,"transaction_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"id"?: string,"kind": string,"notes"?: string | null,"order_id": string,"payment_method"?: string | null,"release_date"?: string,"transaction_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"id"?: string,"kind"?: string,"notes"?: string | null,"order_id"?: string,"payment_method"?: string | null,"release_date"?: string,"transaction_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_deposit_releases_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_deposit_releases_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders_with_balance"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_deposit_releases_transaction_id_fkey"
      columns: ["transaction_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id"]
    }
                  ]
                },"order_item_fabrics": {
                  Row: {
                    "created_at": string | null,"id": string,"line_cost_snapshot": number,"material_color_id": string | null,"material_id": string,"order_item_id": string,"price_snapshot": number,"product_fabric_slot_id": string | null,"usage_qty_snapshot": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"id"?: string,"line_cost_snapshot": number,"material_color_id"?: string | null,"material_id": string,"order_item_id": string,"price_snapshot": number,"product_fabric_slot_id"?: string | null,"usage_qty_snapshot": number,"user_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"id"?: string,"line_cost_snapshot"?: number,"material_color_id"?: string | null,"material_id"?: string,"order_item_id"?: string,"price_snapshot"?: number,"product_fabric_slot_id"?: string | null,"usage_qty_snapshot"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_item_fabrics_material_color_id_fkey"
      columns: ["material_color_id"]
isOneToOne: false
      referencedRelation: "material_colors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_item_fabrics_material_id_fkey"
      columns: ["material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_item_fabrics_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_item_fabrics_product_fabric_slot_id_fkey"
      columns: ["product_fabric_slot_id"]
isOneToOne: false
      referencedRelation: "product_fabric_slots"
      referencedColumns: ["id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "bahan": string | null,"category_id": string | null,"created_at": string | null,"cutting_completed_at": string | null,"cutting_qty": number | null,"embroidery_cost_per_unit": number,"embroidery_details": Json | null,"hpp_per_unit_snapshot": number | null,"hpp_total_snapshot": number | null,"id": string,"name_item": string,"order_id": string,"price": number,"product_id": string | null,"qty": number,"ready_for_sewing_at": string | null,"total_price": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bahan"?: string | null,"category_id"?: string | null,"created_at"?: string | null,"cutting_completed_at"?: string | null,"cutting_qty"?: number | null,"embroidery_cost_per_unit"?: number,"embroidery_details"?: Json | null,"hpp_per_unit_snapshot"?: number | null,"hpp_total_snapshot"?: number | null,"id"?: string,"name_item": string,"order_id": string,"price"?: number,"product_id"?: string | null,"qty"?: number,"ready_for_sewing_at"?: string | null,"total_price"?: number,"user_id": string
                  }
                  Update: {
                    "bahan"?: string | null,"category_id"?: string | null,"created_at"?: string | null,"cutting_completed_at"?: string | null,"cutting_qty"?: number | null,"embroidery_cost_per_unit"?: number,"embroidery_details"?: Json | null,"hpp_per_unit_snapshot"?: number | null,"hpp_total_snapshot"?: number | null,"id"?: string,"name_item"?: string,"order_id"?: string,"price"?: number,"product_id"?: string | null,"qty"?: number,"ready_for_sewing_at"?: string | null,"total_price"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "product_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders_with_balance"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"order_payments": {
                  Row: {
                    "amount": number,"created_at": string | null,"id": string,"order_id": string,"payment_date": string,"payment_method": string | null,"payment_type": string,"transaction_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string | null,"id"?: string,"order_id": string,"payment_date"?: string,"payment_method"?: string | null,"payment_type": string,"transaction_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string | null,"id"?: string,"order_id"?: string,"payment_date"?: string,"payment_method"?: string | null,"payment_type"?: string,"transaction_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_payments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_payments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders_with_balance"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_payments_transaction_id_fkey"
      columns: ["transaction_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id"]
    }
                  ]
                },"order_stage_events": {
                  Row: {
                    "completed_at": string | null,"id": string,"notes": string | null,"order_id": string,"staff_id": string | null,"stage": string,"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"id"?: string,"notes"?: string | null,"order_id": string,"staff_id"?: string | null,"stage": string,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "completed_at"?: string | null,"id"?: string,"notes"?: string | null,"order_id"?: string,"staff_id"?: string | null,"stage"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_stage_events_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_stage_events_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders_with_balance"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_stage_events_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "bonus_paid": boolean,"created_at": string | null,"customer_name": string,"id": string,"is_order_type_manual_override": boolean,"ongkir": number,"order_date": string,"order_id": string,"order_type": string,"po_batch_id": string,"production_status": string,"released_early_at": string | null,"sales_id": string | null,"status": string,"total_price": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bonus_paid"?: boolean,"created_at"?: string | null,"customer_name": string,"id"?: string,"is_order_type_manual_override"?: boolean,"ongkir"?: number,"order_date"?: string,"order_id": string,"order_type"?: string,"po_batch_id": string,"production_status"?: string,"released_early_at"?: string | null,"sales_id"?: string | null,"status"?: string,"total_price"?: number,"user_id": string
                  }
                  Update: {
                    "bonus_paid"?: boolean,"created_at"?: string | null,"customer_name"?: string,"id"?: string,"is_order_type_manual_override"?: boolean,"ongkir"?: number,"order_date"?: string,"order_id"?: string,"order_type"?: string,"po_batch_id"?: string,"production_status"?: string,"released_early_at"?: string | null,"sales_id"?: string | null,"status"?: string,"total_price"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_po_batch_id_fkey"
      columns: ["po_batch_id"]
isOneToOne: false
      referencedRelation: "po_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_sales_id_fkey"
      columns: ["sales_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_sales_id_fkey"
      columns: ["sales_id"]
isOneToOne: false
      referencedRelation: "sales_performance"
      referencedColumns: ["sales_id"]
    }
                  ]
                },"payroll_items": {
                  Row: {
                    "allowances": number,"attendance_days": number,"base_amount": number,"created_at": string | null,"daily_rate": number,"deductions": number,"id": string,"notes": string | null,"payroll_id": string,"piecework_amount": number,"sales_bonus_amount": number,"sales_bonus_percentage": number,"sales_potential_bonus": number,"sales_total_qty": number,"staff_id": string,"take_home_pay": number,"user_id": string,"wage_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allowances"?: number,"attendance_days"?: number,"base_amount"?: number,"created_at"?: string | null,"daily_rate"?: number,"deductions"?: number,"id"?: string,"notes"?: string | null,"payroll_id": string,"piecework_amount"?: number,"sales_bonus_amount"?: number,"sales_bonus_percentage"?: number,"sales_potential_bonus"?: number,"sales_total_qty"?: number,"staff_id": string,"take_home_pay"?: number,"user_id": string,"wage_type": string
                  }
                  Update: {
                    "allowances"?: number,"attendance_days"?: number,"base_amount"?: number,"created_at"?: string | null,"daily_rate"?: number,"deductions"?: number,"id"?: string,"notes"?: string | null,"payroll_id"?: string,"piecework_amount"?: number,"sales_bonus_amount"?: number,"sales_bonus_percentage"?: number,"sales_potential_bonus"?: number,"sales_total_qty"?: number,"staff_id"?: string,"take_home_pay"?: number,"user_id"?: string,"wage_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payroll_items_payroll_id_fkey"
      columns: ["payroll_id"]
isOneToOne: false
      referencedRelation: "weekly_payrolls"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payroll_items_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"piecework_tasks": {
                  Row: {
                    "completed_at": string | null,"created_at": string | null,"cutting_report_line_id": string | null,"id": string,"manual_paid_at": string | null,"manual_paid_note": string | null,"notes": string | null,"order_id": string | null,"order_item_id": string | null,"paid_at": string | null,"payroll_id": string | null,"product_id": string | null,"qty": number,"rate_per_unit": number,"sewing_assignment_id": string | null,"staff_id": string,"status": string,"task_type": string,"total_wage": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"created_at"?: string | null,"cutting_report_line_id"?: string | null,"id"?: string,"manual_paid_at"?: string | null,"manual_paid_note"?: string | null,"notes"?: string | null,"order_id"?: string | null,"order_item_id"?: string | null,"paid_at"?: string | null,"payroll_id"?: string | null,"product_id"?: string | null,"qty": number,"rate_per_unit": number,"sewing_assignment_id"?: string | null,"staff_id": string,"status"?: string,"task_type": string,"total_wage": number,"user_id": string
                  }
                  Update: {
                    "completed_at"?: string | null,"created_at"?: string | null,"cutting_report_line_id"?: string | null,"id"?: string,"manual_paid_at"?: string | null,"manual_paid_note"?: string | null,"notes"?: string | null,"order_id"?: string | null,"order_item_id"?: string | null,"paid_at"?: string | null,"payroll_id"?: string | null,"product_id"?: string | null,"qty"?: number,"rate_per_unit"?: number,"sewing_assignment_id"?: string | null,"staff_id"?: string,"status"?: string,"task_type"?: string,"total_wage"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "piecework_tasks_cutting_report_line_id_fkey"
      columns: ["cutting_report_line_id"]
isOneToOne: false
      referencedRelation: "cutting_report_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "piecework_tasks_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "piecework_tasks_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders_with_balance"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "piecework_tasks_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "piecework_tasks_payroll_id_fkey"
      columns: ["payroll_id"]
isOneToOne: false
      referencedRelation: "weekly_payrolls"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "piecework_tasks_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "piecework_tasks_sewing_assignment_id_fkey"
      columns: ["sewing_assignment_id"]
isOneToOne: false
      referencedRelation: "sewing_assignments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "piecework_tasks_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"po_batch_events": {
                  Row: {
                    "created_at": string,"event": string,"id": string,"payload": Json | null,"po_batch_id": string,"reason": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event": string,"id"?: string,"payload"?: Json | null,"po_batch_id": string,"reason"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"event"?: string,"id"?: string,"payload"?: Json | null,"po_batch_id"?: string,"reason"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "po_batch_events_po_batch_id_fkey"
      columns: ["po_batch_id"]
isOneToOne: false
      referencedRelation: "po_batches"
      referencedColumns: ["id"]
    }
                  ]
                },"po_batches": {
                  Row: {
                    "close_early_reason": string | null,"close_note": string | null,"close_snapshot": Json | null,"closed_at": string | null,"closed_by": string | null,"code": string,"created_at": string,"end_date": string,"id": string,"is_legacy": boolean,"name": string,"note": string | null,"period_month": number,"period_year": number,"quota_qty": number | null,"reopen_count": number,"seq_in_month": number | null,"start_date": string,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "close_early_reason"?: string | null,"close_note"?: string | null,"close_snapshot"?: Json | null,"closed_at"?: string | null,"closed_by"?: string | null,"code": string,"created_at"?: string,"end_date": string,"id"?: string,"is_legacy"?: boolean,"name": string,"note"?: string | null,"period_month": number,"period_year": number,"quota_qty"?: number | null,"reopen_count"?: number,"seq_in_month"?: number | null,"start_date": string,"status"?: string,"user_id": string
                  }
                  Update: {
                    "close_early_reason"?: string | null,"close_note"?: string | null,"close_snapshot"?: Json | null,"closed_at"?: string | null,"closed_by"?: string | null,"code"?: string,"created_at"?: string,"end_date"?: string,"id"?: string,"is_legacy"?: boolean,"name"?: string,"note"?: string | null,"period_month"?: number,"period_year"?: number,"quota_qty"?: number | null,"reopen_count"?: number,"seq_in_month"?: number | null,"start_date"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"product_categories": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"product_fabric_slots": {
                  Row: {
                    "created_at": string | null,"fabric_category_id": string | null,"id": string,"label": string,"product_id": string,"unit": string,"usage_qty": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"fabric_category_id"?: string | null,"id"?: string,"label"?: string,"product_id": string,"unit"?: string,"usage_qty": number,"user_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"fabric_category_id"?: string | null,"id"?: string,"label"?: string,"product_id"?: string,"unit"?: string,"usage_qty"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_fabric_slots_fabric_category_id_fkey"
      columns: ["fabric_category_id"]
isOneToOne: false
      referencedRelation: "material_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_fabric_slots_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_materials": {
                  Row: {
                    "created_at": string | null,"id": string,"material_id": string,"product_id": string,"quantity": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"id"?: string,"material_id": string,"product_id": string,"quantity": number,"user_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"id"?: string,"material_id"?: string,"product_id"?: string,"quantity"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_materials_material_id_fkey"
      columns: ["material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_materials_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "category_id": string | null,"consumables_allowance": number,"created_at": string | null,"cutting_cost_per_pcs": number,"default_price": number,"description": string | null,"id": string,"is_active": boolean,"name": string,"price_prioritas": number | null,"price_satuan": number | null,"sales_bonus_per_pcs": number,"sewing_cost_per_pcs": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id"?: string | null,"consumables_allowance"?: number,"created_at"?: string | null,"cutting_cost_per_pcs"?: number,"default_price"?: number,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"price_prioritas"?: number | null,"price_satuan"?: number | null,"sales_bonus_per_pcs"?: number,"sewing_cost_per_pcs"?: number,"user_id": string
                  }
                  Update: {
                    "category_id"?: string | null,"consumables_allowance"?: number,"created_at"?: string | null,"cutting_cost_per_pcs"?: number,"default_price"?: number,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"price_prioritas"?: number | null,"price_satuan"?: number | null,"sales_bonus_per_pcs"?: number,"sewing_cost_per_pcs"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "product_categories"
      referencedColumns: ["id"]
    }
                  ]
                },"purchasing_report_items": {
                  Row: {
                    "base_quantity": number | null,"category_id": string | null,"conversion_rate": number,"created_at": string | null,"description": string | null,"id": string,"is_variable_unit": boolean,"material_color_id": string | null,"material_id": string | null,"quantity": number,"receipt_photo_url": string | null,"report_id": string,"stock_request_id": string | null,"supplier_name": string | null,"total_price": number,"unit": string,"unit_price": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base_quantity"?: number | null,"category_id"?: string | null,"conversion_rate"?: number,"created_at"?: string | null,"description"?: string | null,"id"?: string,"is_variable_unit"?: boolean,"material_color_id"?: string | null,"material_id"?: string | null,"quantity": number,"receipt_photo_url"?: string | null,"report_id": string,"stock_request_id"?: string | null,"supplier_name"?: string | null,"total_price": number,"unit": string,"unit_price": number,"user_id": string
                  }
                  Update: {
                    "base_quantity"?: number | null,"category_id"?: string | null,"conversion_rate"?: number,"created_at"?: string | null,"description"?: string | null,"id"?: string,"is_variable_unit"?: boolean,"material_color_id"?: string | null,"material_id"?: string | null,"quantity"?: number,"receipt_photo_url"?: string | null,"report_id"?: string,"stock_request_id"?: string | null,"supplier_name"?: string | null,"total_price"?: number,"unit"?: string,"unit_price"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchasing_report_items_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "transaction_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchasing_report_items_material_color_id_fkey"
      columns: ["material_color_id"]
isOneToOne: false
      referencedRelation: "material_colors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchasing_report_items_material_id_fkey"
      columns: ["material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchasing_report_items_report_id_fkey"
      columns: ["report_id"]
isOneToOne: false
      referencedRelation: "purchasing_reports"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchasing_report_items_stock_request_id_fkey"
      columns: ["stock_request_id"]
isOneToOne: false
      referencedRelation: "stock_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"purchasing_reports": {
                  Row: {
                    "approved_at": string | null,"cash_advance_id": string | null,"created_at": string | null,"id": string,"notes": string | null,"received_at": string | null,"received_by": string | null,"report_date": string,"service_fee": number,"staff_id": string,"status": string,"submitted_at": string | null,"total_amount": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"cash_advance_id"?: string | null,"created_at"?: string | null,"id"?: string,"notes"?: string | null,"received_at"?: string | null,"received_by"?: string | null,"report_date"?: string,"service_fee"?: number,"staff_id": string,"status"?: string,"submitted_at"?: string | null,"total_amount"?: number,"user_id": string
                  }
                  Update: {
                    "approved_at"?: string | null,"cash_advance_id"?: string | null,"created_at"?: string | null,"id"?: string,"notes"?: string | null,"received_at"?: string | null,"received_by"?: string | null,"report_date"?: string,"service_fee"?: number,"staff_id"?: string,"status"?: string,"submitted_at"?: string | null,"total_amount"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchasing_reports_cash_advance_id_fkey"
      columns: ["cash_advance_id"]
isOneToOne: false
      referencedRelation: "cash_advances"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchasing_reports_received_by_fkey"
      columns: ["received_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchasing_reports_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"qc_checks": {
                  Row: {
                    "checked_at": string,"id": string,"notes": string | null,"passed_qty": number,"rejected_qty": number,"sewing_assignment_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "checked_at"?: string,"id"?: string,"notes"?: string | null,"passed_qty"?: number,"rejected_qty"?: number,"sewing_assignment_id": string,"user_id": string
                  }
                  Update: {
                    "checked_at"?: string,"id"?: string,"notes"?: string | null,"passed_qty"?: number,"rejected_qty"?: number,"sewing_assignment_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "qc_checks_sewing_assignment_id_fkey"
      columns: ["sewing_assignment_id"]
isOneToOne: false
      referencedRelation: "sewing_assignments"
      referencedColumns: ["id"]
    }
                  ]
                },"quotation_items": {
                  Row: {
                    "category_id": string | null,"embroidery_notes": string | null,"fabric_color": string | null,"fabric_specs": string | null,"fabric_type": string | null,"id": string,"item_notes": string | null,"material_color_id": string | null,"material_id": string | null,"print_notes": string | null,"product_id": string | null,"product_name": string,"qty": number,"quotation_id": string,"sewing_notes": string | null,"size_breakdown": Json | null,"sort_order": number,"subtotal": number | null,"unit": string,"unit_price": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id"?: string | null,"embroidery_notes"?: string | null,"fabric_color"?: string | null,"fabric_specs"?: string | null,"fabric_type"?: string | null,"id"?: string,"item_notes"?: string | null,"material_color_id"?: string | null,"material_id"?: string | null,"print_notes"?: string | null,"product_id"?: string | null,"product_name": string,"qty"?: number,"quotation_id": string,"sewing_notes"?: string | null,"size_breakdown"?: Json | null,"sort_order"?: number,"subtotal"?: never,"unit"?: string,"unit_price"?: number,"user_id": string
                  }
                  Update: {
                    "category_id"?: string | null,"embroidery_notes"?: string | null,"fabric_color"?: string | null,"fabric_specs"?: string | null,"fabric_type"?: string | null,"id"?: string,"item_notes"?: string | null,"material_color_id"?: string | null,"material_id"?: string | null,"print_notes"?: string | null,"product_id"?: string | null,"product_name"?: string,"qty"?: number,"quotation_id"?: string,"sewing_notes"?: string | null,"size_breakdown"?: Json | null,"sort_order"?: number,"subtotal"?: never,"unit"?: string,"unit_price"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quotation_items_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "product_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotation_items_material_color_id_fkey"
      columns: ["material_color_id"]
isOneToOne: false
      referencedRelation: "material_colors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotation_items_material_id_fkey"
      columns: ["material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotation_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotation_items_quotation_id_fkey"
      columns: ["quotation_id"]
isOneToOne: false
      referencedRelation: "quotations"
      referencedColumns: ["id"]
    }
                  ]
                },"quotations": {
                  Row: {
                    "bank_account_id": string | null,"created_at": string,"customer_address": string | null,"customer_company": string | null,"customer_name": string,"dp_percent": number | null,"id": string,"lead_time": string | null,"notes": string | null,"order_id": string | null,"payment_terms": string | null,"quotation_date": string,"quotation_no": string,"sales_id": string | null,"status": string,"updated_at": string,"user_id": string,"valid_until": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bank_account_id"?: string | null,"created_at"?: string,"customer_address"?: string | null,"customer_company"?: string | null,"customer_name": string,"dp_percent"?: number | null,"id"?: string,"lead_time"?: string | null,"notes"?: string | null,"order_id"?: string | null,"payment_terms"?: string | null,"quotation_date"?: string,"quotation_no": string,"sales_id"?: string | null,"status"?: string,"updated_at"?: string,"user_id": string,"valid_until"?: string | null
                  }
                  Update: {
                    "bank_account_id"?: string | null,"created_at"?: string,"customer_address"?: string | null,"customer_company"?: string | null,"customer_name"?: string,"dp_percent"?: number | null,"id"?: string,"lead_time"?: string | null,"notes"?: string | null,"order_id"?: string | null,"payment_terms"?: string | null,"quotation_date"?: string,"quotation_no"?: string,"sales_id"?: string | null,"status"?: string,"updated_at"?: string,"user_id"?: string,"valid_until"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "quotations_bank_account_id_fkey"
      columns: ["bank_account_id"]
isOneToOne: false
      referencedRelation: "company_bank_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotations_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotations_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders_with_balance"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotations_sales_id_fkey"
      columns: ["sales_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotations_sales_id_fkey"
      columns: ["sales_id"]
isOneToOne: false
      referencedRelation: "sales_performance"
      referencedColumns: ["sales_id"]
    }
                  ]
                },"receipts": {
                  Row: {
                    "amount": number,"created_at": string,"customer_name": string,"description": string | null,"id": string,"order_code": string,"order_id": string,"payment_id": string,"payment_method": string | null,"payment_type": string,"receipt_date": string,"receipt_no": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"customer_name": string,"description"?: string | null,"id"?: string,"order_code": string,"order_id": string,"payment_id": string,"payment_method"?: string | null,"payment_type": string,"receipt_date": string,"receipt_no": string,"user_id": string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"customer_name"?: string,"description"?: string | null,"id"?: string,"order_code"?: string,"order_id"?: string,"payment_id"?: string,"payment_method"?: string | null,"payment_type"?: string,"receipt_date"?: string,"receipt_no"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "receipts_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "receipts_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders_with_balance"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "receipts_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: true
      referencedRelation: "order_payments"
      referencedColumns: ["id"]
    }
                  ]
                },"sales": {
                  Row: {
                    "created_at": string | null,"id": string,"is_active": boolean,"name": string,"phone": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"phone"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"phone"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"sewing_assignments": {
                  Row: {
                    "applied_sewing_rate": number | null,"assigned_qty": number,"batch_id": string | null,"created_at": string,"id": string,"material_dispatched_at": string | null,"notes": string | null,"order_item_id": string,"qc_passed_qty": number,"qc_rejected_qty": number,"sewn_qty": number,"staff_id": string,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "applied_sewing_rate"?: number | null,"assigned_qty": number,"batch_id"?: string | null,"created_at"?: string,"id"?: string,"material_dispatched_at"?: string | null,"notes"?: string | null,"order_item_id": string,"qc_passed_qty"?: number,"qc_rejected_qty"?: number,"sewn_qty"?: number,"staff_id": string,"status"?: string,"user_id": string
                  }
                  Update: {
                    "applied_sewing_rate"?: number | null,"assigned_qty"?: number,"batch_id"?: string | null,"created_at"?: string,"id"?: string,"material_dispatched_at"?: string | null,"notes"?: string | null,"order_item_id"?: string,"qc_passed_qty"?: number,"qc_rejected_qty"?: number,"sewn_qty"?: number,"staff_id"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sewing_assignments_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "sewing_distribution_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sewing_assignments_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sewing_assignments_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"sewing_distribution_batches": {
                  Row: {
                    "created_at": string,"distributed_at": string,"distribution_mode": string,"id": string,"notes": string | null,"pool_qty_total": number,"staff_count": number,"target_order_id": string | null,"target_order_type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"distributed_at"?: string,"distribution_mode"?: string,"id"?: string,"notes"?: string | null,"pool_qty_total": number,"staff_count": number,"target_order_id"?: string | null,"target_order_type"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"distributed_at"?: string,"distribution_mode"?: string,"id"?: string,"notes"?: string | null,"pool_qty_total"?: number,"staff_count"?: number,"target_order_id"?: string | null,"target_order_type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sewing_distribution_batches_target_order_id_fkey"
      columns: ["target_order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sewing_distribution_batches_target_order_id_fkey"
      columns: ["target_order_id"]
isOneToOne: false
      referencedRelation: "orders_with_balance"
      referencedColumns: ["id"]
    }
                  ]
                },"staff": {
                  Row: {
                    "created_at": string | null,"daily_rate": number,"id": string,"is_active": boolean,"last_priority_assigned_at": string | null,"name": string,"phone": string | null,"priority_orders_count": number,"role": string | null,"sales_id": string | null,"user_id": string,"wage_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"daily_rate"?: number,"id"?: string,"is_active"?: boolean,"last_priority_assigned_at"?: string | null,"name": string,"phone"?: string | null,"priority_orders_count"?: number,"role"?: string | null,"sales_id"?: string | null,"user_id": string,"wage_type"?: string
                  }
                  Update: {
                    "created_at"?: string | null,"daily_rate"?: number,"id"?: string,"is_active"?: boolean,"last_priority_assigned_at"?: string | null,"name"?: string,"phone"?: string | null,"priority_orders_count"?: number,"role"?: string | null,"sales_id"?: string | null,"user_id"?: string,"wage_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_sales_id_fkey"
      columns: ["sales_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_sales_id_fkey"
      columns: ["sales_id"]
isOneToOne: false
      referencedRelation: "sales_performance"
      referencedColumns: ["sales_id"]
    }
                  ]
                },"stage_work_logs": {
                  Row: {
                    "id": string,"logged_at": string,"notes": string | null,"order_id": string,"order_item_id": string | null,"qty": number,"staff_id": string,"stage": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"logged_at"?: string,"notes"?: string | null,"order_id": string,"order_item_id"?: string | null,"qty": number,"staff_id": string,"stage": string,"user_id": string
                  }
                  Update: {
                    "id"?: string,"logged_at"?: string,"notes"?: string | null,"order_id"?: string,"order_item_id"?: string | null,"qty"?: number,"staff_id"?: string,"stage"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stage_work_logs_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stage_work_logs_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders_with_balance"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stage_work_logs_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stage_work_logs_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_movements": {
                  Row: {
                    "confirmed_at": string | null,"created_at": string | null,"cutting_assignment_id": string | null,"id": string,"material_color_id": string | null,"material_id": string,"movement_type": string,"notes": string | null,"qty": number,"recorded_by": string | null,"sewing_assignment_id": string | null,"source_id": string | null,"source_line_id": string | null,"source_type": string | null,"status": string,"taken_by": string | null,"unit": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "confirmed_at"?: string | null,"created_at"?: string | null,"cutting_assignment_id"?: string | null,"id"?: string,"material_color_id"?: string | null,"material_id": string,"movement_type": string,"notes"?: string | null,"qty": number,"recorded_by"?: string | null,"sewing_assignment_id"?: string | null,"source_id"?: string | null,"source_line_id"?: string | null,"source_type"?: string | null,"status"?: string,"taken_by"?: string | null,"unit": string,"user_id": string
                  }
                  Update: {
                    "confirmed_at"?: string | null,"created_at"?: string | null,"cutting_assignment_id"?: string | null,"id"?: string,"material_color_id"?: string | null,"material_id"?: string,"movement_type"?: string,"notes"?: string | null,"qty"?: number,"recorded_by"?: string | null,"sewing_assignment_id"?: string | null,"source_id"?: string | null,"source_line_id"?: string | null,"source_type"?: string | null,"status"?: string,"taken_by"?: string | null,"unit"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_movements_cutting_assignment_id_fkey"
      columns: ["cutting_assignment_id"]
isOneToOne: false
      referencedRelation: "cutting_assignments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_material_color_id_fkey"
      columns: ["material_color_id"]
isOneToOne: false
      referencedRelation: "material_colors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_material_id_fkey"
      columns: ["material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_sewing_assignment_id_fkey"
      columns: ["sewing_assignment_id"]
isOneToOne: false
      referencedRelation: "sewing_assignments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_taken_by_fkey"
      columns: ["taken_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_requests": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"batch_id": string | null,"conversion_rate": number,"created_at": string | null,"estimated_price": number | null,"fulfilled_date": string | null,"fulfillment_type": string,"goods_received_at": string | null,"id": string,"is_variable_unit": boolean,"material_color_id": string | null,"material_id": string,"po_batch_id": string | null,"preferred_store": string | null,"purchasing_report_id": string | null,"quantity_needed": number,"reason": string | null,"rejected_reason": string | null,"requested_by": string | null,"requested_date": string,"source_order_id": string | null,"source_order_item_id": string | null,"source_type": string,"status": string,"supplier_purchase_id": string | null,"unit": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"batch_id"?: string | null,"conversion_rate"?: number,"created_at"?: string | null,"estimated_price"?: number | null,"fulfilled_date"?: string | null,"fulfillment_type"?: string,"goods_received_at"?: string | null,"id"?: string,"is_variable_unit"?: boolean,"material_color_id"?: string | null,"material_id": string,"po_batch_id"?: string | null,"preferred_store"?: string | null,"purchasing_report_id"?: string | null,"quantity_needed": number,"reason"?: string | null,"rejected_reason"?: string | null,"requested_by"?: string | null,"requested_date"?: string,"source_order_id"?: string | null,"source_order_item_id"?: string | null,"source_type"?: string,"status"?: string,"supplier_purchase_id"?: string | null,"unit": string,"user_id": string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"batch_id"?: string | null,"conversion_rate"?: number,"created_at"?: string | null,"estimated_price"?: number | null,"fulfilled_date"?: string | null,"fulfillment_type"?: string,"goods_received_at"?: string | null,"id"?: string,"is_variable_unit"?: boolean,"material_color_id"?: string | null,"material_id"?: string,"po_batch_id"?: string | null,"preferred_store"?: string | null,"purchasing_report_id"?: string | null,"quantity_needed"?: number,"reason"?: string | null,"rejected_reason"?: string | null,"requested_by"?: string | null,"requested_date"?: string,"source_order_id"?: string | null,"source_order_item_id"?: string | null,"source_type"?: string,"status"?: string,"supplier_purchase_id"?: string | null,"unit"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_requests_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_requests_material_color_id_fkey"
      columns: ["material_color_id"]
isOneToOne: false
      referencedRelation: "material_colors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_requests_material_id_fkey"
      columns: ["material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_requests_po_batch_id_fkey"
      columns: ["po_batch_id"]
isOneToOne: false
      referencedRelation: "po_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_requests_purchasing_report_id_fkey"
      columns: ["purchasing_report_id"]
isOneToOne: false
      referencedRelation: "purchasing_reports"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_requests_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_requests_source_order_id_fkey"
      columns: ["source_order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_requests_source_order_id_fkey"
      columns: ["source_order_id"]
isOneToOne: false
      referencedRelation: "orders_with_balance"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_requests_source_order_item_id_fkey"
      columns: ["source_order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_requests_supplier_purchase_id_fkey"
      columns: ["supplier_purchase_id"]
isOneToOne: false
      referencedRelation: "supplier_purchases"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_purchase_items": {
                  Row: {
                    "base_quantity": number | null,"category_id": string | null,"conversion_rate": number,"created_at": string | null,"id": string,"is_variable_unit": boolean,"material_color_id": string | null,"material_id": string,"purchase_id": string,"quantity": number,"stock_request_id": string | null,"total_price": number,"unit": string,"unit_price": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base_quantity"?: number | null,"category_id"?: string | null,"conversion_rate"?: number,"created_at"?: string | null,"id"?: string,"is_variable_unit"?: boolean,"material_color_id"?: string | null,"material_id": string,"purchase_id": string,"quantity": number,"stock_request_id"?: string | null,"total_price": number,"unit": string,"unit_price": number,"user_id": string
                  }
                  Update: {
                    "base_quantity"?: number | null,"category_id"?: string | null,"conversion_rate"?: number,"created_at"?: string | null,"id"?: string,"is_variable_unit"?: boolean,"material_color_id"?: string | null,"material_id"?: string,"purchase_id"?: string,"quantity"?: number,"stock_request_id"?: string | null,"total_price"?: number,"unit"?: string,"unit_price"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_purchase_items_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "transaction_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_purchase_items_material_color_id_fkey"
      columns: ["material_color_id"]
isOneToOne: false
      referencedRelation: "material_colors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_purchase_items_material_id_fkey"
      columns: ["material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_purchase_items_purchase_id_fkey"
      columns: ["purchase_id"]
isOneToOne: false
      referencedRelation: "supplier_purchases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_purchase_items_stock_request_id_fkey"
      columns: ["stock_request_id"]
isOneToOne: false
      referencedRelation: "stock_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_purchases": {
                  Row: {
                    "created_at": string | null,"id": string,"notes": string | null,"payment_date": string,"payment_proof_url": string | null,"proof_uploaded_at": string | null,"proof_uploaded_by": string | null,"received_date": string | null,"requested_by": string | null,"status": string,"supplier_name": string,"total_amount": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"id"?: string,"notes"?: string | null,"payment_date"?: string,"payment_proof_url"?: string | null,"proof_uploaded_at"?: string | null,"proof_uploaded_by"?: string | null,"received_date"?: string | null,"requested_by"?: string | null,"status"?: string,"supplier_name": string,"total_amount"?: number,"user_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"id"?: string,"notes"?: string | null,"payment_date"?: string,"payment_proof_url"?: string | null,"proof_uploaded_at"?: string | null,"proof_uploaded_by"?: string | null,"received_date"?: string | null,"requested_by"?: string | null,"status"?: string,"supplier_name"?: string,"total_amount"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_purchases_proof_uploaded_by_fkey"
      columns: ["proof_uploaded_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_purchases_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"transaction_categories": {
                  Row: {
                    "account_id": string | null,"created_at": string | null,"id": string,"name": string,"type": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"created_at"?: string | null,"id"?: string,"name": string,"type": string,"user_id"?: string | null
                  }
                  Update: {
                    "account_id"?: string | null,"created_at"?: string | null,"id"?: string,"name"?: string,"type"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "transaction_categories_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    }
                  ]
                },"transactions": {
                  Row: {
                    "amount": number,"cash_account_id": string | null,"category_id": string | null,"counter_account_id": string | null,"created_at": string | null,"description": string | null,"id": string,"order_id": string | null,"title": string,"transaction_date": string,"type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"cash_account_id"?: string | null,"category_id"?: string | null,"counter_account_id"?: string | null,"created_at"?: string | null,"description"?: string | null,"id"?: string,"order_id"?: string | null,"title": string,"transaction_date"?: string,"type": string,"user_id": string
                  }
                  Update: {
                    "amount"?: number,"cash_account_id"?: string | null,"category_id"?: string | null,"counter_account_id"?: string | null,"created_at"?: string | null,"description"?: string | null,"id"?: string,"order_id"?: string | null,"title"?: string,"transaction_date"?: string,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transactions_cash_account_id_fkey"
      columns: ["cash_account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "transaction_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_counter_account_id_fkey"
      columns: ["counter_account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders_with_balance"
      referencedColumns: ["id"]
    }
                  ]
                },"weekly_payrolls": {
                  Row: {
                    "created_at": string | null,"id": string,"notes": string | null,"payment_date": string,"period_end": string,"period_start": string,"sales_below_target_scheme": string,"sales_target_qty": number,"status": string,"total_amount": number,"transaction_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"id"?: string,"notes"?: string | null,"payment_date": string,"period_end": string,"period_start": string,"sales_below_target_scheme"?: string,"sales_target_qty"?: number,"status"?: string,"total_amount"?: number,"transaction_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"id"?: string,"notes"?: string | null,"payment_date"?: string,"period_end"?: string,"period_start"?: string,"sales_below_target_scheme"?: string,"sales_target_qty"?: number,"status"?: string,"total_amount"?: number,"transaction_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "weekly_payrolls_transaction_id_fkey"
      columns: ["transaction_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "orders_with_balance": {
                  Row: {
                    "bonus_paid": boolean | null,"created_at": string | null,"customer_name": string | null,"grand_total": number | null,"id": string | null,"is_order_type_manual_override": boolean | null,"ongkir": number | null,"order_date": string | null,"order_id": string | null,"order_type": string | null,"paid_amount": number | null,"po_batch_id": string | null,"po_code": string | null,"po_name": string | null,"po_status": string | null,"production_status": string | null,"released_early_at": string | null,"remaining_amount": number | null,"sales_id": string | null,"sales_name": string | null,"status": string | null,"total_price": number | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "orders_po_batch_id_fkey"
      columns: ["po_batch_id"]
isOneToOne: false
      referencedRelation: "po_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_sales_id_fkey"
      columns: ["sales_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_sales_id_fkey"
      columns: ["sales_id"]
isOneToOne: false
      referencedRelation: "sales_performance"
      referencedColumns: ["sales_id"]
    }
                  ]
                },"sales_performance": {
                  Row: {
                    "is_active": boolean | null,"sales_id": string | null,"sales_name": string | null,"total_orders": number | null,"total_outstanding": number | null,"total_paid": number | null,"total_revenue": number | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "acc_depreciation_due":
{ Args: { "p_period_end": string,"p_user_id": string }; Returns: {
              "accumulated_account_id": string,"amount": number,"asset_class": string,"asset_id": string
            }[]
                           },
"acc_inventory_valuation_detail":
{ Args: { "p_user_id": string }; Returns: Json
                           },
"acc_inventory_value":
{ Args: { "p_user_id"?: string }; Returns: number
                           },
"acc_resolve_asset_class":
{ Args: { "p_asset_class": string,"p_user_id": string }; Returns: Record<string, unknown>
                           },
"approve_purchasing_report":
{ Args: { "p_report_id": string }; Returns: undefined
                           },
"approve_stock_request":
{ Args: { "p_approved_by"?: string,"p_request_id": string }; Returns: {
              "approved_at": string | null,
"approved_by": string | null,
"batch_id": string | null,
"conversion_rate": number,
"created_at": string | null,
"estimated_price": number | null,
"fulfilled_date": string | null,
"fulfillment_type": string,
"goods_received_at": string | null,
"id": string,
"is_variable_unit": boolean,
"material_color_id": string | null,
"material_id": string,
"po_batch_id": string | null,
"preferred_store": string | null,
"purchasing_report_id": string | null,
"quantity_needed": number,
"reason": string | null,
"rejected_reason": string | null,
"requested_by": string | null,
"requested_date": string,
"source_order_id": string | null,
"source_order_item_id": string | null,
"source_type": string,
"status": string,
"supplier_purchase_id": string | null,
"unit": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "stock_requests"
        isOneToOne: true
        isSetofReturn: false
      } },
"approve_stock_request_spj":
{ Args: { "p_advance_amount"?: number,"p_notes"?: string,"p_purchasing_staff_id": string,"p_request_ids": (string)[] }; Returns: {
              "approved_at": string | null,
"cash_advance_id": string | null,
"created_at": string | null,
"id": string,
"notes": string | null,
"received_at": string | null,
"received_by": string | null,
"report_date": string,
"service_fee": number,
"staff_id": string,
"status": string,
"submitted_at": string | null,
"total_amount": number,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "purchasing_reports"
        isOneToOne: true
        isSetofReturn: false
      } },
"approve_stock_request_supplier":
{ Args: { "p_items": Json,"p_notes"?: string,"p_payment_date": string,"p_request_ids": (string)[],"p_requested_by": string,"p_supplier_name": string }; Returns: {
              "created_at": string | null,
"id": string,
"notes": string | null,
"payment_date": string,
"payment_proof_url": string | null,
"proof_uploaded_at": string | null,
"proof_uploaded_by": string | null,
"received_date": string | null,
"requested_by": string | null,
"status": string,
"supplier_name": string,
"total_amount": number,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "supplier_purchases"
        isOneToOne: true
        isSetofReturn: false
      } },
"assign_cutting_item":
{ Args: { "p_notes"?: string,"p_order_item_id": string,"p_staff_id": string }; Returns: {
              "assigned_at": string,
"dispatch_notes": string | null,
"force_reason": string | null,
"force_started": boolean,
"id": string,
"material_dispatched_at": string | null,
"notes": string | null,
"order_id": string | null,
"order_item_id": string,
"staff_id": string,
"status": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "cutting_assignments"
        isOneToOne: true
        isSetofReturn: false
      } },
"assign_cutting_order":
{ Args: { "p_notes"?: string,"p_order_id": string,"p_staff_id": string }; Returns: {
              "assigned_at": string,
"dispatch_notes": string | null,
"force_reason": string | null,
"force_started": boolean,
"id": string,
"material_dispatched_at": string | null,
"notes": string | null,
"order_id": string | null,
"order_item_id": string,
"staff_id": string,
"status": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "cutting_assignments"
        isOneToOne: true
        isSetofReturn: false
      } },
"bulk_approve_stock_requests":
{ Args: { "p_approved_by"?: string,"p_request_ids": (string)[] }; Returns: number
                           },
"calculate_order_type":
{ Args: { "p_total_qty": number }; Returns: string
                           },
"cancel_disbursed_report":
{ Args: { "p_reason"?: string,"p_report_id": string }; Returns: undefined
                           },
"cancel_stock_movement":
{ Args: { "p_movement_id": string }; Returns: undefined
                           },
"catalog_list_categories":
{ Args: Record<PropertyKey, never>; Returns: {
              "id": string,"name": string
            }[]
                           },
"catalog_list_products":
{ Args: { "p_category_id"?: string,"p_limit"?: number,"p_page"?: number,"p_search"?: string,"p_short_id"?: string,"p_sort"?: string }; Returns: Json
                           },
"catalog_list_sales":
{ Args: Record<PropertyKey, never>; Returns: {
              "id": string,"name": string,"phone": string
            }[]
                           },
"check_cutting_material_stock":
{ Args: { "p_cutting_assignment_id": string }; Returns: Json
                           },
"check_sewing_material_stock":
{ Args: { "p_sewing_assignment_id": string }; Returns: Json
                           },
"close_accounting_period":
{ Args: { "p_period_end": string }; Returns: Json
                           },
"close_po_batch":
{ Args: { "p_batch_id": string,"p_early_reason"?: string,"p_mark_rekap"?: boolean,"p_note"?: string }; Returns: Json
                           },
"confirm_purchasing_report_receipt":
{ Args: { "p_base_quantities"?: Json,"p_received_by"?: string,"p_report_id": string }; Returns: undefined
                           },
"confirm_stock_movement":
{ Args: { "p_movement_id": string,"p_recorded_by"?: string,"p_taken_by"?: string }; Returns: undefined
                           },
"create_bulk_stock_requests":
{ Args: { "p_batch_id"?: string,"p_fulfillment_type": string,"p_global_reason"?: string,"p_items": Json,"p_requested_by": string }; Returns: Json
                           } |
{ Args: { "p_batch_id"?: string,"p_fulfillment_type": string,"p_global_reason"?: string,"p_items": Json,"p_preferred_store"?: string,"p_requested_by": string }; Returns: Json
                           },
"create_invoice_from_order":
{ Args: { "p_invoice_type"?: string,"p_order_id": string }; Returns: string
                           },
"create_invoice_from_quotation":
{ Args: { "p_amount_due"?: number,"p_invoice_type"?: string,"p_quotation_id": string }; Returns: string
                           },
"create_po_batch":
{ Args: { "p_end_date": string,"p_name": string,"p_note"?: string,"p_period_month": number,"p_period_year": number,"p_quota_qty"?: number,"p_start_date": string }; Returns: {
              "close_early_reason": string | null,
"close_note": string | null,
"close_snapshot": Json | null,
"closed_at": string | null,
"closed_by": string | null,
"code": string,
"created_at": string,
"end_date": string,
"id": string,
"is_legacy": boolean,
"name": string,
"note": string | null,
"period_month": number,
"period_year": number,
"quota_qty": number | null,
"reopen_count": number,
"seq_in_month": number | null,
"start_date": string,
"status": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "po_batches"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_supplier_purchase":
{ Args: { "p_items": Json,"p_notes"?: string,"p_payment_date": string,"p_requested_by": string,"p_supplier_name": string }; Returns: {
              "created_at": string | null,
"id": string,
"notes": string | null,
"payment_date": string,
"payment_proof_url": string | null,
"proof_uploaded_at": string | null,
"proof_uploaded_by": string | null,
"received_date": string | null,
"requested_by": string | null,
"status": string,
"supplier_name": string,
"total_amount": number,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "supplier_purchases"
        isOneToOne: true
        isSetofReturn: false
      } },
"delete_fixed_asset":
{ Args: { "p_asset_id": string }; Returns: boolean
                           },
"delete_invoice":
{ Args: { "p_invoice_id": string }; Returns: undefined
                           },
"delete_order":
{ Args: { "p_order_id": string }; Returns: undefined
                           },
"delete_order_deposit_release":
{ Args: { "p_release_id": string }; Returns: undefined
                           },
"delete_order_payment":
{ Args: { "p_payment_id": string }; Returns: undefined
                           },
"delete_po_batch":
{ Args: { "p_batch_id": string }; Returns: boolean
                           },
"delete_quotation":
{ Args: { "p_quotation_id": string }; Returns: undefined
                           },
"dispatch_cutting_materials":
{ Args: { "p_cutting_assignment_id": string,"p_recorded_by": string }; Returns: Json
                           },
"dispatch_sewing_materials":
{ Args: { "p_recorded_by": string,"p_sewing_assignment_id": string }; Returns: Json
                           },
"dispose_fixed_asset":
{ Args: { "p_asset_id": string,"p_date": string,"p_payment_method"?: string,"p_proceeds"?: number }; Returns: string
                           },
"distribute_priority_sewing_order":
{ Args: { "p_manual_quotas"?: (number)[],"p_manual_staff_ids"?: (string)[],"p_notes"?: string,"p_order_id": string }; Returns: string
                           },
"distribute_sewing_work":
{ Args: { "p_notes"?: string,"p_order_item_ids"?: (string)[] }; Returns: string
                           } |
{ Args: { "p_notes"?: string,"p_order_item_ids"?: (string)[],"p_target_order_type"?: string }; Returns: string
                           },
"generate_document_no":
{ Args: { "p_date"?: string,"p_doc_type": string,"p_user_id": string }; Returns: string
                           },
"get_accounting_checks":
{ Args: { "p_as_of": string }; Returns: Json
                           },
"get_balance_sheet":
{ Args: { "p_as_of": string,"p_compare_as_of"?: string,"p_include_provisional"?: boolean }; Returns: Json
                           },
"get_cash_flow":
{ Args: { "p_compare_from"?: string,"p_compare_to"?: string,"p_from": string,"p_to": string }; Returns: Json
                           },
"get_close_preview":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_equity_changes":
{ Args: { "p_from": string,"p_include_provisional"?: boolean,"p_to": string }; Returns: Json
                           },
"get_fixed_asset_register":
{ Args: { "p_as_of"?: string }; Returns: {
              "accumulated": number,"acquisition_date": string,"asset_class": string,"book_value": number,"cost": number,"depreciation_months_posted": number,"disposed_at": string,"fully_depreciated": boolean,"id": string,"monthly_depreciation": number,"name": string,"next_depreciation_period": string,"notes": string,"salvage_value": number,"status": string,"useful_life_months": number
            }[]
                           },
"get_general_ledger":
{ Args: { "p_account_id": string,"p_from": string,"p_to": string }; Returns: {
              "credit": number,"debit": number,"description": string,"entry_date": string,"entry_no": string,"journal_entry_id": string,"memo": string,"running_balance": number,"source_type": string
            }[]
                           },
"get_income_statement":
{ Args: { "p_compare_from"?: string,"p_compare_to"?: string,"p_from": string,"p_include_provisional"?: boolean,"p_to": string }; Returns: Json
                           },
"get_or_create_nota":
{ Args: { "p_order_id": string }; Returns: string
                           },
"get_order_stage_events":
{ Args: { "p_order_id": string }; Returns: {
              "completed_at": string | null,
"id": string,
"notes": string | null,
"order_id": string,
"staff_id": string | null,
"stage": string,
"status": string,
"updated_at": string,
"user_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "order_stage_events"
        isOneToOne: false
        isSetofReturn: true
      } },
"get_po_close_report":
{ Args: { "p_batch_id": string }; Returns: Json
                           },
"get_po_daily_report":
{ Args: { "p_date"?: string }; Returns: Json
                           },
"get_po_monthly_report":
{ Args: { "p_month": number,"p_year": number }; Returns: Json
                           },
"get_po_purchase_list":
{ Args: { "p_batch_id": string }; Returns: Json
                           },
"get_report_notes":
{ Args: { "p_as_of": string }; Returns: Json
                           },
"get_trial_balance":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "account_id": string,"account_type": string,"closing_credit": number,"closing_debit": number,"code": string,"name": string,"opening_credit": number,"opening_debit": number,"period_credit": number,"period_debit": number,"report_group": string
            }[]
                           },
"give_cash_advance":
{ Args: { "p_amount": number,"p_date"?: string,"p_purpose"?: string,"p_staff_id": string }; Returns: {
              "amount": number,
"created_at": string | null,
"date_given": string,
"id": string,
"purpose": string | null,
"staff_id": string,
"status": string,
"transaction_id": string | null,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "cash_advances"
        isOneToOne: true
        isSetofReturn: false
      } },
"init_accounting":
{ Args: { "p_books_start_date": string }; Returns: undefined
                           },
"link_quotation_to_order":
{ Args: { "p_order_id": string,"p_quotation_id": string }; Returns: undefined
                           },
"list_po_batches":
{ Args: { "p_month"?: number,"p_year"?: number }; Returns: {
              "close_early_reason": string | null,
"close_note": string | null,
"close_snapshot": Json | null,
"closed_at": string | null,
"closed_by": string | null,
"code": string,
"created_at": string,
"end_date": string,
"id": string,
"is_legacy": boolean,
"name": string,
"note": string | null,
"period_month": number,
"period_year": number,
"quota_qty": number | null,
"reopen_count": number,
"seq_in_month": number | null,
"start_date": string,
"status": string,
"user_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "po_batches"
        isOneToOne: false
        isSetofReturn: true
      } },
"list_po_batches_summary":
{ Args: { "p_month"?: number,"p_status"?: string,"p_year"?: number }; Returns: {
              "close_early_reason": string,"close_note": string,"close_snapshot": Json,"closed_at": string,"closed_by": string,"code": string,"created_at": string,"end_date": string,"id": string,"is_legacy": boolean,"name": string,"note": string,"order_count": number,"period_month": number,"period_year": number,"quota_qty": number,"quota_used_pct": number,"reopen_count": number,"seq_in_month": number,"start_date": string,"status": string,"total_price": number,"total_qty": number,"user_id": string
            }[]
                           },
"log_stage_work":
{ Args: { "p_notes"?: string,"p_order_id": string,"p_order_item_id"?: string,"p_qty": number,"p_staff_id": string,"p_stage": string }; Returns: string
                           },
"mark_cutting_item_done":
{ Args: { "p_cutting_qty"?: number,"p_notes"?: string,"p_order_item_id": string }; Returns: undefined
                           } |
{ Args: { "p_cutting_qty"?: number,"p_force"?: boolean,"p_force_reason"?: string,"p_notes"?: string,"p_order_item_id": string }; Returns: undefined
                           },
"mark_ready_for_sewing":
{ Args: { "p_order_item_ids": (string)[] }; Returns: undefined
                           },
"mark_sewing_manual_paid":
{ Args: { "p_note"?: string,"p_piecework_task_ids": (string)[] }; Returns: undefined
                           },
"next_journal_entry_no":
{ Args: { "p_date": string,"p_user_id": string }; Returns: string
                           },
"pay_salary":
{ Args: { "p_payroll_id": string }; Returns: undefined
                           },
"pay_weekly_payroll":
{ Args: { "p_payroll_id": string }; Returns: Json
                           },
"po_week_info":
{ Args: { "p_date": string }; Returns: {
              "code": string,"end_date": string,"period_month": number,"period_year": number,"seq_in_month": number,"start_date": string
            }[]
                           },
"post_journal_entry":
{ Args: { "p_date": string,"p_description": string,"p_lines": Json }; Returns: string
                           },
"post_opening_balance":
{ Args: { "p_date": string,"p_lines": Json }; Returns: string
                           },
"post_order_revenue_journal":
{ Args: { "p_order_id": string }; Returns: undefined
                           },
"post_transaction_journal":
{ Args: { "p_txn_id": string }; Returns: undefined
                           },
"process_defect_material_return":
{ Args: { "p_defect_reason": string,"p_material_color_id"?: string,"p_material_id": string,"p_order_id"?: string,"p_qty": number,"p_received_by": string,"p_sewing_assignment_id"?: string,"p_staff_id": string }; Returns: Json
                           },
"receive_supplier_purchase":
{ Args: { "p_purchase_id": string }; Returns: undefined
                           } |
{ Args: { "p_base_quantities"?: Json,"p_purchase_id": string,"p_recorded_by"?: string }; Returns: undefined
                           },
"recompute_order_status":
{ Args: { "p_order_id": string }; Returns: undefined
                           },
"record_order_payment":
{ Args: { "p_amount": number,"p_category_id"?: string,"p_order_id": string,"p_payment_date"?: string,"p_payment_method"?: string,"p_payment_type": string }; Returns: {
              "amount": number,
"created_at": string | null,
"id": string,
"order_id": string,
"payment_date": string,
"payment_method": string | null,
"payment_type": string,
"transaction_id": string | null,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "order_payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"record_qc_check":
{ Args: { "p_assignment_id": string,"p_notes"?: string,"p_passed_qty": number,"p_rejected_qty": number }; Returns: undefined
                           },
"register_fixed_asset":
{ Args: { "p_accumulated_at_start"?: number,"p_acquisition_date": string,"p_asset_class": string,"p_cost": number,"p_name": string,"p_notes"?: string,"p_payment_method"?: string,"p_salvage_value"?: number,"p_useful_life_months": number }; Returns: string
                           },
"reject_purchasing_report":
{ Args: { "p_reason"?: string,"p_report_id": string }; Returns: undefined
                           },
"reject_stock_request":
{ Args: { "p_reason": string,"p_request_id": string }; Returns: {
              "approved_at": string | null,
"approved_by": string | null,
"batch_id": string | null,
"conversion_rate": number,
"created_at": string | null,
"estimated_price": number | null,
"fulfilled_date": string | null,
"fulfillment_type": string,
"goods_received_at": string | null,
"id": string,
"is_variable_unit": boolean,
"material_color_id": string | null,
"material_id": string,
"po_batch_id": string | null,
"preferred_store": string | null,
"purchasing_report_id": string | null,
"quantity_needed": number,
"reason": string | null,
"rejected_reason": string | null,
"requested_by": string | null,
"requested_date": string,
"source_order_id": string | null,
"source_order_item_id": string | null,
"source_type": string,
"status": string,
"supplier_purchase_id": string | null,
"unit": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "stock_requests"
        isOneToOne: true
        isSetofReturn: false
      } },
"release_order_deposit":
{ Args: { "p_amount": number,"p_date"?: string,"p_kind": string,"p_notes"?: string,"p_order_id": string,"p_payment_method"?: string }; Returns: string
                           },
"release_order_early":
{ Args: { "p_order_id": string,"p_reason": string }; Returns: undefined
                           },
"reopen_accounting_period":
{ Args: { "p_new_locked_through"?: string }; Returns: Json
                           },
"reopen_po_batch":
{ Args: { "p_batch_id": string,"p_reason": string }; Returns: undefined
                           },
"reverse_journal_entry":
{ Args: { "p_entry_id": string,"p_reason": string }; Returns: string
                           },
"save_invoice":
{ Args: { "p_header"?: Json,"p_invoice_id"?: string,"p_items"?: Json }; Returns: string
                           },
"save_quotation":
{ Args: { "p_header"?: Json,"p_items"?: Json,"p_quotation_id"?: string }; Returns: string
                           },
"set_invoice_status":
{ Args: { "p_invoice_id": string,"p_status": string }; Returns: undefined
                           },
"set_quotation_status":
{ Args: { "p_quotation_id": string,"p_status": string }; Returns: undefined
                           },
"start_all_sewing_assignments":
{ Args: { "p_staff_id"?: string }; Returns: number
                           } |
{ Args: { "p_force"?: boolean,"p_staff_id"?: string }; Returns: Json
                           },
"start_sewing_assignment":
{ Args: { "p_assignment_id": string }; Returns: undefined
                           } |
{ Args: { "p_assignment_id": string,"p_force"?: boolean,"p_force_reason"?: string }; Returns: Json
                           },
"submit_cutting_report":
{ Args: { "p_lines": Json,"p_notes"?: string,"p_period_end": string,"p_period_start": string,"p_staff_id": string }; Returns: Json
                           },
"suggest_opening_balance":
{ Args: { "p_books_start_date": string }; Returns: Json
                           },
"toggle_order_stage":
{ Args: { "p_done": boolean,"p_notes"?: string,"p_order_id": string,"p_stage": string }; Returns: undefined
                           },
"undo_dispose_fixed_asset":
{ Args: { "p_asset_id": string }; Returns: boolean
                           },
"update_fixed_asset_info":
{ Args: { "p_asset_id": string,"p_name": string,"p_notes": string }; Returns: boolean
                           },
"update_owner_email":
{ Args: { "p_new_email": string }; Returns: undefined
                           },
"update_pending_stock_request":
{ Args: { "p_estimated_price"?: number,"p_fulfillment_type": string,"p_material_color_id"?: string,"p_material_id": string,"p_quantity_needed": number,"p_reason": string,"p_request_id": string }; Returns: Json
                           },
"update_po_batch":
{ Args: { "p_batch_id": string,"p_end_date": string,"p_name": string,"p_note"?: string,"p_period_month": number,"p_period_year": number,"p_quota_qty"?: number,"p_start_date": string }; Returns: {
              "close_early_reason": string | null,
"close_note": string | null,
"close_snapshot": Json | null,
"closed_at": string | null,
"closed_by": string | null,
"code": string,
"created_at": string,
"end_date": string,
"id": string,
"is_legacy": boolean,
"name": string,
"note": string | null,
"period_month": number,
"period_year": number,
"quota_qty": number | null,
"reopen_count": number,
"seq_in_month": number | null,
"start_date": string,
"status": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "po_batches"
        isOneToOne: true
        isSetofReturn: false
      } },
"update_stock_request_fulfillment_type":
{ Args: { "p_fulfillment_type": string,"p_request_id": string }; Returns: undefined
                           },
"upload_supplier_purchase_proof":
{ Args: { "p_proof_url": string,"p_purchase_id": string,"p_uploaded_by"?: string }; Returns: undefined
                           },
"upsert_order_stage_event":
{ Args: { "p_completed_at"?: string,"p_notes"?: string,"p_order_id": string,"p_stage": string,"p_status": string,"p_user_id": string }; Returns: undefined
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
