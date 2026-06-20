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
          monthly_volume_estimate: number | null
          onboarding_status: string
          opt_in_description: string | null
          opt_in_screenshot_url: string | null
          phone: string | null
          policies_accepted: Json | null
          policies_accepted_version: string | null
          privacy_policy_url: string | null
          sample_message: string | null
          sms_consent_disclosures_confirmed_at: string | null
          sms_consent_disclosures_version: string | null
          sms_target_countries: string[] | null
          subaccount_messaging_service_sid: string | null
          subaccount_phone_number: string | null
          subaccount_phone_sid: string | null
          suspended_at: string | null
          terms_accepted_at: string | null
          terms_url: string | null
          twilio_subaccount_auth_token_enc: string | null
          twilio_subaccount_sid: string | null
          updated_at: string
          use_case_description: string | null
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
          monthly_volume_estimate?: number | null
          onboarding_status?: string
          opt_in_description?: string | null
          opt_in_screenshot_url?: string | null
          phone?: string | null
          policies_accepted?: Json | null
          policies_accepted_version?: string | null
          privacy_policy_url?: string | null
          sample_message?: string | null
          sms_consent_disclosures_confirmed_at?: string | null
          sms_consent_disclosures_version?: string | null
          sms_target_countries?: string[] | null
          subaccount_messaging_service_sid?: string | null
          subaccount_phone_number?: string | null
          subaccount_phone_sid?: string | null
          suspended_at?: string | null
          terms_accepted_at?: string | null
          terms_url?: string | null
          twilio_subaccount_auth_token_enc?: string | null
          twilio_subaccount_sid?: string | null
          updated_at?: string
          use_case_description?: string | null
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
          monthly_volume_estimate?: number | null
          onboarding_status?: string
          opt_in_description?: string | null
          opt_in_screenshot_url?: string | null
          phone?: string | null
          policies_accepted?: Json | null
          policies_accepted_version?: string | null
          privacy_policy_url?: string | null
          sample_message?: string | null
          sms_consent_disclosures_confirmed_at?: string | null
          sms_consent_disclosures_version?: string | null
          sms_target_countries?: string[] | null
          subaccount_messaging_service_sid?: string | null
          subaccount_phone_number?: string | null
          subaccount_phone_sid?: string | null
          suspended_at?: string | null
          terms_accepted_at?: string | null
          terms_url?: string | null
          twilio_subaccount_auth_token_enc?: string | null
          twilio_subaccount_sid?: string | null
          updated_at?: string
          use_case_description?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      billing_settings: {
        Row: {
          default_currency: string
          id: boolean
          payoneer_instructions: string | null
          payoneer_payee_email: string | null
          payoneer_payee_name: string | null
          updated_at: string
          usd_to_ngn_rate: number
        }
        Insert: {
          default_currency?: string
          id?: boolean
          payoneer_instructions?: string | null
          payoneer_payee_email?: string | null
          payoneer_payee_name?: string | null
          updated_at?: string
          usd_to_ngn_rate?: number
        }
        Update: {
          default_currency?: string
          id?: boolean
          payoneer_instructions?: string | null
          payoneer_payee_email?: string | null
          payoneer_payee_name?: string | null
          updated_at?: string
          usd_to_ngn_rate?: number
        }
        Relationships: []
      }
      campaign_test_sends: {
        Row: {
          created_at: string
          id: string
          to_phone: string
          twilio_sid: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          to_phone: string
          twilio_sid?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          to_phone?: string
          twilio_sid?: string | null
          user_id?: string
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
          paused_at: string | null
          paused_reason: string | null
          schedule_at: string | null
          send_mode: string
          sender_map: Json
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
          paused_at?: string | null
          paused_reason?: string | null
          schedule_at?: string | null
          send_mode?: string
          sender_map?: Json
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
          paused_at?: string | null
          paused_reason?: string | null
          schedule_at?: string | null
          send_mode?: string
          sender_map?: Json
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
      contact_lists: {
        Row: {
          account_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_lists_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          ip: string | null
          message: string
          name: string
          status: string
          topic: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          ip?: string | null
          message: string
          name: string
          status?: string
          topic?: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          ip?: string | null
          message?: string
          name?: string
          status?: string
          topic?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
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
          last_synced_at: string | null
          manual_override: boolean
          markup_percent: number
          mms_multiplier: number
          number_type_used: string | null
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
          last_synced_at?: string | null
          manual_override?: boolean
          markup_percent?: number
          mms_multiplier?: number
          number_type_used?: string | null
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
          last_synced_at?: string | null
          manual_override?: boolean
          markup_percent?: number
          mms_multiplier?: number
          number_type_used?: string | null
          sell_price?: number
          sender_supports_inbound?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      credit_packs: {
        Row: {
          created_at: string
          credits: number
          currency: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          is_popular: boolean
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          credits: number
          currency: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_popular?: boolean
          name: string
          price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          credits?: number
          currency?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_popular?: boolean
          name?: string
          price?: number
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
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      events: {
        Row: {
          account_id: string | null
          created_at: string
          id: string
          message_id: string | null
          payload: Json | null
          type: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          payload?: Json | null
          type: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          payload?: Json | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
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
      number_requests: {
        Row: {
          account_id: string
          admin_notes: string | null
          assigned_phone_number: string | null
          business_name: string
          business_website: string | null
          country: Database["public"]["Enums"]["number_request_country"]
          created_at: string
          expected_monthly_volume: number
          id: string
          number_type: Database["public"]["Enums"]["number_request_type"]
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          sample_message: string
          status: Database["public"]["Enums"]["number_request_status"]
          updated_at: string
          use_case: string
        }
        Insert: {
          account_id: string
          admin_notes?: string | null
          assigned_phone_number?: string | null
          business_name: string
          business_website?: string | null
          country: Database["public"]["Enums"]["number_request_country"]
          created_at?: string
          expected_monthly_volume?: number
          id?: string
          number_type?: Database["public"]["Enums"]["number_request_type"]
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sample_message: string
          status?: Database["public"]["Enums"]["number_request_status"]
          updated_at?: string
          use_case: string
        }
        Update: {
          account_id?: string
          admin_notes?: string | null
          assigned_phone_number?: string | null
          business_name?: string
          business_website?: string | null
          country?: Database["public"]["Enums"]["number_request_country"]
          created_at?: string
          expected_monthly_volume?: number
          id?: string
          number_type?: Database["public"]["Enums"]["number_request_type"]
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sample_message?: string
          status?: Database["public"]["Enums"]["number_request_status"]
          updated_at?: string
          use_case?: string
        }
        Relationships: [
          {
            foreignKeyName: "number_requests_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          account_id: string
          admin_note: string | null
          amount: number
          created_at: string
          credits: number
          currency: string
          customer_note: string | null
          id: string
          metadata: Json
          pack_id: string | null
          paid_at: string | null
          proof_url: string | null
          provider: string
          provider_reference: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_id: string
          admin_note?: string | null
          amount: number
          created_at?: string
          credits: number
          currency: string
          customer_note?: string | null
          id?: string
          metadata?: Json
          pack_id?: string | null
          paid_at?: string | null
          proof_url?: string | null
          provider: string
          provider_reference?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          admin_note?: string | null
          amount?: number
          created_at?: string
          credits?: number
          currency?: string
          customer_note?: string | null
          id?: string
          metadata?: Json
          pack_id?: string | null
          paid_at?: string | null
          proof_url?: string | null
          provider?: string
          provider_reference?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "credit_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      pricing_sync_log: {
        Row: {
          cost_price: number | null
          country_code: string
          id: string
          message: string | null
          number_type_used: string | null
          sell_price: number | null
          status: string
          synced_at: string
        }
        Insert: {
          cost_price?: number | null
          country_code: string
          id?: string
          message?: string | null
          number_type_used?: string | null
          sell_price?: number | null
          status?: string
          synced_at?: string
        }
        Update: {
          cost_price?: number | null
          country_code?: string
          id?: string
          message?: string | null
          number_type_used?: string | null
          sell_price?: number | null
          status?: string
          synced_at?: string
        }
        Relationships: []
      }
      profile_list_members: {
        Row: {
          account_id: string
          added_at: string
          list_id: string
          profile_id: string
        }
        Insert: {
          account_id: string
          added_at?: string
          list_id: string
          profile_id: string
        }
        Update: {
          account_id?: string
          added_at?: string
          list_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_list_members_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_list_members_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_list_members_profile_id_fkey"
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
      sender_assets: {
        Row: {
          account_id: string
          country_code: string
          created_at: string
          friendly_rejection_reason: string | null
          id: string
          last_synced_at: string | null
          messaging_service_sid: string | null
          phone_number: string | null
          phone_sid: string | null
          rejection_reason: string | null
          sender_kind: string
          updated_at: string
          verification_payload: Json | null
          verification_sid: string | null
          verification_status: string
        }
        Insert: {
          account_id: string
          country_code: string
          created_at?: string
          friendly_rejection_reason?: string | null
          id?: string
          last_synced_at?: string | null
          messaging_service_sid?: string | null
          phone_number?: string | null
          phone_sid?: string | null
          rejection_reason?: string | null
          sender_kind: string
          updated_at?: string
          verification_payload?: Json | null
          verification_sid?: string | null
          verification_status?: string
        }
        Update: {
          account_id?: string
          country_code?: string
          created_at?: string
          friendly_rejection_reason?: string | null
          id?: string
          last_synced_at?: string | null
          messaging_service_sid?: string | null
          phone_number?: string | null
          phone_sid?: string | null
          rejection_reason?: string | null
          sender_kind?: string
          updated_at?: string
          verification_payload?: Json | null
          verification_sid?: string | null
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sender_assets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
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
      tollfree_verification_attempts: {
        Row: {
          account_id: string
          actor_user_id: string
          attempt_status: string
          created_at: string
          failure_reason: string | null
          friendly_failure_reason: string | null
          id: string
          messaging_service_sid: string | null
          phone_number: string | null
          phone_sid: string | null
          request_summary: Json | null
          sender_asset_id: string | null
          twilio_code: string | null
          twilio_more_info: string | null
          twilio_response: Json | null
          twilio_status: number | null
          updated_at: string
          verification_sid: string | null
        }
        Insert: {
          account_id: string
          actor_user_id: string
          attempt_status?: string
          created_at?: string
          failure_reason?: string | null
          friendly_failure_reason?: string | null
          id?: string
          messaging_service_sid?: string | null
          phone_number?: string | null
          phone_sid?: string | null
          request_summary?: Json | null
          sender_asset_id?: string | null
          twilio_code?: string | null
          twilio_more_info?: string | null
          twilio_response?: Json | null
          twilio_status?: number | null
          updated_at?: string
          verification_sid?: string | null
        }
        Update: {
          account_id?: string
          actor_user_id?: string
          attempt_status?: string
          created_at?: string
          failure_reason?: string | null
          friendly_failure_reason?: string | null
          id?: string
          messaging_service_sid?: string | null
          phone_number?: string | null
          phone_sid?: string | null
          request_summary?: Json | null
          sender_asset_id?: string | null
          twilio_code?: string | null
          twilio_more_info?: string | null
          twilio_response?: Json | null
          twilio_status?: number | null
          updated_at?: string
          verification_sid?: string | null
        }
        Relationships: []
      }
      twilio_balance_snapshots: {
        Row: {
          alerted: boolean
          balance: number
          checked_at: string
          created_at: string
          currency: string
          error_message: string | null
          id: string
          status: string
        }
        Insert: {
          alerted?: boolean
          balance: number
          checked_at?: string
          created_at?: string
          currency?: string
          error_message?: string | null
          id?: string
          status: string
        }
        Update: {
          alerted?: boolean
          balance?: number
          checked_at?: string
          created_at?: string
          currency?: string
          error_message?: string | null
          id?: string
          status?: string
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
      country_rates_public: {
        Row: {
          active: boolean | null
          country_code: string | null
          country_name: string | null
          dial_prefix: string | null
          id: string | null
          mms_multiplier: number | null
          sell_price: number | null
          sender_supports_inbound: boolean | null
        }
        Insert: {
          active?: boolean | null
          country_code?: string | null
          country_name?: string | null
          dial_prefix?: string | null
          id?: string | null
          mms_multiplier?: number | null
          sell_price?: number | null
          sender_supports_inbound?: boolean | null
        }
        Update: {
          active?: boolean | null
          country_code?: string | null
          country_name?: string | null
          dial_prefix?: string | null
          id?: string | null
          mms_multiplier?: number | null
          sell_price?: number | null
          sender_supports_inbound?: boolean | null
        }
        Relationships: []
      }
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
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
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
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      my_eligible_profile_ids: {
        Args: { _audience: Json }
        Returns: {
          country_code: string
          first_name: string
          last_name: string
          phone_e164: string
          profile_id: string
        }[]
      }
      profiles_match_query: {
        Args: { _account_id: string; _query: Json }
        Returns: string[]
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      topup_account: {
        Args: { _account_id: string; _amount: number; _description: string }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "user"
      number_request_country: "US" | "CA"
      number_request_status: "pending" | "approved" | "rejected" | "provisioned"
      number_request_type: "toll_free" | "ten_dlc" | "short_code"
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
      number_request_country: ["US", "CA"],
      number_request_status: ["pending", "approved", "rejected", "provisioned"],
      number_request_type: ["toll_free", "ten_dlc", "short_code"],
      phone_number_status: ["active", "pending", "released"],
      phone_number_type: ["toll_free", "personal"],
      sender_id_status: ["pending", "approved", "rejected"],
    },
  },
} as const
