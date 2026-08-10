/**
 * Typed shape of the Supabase `public` schema shared with the legacy prototype.
 * Reconstructed from the live code (both apps read/write these exact columns).
 * The project (joshos-sync) is on open RLS — see CLAUDE.md "Known debt".
 *
 * Four tables are load-bearing. NOTE: `joshos_data` is NOT in the old README but
 * powers multi-device full-state sync (id=2) and the iOS summary card (id=1).
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      timelog: {
        Row: {
          id: number;
          date_key: string;
          hour: number;
          text: string | null;
          category: string | null;
          timestamp: string | null;
          source: string | null;
        };
        Insert: {
          id?: number;
          date_key: string;
          hour: number;
          text?: string | null;
          category?: string | null;
          timestamp?: string | null;
          source?: string | null;
        };
        Update: Partial<Database['public']['Tables']['timelog']['Insert']>;
        Relationships: [];
      };
      daily_scorecard: {
        Row: { date: string; scores: Json; updated_at: string | null };
        Insert: { date: string; scores?: Json; updated_at?: string | null };
        Update: Partial<Database['public']['Tables']['daily_scorecard']['Insert']>;
        Relationships: [];
      };
      joshos_theme: {
        Row: { id: number; data: Json };
        Insert: { id?: number; data?: Json };
        Update: Partial<Database['public']['Tables']['joshos_theme']['Insert']>;
        Relationships: [];
      };
      joshos_data: {
        Row: { id: number; data: Json; updated_at: string | null };
        Insert: { id: number; data?: Json; updated_at?: string | null };
        Update: Partial<Database['public']['Tables']['joshos_data']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

/** Convenience row aliases. */
export type TimelogRow = Database['public']['Tables']['timelog']['Row'];
export type TimelogInsert = Database['public']['Tables']['timelog']['Insert'];
export type ScorecardRow = Database['public']['Tables']['daily_scorecard']['Row'];
export type ThemeRow = Database['public']['Tables']['joshos_theme']['Row'];
export type JoshosDataRow = Database['public']['Tables']['joshos_data']['Row'];
