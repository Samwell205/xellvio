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
      accounts: {
        Row: {
          auto_recharge_amount: number
          auto_recharge_enabled: boolean
          auto_recharge_threshold: number
          avatar_url: string | null
          business_address: string | null
          business_reg_number: string | null
          company: string | null
          contact_email: string | null
          created_at: string
          credit_balance: number
          email: string | null
          full_name: string | null
          id: string
          legal_business_name: string | null
          onboarding_status: string
          phone: string | null
          privacy_policy_url: string | null
          suspended_at: string | null
          terms_accepted_at: string | null
          terms_url: string | null
          twilio_subaccount_auth_token_enc: string | null
          twilio_subaccount_sid: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          auto_recharge_amount?: number
          auto_recharge_enabled?: boolean
          auto_recharge_threshold?: number
          avatar_url?: string | null
          business_address?: string | null
          business_reg_number?: string | null
          company?: string | null
          contact_email?: string | null
          created_at?: string
          credit_balance?: number
          email?: string | null
          full_name?: string | null
          id: string
          legal_business_name?: string | null
          onboarding_status?: string
          phone?: string | null
          privacy_policy_url?: string | null
          suspended_at?: string | null
          terms_accepted_at?: string | null
          terms_url?: string | null
          twilio_subaccount_auth_token_enc?: string | null
          twilio_subaccount_sid?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          auto_recharge_amount?: number
          auto_recharge_enabled?: boolean
          auto_recharge_threshold?: number
          avatar_url?: string | null
          business_address?: string | null
          business_reg_number?: string | null
          company?: string | null
          contact_email?: string | null
          created_at?: string
          credit_balance?: number
          email?: string | null
          full_name?: string | null
          id?: string
          legal_business_name?: string | null
          onboarding_status?: string
          phone?: string | null
          privacy_policy_url?: string | null
          suspended_at?: string | null
          terms_accepted_at?: string | null
          terms_url?: string | null
          twilio_subaccount_auth_token_enc?: string | null
          twilio_subaccount_sid?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          account_id: string
          audience: Json
          created_at: string
          id: string
          media_url: string | null
          message_body: string
          name: string
          schedule_at: string | null
          send_mode: string
          smart_skip_hours: number
          status: string
          updated_at: string
        }
        Insert: {
          account_id: string
          audience?: Json
          created_at?: string
          id?: string
          media_url?: string | null
          message_body?: string
          name: string
          schedule_at?: string | null
          send_mode?: string
          smart_skip_hours?: number
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          audience?: Json
          created_at?: string
          id?: string
          media_url?: string | null
          message_body?: string
          name?: string
          schedule_at?: string | null
          send_mode?: string
          smart_skip_hours?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      consents: {
        Row: {
          channel: string
          consented_at: string
          created_at: string
          id: string
          profile_id: string
          proof: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          channel?: string
          consented_at?: string
          created_at?: string
          id?: string
          profile_id: string
          proof?: string | null
          source?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          channel?: string
          consented_at?: string
          created_at?: string
          id?: string
          profile_id?: string
          proof?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      country_rates: {
        Row: {
          active: boolean
          cost_price: number
          country_code: string
          country_name: string
          created_at: string
          currency: string
          dial_prefix: string
          id: string
          mms_multiplier: number
          sell_price: number
          sender_supports_inbound: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          cost_price?: number
          country_code: string
          country_name: string
          created_at?: string
          currency?: string
          dial_prefix: string
          id?: string
          mms_multiplier?: number
          sell_price?: number
          sender_supports_inbound?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          cost_price?: number
          country_code?: string
          country_name?: string
          created_at?: string
          currency?: string
          dial_prefix?: string
          id?: string
          mms_multiplier?: number
          sell_price?: number
          sender_supports_inbound?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          account_id: string
          amount: number
          balance_after: number
          campaign_id: string | null
          created_at: string
          description: string | null
          id: string
          type: string
        }
        Insert: {
          account_id: string
          amount: number
          balance_after: number
          campaign_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          type: string
        }
        Update: {
          account_id?: string
          amount?: number
          balance_after?: number
          campaign_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          id: string
          message_id: string
          payload: Json | null
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          payload?: Json | null
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          payload?: Json | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          campaign_id: string
          cost: number | null
          country_code: string | null
          created_at: string
          delivered_at: string | null
          error_code: string | null
          id: string
          phone_e164: string
          profile_id: string | null
          provider_message_id: string | null
          rendered_body: string
          segments_count: number | null
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          cost?: number | null
          country_code?: string | null
          created_at?: string
          delivered_at?: string | null
          error_code?: string | null
          id?: string
          phone_e164: string
          profile_id?: string | null
          provider_message_id?: string | null
          rendered_body: string
          segments_count?: number | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          cost?: number | null
          country_code?: string | null
          created_at?: string
          delivered_at?: string | null
          error_code?: string | null
          id?: string
          phone_e164?: string
          profile_id?: string | null
          provider_message_id?: string | null
          rendered_body?: string
          segments_count?: number | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_id: string
          country_code: string | null
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          phone_e164: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          country_code?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone_e164: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          country_code?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone_e164?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      segments: {
        Row: {
          account_id: string
          created_at: string
          id: string
          name: string
          query: Json
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          name: string
          query?: Json
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          name?: string
          query?: Json
          updated_at?: string
        }
        Relationships: []
      }
      suppressions: {
        Row: {
          account_id: string
          created_at: string
          id: string
          phone_e164: string
          reason: string | null
          source: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          phone_e164: string
          reason?: string | null
          source?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          phone_e164?: string
          reason?: string | null
          source?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      debit_account: {
        Args: {
          _account_id: string
          _amount: number
          _campaign_id: string
          _description: string
        }
        Returns: number
      }
      decrypt_twilio_token: { Args: { _cipher: string }; Returns: string }
      eligible_profile_ids: {
        Args: { _account_id: string; _audience: Json }
        Returns: {
          country_code: string
          first_name: string
          last_name: string
          phone_e164: string
          profile_id: string
        }[]
      }
      encrypt_twilio_token: { Args: { _plain: string }; Returns: string }
      has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      profiles_match_query: {
        Args: { _account_id: string; _query: Json }
        Returns: string[]
      }
      topup_account: {
        Args: { _account_id: string; _amount: number; _description: string }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "user"
      phone_number_status: "active" | "pending" | "released"
      phone_number_type: "toll_free" | "personal"
      sender_id_status: "pending" | "approved" | "rejected"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "user"],
      phone_number_status: ["active", "pending", "released"],
      phone_number_type: ["toll_free", "personal"],
      sender_id_status: ["pending", "approved", "rejected"],
    },
  },
} as const
