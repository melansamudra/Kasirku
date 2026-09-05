// Hand-reconstructed from supabase/migrations/*.sql (no network/CLI access in
// this environment to run `supabase gen types typescript`). Mirrors the
// conventions of the real Supabase codegen output as closely as possible:
//   - Row: every column, nullable columns unioned with `null`.
//   - Insert: NOT NULL columns without a DEFAULT are required; everything
//     else (DEFAULT, GENERATED, nullable) is optional via `?`.
//   - Update: every field optional.
// CHECK (col IN (...)) constraints on plain text/varchar columns are NOT
// narrowed to string-literal unions — only real `CREATE TYPE ... AS ENUM`
// types would be (there are none in this schema; grep for `create type`
// across every migration returns nothing, so `Enums` is empty).
// `Relationships: []` is left empty everywhere (FK metadata not reconstructed).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      account_reconciliations: {
        Row: {
          id: string;
          business_id: string;
          account_id: string;
          statement_date: string;
          book_balance: number;
          statement_balance: number;
          difference: number;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          account_id: string;
          statement_date: string;
          book_balance: number;
          statement_balance: number;
          difference: number;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          account_id?: string;
          statement_date?: string;
          book_balance?: number;
          statement_balance?: number;
          difference?: number;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      accounts: {
        Row: {
          id: string;
          business_id: string;
          code: string;
          name: string;
          type: string;
          normal_balance: string;
          is_system: boolean;
          created_at: string;
          bank_name: string | null;
          bank_account_number: string | null;
          bank_account_holder: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          code: string;
          name: string;
          type: string;
          normal_balance: string;
          is_system?: boolean;
          created_at?: string;
          bank_name?: string | null;
          bank_account_number?: string | null;
          bank_account_holder?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          code?: string;
          name?: string;
          type?: string;
          normal_balance?: string;
          is_system?: boolean;
          created_at?: string;
          bank_name?: string | null;
          bank_account_number?: string | null;
          bank_account_holder?: string | null;
        };
        Relationships: [];
      };
      activity_log: {
        Row: {
          id: string;
          business_id: string | null;
          type: string;
          status: string;
          title: string;
          detail: string | null;
          data: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id?: string | null;
          type: string;
          status: string;
          title: string;
          detail?: string | null;
          data?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string | null;
          type?: string;
          status?: string;
          title?: string;
          detail?: string | null;
          data?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      admins: {
        Row: {
          user_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      attendance: {
        Row: {
          id: string;
          business_id: string;
          employee_id: string;
          date: string;
          status: string;
          note: string | null;
          created_at: string;
          late: boolean;
          shift_template_id: string | null;
          check_in_at: string | null;
          check_in_photo_url: string | null;
          check_out_at: string | null;
          check_out_photo_url: string | null;
          late_minutes: number;
          overtime_hours: number;
          verified_by_admin: boolean;
          verified_at: string | null;
          check_in_lat: number | null;
          check_in_lng: number | null;
          check_out_lat: number | null;
          check_out_lng: number | null;
          break_start_at: string | null;
          break_end_at: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          employee_id: string;
          date: string;
          status: string;
          note?: string | null;
          created_at?: string;
          late?: boolean;
          shift_template_id?: string | null;
          check_in_at?: string | null;
          check_in_photo_url?: string | null;
          check_out_at?: string | null;
          check_out_photo_url?: string | null;
          late_minutes?: number;
          overtime_hours?: number;
          verified_by_admin?: boolean;
          verified_at?: string | null;
          check_in_lat?: number | null;
          check_in_lng?: number | null;
          check_out_lat?: number | null;
          check_out_lng?: number | null;
          break_start_at?: string | null;
          break_end_at?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          employee_id?: string;
          date?: string;
          status?: string;
          note?: string | null;
          created_at?: string;
          late?: boolean;
          shift_template_id?: string | null;
          check_in_at?: string | null;
          check_in_photo_url?: string | null;
          check_out_at?: string | null;
          check_out_photo_url?: string | null;
          late_minutes?: number;
          overtime_hours?: number;
          verified_by_admin?: boolean;
          verified_at?: string | null;
          check_in_lat?: number | null;
          check_in_lng?: number | null;
          check_out_lat?: number | null;
          check_out_lng?: number | null;
          break_start_at?: string | null;
          break_end_at?: string | null;
        };
        Relationships: [];
      };
      budgets: {
        Row: {
          id: string;
          business_id: string;
          account_id: string;
          period: string;
          target_amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          account_id: string;
          period: string;
          target_amount?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          account_id?: string;
          period?: string;
          target_amount?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      business_staff: {
        Row: {
          id: string;
          business_id: string;
          user_id: string;
          name: string;
          email: string;
          permissions: string[];
          active: boolean;
          role: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          user_id: string;
          name: string;
          email: string;
          permissions?: string[];
          active?: boolean;
          role?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          user_id?: string;
          name?: string;
          email?: string;
          permissions?: string[];
          active?: boolean;
          role?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      businesses: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          business_type: string;
          address: string | null;
          phone: string | null;
          npwp: string | null;
          logo_url: string | null;
          tax_enabled: boolean;
          tax_rate: number;
          service_enabled: boolean;
          service_rate: number;
          auto_lock_enabled: boolean;
          auto_lock_minutes: number;
          recovery_code_hash: string | null;
          created_at: string;
          receipt_settings: Json;
          self_order_banner: string | null;
          self_order_enabled: boolean;
          mirroring_enabled: boolean;
          izin_deduction_mode: string;
          izin_deduction_weekday: number;
          izin_deduction_weekend: number;
          late_deduction_per_occurrence: number;
          lembur_rate_per_hour: number;
          attendance_qr_slug: string | null;
          purchase_request_slug: string | null;
          cost_control_enabled: boolean;
          outlet_request_slug: string | null;
          production_scan_slug: string | null;
          stock_opname_slug: string | null;
          location_transfer_slug: string | null;
          receive_stock_slug: string | null;
          kasbon_slug: string | null;
          procurement_budget_gate_enabled: boolean;
          break_attendance_enabled: boolean;
          personal_loan_enabled: boolean;
          sell_products_enabled: boolean;
          hidden_nav_keys: string[];
          stock_locations_enabled: boolean;
          po_approval_levels: number;
          stock_deduction_enabled: boolean;
          rich_stock_ops_enabled: boolean;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          business_type: string;
          address?: string | null;
          phone?: string | null;
          npwp?: string | null;
          logo_url?: string | null;
          tax_enabled?: boolean;
          tax_rate?: number;
          service_enabled?: boolean;
          service_rate?: number;
          auto_lock_enabled?: boolean;
          auto_lock_minutes?: number;
          recovery_code_hash?: string | null;
          created_at?: string;
          receipt_settings?: Json;
          self_order_banner?: string | null;
          self_order_enabled?: boolean;
          mirroring_enabled?: boolean;
          izin_deduction_mode?: string;
          izin_deduction_weekday?: number;
          izin_deduction_weekend?: number;
          late_deduction_per_occurrence?: number;
          lembur_rate_per_hour?: number;
          attendance_qr_slug?: string | null;
          purchase_request_slug?: string | null;
          cost_control_enabled?: boolean;
          outlet_request_slug?: string | null;
          production_scan_slug?: string | null;
          procurement_budget_gate_enabled?: boolean;
          stock_opname_slug?: string | null;
          location_transfer_slug?: string | null;
          receive_stock_slug?: string | null;
          kasbon_slug?: string | null;
          break_attendance_enabled?: boolean;
          personal_loan_enabled?: boolean;
          sell_products_enabled?: boolean;
          hidden_nav_keys?: string[];
          stock_locations_enabled?: boolean;
          po_approval_levels?: number;
          stock_deduction_enabled?: boolean;
          rich_stock_ops_enabled?: boolean;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          business_type?: string;
          address?: string | null;
          phone?: string | null;
          npwp?: string | null;
          logo_url?: string | null;
          tax_enabled?: boolean;
          tax_rate?: number;
          service_enabled?: boolean;
          service_rate?: number;
          auto_lock_enabled?: boolean;
          auto_lock_minutes?: number;
          recovery_code_hash?: string | null;
          created_at?: string;
          receipt_settings?: Json;
          self_order_banner?: string | null;
          self_order_enabled?: boolean;
          mirroring_enabled?: boolean;
          izin_deduction_mode?: string;
          izin_deduction_weekday?: number;
          izin_deduction_weekend?: number;
          late_deduction_per_occurrence?: number;
          lembur_rate_per_hour?: number;
          attendance_qr_slug?: string | null;
          purchase_request_slug?: string | null;
          cost_control_enabled?: boolean;
          outlet_request_slug?: string | null;
          production_scan_slug?: string | null;
          stock_opname_slug?: string | null;
          procurement_budget_gate_enabled?: boolean;
          location_transfer_slug?: string | null;
          receive_stock_slug?: string | null;
          kasbon_slug?: string | null;
          break_attendance_enabled?: boolean;
          personal_loan_enabled?: boolean;
          sell_products_enabled?: boolean;
          hidden_nav_keys?: string[];
          stock_locations_enabled?: boolean;
          po_approval_levels?: number;
          stock_deduction_enabled?: boolean;
          rich_stock_ops_enabled?: boolean;
        };
        Relationships: [];
      };
      cashiers: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          role: string;
          pin_hash: string;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          role: string;
          pin_hash: string;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          role?: string;
          pin_hash?: string;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      custom_payment_methods: {
        Row: {
          id: string;
          business_id: string;
          name: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          phone: string | null;
          email: string | null;
          note: string | null;
          deleted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          phone?: string | null;
          email?: string | null;
          note?: string | null;
          deleted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          phone?: string | null;
          email?: string | null;
          note?: string | null;
          deleted_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      depreciation_postings: {
        Row: {
          id: string;
          business_id: string;
          period: string;
          total_amount: number;
          journal_entry_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          period: string;
          total_amount: number;
          journal_entry_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          period?: string;
          total_amount?: number;
          journal_entry_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      discount_rules: {
        Row: {
          id: string;
          business_id: string;
          type: string;
          product_id: string | null;
          name: string | null;
          value: number;
          value_type: string;
          active: boolean;
          valid_from: string | null;
          valid_until: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          type: string;
          product_id?: string | null;
          name?: string | null;
          value?: number;
          value_type?: string;
          active?: boolean;
          valid_from?: string | null;
          valid_until?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          type?: string;
          product_id?: string | null;
          name?: string | null;
          value?: number;
          value_type?: string;
          active?: boolean;
          valid_from?: string | null;
          valid_until?: string | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "discount_rules_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      employee_advances: {
        Row: {
          id: string;
          business_id: string;
          employee_id: string;
          date: string;
          amount: number;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          employee_id: string;
          date: string;
          amount: number;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          employee_id?: string;
          date?: string;
          amount?: number;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employee_advances_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      employee_personal_loans: {
        Row: {
          id: string;
          business_id: string;
          employee_id: string;
          date: string;
          amount: number;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          employee_id: string;
          date: string;
          amount: number;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          employee_id?: string;
          date?: string;
          amount?: number;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employee_personal_loans_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      employee_recurring_allowances: {
        Row: {
          id: string;
          business_id: string;
          employee_id: string;
          label: string;
          amount: number;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          employee_id: string;
          label: string;
          amount: number;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          employee_id?: string;
          label?: string;
          amount?: number;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employee_recurring_allowances_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      employee_shift_assignments: {
        Row: {
          id: string;
          business_id: string;
          employee_id: string;
          date: string;
          shift_template_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          employee_id: string;
          date: string;
          shift_template_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          employee_id?: string;
          date?: string;
          shift_template_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employee_shift_assignments_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_shift_assignments_shift_template_id_fkey";
            columns: ["shift_template_id"];
            isOneToOne: false;
            referencedRelation: "shift_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      employees: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          salary_type: string;
          daily_rate: number;
          monthly_rate: number;
          active: boolean;
          note: string | null;
          cashier_id: string | null;
          created_at: string;
          contract_end: string | null;
          lembur_rate_per_hour: number | null;
          daily_meal_allowance: number;
          daily_attendance_allowance: number;
          location_id: string | null;
          pin_hash: string | null;
          has_pin: boolean | null;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          salary_type?: string;
          daily_rate?: number;
          monthly_rate?: number;
          active?: boolean;
          note?: string | null;
          cashier_id?: string | null;
          created_at?: string;
          contract_end?: string | null;
          lembur_rate_per_hour?: number | null;
          daily_meal_allowance?: number;
          daily_attendance_allowance?: number;
          location_id?: string | null;
          pin_hash?: string | null;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          salary_type?: string;
          daily_rate?: number;
          monthly_rate?: number;
          active?: boolean;
          note?: string | null;
          cashier_id?: string | null;
          created_at?: string;
          contract_end?: string | null;
          lembur_rate_per_hour?: number | null;
          daily_meal_allowance?: number;
          daily_attendance_allowance?: number;
          location_id?: string | null;
          pin_hash?: string | null;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "employees_cashier_id_fkey";
            columns: ["cashier_id"];
            isOneToOne: true;
            referencedRelation: "cashiers";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          id: string;
          business_id: string;
          date: string;
          category: string;
          amount: number;
          note: string | null;
          ingredient_id: string | null;
          product_id: string | null;
          qty: number | null;
          created_at: string;
          location_id: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          date: string;
          category: string;
          amount: number;
          note?: string | null;
          ingredient_id?: string | null;
          product_id?: string | null;
          qty?: number | null;
          created_at?: string;
          location_id?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          date?: string;
          category?: string;
          amount?: number;
          note?: string | null;
          ingredient_id?: string | null;
          product_id?: string | null;
          qty?: number | null;
          created_at?: string;
          location_id?: string | null;
        };
        Relationships: [];
      };
      fixed_assets: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          purchase_date: string;
          cost: number;
          useful_life_months: number;
          salvage_value: number;
          accumulated_depreciation: number;
          disposed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          purchase_date: string;
          cost: number;
          useful_life_months: number;
          salvage_value?: number;
          accumulated_depreciation?: number;
          disposed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          purchase_date?: string;
          cost?: number;
          useful_life_months?: number;
          salvage_value?: number;
          accumulated_depreciation?: number;
          disposed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      global_modifier_groups: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          required: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          required?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          required?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      global_modifier_options: {
        Row: {
          id: string;
          group_id: string;
          name: string;
          price_adjustment: number;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          name: string;
          price_adjustment?: number;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          name?: string;
          price_adjustment?: number;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "global_modifier_options_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "global_modifier_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      hpp_desktop_orders: {
        Row: {
          id: string;
          order_id: string;
          email: string;
          amount: number;
          status: string;
          download_token: string | null;
          midtrans_transaction_id: string | null;
          payment_type: string | null;
          raw_notification: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          email: string;
          amount: number;
          status?: string;
          download_token?: string | null;
          midtrans_transaction_id?: string | null;
          payment_type?: string | null;
          raw_notification?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          email?: string;
          amount?: number;
          status?: string;
          download_token?: string | null;
          midtrans_transaction_id?: string | null;
          payment_type?: string | null;
          raw_notification?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      ingredient_price_history: {
        Row: {
          id: string;
          business_id: string;
          ingredient_id: string;
          unit_cost: number;
          source: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          ingredient_id: string;
          unit_cost: number;
          source?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          ingredient_id?: string;
          unit_cost?: number;
          source?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      ingredient_opname_sections: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      ingredient_opname_section_items: {
        Row: {
          business_id: string;
          ingredient_id: string;
          section_id: string;
        };
        Insert: {
          business_id: string;
          ingredient_id: string;
          section_id: string;
        };
        Update: {
          business_id?: string;
          ingredient_id?: string;
          section_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ingredient_opname_section_items_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ingredient_opname_section_items_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "ingredient_opname_sections";
            referencedColumns: ["id"];
          },
        ];
      };
      ingredient_purchase_units: {
        Row: {
          id: string;
          business_id: string;
          ingredient_id: string;
          unit_name: string;
          conversion: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          ingredient_id: string;
          unit_name: string;
          conversion: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          ingredient_id?: string;
          unit_name?: string;
          conversion?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ingredient_purchase_units_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
        ];
      };
      ingredients: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          unit: string;
          unit_cost: number;
          stock: number;
          deleted_at: string | null;
          min_stock: number;
          departments: string[];
          barcode: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          unit: string;
          unit_cost?: number;
          stock?: number;
          deleted_at?: string | null;
          min_stock?: number;
          departments?: string[];
          barcode?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          unit?: string;
          unit_cost?: number;
          stock?: number;
          deleted_at?: string | null;
          min_stock?: number;
          departments?: string[];
          barcode?: string | null;
        };
        Relationships: [];
      };
      inventory_snapshots: {
        Row: {
          id: string;
          business_id: string;
          date: string;
          value: number;
          manual: boolean;
        };
        Insert: {
          id?: string;
          business_id: string;
          date: string;
          value: number;
          manual?: boolean;
        };
        Update: {
          id?: string;
          business_id?: string;
          date?: string;
          value?: number;
          manual?: boolean;
        };
        Relationships: [];
      };
      invoice_lines: {
        Row: {
          id: string;
          invoice_id: string;
          description: string;
          qty: number;
          unit_price: number;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          description: string;
          qty: number;
          unit_price: number;
        };
        Update: {
          id?: string;
          invoice_id?: string;
          description?: string;
          qty?: number;
          unit_price?: number;
        };
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          business_id: string;
          customer_id: string | null;
          customer_name: string;
          invoice_number: string;
          date: string;
          due_date: string | null;
          subtotal: number;
          dp_amount: number;
          status: string;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          customer_id?: string | null;
          customer_name: string;
          invoice_number: string;
          date?: string;
          due_date?: string | null;
          subtotal?: number;
          dp_amount?: number;
          status?: string;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          customer_id?: string | null;
          customer_name?: string;
          invoice_number?: string;
          date?: string;
          due_date?: string | null;
          subtotal?: number;
          dp_amount?: number;
          status?: string;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      journal_entries: {
        Row: {
          id: string;
          business_id: string;
          date: string;
          description: string;
          source: string;
          source_id: string | null;
          payment_method: "tunai" | "transfer" | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          date?: string;
          description: string;
          source?: string;
          source_id?: string | null;
          payment_method?: "tunai" | "transfer" | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          date?: string;
          description?: string;
          source?: string;
          source_id?: string | null;
          payment_method?: "tunai" | "transfer" | null;
          created_at?: string;
        };
        Relationships: [];
      };
      journal_lines: {
        Row: {
          id: string;
          entry_id: string;
          account_id: string;
          debit: number;
          credit: number;
        };
        Insert: {
          id?: string;
          entry_id: string;
          account_id: string;
          debit?: number;
          credit?: number;
        };
        Update: {
          id?: string;
          entry_id?: string;
          account_id?: string;
          debit?: number;
          credit?: number;
        };
        Relationships: [
          {
            foreignKeyName: "journal_lines_entry_id_fkey";
            columns: ["entry_id"];
            isOneToOne: false;
            referencedRelation: "journal_entries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "journal_lines_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      kitchen_printers: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          categories: string[];
          connection_type: string;
          address: string | null;
          device_label: string | null;
          prints_receipt: boolean;
          paper_width: number;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          categories?: string[];
          connection_type?: string;
          address?: string | null;
          device_label?: string | null;
          prints_receipt?: boolean;
          paper_width?: number;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          categories?: string[];
          connection_type?: string;
          address?: string | null;
          device_label?: string | null;
          prints_receipt?: boolean;
          paper_width?: number;
        };
        Relationships: [];
      };
      late_deduction_tiers: {
        Row: {
          id: string;
          business_id: string;
          threshold_minutes: number;
          amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          threshold_minutes: number;
          amount: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          threshold_minutes?: number;
          amount?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      members: {
        Row: {
          id: string;
          business_id: string;
          member_code: string;
          name: string;
          phone: string | null;
          valid_from: string;
          valid_until: string;
          note: string | null;
          deleted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          member_code: string;
          name: string;
          phone?: string | null;
          valid_from: string;
          valid_until: string;
          note?: string | null;
          deleted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          member_code?: string;
          name?: string;
          phone?: string | null;
          valid_from?: string;
          valid_until?: string;
          note?: string | null;
          deleted_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      merchant_fees: {
        Row: {
          id: string;
          business_id: string;
          method: string;
          fee_percent: number;
        };
        Insert: {
          id?: string;
          business_id: string;
          method: string;
          fee_percent?: number;
        };
        Update: {
          id?: string;
          business_id?: string;
          method?: string;
          fee_percent?: number;
        };
        Relationships: [];
      };
      mirror_accounts: {
        Row: {
          id: string;
          business_id: string;
          user_id: string;
          invited_email: string;
          status: string;
          permissions: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          user_id: string;
          invited_email: string;
          status?: string;
          permissions?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          user_id?: string;
          invited_email?: string;
          status?: string;
          permissions?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      mirror_month_locks: {
        Row: {
          id: string;
          business_id: string;
          month_year: string;
          locked_at: string;
          locked_by: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          month_year: string;
          locked_at?: string;
          locked_by: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          month_year?: string;
          locked_at?: string;
          locked_by?: string;
        };
        Relationships: [];
      };
      mirror_selections: {
        Row: {
          mirror_account_id: string;
          transaction_id: string;
          business_id: string;
        };
        Insert: {
          mirror_account_id: string;
          transaction_id: string;
          business_id: string;
        };
        Update: {
          mirror_account_id?: string;
          transaction_id?: string;
          business_id?: string;
        };
        Relationships: [];
      };
      mirror_visible_kas: {
        Row: {
          business_id: string;
          journal_line_id: string;
          created_at: string;
        };
        Insert: {
          business_id: string;
          journal_line_id: string;
          created_at?: string;
        };
        Update: {
          business_id?: string;
          journal_line_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mirror_visible_kas_journal_line_id_fkey";
            columns: ["journal_line_id"];
            isOneToOne: false;
            referencedRelation: "journal_lines";
            referencedColumns: ["id"];
          },
        ];
      };
      mirror_visible_transactions: {
        Row: {
          business_id: string;
          transaction_id: string;
          created_at: string;
        };
        Insert: {
          business_id: string;
          transaction_id: string;
          created_at?: string;
        };
        Update: {
          business_id?: string;
          transaction_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mirror_visible_transactions_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      open_bills: {
        Row: {
          id: string;
          business_id: string;
          label: string;
          items: Json;
          created_at: string;
          updated_at: string;
          customer_name: string | null;
          customer_id: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          label: string;
          items?: Json;
          created_at?: string;
          updated_at?: string;
          customer_name?: string | null;
          customer_id?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          label?: string;
          items?: Json;
          created_at?: string;
          updated_at?: string;
          customer_name?: string | null;
          customer_id?: string | null;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          business_id: string;
          plan_code: string;
          order_id: string;
          amount: number;
          status: string;
          midtrans_transaction_id: string | null;
          payment_type: string | null;
          raw_notification: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          plan_code: string;
          order_id: string;
          amount: number;
          status?: string;
          midtrans_transaction_id?: string | null;
          payment_type?: string | null;
          raw_notification?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          plan_code?: string;
          order_id?: string;
          amount?: number;
          status?: string;
          midtrans_transaction_id?: string | null;
          payment_type?: string | null;
          raw_notification?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      payroll_holidays: {
        Row: {
          id: string;
          business_id: string;
          holiday_date: string;
          label: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          holiday_date: string;
          label?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          holiday_date?: string;
          label?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      payslip_adjustments: {
        Row: {
          id: string;
          payslip_id: string;
          type: string;
          label: string;
          amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          payslip_id: string;
          type: string;
          label: string;
          amount: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          payslip_id?: string;
          type?: string;
          label?: string;
          amount?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payslip_adjustments_payslip_id_fkey";
            columns: ["payslip_id"];
            isOneToOne: false;
            referencedRelation: "payslips";
            referencedColumns: ["id"];
          },
        ];
      };
      payslips: {
        Row: {
          id: string;
          business_id: string;
          employee_id: string;
          period_start: string;
          period_end: string;
          salary_type: string;
          daily_rate: number;
          monthly_rate: number;
          hadir_count: number;
          izin_count: number;
          sakit_count: number;
          alpa_count: number;
          off_count: number;
          base_pay: number;
          meal_allowance: number;
          attendance_allowance: number;
          created_at: string;
          paid_at: string | null;
          lembur_amount: number;
          thr_amount: number;
          late_deduction: number;
          kasbon_deduction: number;
          personal_loan_deduction: number;
          journal_entry_id: string | null;
          expense_id: string | null;
          izin_weekday_count: number;
          izin_weekend_count: number;
          izin_noted_count: number;
          izin_unnoted_count: number;
          izin_unnoted_weekend_count: number;
          izin_deduction: number;
          izin_weekend_penalty: number;
          late_count: number;
          hari_kerja_efektif: number;
          lembur_hours: number;
          lembur_rate: number;
        };
        Insert: {
          id?: string;
          business_id: string;
          employee_id: string;
          period_start: string;
          period_end: string;
          salary_type?: string;
          daily_rate: number;
          monthly_rate?: number;
          hadir_count?: number;
          izin_count?: number;
          sakit_count?: number;
          alpa_count?: number;
          off_count?: number;
          base_pay?: number;
          meal_allowance?: number;
          attendance_allowance?: number;
          created_at?: string;
          paid_at?: string | null;
          lembur_amount?: number;
          thr_amount?: number;
          late_deduction?: number;
          kasbon_deduction?: number;
          personal_loan_deduction?: number;
          journal_entry_id?: string | null;
          expense_id?: string | null;
          izin_weekday_count?: number;
          izin_weekend_count?: number;
          izin_noted_count?: number;
          izin_unnoted_count?: number;
          izin_unnoted_weekend_count?: number;
          izin_deduction?: number;
          izin_weekend_penalty?: number;
          late_count?: number;
          hari_kerja_efektif?: number;
          lembur_hours?: number;
          lembur_rate?: number;
        };
        Update: {
          id?: string;
          business_id?: string;
          employee_id?: string;
          period_start?: string;
          period_end?: string;
          salary_type?: string;
          daily_rate?: number;
          monthly_rate?: number;
          hadir_count?: number;
          izin_count?: number;
          sakit_count?: number;
          alpa_count?: number;
          off_count?: number;
          base_pay?: number;
          meal_allowance?: number;
          attendance_allowance?: number;
          created_at?: string;
          paid_at?: string | null;
          lembur_amount?: number;
          thr_amount?: number;
          late_deduction?: number;
          kasbon_deduction?: number;
          personal_loan_deduction?: number;
          journal_entry_id?: string | null;
          expense_id?: string | null;
          izin_weekday_count?: number;
          izin_weekend_count?: number;
          izin_noted_count?: number;
          izin_unnoted_count?: number;
          izin_unnoted_weekend_count?: number;
          izin_deduction?: number;
          izin_weekend_penalty?: number;
          late_count?: number;
          hari_kerja_efektif?: number;
          lembur_hours?: number;
          lembur_rate?: number;
        };
        Relationships: [
          {
            foreignKeyName: "payslips_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      period_closings: {
        Row: {
          id: string;
          business_id: string;
          period_end: string;
          net_income: number;
          journal_entry_id: string | null;
          closed_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          period_end: string;
          net_income: number;
          journal_entry_id?: string | null;
          closed_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          period_end?: string;
          net_income?: number;
          journal_entry_id?: string | null;
          closed_at?: string;
        };
        Relationships: [];
      };
      product_categories: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      product_global_modifier_links: {
        Row: {
          product_id: string;
          group_id: string;
        };
        Insert: {
          product_id: string;
          group_id: string;
        };
        Update: {
          product_id?: string;
          group_id?: string;
        };
        Relationships: [];
      };
      product_option_groups: {
        Row: {
          id: string;
          product_id: string;
          name: string;
          required: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          name: string;
          required?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          name?: string;
          required?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      product_options: {
        Row: {
          id: string;
          group_id: string;
          name: string;
          price_adjustment: number;
          sort_order: number;
        };
        Insert: {
          id?: string;
          group_id: string;
          name: string;
          price_adjustment?: number;
          sort_order?: number;
        };
        Update: {
          id?: string;
          group_id?: string;
          name?: string;
          price_adjustment?: number;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "product_options_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "product_option_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      product_recipes: {
        Row: {
          id: string;
          product_id: string;
          ingredient_id: string | null;
          ingredient_name_manual: string | null;
          qty: number;
          unit: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          ingredient_id?: string | null;
          ingredient_name_manual?: string | null;
          qty: number;
          unit: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          ingredient_id?: string | null;
          ingredient_name_manual?: string | null;
          qty?: number;
          unit?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_recipes_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          category: string | null;
          price: number;
          cost: number;
          stock: number;
          barcode: string | null;
          image_url: string | null;
          emoji: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
          min_stock: number;
          sku: string | null;
          variant_label: string | null;
          featured: boolean | null;
          show_in_self_order: boolean | null;
          sort_order: number | null;
          semi_finished_item_id: string | null;
          department: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          category?: string | null;
          price?: number;
          cost?: number;
          stock?: number;
          barcode?: string | null;
          image_url?: string | null;
          emoji?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          min_stock?: number;
          sku?: string | null;
          variant_label?: string | null;
          featured?: boolean | null;
          show_in_self_order?: boolean | null;
          sort_order?: number | null;
          semi_finished_item_id?: string | null;
          department?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          category?: string | null;
          price?: number;
          cost?: number;
          stock?: number;
          barcode?: string | null;
          image_url?: string | null;
          emoji?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          min_stock?: number;
          sku?: string | null;
          variant_label?: string | null;
          featured?: boolean | null;
          show_in_self_order?: boolean | null;
          sort_order?: number | null;
          semi_finished_item_id?: string | null;
          department?: string | null;
        };
        Relationships: [];
      };
      product_import_staging: {
        Row: {
          id: string;
          business_id: string;
          item_name: string;
          ingredient_id: string;
          qty_per_batch: number;
          unit: string;
          batch_yield: number;
          source_file: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          item_name: string;
          ingredient_id: string;
          qty_per_batch: number;
          unit: string;
          batch_yield: number;
          source_file?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          item_name?: string;
          ingredient_id?: string;
          qty_per_batch?: number;
          unit?: string;
          batch_yield?: number;
          source_file?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      purchase_payments: {
        Row: {
          id: string;
          business_id: string;
          purchase_id: string;
          date: string;
          amount: number;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          purchase_id: string;
          date?: string;
          amount: number;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          purchase_id?: string;
          date?: string;
          amount?: number;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      purchase_request_item_allocations: {
        Row: {
          id: string;
          business_id: string;
          purchase_request_item_id: string;
          supplier_id: string | null;
          qty: number;
          forwarded_at: string | null;
          received_at: string | null;
          purchase_id: string | null;
          created_at: string;
          purchase_order_id: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          purchase_request_item_id: string;
          supplier_id?: string | null;
          qty: number;
          forwarded_at?: string | null;
          received_at?: string | null;
          purchase_id?: string | null;
          created_at?: string;
          purchase_order_id?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          purchase_request_item_id?: string;
          supplier_id?: string | null;
          qty?: number;
          forwarded_at?: string | null;
          received_at?: string | null;
          purchase_id?: string | null;
          created_at?: string;
          purchase_order_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_request_item_allocations_purchase_request_item_id_fkey";
            columns: ["purchase_request_item_id"];
            isOneToOne: false;
            referencedRelation: "purchase_request_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_request_item_allocations_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_request_item_allocations_purchase_id_fkey";
            columns: ["purchase_id"];
            isOneToOne: false;
            referencedRelation: "purchases";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_request_items: {
        Row: {
          id: string;
          business_id: string;
          purchase_request_id: string;
          item_type: string;
          ingredient_id: string | null;
          product_id: string | null;
          item_name: string;
          unit: string | null;
          qty_ordered: number;
          current_stock: number | null;
          created_at: string;
          approved_qty: number | null;
          budget_status: string;
          budget_approved_by: string | null;
          budget_approved_by_user_id: string | null;
          budget_approved_at: string | null;
          budget_note: string | null;
          fulfillment_source: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          purchase_request_id: string;
          item_type: string;
          ingredient_id?: string | null;
          product_id?: string | null;
          item_name: string;
          unit?: string | null;
          qty_ordered: number;
          current_stock?: number | null;
          created_at?: string;
          approved_qty?: number | null;
          budget_status?: string;
          budget_approved_by?: string | null;
          budget_approved_by_user_id?: string | null;
          budget_approved_at?: string | null;
          budget_note?: string | null;
          fulfillment_source?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          purchase_request_id?: string;
          item_type?: string;
          ingredient_id?: string | null;
          product_id?: string | null;
          item_name?: string;
          unit?: string | null;
          qty_ordered?: number;
          current_stock?: number | null;
          created_at?: string;
          approved_qty?: number | null;
          budget_status?: string;
          budget_approved_by?: string | null;
          budget_approved_by_user_id?: string | null;
          budget_approved_at?: string | null;
          budget_note?: string | null;
          fulfillment_source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_request_items_purchase_request_id_fkey";
            columns: ["purchase_request_id"];
            isOneToOne: false;
            referencedRelation: "purchase_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_request_item_stock_fulfillments: {
        Row: {
          id: string;
          business_id: string;
          purchase_request_item_id: string;
          source_location_id: string;
          qty: number;
          marked_by: string | null;
          marked_at: string;
          received_by: string | null;
          received_at: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          purchase_request_item_id: string;
          source_location_id: string;
          qty: number;
          marked_by?: string | null;
          marked_at?: string;
          received_by?: string | null;
          received_at?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          purchase_request_item_id?: string;
          source_location_id?: string;
          qty?: number;
          marked_by?: string | null;
          marked_at?: string;
          received_by?: string | null;
          received_at?: string | null;
        };
        Relationships: [];
      };
      petty_cash_allocations: {
        Row: {
          id: string;
          business_id: string;
          date: string;
          amount: number;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          date: string;
          amount: number;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          date?: string;
          amount?: number;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      supplier_debt_notes: {
        Row: {
          id: string;
          business_id: string;
          supplier_id: string | null;
          supplier_name_manual: string | null;
          category: string;
          amount: number;
          note: string | null;
          receipt_url: string | null;
          origin: string;
          shift_id: string | null;
          cashier_id: string | null;
          created_by_user_id: string | null;
          status: string;
          verified_by: string | null;
          verified_at: string | null;
          created_at: string;
          date: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          supplier_id?: string | null;
          supplier_name_manual?: string | null;
          category: string;
          amount: number;
          note?: string | null;
          receipt_url?: string | null;
          origin?: string;
          shift_id?: string | null;
          cashier_id?: string | null;
          created_by_user_id?: string | null;
          status?: string;
          verified_by?: string | null;
          verified_at?: string | null;
          created_at?: string;
          date?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          supplier_id?: string | null;
          supplier_name_manual?: string | null;
          category?: string;
          amount?: number;
          note?: string | null;
          receipt_url?: string | null;
          origin?: string;
          shift_id?: string | null;
          cashier_id?: string | null;
          created_by_user_id?: string | null;
          status?: string;
          verified_by?: string | null;
          verified_at?: string | null;
          created_at?: string;
          date?: string;
        };
        Relationships: [];
      };
      petty_cash_closures: {
        Row: {
          id: string;
          business_id: string;
          date: string;
          total_allocated: number;
          total_tunai: number;
          total_hutang: number;
          hutang_count: number;
          expected_remaining: number;
          actual_remaining: number;
          difference: number;
          notes: string | null;
          closed_by: string | null;
          closed_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          date: string;
          total_allocated?: number;
          total_tunai?: number;
          total_hutang?: number;
          hutang_count?: number;
          expected_remaining?: number;
          actual_remaining: number;
          difference?: number;
          notes?: string | null;
          closed_by?: string | null;
          closed_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          date?: string;
          total_allocated?: number;
          total_tunai?: number;
          total_hutang?: number;
          hutang_count?: number;
          expected_remaining?: number;
          actual_remaining?: number;
          difference?: number;
          notes?: string | null;
          closed_by?: string | null;
          closed_at?: string;
        };
        Relationships: [];
      };
      semi_finished_items: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          unit: string;
          stock: number;
          min_stock: number;
          fluctuation_pct: number;
          barcode: string | null;
          category: string | null;
          batch_yield_qty: number | null;
          ingredient_id: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
          manual_unit_cost: number | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          unit: string;
          stock?: number;
          min_stock?: number;
          fluctuation_pct?: number;
          barcode?: string | null;
          category?: string | null;
          batch_yield_qty?: number | null;
          ingredient_id?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          manual_unit_cost?: number | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          unit?: string;
          stock?: number;
          min_stock?: number;
          fluctuation_pct?: number;
          barcode?: string | null;
          category?: string | null;
          batch_yield_qty?: number | null;
          ingredient_id?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          manual_unit_cost?: number | null;
        };
        Relationships: [];
      };
      semi_finished_recipes: {
        Row: {
          id: string;
          business_id: string;
          semi_finished_item_id: string;
          component_type: string;
          ingredient_id: string | null;
          component_semi_finished_id: string | null;
          qty: number;
          unit: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          semi_finished_item_id: string;
          component_type: string;
          ingredient_id?: string | null;
          component_semi_finished_id?: string | null;
          qty: number;
          unit: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          semi_finished_item_id?: string;
          component_type?: string;
          ingredient_id?: string | null;
          component_semi_finished_id?: string | null;
          qty?: number;
          unit?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      bsj_import_staging: {
        Row: {
          id: string;
          business_id: string;
          item_name: string;
          ingredient_id: string;
          qty_per_batch: number;
          unit: string;
          batch_yield: number;
          source_file: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          item_name: string;
          ingredient_id: string;
          qty_per_batch: number;
          unit: string;
          batch_yield: number;
          source_file?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          item_name?: string;
          ingredient_id?: string;
          qty_per_batch?: number;
          unit?: string;
          batch_yield?: number;
          source_file?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      finished_products: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          category: string | null;
          selling_price: number | null;
          fluctuation_pct: number;
          target_food_cost_pct: number | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          category?: string | null;
          selling_price?: number | null;
          fluctuation_pct?: number;
          target_food_cost_pct?: number | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          category?: string | null;
          selling_price?: number | null;
          fluctuation_pct?: number;
          target_food_cost_pct?: number | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      finished_product_recipes: {
        Row: {
          id: string;
          business_id: string;
          finished_product_id: string;
          component_type: string;
          ingredient_id: string | null;
          semi_finished_item_id: string | null;
          qty: number;
          unit: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          finished_product_id: string;
          component_type: string;
          ingredient_id?: string | null;
          semi_finished_item_id?: string | null;
          qty: number;
          unit: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          finished_product_id?: string;
          component_type?: string;
          ingredient_id?: string | null;
          semi_finished_item_id?: string | null;
          qty?: number;
          unit?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      finished_product_import_staging: {
        Row: {
          id: string;
          business_id: string;
          item_name: string;
          component_type: string;
          ingredient_id: string | null;
          semi_finished_item_id: string | null;
          qty_per_batch: number;
          unit: string;
          batch_yield: number;
          source_file: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          item_name: string;
          component_type: string;
          ingredient_id?: string | null;
          semi_finished_item_id?: string | null;
          qty_per_batch: number;
          unit: string;
          batch_yield: number;
          source_file?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          item_name?: string;
          component_type?: string;
          ingredient_id?: string | null;
          semi_finished_item_id?: string | null;
          qty_per_batch?: number;
          unit?: string;
          batch_yield?: number;
          source_file?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      production_runs: {
        Row: {
          id: string;
          business_id: string;
          semi_finished_item_id: string | null;
          item_name: string;
          qty_produced: number;
          unit: string;
          total_cost: number;
          unit_cost: number;
          produced_by_employee_id: string | null;
          produced_by_name: string;
          note: string | null;
          voided: boolean;
          voided_at: string | null;
          void_reason: string | null;
          status: string;
          reject_reason: string | null;
          produced_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          semi_finished_item_id?: string | null;
          item_name: string;
          qty_produced: number;
          unit: string;
          total_cost?: number;
          unit_cost?: number;
          produced_by_employee_id?: string | null;
          produced_by_name: string;
          note?: string | null;
          voided?: boolean;
          voided_at?: string | null;
          void_reason?: string | null;
          status?: string;
          reject_reason?: string | null;
          produced_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          semi_finished_item_id?: string | null;
          item_name?: string;
          qty_produced?: number;
          unit?: string;
          total_cost?: number;
          unit_cost?: number;
          produced_by_employee_id?: string | null;
          produced_by_name?: string;
          note?: string | null;
          voided?: boolean;
          voided_at?: string | null;
          void_reason?: string | null;
          status?: string;
          reject_reason?: string | null;
          produced_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      production_run_consumptions: {
        Row: {
          id: string;
          business_id: string;
          production_run_id: string;
          component_type: string;
          ingredient_id: string | null;
          semi_finished_item_id: string | null;
          component_name: string;
          qty_consumed: number;
          unit: string;
          unit_cost_at_time: number;
          subtotal_cost: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          production_run_id: string;
          component_type: string;
          ingredient_id?: string | null;
          semi_finished_item_id?: string | null;
          component_name: string;
          qty_consumed: number;
          unit: string;
          unit_cost_at_time: number;
          subtotal_cost: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          production_run_id?: string;
          component_type?: string;
          ingredient_id?: string | null;
          semi_finished_item_id?: string | null;
          component_name?: string;
          qty_consumed?: number;
          unit?: string;
          unit_cost_at_time?: number;
          subtotal_cost?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      production_run_reported_consumptions: {
        Row: {
          id: string;
          business_id: string;
          production_run_id: string;
          ingredient_id: string | null;
          reported_name: string;
          reported_unit: string;
          qty: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          production_run_id: string;
          ingredient_id?: string | null;
          reported_name: string;
          reported_unit: string;
          qty: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          production_run_id?: string;
          ingredient_id?: string | null;
          reported_name?: string;
          reported_unit?: string;
          qty?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      outlets: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          address: string | null;
          active: boolean;
          pic_employee_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          address?: string | null;
          active?: boolean;
          pic_employee_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          address?: string | null;
          active?: boolean;
          pic_employee_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      outlet_stock: {
        Row: {
          id: string;
          business_id: string;
          outlet_id: string;
          semi_finished_item_id: string;
          stock: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          outlet_id: string;
          semi_finished_item_id: string;
          stock?: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          outlet_id?: string;
          semi_finished_item_id?: string;
          stock?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      outlet_requests: {
        Row: {
          id: string;
          business_id: string;
          outlet_id: string | null;
          outlet_name: string;
          employee_id: string | null;
          employee_name: string;
          status: string;
          note: string | null;
          reject_reason: string | null;
          created_at: string;
          decided_at: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          outlet_id?: string | null;
          outlet_name: string;
          employee_id?: string | null;
          employee_name: string;
          status?: string;
          note?: string | null;
          reject_reason?: string | null;
          created_at?: string;
          decided_at?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          outlet_id?: string | null;
          outlet_name?: string;
          employee_id?: string | null;
          employee_name?: string;
          status?: string;
          note?: string | null;
          reject_reason?: string | null;
          created_at?: string;
          decided_at?: string | null;
        };
        Relationships: [];
      };
      outlet_request_items: {
        Row: {
          id: string;
          business_id: string;
          outlet_request_id: string;
          semi_finished_item_id: string | null;
          item_name: string;
          unit: string;
          qty_requested: number;
          qty_approved: number | null;
          value: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          outlet_request_id: string;
          semi_finished_item_id?: string | null;
          item_name: string;
          unit: string;
          qty_requested: number;
          qty_approved?: number | null;
          value?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          outlet_request_id?: string;
          semi_finished_item_id?: string | null;
          item_name?: string;
          unit?: string;
          qty_requested?: number;
          qty_approved?: number | null;
          value?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      purchase_requests: {
        Row: {
          id: string;
          business_id: string;
          employee_id: string | null;
          employee_name: string;
          status: string;
          note: string | null;
          created_at: string;
          received_at: string | null;
          forwarded_at: string | null;
          location_id: string | null;
          pr_number: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          employee_id?: string | null;
          employee_name: string;
          status?: string;
          note?: string | null;
          created_at?: string;
          received_at?: string | null;
          forwarded_at?: string | null;
          location_id?: string | null;
          pr_number?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          employee_id?: string | null;
          employee_name?: string;
          status?: string;
          note?: string | null;
          created_at?: string;
          received_at?: string | null;
          forwarded_at?: string | null;
          location_id?: string | null;
          pr_number?: string | null;
        };
        Relationships: [];
      };
      purchase_orders: {
        Row: {
          id: string;
          business_id: string;
          po_number: string;
          supplier_id: string | null;
          purchase_request_id: string | null;
          status: string;
          total_amount: number;
          issued_by: string | null;
          issued_by_user_id: string | null;
          approved_by: string | null;
          approved_by_user_id: string | null;
          approved_at: string | null;
          note: string | null;
          created_at: string;
          approval_levels: number;
          level1_approved_by_user_id: string | null;
          level1_approved_by: string | null;
          level1_approved_at: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          po_number: string;
          supplier_id?: string | null;
          purchase_request_id?: string | null;
          status?: string;
          total_amount?: number;
          issued_by?: string | null;
          issued_by_user_id?: string | null;
          approved_by?: string | null;
          approved_by_user_id?: string | null;
          approved_at?: string | null;
          note?: string | null;
          created_at?: string;
          approval_levels?: number;
          level1_approved_by_user_id?: string | null;
          level1_approved_by?: string | null;
          level1_approved_at?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          po_number?: string;
          supplier_id?: string | null;
          purchase_request_id?: string | null;
          status?: string;
          total_amount?: number;
          issued_by?: string | null;
          issued_by_user_id?: string | null;
          approved_by?: string | null;
          approved_by_user_id?: string | null;
          approved_at?: string | null;
          note?: string | null;
          created_at?: string;
          approval_levels?: number;
          level1_approved_by_user_id?: string | null;
          level1_approved_by?: string | null;
          level1_approved_at?: string | null;
        };
        Relationships: [];
      };
      purchase_order_items: {
        Row: {
          id: string;
          business_id: string;
          purchase_order_id: string;
          item_name: string;
          unit: string;
          qty: number;
          unit_price: number;
          subtotal: number;
          allocation_id: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          purchase_order_id: string;
          item_name: string;
          unit: string;
          qty: number;
          unit_price?: number;
          subtotal?: number;
          allocation_id?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          purchase_order_id?: string;
          item_name?: string;
          unit?: string;
          qty?: number;
          unit_price?: number;
          subtotal?: number;
          allocation_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey";
            columns: ["purchase_order_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_order_contributors: {
        Row: {
          id: string;
          business_id: string;
          purchase_order_id: string;
          user_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          purchase_order_id: string;
          user_id: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          purchase_order_id?: string;
          user_id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_order_contributors_purchase_order_id_fkey";
            columns: ["purchase_order_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      goods_receipt_notes: {
        Row: {
          id: string;
          business_id: string;
          purchase_order_id: string;
          grn_number: string;
          received_by: string;
          received_by_user_id: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          purchase_order_id: string;
          grn_number: string;
          received_by: string;
          received_by_user_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          purchase_order_id?: string;
          grn_number?: string;
          received_by?: string;
          received_by_user_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goods_receipt_notes_purchase_order_id_fkey";
            columns: ["purchase_order_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      goods_receipt_note_items: {
        Row: {
          id: string;
          business_id: string;
          grn_id: string;
          purchase_order_item_id: string;
          qty_received: number;
          condition: string;
          condition_note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          grn_id: string;
          purchase_order_item_id: string;
          qty_received: number;
          condition: string;
          condition_note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          grn_id?: string;
          purchase_order_item_id?: string;
          qty_received?: number;
          condition?: string;
          condition_note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goods_receipt_note_items_grn_id_fkey";
            columns: ["grn_id"];
            isOneToOne: false;
            referencedRelation: "goods_receipt_notes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goods_receipt_note_items_purchase_order_item_id_fkey";
            columns: ["purchase_order_item_id"];
            isOneToOne: false;
            referencedRelation: "purchase_order_items";
            referencedColumns: ["id"];
          },
        ];
      };
      delivery_notes: {
        Row: {
          id: string;
          business_id: string;
          purchase_request_id: string;
          dn_number: string;
          from_location_id: string;
          to_location_name: string;
          to_location_id: string | null;
          prepared_by: string;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          purchase_request_id: string;
          dn_number: string;
          from_location_id: string;
          to_location_name: string;
          to_location_id?: string | null;
          prepared_by: string;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          purchase_request_id?: string;
          dn_number?: string;
          from_location_id?: string;
          to_location_name?: string;
          to_location_id?: string | null;
          prepared_by?: string;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "delivery_notes_purchase_request_id_fkey";
            columns: ["purchase_request_id"];
            isOneToOne: false;
            referencedRelation: "purchase_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      delivery_note_items: {
        Row: {
          id: string;
          business_id: string;
          delivery_note_id: string;
          source_type: string;
          source_id: string;
          item_name: string;
          unit: string;
          qty: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          delivery_note_id: string;
          source_type: string;
          source_id: string;
          item_name: string;
          unit: string;
          qty: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          delivery_note_id?: string;
          source_type?: string;
          source_id?: string;
          item_name?: string;
          unit?: string;
          qty?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "delivery_note_items_delivery_note_id_fkey";
            columns: ["delivery_note_id"];
            isOneToOne: false;
            referencedRelation: "delivery_notes";
            referencedColumns: ["id"];
          },
        ];
      };
      manual_delivery_notes: {
        Row: {
          id: string;
          business_id: string;
          location_id: string;
          dn_number: string;
          destination: string;
          note: string | null;
          created_by_user_id: string | null;
          created_by_name: string | null;
          created_at: string;
          receive_code: string;
          received_by_business_id: string | null;
          received_at: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          location_id: string;
          dn_number: string;
          destination: string;
          note?: string | null;
          created_by_user_id?: string | null;
          created_by_name?: string | null;
          created_at?: string;
          receive_code?: string;
          received_by_business_id?: string | null;
          received_at?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          location_id?: string;
          dn_number?: string;
          destination?: string;
          note?: string | null;
          created_by_user_id?: string | null;
          created_by_name?: string | null;
          created_at?: string;
          receive_code?: string;
          received_by_business_id?: string | null;
          received_at?: string | null;
        };
        Relationships: [];
      };
      manual_delivery_note_items: {
        Row: {
          id: string;
          business_id: string;
          manual_delivery_note_id: string;
          item_name: string;
          unit: string | null;
          qty: number;
          sort_order: number;
        };
        Insert: {
          id?: string;
          business_id: string;
          manual_delivery_note_id: string;
          item_name: string;
          unit?: string | null;
          qty: number;
          sort_order?: number;
        };
        Update: {
          id?: string;
          business_id?: string;
          manual_delivery_note_id?: string;
          item_name?: string;
          unit?: string | null;
          qty?: number;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "manual_delivery_note_items_manual_delivery_note_id_fkey";
            columns: ["manual_delivery_note_id"];
            isOneToOne: false;
            referencedRelation: "manual_delivery_notes";
            referencedColumns: ["id"];
          },
        ];
      };
      manual_purchase_requests: {
        Row: {
          id: string;
          business_id: string;
          location_id: string;
          pr_number: string;
          note: string | null;
          created_by_user_id: string | null;
          created_by_name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          location_id: string;
          pr_number: string;
          note?: string | null;
          created_by_user_id?: string | null;
          created_by_name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          location_id?: string;
          pr_number?: string;
          note?: string | null;
          created_by_user_id?: string | null;
          created_by_name?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      manual_purchase_request_items: {
        Row: {
          id: string;
          business_id: string;
          manual_purchase_request_id: string;
          item_name: string;
          unit: string | null;
          qty: number;
          sort_order: number;
        };
        Insert: {
          id?: string;
          business_id: string;
          manual_purchase_request_id: string;
          item_name: string;
          unit?: string | null;
          qty: number;
          sort_order?: number;
        };
        Update: {
          id?: string;
          business_id?: string;
          manual_purchase_request_id?: string;
          item_name?: string;
          unit?: string | null;
          qty?: number;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "manual_purchase_request_items_manual_purchase_request_id_fkey";
            columns: ["manual_purchase_request_id"];
            isOneToOne: false;
            referencedRelation: "manual_purchase_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      manual_stock_opnames: {
        Row: {
          id: string;
          business_id: string;
          location_id: string;
          opname_number: string;
          note: string | null;
          created_by_user_id: string | null;
          created_by_name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          location_id: string;
          opname_number: string;
          note?: string | null;
          created_by_user_id?: string | null;
          created_by_name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          location_id?: string;
          opname_number?: string;
          note?: string | null;
          created_by_user_id?: string | null;
          created_by_name?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      manual_stock_opname_items: {
        Row: {
          id: string;
          business_id: string;
          manual_stock_opname_id: string;
          item_name: string;
          unit: string | null;
          qty: number;
          sort_order: number;
        };
        Insert: {
          id?: string;
          business_id: string;
          manual_stock_opname_id: string;
          item_name: string;
          unit?: string | null;
          qty: number;
          sort_order?: number;
        };
        Update: {
          id?: string;
          business_id?: string;
          manual_stock_opname_id?: string;
          item_name?: string;
          unit?: string | null;
          qty?: number;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "manual_stock_opname_items_manual_stock_opname_id_fkey";
            columns: ["manual_stock_opname_id"];
            isOneToOne: false;
            referencedRelation: "manual_stock_opnames";
            referencedColumns: ["id"];
          },
        ];
      };
      procurement_budget_lines: {
        Row: {
          id: string;
          business_id: string;
          period: string;
          ingredient_id: string;
          reference_period: string | null;
          suggested_qty: number;
          order_qty: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          period: string;
          ingredient_id: string;
          reference_period?: string | null;
          suggested_qty?: number;
          order_qty?: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          period?: string;
          ingredient_id?: string;
          reference_period?: string | null;
          suggested_qty?: number;
          order_qty?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      purchases: {
        Row: {
          id: string;
          business_id: string;
          supplier_id: string | null;
          date: string;
          category: string;
          ingredient_id: string | null;
          product_id: string | null;
          qty: number | null;
          note: string | null;
          amount: number;
          paid_amount: number;
          created_at: string;
          due_date: string | null;
          voided: boolean;
          voided_at: string | null;
          void_reason: string | null;
          stock_only: boolean;
          location_id: string | null;
          expense_account_code: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          supplier_id?: string | null;
          date?: string;
          category: string;
          ingredient_id?: string | null;
          product_id?: string | null;
          qty?: number | null;
          note?: string | null;
          amount: number;
          paid_amount?: number;
          created_at?: string;
          due_date?: string | null;
          voided?: boolean;
          voided_at?: string | null;
          void_reason?: string | null;
          stock_only?: boolean;
          location_id?: string | null;
          expense_account_code?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          supplier_id?: string | null;
          date?: string;
          category?: string;
          ingredient_id?: string | null;
          product_id?: string | null;
          qty?: number | null;
          note?: string | null;
          amount?: number;
          paid_amount?: number;
          created_at?: string;
          due_date?: string | null;
          voided?: boolean;
          voided_at?: string | null;
          void_reason?: string | null;
          stock_only?: boolean;
          location_id?: string | null;
          expense_account_code?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "purchases_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      receivable_payments: {
        Row: {
          id: string;
          business_id: string;
          receivable_id: string;
          date: string;
          amount: number;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          receivable_id: string;
          date?: string;
          amount: number;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          receivable_id?: string;
          date?: string;
          amount?: number;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      receivables: {
        Row: {
          id: string;
          business_id: string;
          customer_id: string | null;
          date: string;
          description: string;
          amount: number;
          paid_amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          customer_id?: string | null;
          date?: string;
          description: string;
          amount: number;
          paid_amount?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          customer_id?: string | null;
          date?: string;
          description?: string;
          amount?: number;
          paid_amount?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      reconciliations: {
        Row: {
          id: string;
          business_id: string;
          date: string;
          method: string;
          actual_amount: number;
          note: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          date: string;
          method: string;
          actual_amount: number;
          note?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          date?: string;
          method?: string;
          actual_amount?: number;
          note?: string | null;
        };
        Relationships: [];
      };
      self_order_items: {
        Row: {
          id: string;
          self_order_id: string;
          product_id: string | null;
          name: string;
          price: number;
          qty: number;
          note: string | null;
        };
        Insert: {
          id?: string;
          self_order_id: string;
          product_id?: string | null;
          name: string;
          price: number;
          qty: number;
          note?: string | null;
        };
        Update: {
          id?: string;
          self_order_id?: string;
          product_id?: string | null;
          name?: string;
          price?: number;
          qty?: number;
          note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "self_order_items_self_order_id_fkey";
            columns: ["self_order_id"];
            isOneToOne: false;
            referencedRelation: "self_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "self_order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      self_orders: {
        Row: {
          id: string;
          business_id: string;
          table_id: string;
          status: string;
          created_at: string;
          customer_name: string | null;
          customer_phone: string | null;
          payment_method: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          table_id: string;
          status?: string;
          created_at?: string;
          customer_name?: string | null;
          customer_phone?: string | null;
          payment_method?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          table_id?: string;
          status?: string;
          created_at?: string;
          customer_name?: string | null;
          customer_phone?: string | null;
          payment_method?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "self_orders_table_id_fkey";
            columns: ["table_id"];
            isOneToOne: false;
            referencedRelation: "tables";
            referencedColumns: ["id"];
          },
        ];
      };
      shift_templates: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          start_time: string;
          end_time: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          start_time: string;
          end_time: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          start_time?: string;
          end_time?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      shifts: {
        Row: {
          id: string;
          business_id: string;
          cashier_id: string;
          opening_cash: number;
          opened_at: string;
          closed_at: string | null;
          closing_cash: number | null;
          notes: string | null;
          close_notes: string | null;
          cash_sales: number;
          non_cash_sales: number;
          total_sales: number;
          expected_cash: number | null;
          difference: number | null;
          tx_count: number;
          void_count: number;
        };
        Insert: {
          id?: string;
          business_id: string;
          cashier_id: string;
          opening_cash?: number;
          opened_at?: string;
          closed_at?: string | null;
          closing_cash?: number | null;
          notes?: string | null;
          close_notes?: string | null;
          cash_sales?: number;
          non_cash_sales?: number;
          total_sales?: number;
          expected_cash?: number | null;
          difference?: number | null;
          tx_count?: number;
          void_count?: number;
        };
        Update: {
          id?: string;
          business_id?: string;
          cashier_id?: string;
          opening_cash?: number;
          opened_at?: string;
          closed_at?: string | null;
          closing_cash?: number | null;
          notes?: string | null;
          close_notes?: string | null;
          cash_sales?: number;
          non_cash_sales?: number;
          total_sales?: number;
          expected_cash?: number | null;
          difference?: number | null;
          tx_count?: number;
          void_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "shifts_cashier_id_fkey";
            columns: ["cashier_id"];
            isOneToOne: false;
            referencedRelation: "cashiers";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_opname_entries: {
        Row: {
          id: string;
          business_id: string;
          location_id: string;
          component_type: string;
          ingredient_id: string | null;
          semi_finished_item_id: string | null;
          item_name: string;
          unit: string;
          reported_stock: number;
          system_stock_at_report: number;
          submitted_by_name: string;
          entry_date: string;
          status: string;
          verified_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          location_id: string;
          component_type: string;
          ingredient_id?: string | null;
          semi_finished_item_id?: string | null;
          item_name: string;
          unit: string;
          reported_stock: number;
          system_stock_at_report: number;
          submitted_by_name: string;
          entry_date?: string;
          status?: string;
          verified_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          location_id?: string;
          component_type?: string;
          ingredient_id?: string | null;
          semi_finished_item_id?: string | null;
          item_name?: string;
          unit?: string;
          reported_stock?: number;
          system_stock_at_report?: number;
          submitted_by_name?: string;
          entry_date?: string;
          status?: string;
          verified_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      location_transfers: {
        Row: {
          id: string;
          business_id: string;
          from_location_id: string;
          to_location_id: string;
          requested_by_name: string;
          note: string | null;
          status: string;
          created_at: string;
          fulfilled_at: string | null;
          fulfilled_by_name: string | null;
          dn_number: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          from_location_id: string;
          to_location_id: string;
          requested_by_name: string;
          note?: string | null;
          status?: string;
          created_at?: string;
          fulfilled_at?: string | null;
          fulfilled_by_name?: string | null;
          dn_number?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          from_location_id?: string;
          to_location_id?: string;
          requested_by_name?: string;
          note?: string | null;
          status?: string;
          created_at?: string;
          fulfilled_at?: string | null;
          fulfilled_by_name?: string | null;
          dn_number?: string | null;
        };
        Relationships: [];
      };
      location_transfer_items: {
        Row: {
          id: string;
          business_id: string;
          transfer_id: string;
          semi_finished_item_id: string;
          item_name: string;
          unit: string;
          qty_requested: number;
          qty_sent: number | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          transfer_id: string;
          semi_finished_item_id: string;
          item_name: string;
          unit: string;
          qty_requested: number;
          qty_sent?: number | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          transfer_id?: string;
          semi_finished_item_id?: string;
          item_name?: string;
          unit?: string;
          qty_requested?: number;
          qty_sent?: number | null;
        };
        Relationships: [];
      };
      stock_adjustments: {
        Row: {
          id: string;
          business_id: string;
          product_id: string | null;
          ingredient_id: string | null;
          semi_finished_item_id: string | null;
          location_id: string | null;
          item_name: string;
          unit: string | null;
          stock_before: number;
          stock_after: number;
          diff: number;
          reason: string;
          entry_date: string;
          created_at: string;
          submitted_by_name: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          product_id?: string | null;
          ingredient_id?: string | null;
          semi_finished_item_id?: string | null;
          location_id?: string | null;
          item_name: string;
          unit?: string | null;
          stock_before: number;
          stock_after: number;
          diff: number;
          reason: string;
          entry_date?: string;
          created_at?: string;
          submitted_by_name?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          product_id?: string | null;
          ingredient_id?: string | null;
          semi_finished_item_id?: string | null;
          location_id?: string | null;
          item_name?: string;
          unit?: string | null;
          stock_before?: number;
          stock_after?: number;
          diff?: number;
          reason?: string;
          entry_date?: string;
          created_at?: string;
          submitted_by_name?: string | null;
        };
        Relationships: [];
      };
      stock_locations: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          sort_order: number;
          created_at: string;
          is_default_purchase: boolean;
          is_production: boolean;
          portal_slug: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          sort_order?: number;
          created_at?: string;
          is_default_purchase?: boolean;
          is_production?: boolean;
          portal_slug?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          sort_order?: number;
          created_at?: string;
          is_default_purchase?: boolean;
          is_production?: boolean;
          portal_slug?: string | null;
        };
        Relationships: [];
      };
      stock_location_opname_sections: {
        Row: {
          business_id: string;
          location_id: string;
          section_id: string;
        };
        Insert: {
          business_id: string;
          location_id: string;
          section_id: string;
        };
        Update: {
          business_id?: string;
          location_id?: string;
          section_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_location_opname_sections_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "stock_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_location_opname_sections_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "ingredient_opname_sections";
            referencedColumns: ["id"];
          },
        ];
      };
      ingredient_location_stock: {
        Row: {
          id: string;
          business_id: string;
          location_id: string;
          ingredient_id: string;
          stock: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          location_id: string;
          ingredient_id: string;
          stock?: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          location_id?: string;
          ingredient_id?: string;
          stock?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      semi_finished_item_location_stock: {
        Row: {
          id: string;
          business_id: string;
          location_id: string;
          semi_finished_item_id: string;
          stock: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          location_id: string;
          semi_finished_item_id: string;
          stock?: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          location_id?: string;
          semi_finished_item_id?: string;
          stock?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      semi_finished_item_opname_section_items: {
        Row: {
          business_id: string;
          semi_finished_item_id: string;
          section_id: string;
        };
        Insert: {
          business_id: string;
          semi_finished_item_id: string;
          section_id: string;
        };
        Update: {
          business_id?: string;
          semi_finished_item_id?: string;
          section_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "semi_finished_item_opname_section_items_semi_finished_item_i_fkey";
            columns: ["semi_finished_item_id"];
            isOneToOne: false;
            referencedRelation: "semi_finished_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "semi_finished_item_opname_section_items_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "ingredient_opname_sections";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          id: string;
          business_id: string;
          plan_code: string;
          status: string;
          period_end: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          plan_code: string;
          status?: string;
          period_end?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          plan_code?: string;
          status?: string;
          period_end?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      suppliers: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          phone: string | null;
          address: string | null;
          notes: string | null;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          phone?: string | null;
          address?: string | null;
          notes?: string | null;
          created_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          phone?: string | null;
          address?: string | null;
          notes?: string | null;
          created_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      tables: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          qr_slug: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          qr_slug: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          qr_slug?: string;
        };
        Relationships: [];
      };
      ticket_categories: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          price_weekday: number;
          price_holiday: number;
          member_price: number;
          next_serial: number;
          active: boolean;
          deleted_at: string | null;
          created_at: string;
          group_min_qty: number;
          group_price: number | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          price_weekday?: number;
          price_holiday?: number;
          member_price?: number;
          next_serial?: number;
          active?: boolean;
          deleted_at?: string | null;
          created_at?: string;
          group_min_qty?: number;
          group_price?: number | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          price_weekday?: number;
          price_holiday?: number;
          member_price?: number;
          next_serial?: number;
          active?: boolean;
          deleted_at?: string | null;
          created_at?: string;
          group_min_qty?: number;
          group_price?: number | null;
        };
        Relationships: [];
      };
      ticket_holidays: {
        Row: {
          id: string;
          business_id: string;
          holiday_date: string;
          label: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          holiday_date: string;
          label?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          holiday_date?: string;
          label?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      ticket_serials: {
        Row: {
          id: string;
          ticket_transaction_id: string;
          ticket_category_id: string;
          business_id: string;
          serial_no: number;
          price: number;
          is_member_price: boolean;
          manual_number: string;
          checked_in_at: string | null;
          checked_in_by: string | null;
        };
        Insert: {
          id?: string;
          ticket_transaction_id: string;
          ticket_category_id: string;
          business_id: string;
          serial_no: number;
          price: number;
          is_member_price?: boolean;
          manual_number: string;
          checked_in_at?: string | null;
          checked_in_by?: string | null;
        };
        Update: {
          id?: string;
          ticket_transaction_id?: string;
          ticket_category_id?: string;
          business_id?: string;
          serial_no?: number;
          price?: number;
          is_member_price?: boolean;
          manual_number?: string;
          checked_in_at?: string | null;
          checked_in_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ticket_serials_ticket_category_id_fkey";
            columns: ["ticket_category_id"];
            isOneToOne: false;
            referencedRelation: "ticket_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      ticket_transactions: {
        Row: {
          id: string;
          business_id: string;
          shift_id: string | null;
          cashier_id: string;
          member_id: string | null;
          invoice_number: string;
          date: string;
          is_holiday: boolean;
          subtotal: number;
          service: number;
          tax: number;
          total: number;
          payment_method: string;
          received: number | null;
          change: number;
          voided: boolean;
          voided_at: string | null;
          void_reason: string | null;
          voided_by: string | null;
          client_ref: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          shift_id?: string | null;
          cashier_id: string;
          member_id?: string | null;
          invoice_number: string;
          date?: string;
          is_holiday?: boolean;
          subtotal?: number;
          service?: number;
          tax?: number;
          total?: number;
          payment_method: string;
          received?: number | null;
          change?: number;
          voided?: boolean;
          voided_at?: string | null;
          void_reason?: string | null;
          voided_by?: string | null;
          client_ref?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          shift_id?: string | null;
          cashier_id?: string;
          member_id?: string | null;
          invoice_number?: string;
          date?: string;
          is_holiday?: boolean;
          subtotal?: number;
          service?: number;
          tax?: number;
          total?: number;
          payment_method?: string;
          received?: number | null;
          change?: number;
          voided?: boolean;
          voided_at?: string | null;
          void_reason?: string | null;
          voided_by?: string | null;
          client_ref?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ticket_transactions_cashier_id_fkey";
            columns: ["cashier_id"];
            isOneToOne: false;
            referencedRelation: "cashiers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ticket_transactions_voided_by_fkey";
            columns: ["voided_by"];
            isOneToOne: false;
            referencedRelation: "cashiers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ticket_transactions_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      transaction_ingredient_consumption: {
        Row: {
          id: string;
          transaction_id: string;
          ingredient_id: string;
          qty: number;
        };
        Insert: {
          id?: string;
          transaction_id: string;
          ingredient_id: string;
          qty: number;
        };
        Update: {
          id?: string;
          transaction_id?: string;
          ingredient_id?: string;
          qty?: number;
        };
        Relationships: [];
      };
      transaction_items: {
        Row: {
          id: string;
          transaction_id: string;
          product_id: string | null;
          name: string;
          category: string | null;
          price: number;
          cost: number;
          qty: number;
          note: string | null;
          disc: number;
          disc_type: string;
          voided: boolean;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
          batch: number;
        };
        Insert: {
          id?: string;
          transaction_id: string;
          product_id?: string | null;
          name: string;
          category?: string | null;
          price: number;
          cost?: number;
          qty: number;
          note?: string | null;
          disc?: number;
          disc_type?: string;
          voided?: boolean;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
          batch?: number;
        };
        Update: {
          id?: string;
          transaction_id?: string;
          product_id?: string | null;
          name?: string;
          category?: string | null;
          price?: number;
          cost?: number;
          qty?: number;
          note?: string | null;
          disc?: number;
          disc_type?: string;
          voided?: boolean;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
          batch?: number;
        };
        Relationships: [
          {
            foreignKeyName: "transaction_items_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transaction_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      transaction_payments: {
        Row: {
          id: string;
          transaction_id: string;
          method: string;
          amount: number;
          received: number | null;
          change: number | null;
        };
        Insert: {
          id?: string;
          transaction_id: string;
          method: string;
          amount: number;
          received?: number | null;
          change?: number | null;
        };
        Update: {
          id?: string;
          transaction_id?: string;
          method?: string;
          amount?: number;
          received?: number | null;
          change?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "transaction_payments_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          id: string;
          business_id: string;
          shift_id: string | null;
          cashier_id: string | null;
          invoice_number: string;
          date: string;
          subtotal_raw: number;
          subtotal: number;
          service: number;
          tax: number;
          total: number;
          total_item_disc: number;
          order_disc_amt: number;
          total_cost: number;
          gross_profit: number;
          is_split: boolean;
          voided: boolean;
          voided_at: string | null;
          void_reason: string | null;
          voided_by: string | null;
          table_id: string | null;
          customer_id: string | null;
          client_ref: string | null;
          order_label: string | null;
          customer_name: string | null;
          order_disc_name: string | null;
          order_type: string | null;
          catatan: string | null;
          receipt_code: string | null;
          external_ref: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          shift_id?: string | null;
          cashier_id?: string | null;
          invoice_number: string;
          date?: string;
          subtotal_raw?: number;
          subtotal?: number;
          service?: number;
          tax?: number;
          total?: number;
          total_item_disc?: number;
          order_disc_amt?: number;
          total_cost?: number;
          gross_profit?: number;
          is_split?: boolean;
          voided?: boolean;
          voided_at?: string | null;
          void_reason?: string | null;
          voided_by?: string | null;
          table_id?: string | null;
          customer_id?: string | null;
          client_ref?: string | null;
          order_label?: string | null;
          customer_name?: string | null;
          order_disc_name?: string | null;
          order_type?: string | null;
          catatan?: string | null;
          receipt_code?: string | null;
          external_ref?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          shift_id?: string | null;
          cashier_id?: string | null;
          invoice_number?: string;
          date?: string;
          subtotal_raw?: number;
          subtotal?: number;
          service?: number;
          tax?: number;
          total?: number;
          total_item_disc?: number;
          order_disc_amt?: number;
          total_cost?: number;
          gross_profit?: number;
          is_split?: boolean;
          voided?: boolean;
          voided_at?: string | null;
          void_reason?: string | null;
          voided_by?: string | null;
          table_id?: string | null;
          customer_id?: string | null;
          client_ref?: string | null;
          order_label?: string | null;
          customer_name?: string | null;
          order_disc_name?: string | null;
          order_type?: string | null;
          catatan?: string | null;
          receipt_code?: string | null;
          external_ref?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_cashier_id_fkey";
            columns: ["cashier_id"];
            isOneToOne: false;
            referencedRelation: "cashiers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_voided_by_fkey";
            columns: ["voided_by"];
            isOneToOne: false;
            referencedRelation: "cashiers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      admin_stats: {
        Args: Record<PropertyKey, never>;
        Returns: {
          total_businesses: number;
          total_owners: number;
          fnb_count: number;
          retail_count: number;
          tiket_count: number;
          tx_today: number;
          new_businesses_7d: number;
        }[];
      };
      admin_list_businesses: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          name: string;
          business_type: string;
          owner_email: string;
          created_at: string;
          shift_open: boolean;
          tx_count: number;
          subscription_status: string;
          plan_code: string | null;
          period_end: string | null;
          mirroring_enabled: boolean;
          cost_control_enabled: boolean;
        }[];
      };
      get_hpp_order_status: {
        Args: { p_order_id: string };
        Returns: {
          status: string;
          download_token: string | null;
        }[];
      };
      checkout_ticket_transaction: {
        Args: {
          p_business_id: string;
          p_cashier_id: string;
          p_items: Json;
          p_payment_method: string;
          p_received?: number | null;
          p_member_id?: string | null;
          p_client_ref?: string | null;
        };
        Returns: {
          transaction_id: string;
          invoice_number: string;
          already_existed: boolean;
        }[];
      };
      void_ticket_transaction: {
        Args: {
          p_business_id: string;
          p_transaction_id: string;
          p_manager_pin: string;
          p_reason?: string | null;
        };
        Returns: {
          voided_by_name: string;
        }[];
      };
      check_in_ticket: {
        Args: {
          p_business_id: string;
          p_cashier_id: string;
          p_ticket_category_id: string;
          p_manual_number: string;
        };
        Returns: {
          category_name: string;
          price: number;
          is_member_price: boolean;
          invoice_number: string;
          sold_at: string;
        }[];
      };
      get_self_order_menu: {
        Args: { p_qr_slug: string };
        Returns: Json;
      };
      get_attendance_checkin_info: {
        Args: { p_slug: string };
        Returns: {
          business_id: string;
          business_name: string;
          employee_id: string;
          employee_name: string;
          break_attendance_enabled: boolean;
          divisi: string | null;
        }[];
      };
      get_purchase_request_info: {
        Args: { p_slug: string };
        Returns: Json;
      };
      get_manual_delivery_note_by_code: {
        Args: { p_code: string };
        Returns: Json;
      };
      claim_manual_delivery_note_by_code: {
        Args: { p_code: string; p_receiving_business_id: string };
        Returns: string;
      };
      get_stock_opname_info: {
        Args: { p_slug: string };
        Returns: Json;
      };
      get_kasbon_submit_info: {
        Args: { p_slug: string };
        Returns: Json;
      };
      submit_petty_cash_kasbon_public: {
        Args: {
          p_slug: string;
          p_employee_id: string;
          p_amount: number;
          p_note?: string | null;
          p_date?: string | null;
        };
        Returns: string;
      };
      get_location_stock_snapshot: {
        Args: { p_slug: string; p_location_id: string };
        Returns: Json;
      };
      submit_stock_opname: {
        Args: {
          p_slug: string;
          p_employee_id: string;
          p_location_id: string;
          p_ingredient_counts: Json;
          p_semi_finished_counts: Json;
          p_entry_date?: string | null;
          p_new_ingredients?: Json;
          p_new_semi_finished?: Json;
          p_section_id?: string | null;
        };
        Returns: Json;
      };
      set_employee_pin: {
        Args: { p_business_id: string; p_employee_id: string; p_pin: string };
        Returns: undefined;
      };
      verify_employee_pin: {
        Args: { p_slug: string; p_employee_id: string; p_pin: string };
        Returns: { employee_id: string; employee_name: string }[];
      };
      get_location_portal_home: {
        Args: { p_slug: string };
        Returns: Json;
      };
      get_location_portal_transfers: {
        Args: { p_slug: string };
        Returns: Json;
      };
      get_purchasing_portal_incoming: {
        Args: { p_slug: string };
        Returns: Json;
      };
      get_location_portal_transfer_history: {
        Args: { p_slug: string };
        Returns: Json;
      };
      get_location_transfer_delivery_note: {
        Args: { p_slug: string; p_transfer_id: string };
        Returns: Json;
      };
      fulfill_location_transfer_public: {
        Args: { p_slug: string; p_employee_id: string; p_transfer_id: string; p_qty_sent: Json };
        Returns: Json;
      };
      get_receive_stock_info: {
        Args: { p_slug: string; p_location_id: string };
        Returns: Json;
      };
      receive_stock_fulfillment_public: {
        Args: { p_slug: string; p_fulfillment_id: string; p_employee_id: string };
        Returns: Json;
      };
      get_location_transfer_info: {
        Args: { p_slug: string };
        Returns: Json;
      };
      submit_location_transfer_request: {
        Args: {
          p_slug: string;
          p_requesting_location_id: string;
          p_employee_id: string;
          p_note: string | null;
          p_items: Json;
        };
        Returns: string;
      };
      submit_purchase_request: {
        Args: {
          p_slug: string;
          p_employee_id: string;
          p_note: string | null;
          p_items: Json;
          p_location_id?: string | null;
        };
        Returns: string;
      };
      get_outlet_request_info: {
        Args: { p_slug: string };
        Returns: Json;
      };
      submit_outlet_request: {
        Args: {
          p_slug: string;
          p_outlet_id: string;
          p_employee_id: string;
          p_note: string | null;
          p_items: Json;
        };
        Returns: string;
      };
      get_production_scan_info: {
        Args: { p_slug: string };
        Returns: Json;
      };
      submit_production_scan: {
        Args: {
          p_slug: string;
          p_item_id: string | null;
          p_qty: number;
          p_employee_id: string | null;
          p_note: string | null;
          p_new_item_name?: string | null;
          p_new_item_unit?: string | null;
          p_reported_ingredients?: Json;
        };
        Returns: string;
      };
      submit_self_order: {
        Args: {
          p_qr_slug: string;
          p_items: Json;
          p_customer_name?: string | null;
          p_customer_phone?: string | null;
          p_payment_method?: string;
        };
        Returns: string;
      };
      start_trial: {
        Args: { p_business_id: string };
        Returns: undefined;
      };
      verify_cashier_pin: {
        Args: { p_cashier_id: string; p_pin: string };
        Returns: {
          id: string;
          business_id: string;
          name: string;
          role: string;
        }[];
      };
      checkout_transaction: {
        Args: {
          p_business_id: string;
          p_cashier_id: string;
          p_items: Json;
          p_payments: Json;
          p_order_disc?: number;
          p_order_disc_type?: string;
          p_customer_id?: string | null;
          p_self_order_ids?: string[] | null;
          p_client_ref?: string | null;
          p_order_type?: string | null;
        };
        Returns: {
          transaction_id: string;
          invoice_number: string;
          already_existed: boolean;
        }[];
      };
      open_shift: {
        Args: {
          p_business_id: string;
          p_cashier_id: string;
          p_opening_cash: number;
          p_notes?: string | null;
        };
        Returns: string;
      };
      close_shift: {
        Args: {
          p_shift_id: string;
          p_closing_cash: number;
          p_close_notes?: string | null;
        };
        Returns: {
          cash_sales: number;
          non_cash_sales: number;
          total_sales: number;
          expected_cash: number;
          difference: number;
          tx_count: number;
          void_count: number;
        }[];
      };
      post_shift_cash_movement: {
        Args: {
          p_business_id: string;
          p_shift_id: string;
          p_direction: string;
          p_amount: number;
          p_description: string;
          p_category?: string | null;
          p_receipt_url?: string | null;
        };
        Returns: string;
      };
      post_petty_cash_expense: {
        Args: {
          p_business_id: string;
          p_amount: number;
          p_description: string;
          p_category?: string | null;
          p_receipt_url?: string | null;
        };
        Returns: string;
      };
      submit_petty_cash_expense_public: {
        Args: {
          p_slug: string;
          p_employee_id: string;
          p_amount: number;
          p_category: string;
          p_description: string;
        };
        Returns: string;
      };
      post_petty_cash_kasbon: {
        Args: {
          p_business_id: string;
          p_employee_id: string;
          p_amount: number;
          p_note?: string | null;
        };
        Returns: string;
      };
      review_shift_cash_movement: {
        Args: {
          p_movement_id: string;
          p_decision: string;
          p_account_code?: string | null;
        };
        Returns: string;
      };
      close_petty_cash: {
        Args: {
          p_business_id: string;
          p_date: string;
          p_from: string;
          p_to: string;
          p_actual_remaining: number;
          p_notes?: string | null;
        };
        Returns: {
          id: string;
          business_id: string;
          date: string;
          total_allocated: number;
          total_tunai: number;
          total_hutang: number;
          hutang_count: number;
          expected_remaining: number;
          actual_remaining: number;
          difference: number;
          notes: string | null;
          closed_by: string | null;
          closed_at: string;
        }[];
      };
      void_transaction: {
        Args: {
          p_business_id: string;
          p_transaction_id: string;
          p_manager_pin: string;
          p_reason?: string | null;
        };
        Returns: {
          voided_by_name: string;
        }[];
      };
      owner_void_transaction: {
        Args: {
          p_business_id: string;
          p_transaction_id: string;
          p_reason?: string | null;
        };
        Returns: undefined;
      };
      void_transaction_item: {
        Args: {
          p_business_id: string;
          p_transaction_id: string;
          p_item_id: string;
          p_reason?: string | null;
          p_cashier_id?: string | null;
          p_manager_pin?: string | null;
        };
        Returns: undefined;
      };
      delete_open_bill: {
        Args: {
          p_business_id: string;
          p_bill_id: string;
          p_manager_pin: string;
        };
        Returns: undefined;
      };
      create_manual_transaction: {
        Args: {
          p_business_id: string;
          p_date: string;
          p_items: Json;
          p_payment_method: string;
          p_received?: number | null;
          p_customer_id?: string | null;
          p_catatan?: string | null;
        };
        Returns: {
          transaction_id: string;
          invoice_number: string;
        }[];
      };
      import_historical_transactions_bulk: {
        Args: {
          p_business_id: string;
          p_transactions: Json;
        };
        Returns: {
          created: number;
          skipped: number;
        }[];
      };
      import_esb_sales_bulk: {
        Args: {
          p_business_id: string;
          p_transactions: Json;
        };
        Returns: {
          created: number;
          skipped: number;
          skipped_refs: string[];
        }[];
      };
      post_journal_entry: {
        Args: {
          p_business_id: string;
          p_date: string;
          p_description: string;
          p_lines: Json;
          p_source?: string;
        };
        Returns: string;
      };
      create_cashier: {
        Args: {
          p_business_id: string;
          p_name: string;
          p_role: string;
          p_pin: string;
        };
        Returns: string;
      };
      reset_cashier_pin: {
        Args: {
          p_business_id: string;
          p_cashier_id: string;
          p_new_pin: string;
        };
        Returns: undefined;
      };
      close_accounting_period: {
        Args: { p_business_id: string; p_period_end: string };
        Returns: string;
      };
      reverse_journal_entry: {
        Args: {
          p_business_id: string;
          p_entry_id: string;
          p_note?: string | null;
        };
        Returns: string;
      };
      set_journal_entry_payment_method: {
        Args: {
          p_entry_id: string;
          p_payment_method: string;
        };
        Returns: undefined;
      };
      set_business_self_order_enabled: {
        Args: {
          p_business_id: string;
          p_enabled: boolean;
        };
        Returns: undefined;
      };
      unmark_payslip_paid: {
        Args: {
          p_business_id: string;
          p_payslip_id: string;
        };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
