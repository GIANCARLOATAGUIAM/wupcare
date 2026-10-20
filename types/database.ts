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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      // Proposed migration 0014: official academic catalog (read-only).
      colleges: {
        Row: { code: string; id: string; name: string; sort_order: number }
        Insert: { code: string; id: string; name: string; sort_order: number }
        Update: { code?: string; id?: string; name?: string; sort_order?: number }
        Relationships: []
      }
      programs: {
        Row: { abbreviation: string; college_id: string; id: string; name: string; sort_order: number }
        Insert: { abbreviation: string; college_id: string; id: string; name: string; sort_order: number }
        Update: { abbreviation?: string; college_id?: string; id?: string; name?: string; sort_order?: number }
        Relationships: []
      }
      appointments: {
        Row: {
          created_at: string
          handled_by: string | null
          id: string
          preferred_date: string
          preferred_time: string
          reason: string
          requested_by: string
          reschedule_count: number
          scheduled_at: string | null
          staff_remarks: string | null
          status: Database["public"]["Enums"]["appointment_status"]
          student_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          handled_by?: string | null
          id?: string
          preferred_date: string
          preferred_time: string
          reason: string
          requested_by?: string
          reschedule_count?: number
          scheduled_at?: string | null
          staff_remarks?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          student_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          handled_by?: string | null
          id?: string
          preferred_date?: string
          preferred_time?: string
          reason?: string
          requested_by?: string
          reschedule_count?: number
          scheduled_at?: string | null
          staff_remarks?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          student_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_settings: {
        Row: {
          close_time: string
          created_at: string
          id: number
          max_days_ahead: number
          open_days: number[]
          open_time: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          close_time?: string
          created_at?: string
          id?: number
          max_days_ahead?: number
          open_days?: number[]
          open_time?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          close_time?: string
          created_at?: string
          id?: number
          max_days_ahead?: number
          open_days?: number[]
          open_time?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinic_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_visits: {
        Row: {
          appointment_id: string | null
          assessment: string | null
          attended_by: string
          concern_category_id: string
          created_at: string
          follow_up_instructions: string | null
          id: string
          reason: string
          student_id: string
          symptoms: string | null
          treatment: string | null
          updated_at: string
          updated_by: string | null
          visit_at: string
        }
        Insert: {
          appointment_id?: string | null
          assessment?: string | null
          attended_by: string
          concern_category_id: string
          created_at?: string
          follow_up_instructions?: string | null
          id?: string
          reason: string
          student_id: string
          symptoms?: string | null
          treatment?: string | null
          updated_at?: string
          updated_by?: string | null
          visit_at?: string
        }
        Update: {
          appointment_id?: string | null
          assessment?: string | null
          attended_by?: string
          concern_category_id?: string
          created_at?: string
          follow_up_instructions?: string | null
          id?: string
          reason?: string
          student_id?: string
          symptoms?: string | null
          treatment?: string | null
          updated_at?: string
          updated_by?: string | null
          visit_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_visits_appointment_fkey"
            columns: ["appointment_id", "student_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id", "student_id"]
          },
          {
            foreignKeyName: "clinic_visits_attended_by_fkey"
            columns: ["attended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_visits_concern_category_id_fkey"
            columns: ["concern_category_id"]
            isOneToOne: false
            referencedRelation: "health_concern_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_visits_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_visits_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      health_concern_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      health_incidents: {
        Row: {
          action_taken: string
          clinic_visit_id: string | null
          created_at: string
          description: string
          id: string
          location: string | null
          occurred_at: string
          recorded_by: string
          student_id: string
          type: Database["public"]["Enums"]["incident_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          action_taken: string
          clinic_visit_id?: string | null
          created_at?: string
          description: string
          id?: string
          location?: string | null
          occurred_at: string
          recorded_by: string
          student_id: string
          type: Database["public"]["Enums"]["incident_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          action_taken?: string
          clinic_visit_id?: string | null
          created_at?: string
          description?: string
          id?: string
          location?: string | null
          occurred_at?: string
          recorded_by?: string
          student_id?: string
          type?: Database["public"]["Enums"]["incident_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "health_incidents_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_incidents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_incidents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_incidents_visit_fkey"
            columns: ["clinic_visit_id", "student_id"]
            isOneToOne: false
            referencedRelation: "clinic_visits"
            referencedColumns: ["id", "student_id"]
          },
        ]
      }
      health_records: {
        Row: {
          allergies: string | null
          created_at: string
          emergency_contact_name: string | null
          emergency_contact_number: string | null
          emergency_contact_relationship: string | null
          existing_conditions: string | null
          health_notes: string | null
          id: string
          immunizations: string | null
          medical_history: string | null
          student_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allergies?: string | null
          created_at?: string
          emergency_contact_name?: string | null
          emergency_contact_number?: string | null
          emergency_contact_relationship?: string | null
          existing_conditions?: string | null
          health_notes?: string | null
          id?: string
          immunizations?: string | null
          medical_history?: string | null
          student_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allergies?: string | null
          created_at?: string
          emergency_contact_name?: string | null
          emergency_contact_number?: string | null
          emergency_contact_relationship?: string | null
          existing_conditions?: string | null
          health_notes?: string | null
          id?: string
          immunizations?: string | null
          medical_history?: string | null
          student_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "health_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_records_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_transactions: {
        Row: {
          clinic_visit_id: string | null
          created_at: string
          id: string
          incident_id: string | null
          medicine_id: string
          notes: string | null
          performed_by: string
          quantity: number
          student_id: string | null
          type: Database["public"]["Enums"]["med_txn_type"]
        }
        Insert: {
          clinic_visit_id?: string | null
          created_at?: string
          id?: string
          incident_id?: string | null
          medicine_id: string
          notes?: string | null
          performed_by: string
          quantity: number
          student_id?: string | null
          type: Database["public"]["Enums"]["med_txn_type"]
        }
        Update: {
          clinic_visit_id?: string | null
          created_at?: string
          id?: string
          incident_id?: string | null
          medicine_id?: string
          notes?: string | null
          performed_by?: string
          quantity?: number
          student_id?: string | null
          type?: Database["public"]["Enums"]["med_txn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "medication_transactions_incident_fkey"
            columns: ["incident_id", "student_id"]
            isOneToOne: false
            referencedRelation: "health_incidents"
            referencedColumns: ["id", "student_id"]
          },
          {
            foreignKeyName: "medication_transactions_medicine_id_fkey"
            columns: ["medicine_id"]
            isOneToOne: false
            referencedRelation: "medicines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_transactions_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_transactions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_transactions_visit_fkey"
            columns: ["clinic_visit_id", "student_id"]
            isOneToOne: false
            referencedRelation: "clinic_visits"
            referencedColumns: ["id", "student_id"]
          },
        ]
      }
      medicines: {
        Row: {
          created_at: string
          expiration_date: string
          id: string
          is_active: boolean
          is_demo: boolean
          name: string
          reorder_level: number
          stock_quantity: number
          unit: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          expiration_date: string
          id?: string
          is_active?: boolean
          is_demo?: boolean
          name: string
          reorder_level?: number
          stock_quantity?: number
          unit: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          expiration_date?: string
          id?: string
          is_active?: boolean
          is_demo?: boolean
          name?: string
          reorder_level?: number
          stock_quantity?: number
          unit?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medicines_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          requested_student_number: string | null
          role: Database["public"]["Enums"]["user_role"]
          student_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
          is_active?: boolean
          requested_student_number?: string | null
          role: Database["public"]["Enums"]["user_role"]
          student_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          requested_student_number?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          student_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          address: string | null
          birth_date: string | null
          college: string | null
          college_id: string | null
          contact_number: string | null
          created_at: string
          created_by: string | null
          email: string | null
          first_name: string
          guardian_contact: string | null
          guardian_name: string | null
          guardian_relationship: string | null
          id: string
          is_demo: boolean
          last_name: string
          middle_name: string | null
          program: string | null
          program_id: string | null
          sex: string | null
          status: Database["public"]["Enums"]["student_status"]
          student_number: string
          updated_at: string
          updated_by: string | null
          year_level: number | null
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          college?: string | null
          college_id?: string | null
          contact_number?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name: string
          guardian_contact?: string | null
          guardian_name?: string | null
          guardian_relationship?: string | null
          id?: string
          is_demo?: boolean
          last_name: string
          middle_name?: string | null
          program?: string | null
          program_id?: string | null
          sex?: string | null
          status?: Database["public"]["Enums"]["student_status"]
          student_number: string
          updated_at?: string
          updated_by?: string | null
          year_level?: number | null
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          college?: string | null
          college_id?: string | null
          contact_number?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name?: string
          guardian_contact?: string | null
          guardian_name?: string | null
          guardian_relationship?: string | null
          id?: string
          is_demo?: boolean
          last_name?: string
          middle_name?: string | null
          program?: string | null
          program_id?: string | null
          sex?: string | null
          status?: Database["public"]["Enums"]["student_status"]
          student_number?: string
          updated_at?: string
          updated_by?: string | null
          year_level?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "students_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      // Pending approval: docs/sql/update-own-display-name.sql (not installed).
      update_own_display_name: {
        Args: { p_full_name: string }
        Returns: undefined
      }
      // Proposed migration 0013 (not applied until approved).
      appointment_summary: {
        Args: { p_scope?: string }
        Returns: {
          cancelled: number
          completed: number
          declined: number
          pending: number
          scheduled: number
          today: number
          total: number
        }[]
      }
      // Migration 0014 shape (0013 returned college and year_level only).
      my_academic_profile: {
        Args: never
        Returns: {
          college: string | null
          college_id: string | null
          program: string | null
          program_id: string | null
          year_level: number | null
        }[]
      }
      update_my_academic_profile: {
        Args: { p_college_id: string; p_program_id: string; p_year_level: number }
        Returns: undefined
      }
      medicine_stock_history: {
        Args: { p_limit?: number; p_medicine_id: string; p_offset?: number }
        Returns: {
          created_at: string
          id: string
          ledger_total: number
          notes: string | null
          performed_by: string | null
          quantity: number
          total_count: number
          type: Database["public"]["Enums"]["med_txn_type"]
        }[]
      }
      account_student_numbers: {
        Args: never
        Returns: {
          profile_id: string
          student_number: string
        }[]
      }
      adjust_medication: {
        Args: { p_medicine_id: string; p_quantity: number; p_reason: string }
        Returns: number
      }
      approve_student_link: {
        Args: { p_profile_id: string; p_student_id: string }
        Returns: undefined
      }
      create_incident_with_medications: {
        Args: { p_incident: Json; p_items?: Json }
        Returns: string
      }
      create_visit_with_medications: {
        Args: { p_items?: Json; p_visit: Json }
        Returns: string
      }
      issue_medication: {
        Args: {
          p_clinic_visit_id?: string
          p_incident_id?: string
          p_medicine_id: string
          p_notes?: string
          p_quantity: number
          p_student_id: string
        }
        Returns: undefined
      }
      report_appointments: {
        Args: { p_from: string; p_scope?: string; p_to: string }
        Returns: {
          appointment_count: number
          status: Database["public"]["Enums"]["appointment_status"]
        }[]
      }
      report_concerns: {
        Args: { p_from: string; p_scope?: string; p_to: string }
        Returns: {
          category: string
          visit_count: number
        }[]
      }
      report_incidents: {
        Args: { p_from: string; p_scope?: string; p_to: string }
        Returns: {
          incident_count: number
          incident_type: Database["public"]["Enums"]["incident_type"]
        }[]
      }
      report_medication_usage: {
        Args: { p_from: string; p_scope?: string; p_to: string }
        Returns: {
          expiration_date: string
          medicine_id: string
          medicine_name: string
          quantity_issued: number
          stock_quantity: number
          unit: string
        }[]
      }
      report_visits: {
        Args: {
          p_from: string
          p_period?: string
          p_scope?: string
          p_to: string
        }
        Returns: {
          period: string
          visit_count: number
        }[]
      }
      // Added by docs/sql/student-self-registration.draft.sql (not yet applied).
      registration_student_id_available: {
        Args: { p_student_number: string }
        Returns: boolean
      }
      restock_medication: {
        Args: { p_medicine_id: string; p_notes?: string; p_quantity: number }
        Returns: number
      }
      students_without_account: {
        Args: never
        Returns: {
          full_name: string
          id: string
          student_number: string
        }[]
      }
    }
    Enums: {
      appointment_status:
        | "pending"
        | "approved"
        | "declined"
        | "cancelled"
        | "completed"
      incident_type: "illness" | "injury" | "accident" | "other"
      med_txn_type: "issuance" | "restock" | "adjustment"
      student_status: "active" | "inactive" | "graduated"
      user_role: "admin" | "clinic_staff" | "student"
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
    Enums: {
      appointment_status: [
        "pending",
        "approved",
        "declined",
        "cancelled",
        "completed",
      ],
      incident_type: ["illness", "injury", "accident", "other"],
      med_txn_type: ["issuance", "restock", "adjustment"],
      student_status: ["active", "inactive", "graduated"],
      user_role: ["admin", "clinic_staff", "student"],
    },
  },
} as const
