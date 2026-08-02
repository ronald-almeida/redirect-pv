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
      alerts: {
        Row: {
          created_at: string
          detail: string | null
          domain_id: string | null
          id: string
          kind: string
          link_id: string | null
          read_at: string | null
          severity: string
          title: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          domain_id?: string | null
          id?: string
          kind: string
          link_id?: string | null
          read_at?: string | null
          severity?: string
          title: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          domain_id?: string | null
          id?: string
          kind?: string
          link_id?: string | null
          read_at?: string | null
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
        ]
      }
      clicks: {
        Row: {
          cache_status: string | null
          country: string | null
          created_at: string
          device: string | null
          host: string | null
          id: string
          ip: string | null
          is_vpn: boolean
          link_id: string
          mode_at_click: string
          redirect_ms: number | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          cache_status?: string | null
          country?: string | null
          created_at?: string
          device?: string | null
          host?: string | null
          id?: string
          ip?: string | null
          is_vpn?: boolean
          link_id: string
          mode_at_click: string
          redirect_ms?: number | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          cache_status?: string | null
          country?: string | null
          created_at?: string
          device?: string | null
          host?: string | null
          id?: string
          ip?: string | null
          is_vpn?: boolean
          link_id?: string
          mode_at_click?: string
          redirect_ms?: number | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clicks_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
        ]
      }
      domains: {
        Row: {
          active: boolean
          archived_at: string | null
          cf_api_token_secret: string | null
          cf_dns_status: string
          cf_ssl_status: string
          cf_worker_status: string
          cf_zone_id: string | null
          check_error: string | null
          created_at: string
          description: string | null
          dns_status: string
          domain: string
          health_status: string
          id: string
          is_primary: boolean
          last_checked_at: string | null
          last_health_at: string | null
          notes: string | null
          ssl_status: string
          updated_at: string
          worker_status: string
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          cf_api_token_secret?: string | null
          cf_dns_status?: string
          cf_ssl_status?: string
          cf_worker_status?: string
          cf_zone_id?: string | null
          check_error?: string | null
          created_at?: string
          description?: string | null
          dns_status?: string
          domain: string
          health_status?: string
          id?: string
          is_primary?: boolean
          last_checked_at?: string | null
          last_health_at?: string | null
          notes?: string | null
          ssl_status?: string
          updated_at?: string
          worker_status?: string
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          cf_api_token_secret?: string | null
          cf_dns_status?: string
          cf_ssl_status?: string
          cf_worker_status?: string
          cf_zone_id?: string | null
          check_error?: string | null
          created_at?: string
          description?: string | null
          dns_status?: string
          domain?: string
          health_status?: string
          id?: string
          is_primary?: boolean
          last_checked_at?: string | null
          last_health_at?: string | null
          notes?: string | null
          ssl_status?: string
          updated_at?: string
          worker_status?: string
        }
        Relationships: []
      }
      link_audit: {
        Row: {
          action: string
          actor: string
          created_at: string
          detail: Json | null
          id: string
          link_id: string | null
          slug: string | null
        }
        Insert: {
          action: string
          actor?: string
          created_at?: string
          detail?: Json | null
          id?: string
          link_id?: string | null
          slug?: string | null
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          detail?: Json | null
          id?: string
          link_id?: string | null
          slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "link_audit_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
        ]
      }
      links: {
        Row: {
          ab_test: boolean
          access_password: string | null
          active: boolean
          allowed_countries: string[] | null
          archived_at: string | null
          auto_activate: boolean
          auto_activate_after: number
          avg_redirect_ms: number
          blocked_ips: string[] | null
          click_count: number
          click_limit: number | null
          created_at: string
          decoy_url: string | null
          domain_id: string | null
          expires_at: string | null
          id: string
          last_click_at: string | null
          last_redirect_ms: number
          mode: string
          name: string | null
          owner_ips: string[]
          owner_only: boolean
          page_icon: string | null
          page_message: string | null
          page_title: string | null
          real_url: string | null
          real_urls: string[] | null
          rotation_index: number
          slug: string
          total_redirects: number
          updated_at: string
        }
        Insert: {
          ab_test?: boolean
          access_password?: string | null
          active?: boolean
          allowed_countries?: string[] | null
          archived_at?: string | null
          auto_activate?: boolean
          auto_activate_after?: number
          avg_redirect_ms?: number
          blocked_ips?: string[] | null
          click_count?: number
          click_limit?: number | null
          created_at?: string
          decoy_url?: string | null
          domain_id?: string | null
          expires_at?: string | null
          id?: string
          last_click_at?: string | null
          last_redirect_ms?: number
          mode?: string
          name?: string | null
          owner_ips?: string[]
          owner_only?: boolean
          page_icon?: string | null
          page_message?: string | null
          page_title?: string | null
          real_url?: string | null
          real_urls?: string[] | null
          rotation_index?: number
          slug: string
          total_redirects?: number
          updated_at?: string
        }
        Update: {
          ab_test?: boolean
          access_password?: string | null
          active?: boolean
          allowed_countries?: string[] | null
          archived_at?: string | null
          auto_activate?: boolean
          auto_activate_after?: number
          avg_redirect_ms?: number
          blocked_ips?: string[] | null
          click_count?: number
          click_limit?: number | null
          created_at?: string
          decoy_url?: string | null
          domain_id?: string | null
          expires_at?: string | null
          id?: string
          last_click_at?: string | null
          last_redirect_ms?: number
          mode?: string
          name?: string | null
          owner_ips?: string[]
          owner_only?: boolean
          page_icon?: string | null
          page_message?: string | null
          page_title?: string | null
          real_url?: string | null
          real_urls?: string[] | null
          rotation_index?: number
          slug?: string
          total_redirects?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "links_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          cf_account_id: string | null
          cf_enabled: boolean
          default_auto_activate_after: number
          default_waiting_url: string
          id: string
          updated_at: string
        }
        Insert: {
          cf_account_id?: string | null
          cf_enabled?: boolean
          default_auto_activate_after?: number
          default_waiting_url?: string
          id?: string
          updated_at?: string
        }
        Update: {
          cf_account_id?: string | null
          cf_enabled?: boolean
          default_auto_activate_after?: number
          default_waiting_url?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_link_click: { Args: { _link_id: string }; Returns: undefined }
      recompute_all_link_counters: { Args: never; Returns: undefined }
      recompute_link_counters: {
        Args: { _link_id: string }
        Returns: undefined
      }
      record_redirect_metrics: {
        Args: { _link_id: string; _ms: number }
        Returns: undefined
      }
      reset_link_counters: { Args: { _link_id: string }; Returns: undefined }
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
    Enums: {},
  },
} as const
