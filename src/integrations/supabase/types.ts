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
      account_members: {
        Row: {
          accepted_at: string | null
          account_id: string
          created_at: string
          id: string
          invited_by: string | null
          invited_email: string
          permissions: Json
          role: Database["public"]["Enums"]["account_member_role"]
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          account_id: string
          created_at?: string
          id?: string
          invited_by?: string | null
          invited_email: string
          permissions?: Json
          role?: Database["public"]["Enums"]["account_member_role"]
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          account_id?: string
          created_at?: string
          id?: string
          invited_by?: string | null
          invited_email?: string
          permissions?: Json
          role?: Database["public"]["Enums"]["account_member_role"]
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_members_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_signup_codes: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
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
          gorgias_api_key_enc: string | null
          gorgias_domain: string | null
          gorgias_email: string | null
          gorgias_enabled: boolean
          id: string
          is_seller: boolean
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
          seller_balance: number
          seller_lifetime_earnings: number
          sending_suspended_at: string | null
          sending_suspended_reason: string | null
          sms_consent_disclosures_confirmed_at: string | null
          sms_consent_disclosures_version: string | null
          sms_target_countries: string[] | null
          suspended_at: string | null
          telnyx_messaging_profile_created_at: string | null
          telnyx_messaging_profile_id: string | null
          telnyx_number_id: string | null
          telnyx_phone_number: string | null
          terms_accepted_at: string | null
          terms_url: string | null
          tollfree_setup_fee_due_cents: number
          tollfree_setup_fee_paid_at: string | null
          tos_current_version_accepted: string | null
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
          gorgias_api_key_enc?: string | null
          gorgias_domain?: string | null
          gorgias_email?: string | null
          gorgias_enabled?: boolean
          id: string
          is_seller?: boolean
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
          seller_balance?: number
          seller_lifetime_earnings?: number
          sending_suspended_at?: string | null
          sending_suspended_reason?: string | null
          sms_consent_disclosures_confirmed_at?: string | null
          sms_consent_disclosures_version?: string | null
          sms_target_countries?: string[] | null
          suspended_at?: string | null
          telnyx_messaging_profile_created_at?: string | null
          telnyx_messaging_profile_id?: string | null
          telnyx_number_id?: string | null
          telnyx_phone_number?: string | null
          terms_accepted_at?: string | null
          terms_url?: string | null
          tollfree_setup_fee_due_cents?: number
          tollfree_setup_fee_paid_at?: string | null
          tos_current_version_accepted?: string | null
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
          gorgias_api_key_enc?: string | null
          gorgias_domain?: string | null
          gorgias_email?: string | null
          gorgias_enabled?: boolean
          id?: string
          is_seller?: boolean
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
          seller_balance?: number
          seller_lifetime_earnings?: number
          sending_suspended_at?: string | null
          sending_suspended_reason?: string | null
          sms_consent_disclosures_confirmed_at?: string | null
          sms_consent_disclosures_version?: string | null
          sms_target_countries?: string[] | null
          suspended_at?: string | null
          telnyx_messaging_profile_created_at?: string | null
          telnyx_messaging_profile_id?: string | null
          telnyx_number_id?: string | null
          telnyx_phone_number?: string | null
          terms_accepted_at?: string | null
          terms_url?: string | null
          tollfree_setup_fee_due_cents?: number
          tollfree_setup_fee_paid_at?: string | null
          tos_current_version_accepted?: string | null
          updated_at?: string
          use_case_description?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      admin_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
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
      blocked_domains: {
        Row: {
          allowed_by_accounts: string[]
          created_at: string
          domain: string
          id: string
          is_shortener: boolean
          reason: string | null
        }
        Insert: {
          allowed_by_accounts?: string[]
          created_at?: string
          domain: string
          id?: string
          is_shortener?: boolean
          reason?: string | null
        }
        Update: {
          allowed_by_accounts?: string[]
          created_at?: string
          domain?: string
          id?: string
          is_shortener?: boolean
          reason?: string | null
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
      campaign_tos_acceptances: {
        Row: {
          accepted_at: string
          campaign_id: string
          id: string
          ip_address: string | null
          tenant_account_id: string
          tos_version: string
          user_agent: string | null
        }
        Insert: {
          accepted_at?: string
          campaign_id: string
          id?: string
          ip_address?: string | null
          tenant_account_id: string
          tos_version: string
          user_agent?: string | null
        }
        Update: {
          accepted_at?: string
          campaign_id?: string
          id?: string
          ip_address?: string | null
          tenant_account_id?: string
          tos_version?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_tos_acceptances_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_tos_acceptances_tenant_account_id_fkey"
            columns: ["tenant_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
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
      content_screening_log: {
        Row: {
          account_id: string
          action_taken: string
          blocked_reasons: Json
          campaign_id: string | null
          context: string | null
          created_at: string
          id: string
          message_text: string
          risk_score: number
        }
        Insert: {
          account_id: string
          action_taken: string
          blocked_reasons?: Json
          campaign_id?: string | null
          context?: string | null
          created_at?: string
          id?: string
          message_text: string
          risk_score: number
        }
        Update: {
          account_id?: string
          action_taken?: string
          blocked_reasons?: Json
          campaign_id?: string | null
          context?: string | null
          created_at?: string
          id?: string
          message_text?: string
          risk_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_screening_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_screening_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
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
      gorgias_ticket_map: {
        Row: {
          account_id: string
          created_at: string
          gorgias_customer_id: number | null
          gorgias_ticket_id: number
          id: string
          phone_e164: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          gorgias_customer_id?: number | null
          gorgias_ticket_id: number
          id?: string
          phone_e164: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          gorgias_customer_id?: number | null
          gorgias_ticket_id?: number
          id?: string
          phone_e164?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gorgias_ticket_map_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listings: {
        Row: {
          buyer_account_id: string | null
          buyer_price_amount: number | null
          created_at: string
          id: string
          phone_number: string | null
          seller_account_id: string
          seller_payout_amount: number | null
          sender_asset_id: string | null
          sold_at: string | null
          status: string
          tollfree_attempt_id: string | null
          updated_at: string
        }
        Insert: {
          buyer_account_id?: string | null
          buyer_price_amount?: number | null
          created_at?: string
          id?: string
          phone_number?: string | null
          seller_account_id: string
          seller_payout_amount?: number | null
          sender_asset_id?: string | null
          sold_at?: string | null
          status?: string
          tollfree_attempt_id?: string | null
          updated_at?: string
        }
        Update: {
          buyer_account_id?: string | null
          buyer_price_amount?: number | null
          created_at?: string
          id?: string
          phone_number?: string | null
          seller_account_id?: string
          seller_payout_amount?: number | null
          sender_asset_id?: string | null
          sold_at?: string | null
          status?: string
          tollfree_attempt_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_buyer_account_id_fkey"
            columns: ["buyer_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_seller_account_id_fkey"
            columns: ["seller_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_sender_asset_id_fkey"
            columns: ["sender_asset_id"]
            isOneToOne: false
            referencedRelation: "sender_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_tollfree_attempt_id_fkey"
            columns: ["tollfree_attempt_id"]
            isOneToOne: false
            referencedRelation: "tollfree_verification_attempts"
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
          dispatch_started_at: string | null
          error_code: string | null
          failure_reason: string | null
          id: string
          phone_e164: string
          profile_id: string | null
          provider_message_id: string | null
          rendered_body: string
          segments_count: number | null
          sender_kind: string | null
          sender_used: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          cost?: number | null
          country_code?: string | null
          created_at?: string
          delivered_at?: string | null
          dispatch_started_at?: string | null
          error_code?: string | null
          failure_reason?: string | null
          id?: string
          phone_e164: string
          profile_id?: string | null
          provider_message_id?: string | null
          rendered_body: string
          segments_count?: number | null
          sender_kind?: string | null
          sender_used?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          cost?: number | null
          country_code?: string | null
          created_at?: string
          delivered_at?: string | null
          dispatch_started_at?: string | null
          error_code?: string | null
          failure_reason?: string | null
          id?: string
          phone_e164?: string
          profile_id?: string | null
          provider_message_id?: string | null
          rendered_body?: string
          segments_count?: number | null
          sender_kind?: string | null
          sender_used?: string | null
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
      numbers: {
        Row: {
          account_id: string
          country_code: string | null
          created_at: string
          id: string
          number_type: string | null
          phone_number: string
          purchased_at: string
          status: string
          telnyx_messaging_profile_id: string | null
          telnyx_number_id: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          country_code?: string | null
          created_at?: string
          id?: string
          number_type?: string | null
          phone_number: string
          purchased_at?: string
          status?: string
          telnyx_messaging_profile_id?: string | null
          telnyx_number_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          country_code?: string | null
          created_at?: string
          id?: string
          number_type?: string | null
          phone_number?: string
          purchased_at?: string
          status?: string
          telnyx_messaging_profile_id?: string | null
          telnyx_number_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "numbers_account_id_fkey"
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
          two_way_opt_in: boolean
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
          two_way_opt_in?: boolean
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
          two_way_opt_in?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      review_queue: {
        Row: {
          account_id: string
          auto_approve_at: string
          blocked_reasons: Json
          campaign_id: string | null
          created_at: string
          id: string
          message_text: string
          resolved_at: string | null
          reviewer_id: string | null
          reviewer_note: string | null
          risk_score: number
          status: string
          updated_at: string
        }
        Insert: {
          account_id: string
          auto_approve_at?: string
          blocked_reasons?: Json
          campaign_id?: string | null
          created_at?: string
          id?: string
          message_text: string
          resolved_at?: string | null
          reviewer_id?: string | null
          reviewer_note?: string | null
          risk_score: number
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          auto_approve_at?: string
          blocked_reasons?: Json
          campaign_id?: string | null
          created_at?: string
          id?: string
          message_text?: string
          resolved_at?: string | null
          reviewer_id?: string | null
          reviewer_note?: string | null
          risk_score?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_queue_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
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
      seller_ledger: {
        Row: {
          account_id: string
          amount: number
          balance_after: number
          created_at: string
          description: string | null
          id: string
          listing_id: string | null
          type: string
          withdrawal_id: string | null
        }
        Insert: {
          account_id: string
          amount: number
          balance_after: number
          created_at?: string
          description?: string | null
          id?: string
          listing_id?: string | null
          type: string
          withdrawal_id?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string | null
          id?: string
          listing_id?: string | null
          type?: string
          withdrawal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_ledger_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_ledger_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_payout_accounts: {
        Row: {
          account_id: string
          account_name: string
          account_number: string
          bank_code: string
          bank_name: string
          created_at: string
          id: string
          resolved_at: string
          updated_at: string
        }
        Insert: {
          account_id: string
          account_name: string
          account_number: string
          bank_code: string
          bank_name: string
          created_at?: string
          id?: string
          resolved_at?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          account_name?: string
          account_number?: string
          bank_code?: string
          bank_name?: string
          created_at?: string
          id?: string
          resolved_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_payout_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      sender_assets: {
        Row: {
          account_id: string
          country_code: string
          created_at: string
          friendly_rejection_reason: string | null
          id: string
          in_review_at: string | null
          last_synced_at: string | null
          phone_number: string | null
          rejected_at: string | null
          rejection_reason: string | null
          sender_kind: string
          submitted_at: string | null
          telnyx_messaging_profile_id: string | null
          telnyx_phone_number_id: string | null
          telnyx_verification_id: string | null
          updated_at: string
          verification_payload: Json | null
          verification_status: string
          verified_at: string | null
        }
        Insert: {
          account_id: string
          country_code: string
          created_at?: string
          friendly_rejection_reason?: string | null
          id?: string
          in_review_at?: string | null
          last_synced_at?: string | null
          phone_number?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          sender_kind: string
          submitted_at?: string | null
          telnyx_messaging_profile_id?: string | null
          telnyx_phone_number_id?: string | null
          telnyx_verification_id?: string | null
          updated_at?: string
          verification_payload?: Json | null
          verification_status?: string
          verified_at?: string | null
        }
        Update: {
          account_id?: string
          country_code?: string
          created_at?: string
          friendly_rejection_reason?: string | null
          id?: string
          in_review_at?: string | null
          last_synced_at?: string | null
          phone_number?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          sender_kind?: string
          submitted_at?: string | null
          telnyx_messaging_profile_id?: string | null
          telnyx_phone_number_id?: string | null
          telnyx_verification_id?: string | null
          updated_at?: string
          verification_payload?: Json | null
          verification_status?: string
          verified_at?: string | null
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
      sms_thread_messages: {
        Row: {
          account_id: string
          body: string
          created_at: string
          direction: string
          from_number: string | null
          id: string
          phone_e164: string
          provider_sid: string | null
          status: string | null
          to_number: string | null
        }
        Insert: {
          account_id: string
          body: string
          created_at?: string
          direction: string
          from_number?: string | null
          id?: string
          phone_e164: string
          provider_sid?: string | null
          status?: string | null
          to_number?: string | null
        }
        Update: {
          account_id?: string
          body?: string
          created_at?: string
          direction?: string
          from_number?: string | null
          id?: string
          phone_e164?: string
          provider_sid?: string | null
          status?: string | null
          to_number?: string | null
        }
        Relationships: []
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
      tenant_10dlc_registrations: {
        Row: {
          account_id: string
          approved_at: string | null
          brand_id: string | null
          campaign_id: string | null
          created_at: string
          id: string
          metadata: Json
          rejection_reason: string | null
          status: string
          submitted_at: string | null
          telnyx_brand_id: string | null
          telnyx_campaign_id: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          approved_at?: string | null
          brand_id?: string | null
          campaign_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          rejection_reason?: string | null
          status?: string
          submitted_at?: string | null
          telnyx_brand_id?: string | null
          telnyx_campaign_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          approved_at?: string | null
          brand_id?: string | null
          campaign_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          rejection_reason?: string | null
          status?: string
          submitted_at?: string | null
          telnyx_brand_id?: string | null
          telnyx_campaign_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_10dlc_registrations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_sending_suspensions: {
        Row: {
          account_id: string
          id: string
          lifted_at: string | null
          lifted_by: string | null
          reason: string
          suspended_at: string
          suspended_by: string | null
          telnyx_error: string | null
          telnyx_profile_id: string | null
        }
        Insert: {
          account_id: string
          id?: string
          lifted_at?: string | null
          lifted_by?: string | null
          reason: string
          suspended_at?: string
          suspended_by?: string | null
          telnyx_error?: string | null
          telnyx_profile_id?: string | null
        }
        Update: {
          account_id?: string
          id?: string
          lifted_at?: string | null
          lifted_by?: string | null
          reason?: string
          suspended_at?: string
          suspended_by?: string | null
          telnyx_error?: string | null
          telnyx_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_sending_suspensions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
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
          phone_number: string | null
          provider_code: string | null
          provider_more_info: string | null
          provider_response: Json | null
          provider_status: number | null
          request_summary: Json | null
          sender_asset_id: string | null
          telnyx_messaging_profile_id: string | null
          telnyx_number_id: string | null
          telnyx_verification_id: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          actor_user_id: string
          attempt_status?: string
          created_at?: string
          failure_reason?: string | null
          friendly_failure_reason?: string | null
          id?: string
          phone_number?: string | null
          provider_code?: string | null
          provider_more_info?: string | null
          provider_response?: Json | null
          provider_status?: number | null
          request_summary?: Json | null
          sender_asset_id?: string | null
          telnyx_messaging_profile_id?: string | null
          telnyx_number_id?: string | null
          telnyx_verification_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          actor_user_id?: string
          attempt_status?: string
          created_at?: string
          failure_reason?: string | null
          friendly_failure_reason?: string | null
          id?: string
          phone_number?: string | null
          provider_code?: string | null
          provider_more_info?: string | null
          provider_response?: Json | null
          provider_status?: number | null
          request_summary?: Json | null
          sender_asset_id?: string | null
          telnyx_messaging_profile_id?: string | null
          telnyx_number_id?: string | null
          telnyx_verification_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tos_acceptances: {
        Row: {
          accepted_at: string
          id: string
          ip_address: string | null
          tenant_account_id: string
          tos_version: string
          user_agent: string | null
        }
        Insert: {
          accepted_at?: string
          id?: string
          ip_address?: string | null
          tenant_account_id: string
          tos_version: string
          user_agent?: string | null
        }
        Update: {
          accepted_at?: string
          id?: string
          ip_address?: string | null
          tenant_account_id?: string
          tos_version?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tos_acceptances_tenant_account_id_fkey"
            columns: ["tenant_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
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
      twilio_webhook_events: {
        Row: {
          body_hash: string
          id: string
          received_at: string
          status: string | null
          verification_sid: string | null
        }
        Insert: {
          body_hash: string
          id?: string
          received_at?: string
          status?: string | null
          verification_sid?: string | null
        }
        Update: {
          body_hash?: string
          id?: string
          received_at?: string
          status?: string | null
          verification_sid?: string | null
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
      verifier_bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_code: string
          bank_name: string
          created_at: string
          id: string
          resolved_at: string
          updated_at: string
          verifier_id: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_code: string
          bank_name: string
          created_at?: string
          id?: string
          resolved_at?: string
          updated_at?: string
          verifier_id: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_code?: string
          bank_name?: string
          created_at?: string
          id?: string
          resolved_at?: string
          updated_at?: string
          verifier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verifier_bank_accounts_verifier_id_fkey"
            columns: ["verifier_id"]
            isOneToOne: true
            referencedRelation: "verifiers"
            referencedColumns: ["id"]
          },
        ]
      }
      verifier_signup_codes: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      verifier_tfns: {
        Row: {
          commission_ngn: number | null
          country: string
          created_at: string
          id: string
          in_review_at: string | null
          notes: string | null
          payout_ngn: number | null
          phone_number: string
          rejected_at: string | null
          rejection_reason: string | null
          sale_price_ngn: number | null
          sold_at: string | null
          sold_to_account_id: string | null
          status: Database["public"]["Enums"]["verifier_tfn_status"]
          submitted_at: string | null
          telnyx_number_id: string | null
          telnyx_verification_id: string | null
          updated_at: string
          verified_at: string | null
          verifier_id: string
        }
        Insert: {
          commission_ngn?: number | null
          country?: string
          created_at?: string
          id?: string
          in_review_at?: string | null
          notes?: string | null
          payout_ngn?: number | null
          phone_number: string
          rejected_at?: string | null
          rejection_reason?: string | null
          sale_price_ngn?: number | null
          sold_at?: string | null
          sold_to_account_id?: string | null
          status?: Database["public"]["Enums"]["verifier_tfn_status"]
          submitted_at?: string | null
          telnyx_number_id?: string | null
          telnyx_verification_id?: string | null
          updated_at?: string
          verified_at?: string | null
          verifier_id: string
        }
        Update: {
          commission_ngn?: number | null
          country?: string
          created_at?: string
          id?: string
          in_review_at?: string | null
          notes?: string | null
          payout_ngn?: number | null
          phone_number?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          sale_price_ngn?: number | null
          sold_at?: string | null
          sold_to_account_id?: string | null
          status?: Database["public"]["Enums"]["verifier_tfn_status"]
          submitted_at?: string | null
          telnyx_number_id?: string | null
          telnyx_verification_id?: string | null
          updated_at?: string
          verified_at?: string | null
          verifier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verifier_tfns_sold_to_account_id_fkey"
            columns: ["sold_to_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifier_tfns_verifier_id_fkey"
            columns: ["verifier_id"]
            isOneToOne: false
            referencedRelation: "verifiers"
            referencedColumns: ["id"]
          },
        ]
      }
      verifier_transactions: {
        Row: {
          amount_ngn: number
          balance_after: number
          created_at: string
          description: string | null
          id: string
          tfn_id: string | null
          type: Database["public"]["Enums"]["verifier_tx_type"]
          verifier_id: string
          withdrawal_id: string | null
        }
        Insert: {
          amount_ngn: number
          balance_after: number
          created_at?: string
          description?: string | null
          id?: string
          tfn_id?: string | null
          type: Database["public"]["Enums"]["verifier_tx_type"]
          verifier_id: string
          withdrawal_id?: string | null
        }
        Update: {
          amount_ngn?: number
          balance_after?: number
          created_at?: string
          description?: string | null
          id?: string
          tfn_id?: string | null
          type?: Database["public"]["Enums"]["verifier_tx_type"]
          verifier_id?: string
          withdrawal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verifier_transactions_tfn_id_fkey"
            columns: ["tfn_id"]
            isOneToOne: false
            referencedRelation: "verifier_tfns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifier_transactions_verifier_id_fkey"
            columns: ["verifier_id"]
            isOneToOne: false
            referencedRelation: "verifiers"
            referencedColumns: ["id"]
          },
        ]
      }
      verifier_wallets: {
        Row: {
          balance_ngn: number
          id: string
          lifetime_earned_ngn: number
          updated_at: string
          verifier_id: string
        }
        Insert: {
          balance_ngn?: number
          id?: string
          lifetime_earned_ngn?: number
          updated_at?: string
          verifier_id: string
        }
        Update: {
          balance_ngn?: number
          id?: string
          lifetime_earned_ngn?: number
          updated_at?: string
          verifier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verifier_wallets_verifier_id_fkey"
            columns: ["verifier_id"]
            isOneToOne: true
            referencedRelation: "verifiers"
            referencedColumns: ["id"]
          },
        ]
      }
      verifier_withdrawals: {
        Row: {
          admin_note: string | null
          amount_ngn: number
          created_at: string
          id: string
          paid_at: string | null
          paid_by: string | null
          requested_at: string
          status: Database["public"]["Enums"]["verifier_withdrawal_status"]
          updated_at: string
          verifier_id: string
        }
        Insert: {
          admin_note?: string | null
          amount_ngn: number
          created_at?: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["verifier_withdrawal_status"]
          updated_at?: string
          verifier_id: string
        }
        Update: {
          admin_note?: string | null
          amount_ngn?: number
          created_at?: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["verifier_withdrawal_status"]
          updated_at?: string
          verifier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verifier_withdrawals_verifier_id_fkey"
            columns: ["verifier_id"]
            isOneToOne: false
            referencedRelation: "verifiers"
            referencedColumns: ["id"]
          },
        ]
      }
      verifiers: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      withdrawal_requests: {
        Row: {
          admin_notes: string | null
          amount: number
          created_at: string
          id: string
          paid_at: string | null
          paid_by: string | null
          payout_account_snapshot: Json
          seller_account_id: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          amount: number
          created_at?: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          payout_account_snapshot: Json
          seller_account_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          created_at?: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          payout_account_snapshot?: Json
          seller_account_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawal_requests_seller_account_id_fkey"
            columns: ["seller_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_account_invites: { Args: never; Returns: number }
      claim_and_sell_verified_tfn: {
        Args: {
          _account_id: string
          _commission_pct: number
          _price_ngn: number
        }
        Returns: {
          commission_ngn: number
          country: string
          payout_ngn: number
          phone_number: string
          tfn_id: string
          verifier_id: string
        }[]
      }
      claim_campaign_messages: {
        Args: { _campaign_id: string; _limit: number }
        Returns: {
          cost: number
          country_code: string
          id: string
          phone_e164: string
          rendered_body: string
          segments_count: number
        }[]
      }
      credit_seller: {
        Args: {
          _account_id: string
          _amount: number
          _description: string
          _listing_id: string
        }
        Returns: number
      }
      debit_account: {
        Args: {
          _account_id: string
          _amount: number
          _campaign_id: string
          _description: string
        }
        Returns: number
      }
      debit_seller_withdrawal: {
        Args: {
          _account_id: string
          _amount: number
          _description: string
          _withdrawal_id: string
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
      eligible_profile_ids_page: {
        Args: {
          _account_id: string
          _audience: Json
          _limit?: number
          _offset?: number
        }
        Returns: {
          country_code: string
          first_name: string
          last_name: string
          phone_e164: string
          profile_id: string
        }[]
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      encrypt_twilio_token: { Args: { _plain: string }; Returns: string }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_verifier_wallet: {
        Args: { _verifier_id: string }
        Returns: string
      }
      has_account_access: {
        Args: {
          _account_id: string
          _min_role?: Database["public"]["Enums"]["account_member_role"]
        }
        Returns: boolean
      }
      has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      mark_verifier_withdrawal_paid: {
        Args: { _admin_note?: string; _withdrawal_id: string }
        Returns: number
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
      my_eligible_profile_count: { Args: { _audience: Json }; Returns: number }
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
      my_eligible_profile_ids_page: {
        Args: { _audience: Json; _limit?: number; _offset?: number }
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
      reject_verifier_withdrawal: {
        Args: { _admin_note: string; _withdrawal_id: string }
        Returns: undefined
      }
      topup_account: {
        Args: { _account_id: string; _amount: number; _description: string }
        Returns: number
      }
    }
    Enums: {
      account_member_role: "viewer" | "editor" | "admin"
      app_role: "admin" | "user"
      number_request_country: "US" | "CA"
      number_request_status: "pending" | "approved" | "rejected" | "provisioned"
      number_request_type: "toll_free" | "ten_dlc" | "short_code"
      phone_number_status: "active" | "pending" | "released"
      phone_number_type: "toll_free" | "personal"
      sender_id_status: "pending" | "approved" | "rejected"
      verifier_tfn_status:
        | "assigned"
        | "pending_verification"
        | "verified"
        | "sold"
        | "rejected"
      verifier_tx_type:
        | "sale_credit"
        | "commission"
        | "withdrawal_debit"
        | "adjustment"
      verifier_withdrawal_status: "pending" | "paid" | "rejected"
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
      account_member_role: ["viewer", "editor", "admin"],
      app_role: ["admin", "user"],
      number_request_country: ["US", "CA"],
      number_request_status: ["pending", "approved", "rejected", "provisioned"],
      number_request_type: ["toll_free", "ten_dlc", "short_code"],
      phone_number_status: ["active", "pending", "released"],
      phone_number_type: ["toll_free", "personal"],
      sender_id_status: ["pending", "approved", "rejected"],
      verifier_tfn_status: [
        "assigned",
        "pending_verification",
        "verified",
        "sold",
        "rejected",
      ],
      verifier_tx_type: [
        "sale_credit",
        "commission",
        "withdrawal_debit",
        "adjustment",
      ],
      verifier_withdrawal_status: ["pending", "paid", "rejected"],
    },
  },
} as const
