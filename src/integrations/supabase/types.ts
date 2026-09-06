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
      match_invites: {
        Row: {
          created_at: string
          from_nickname: string
          from_session: string
          game: string
          id: string
          match_id: string | null
          status: string
          to_nickname: string
          to_session: string
        }
        Insert: {
          created_at?: string
          from_nickname: string
          from_session: string
          game: string
          id?: string
          match_id?: string | null
          status?: string
          to_nickname: string
          to_session: string
        }
        Update: {
          created_at?: string
          from_nickname?: string
          from_session?: string
          game?: string
          id?: string
          match_id?: string | null
          status?: string
          to_nickname?: string
          to_session?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_invites_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string
          game: string
          guest_nickname: string
          guest_session: string
          host_nickname: string
          host_session: string
          id: string
          state: Json | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          game: string
          guest_nickname: string
          guest_session: string
          host_nickname: string
          host_session: string
          id?: string
          state?: Json | null
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          game?: string
          guest_nickname?: string
          guest_session?: string
          host_nickname?: string
          host_session?: string
          id?: string
          state?: Json | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      game_rooms: {
        Row: {
          created_at: string
          game: string
          host_nickname: string
          host_session: string
          id: string
          is_public: boolean
          max_seats: number
          password: string | null
          state: Json | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          game?: string
          host_nickname: string
          host_session: string
          id?: string
          is_public?: boolean
          max_seats?: number
          password?: string | null
          state?: Json | null
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          game?: string
          host_nickname?: string
          host_session?: string
          id?: string
          is_public?: boolean
          max_seats?: number
          password?: string | null
          state?: Json | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      game_room_players: {
        Row: {
          avatar: string | null
          id: string
          is_bot: boolean
          joined_at: string
          last_seen_at: string
          nickname: string
          room_id: string
          seat: number
          session_id: string
        }
        Insert: {
          avatar?: string | null
          id?: string
          is_bot?: boolean
          joined_at?: string
          last_seen_at?: string
          nickname: string
          room_id: string
          seat: number
          session_id: string
        }
        Update: {
          avatar?: string | null
          id?: string
          is_bot?: boolean
          joined_at?: string
          last_seen_at?: string
          nickname?: string
          room_id?: string
          seat?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_room_players_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "game_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visits: {
        Row: {
          id: number
          visited_at: string
        }
        Insert: {
          id?: number
          visited_at?: string
        }
        Update: {
          id?: number
          visited_at?: string
        }
        Relationships: []
      }
      waiting_players: {
        Row: {
          created_at: string
          game: string
          id: string
          last_seen_at: string
          nickname: string
          session_id: string
        }
        Insert: {
          created_at?: string
          game: string
          id?: string
          last_seen_at?: string
          nickname: string
          session_id: string
        }
        Update: {
          created_at?: string
          game?: string
          id?: string
          last_seen_at?: string
          nickname?: string
          session_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
