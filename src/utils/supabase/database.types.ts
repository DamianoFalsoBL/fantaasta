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
    PostgrestVersion: "14.17"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      aste: {
        Row: {
          abbandoni: Json
          base_asta: number
          consuma_turno: boolean
          created_at: string
          giocatore_id: number
          id: string
          prezzo_corrente: number
          rilanci: Json
          scadenza_corrente: string | null
          squadra_in_testa: string | null
          stato: Database["public"]["Enums"]["stato_asta"]
        }
        Insert: {
          abbandoni?: Json
          base_asta?: number
          consuma_turno?: boolean
          created_at?: string
          giocatore_id: number
          id?: string
          prezzo_corrente?: number
          rilanci?: Json
          scadenza_corrente?: string | null
          squadra_in_testa?: string | null
          stato?: Database["public"]["Enums"]["stato_asta"]
        }
        Update: {
          abbandoni?: Json
          base_asta?: number
          consuma_turno?: boolean
          created_at?: string
          giocatore_id?: number
          id?: string
          prezzo_corrente?: number
          rilanci?: Json
          scadenza_corrente?: string | null
          squadra_in_testa?: string | null
          stato?: Database["public"]["Enums"]["stato_asta"]
        }
        Relationships: [
          {
            foreignKeyName: "aste_giocatore_id_fkey"
            columns: ["giocatore_id"]
            isOneToOne: true
            referencedRelation: "giocatori"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aste_squadra_in_testa_fkey"
            columns: ["squadra_in_testa"]
            isOneToOne: false
            referencedRelation: "squadre"
            referencedColumns: ["id"]
          },
        ]
      }
      buste: {
        Row: {
          created_at: string
          esito: Database["public"]["Enums"]["esito_busta"]
          giocatore_id: number
          id: string
          squadra_id: string
          turno: number
        }
        Insert: {
          created_at?: string
          esito?: Database["public"]["Enums"]["esito_busta"]
          giocatore_id: number
          id?: string
          squadra_id: string
          turno?: number
        }
        Update: {
          created_at?: string
          esito?: Database["public"]["Enums"]["esito_busta"]
          giocatore_id?: number
          id?: string
          squadra_id?: string
          turno?: number
        }
        Relationships: [
          {
            foreignKeyName: "buste_giocatore_id_fkey"
            columns: ["giocatore_id"]
            isOneToOne: false
            referencedRelation: "giocatori"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buste_squadra_id_fkey"
            columns: ["squadra_id"]
            isOneToOne: false
            referencedRelation: "squadre"
            referencedColumns: ["id"]
          },
        ]
      }
      giocatori: {
        Row: {
          created_at: string
          eta: number | null
          fuori_lista: boolean
          id: number
          nome: string
          quotazione: number
          ruolo: Database["public"]["Enums"]["ruolo_giocatore"]
          ruolo_mantra: string[] | null
          squadra: string
          stato: Database["public"]["Enums"]["stato_giocatore"]
        }
        Insert: {
          created_at?: string
          eta?: number | null
          fuori_lista?: boolean
          id: number
          nome: string
          quotazione?: number
          ruolo: Database["public"]["Enums"]["ruolo_giocatore"]
          ruolo_mantra?: string[] | null
          squadra: string
          stato?: Database["public"]["Enums"]["stato_giocatore"]
        }
        Update: {
          created_at?: string
          eta?: number | null
          fuori_lista?: boolean
          id?: number
          nome?: string
          quotazione?: number
          ruolo?: Database["public"]["Enums"]["ruolo_giocatore"]
          ruolo_mantra?: string[] | null
          squadra?: string
          stato?: Database["public"]["Enums"]["stato_giocatore"]
        }
        Relationships: []
      }
      liste_aste: {
        Row: {
          giocatore_id: number
          id: string
          squadra_id: string
        }
        Insert: {
          giocatore_id: number
          id?: string
          squadra_id: string
        }
        Update: {
          giocatore_id?: number
          id?: string
          squadra_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "liste_aste_giocatore_id_fkey"
            columns: ["giocatore_id"]
            isOneToOne: false
            referencedRelation: "giocatori"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liste_aste_squadra_id_fkey"
            columns: ["squadra_id"]
            isOneToOne: false
            referencedRelation: "squadre"
            referencedColumns: ["id"]
          },
        ]
      }
      massimi_asta: {
        Row: {
          asta_id: string
          created_at: string
          importo: number
          squadra_id: string
        }
        Insert: {
          asta_id: string
          created_at?: string
          importo: number
          squadra_id: string
        }
        Update: {
          asta_id?: string
          created_at?: string
          importo?: number
          squadra_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "massimi_asta_asta_id_fkey"
            columns: ["asta_id"]
            isOneToOne: false
            referencedRelation: "aste"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "massimi_asta_squadra_id_fkey"
            columns: ["squadra_id"]
            isOneToOne: false
            referencedRelation: "squadre"
            referencedColumns: ["id"]
          },
        ]
      }
      offerte: {
        Row: {
          asta_id: string
          created_at: string
          id: string
          importo: number
          origine: Database["public"]["Enums"]["origine_offerta"]
          squadra_id: string
        }
        Insert: {
          asta_id: string
          created_at?: string
          id?: string
          importo: number
          origine?: Database["public"]["Enums"]["origine_offerta"]
          squadra_id: string
        }
        Update: {
          asta_id?: string
          created_at?: string
          id?: string
          importo?: number
          origine?: Database["public"]["Enums"]["origine_offerta"]
          squadra_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offerte_asta_id_fkey"
            columns: ["asta_id"]
            isOneToOne: false
            referencedRelation: "aste"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offerte_squadra_id_fkey"
            columns: ["squadra_id"]
            isOneToOne: false
            referencedRelation: "squadre"
            referencedColumns: ["id"]
          },
        ]
      }
      offerte_trasferimento: {
        Row: {
          created_at: string
          crediti: number
          deciso_at: string | null
          eseguito_at: string | null
          giocatore_id: number
          id: string
          messaggio: string | null
          squadra_a: string
          squadra_da: string
          stato: Database["public"]["Enums"]["stato_offerta_trasf"]
        }
        Insert: {
          created_at?: string
          crediti?: number
          deciso_at?: string | null
          eseguito_at?: string | null
          giocatore_id: number
          id?: string
          messaggio?: string | null
          squadra_a: string
          squadra_da: string
          stato?: Database["public"]["Enums"]["stato_offerta_trasf"]
        }
        Update: {
          created_at?: string
          crediti?: number
          deciso_at?: string | null
          eseguito_at?: string | null
          giocatore_id?: number
          id?: string
          messaggio?: string | null
          squadra_a?: string
          squadra_da?: string
          stato?: Database["public"]["Enums"]["stato_offerta_trasf"]
        }
        Relationships: [
          {
            foreignKeyName: "offerte_trasferimento_giocatore_id_fkey"
            columns: ["giocatore_id"]
            isOneToOne: false
            referencedRelation: "giocatori"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offerte_trasferimento_squadra_a_fkey"
            columns: ["squadra_a"]
            isOneToOne: false
            referencedRelation: "squadre"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offerte_trasferimento_squadra_da_fkey"
            columns: ["squadra_da"]
            isOneToOne: false
            referencedRelation: "squadre"
            referencedColumns: ["id"]
          },
        ]
      }
      offerte_trasferimento_giocatori: {
        Row: {
          giocatore_id: number
          offerta_id: string
        }
        Insert: {
          giocatore_id: number
          offerta_id: string
        }
        Update: {
          giocatore_id?: number
          offerta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offerte_trasferimento_giocatori_giocatore_id_fkey"
            columns: ["giocatore_id"]
            isOneToOne: false
            referencedRelation: "giocatori"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offerte_trasferimento_giocatori_offerta_id_fkey"
            columns: ["offerta_id"]
            isOneToOne: false
            referencedRelation: "offerte_trasferimento"
            referencedColumns: ["id"]
          },
        ]
      }
      profili: {
        Row: {
          created_at: string
          id: string
          ruolo: Database["public"]["Enums"]["ruolo_utente"]
          squadra_id: string | null
        }
        Insert: {
          created_at?: string
          id: string
          ruolo?: Database["public"]["Enums"]["ruolo_utente"]
          squadra_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ruolo?: Database["public"]["Enums"]["ruolo_utente"]
          squadra_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profili_squadra_id_fkey"
            columns: ["squadra_id"]
            isOneToOne: false
            referencedRelation: "squadre"
            referencedColumns: ["id"]
          },
        ]
      }
      regole_lega: {
        Row: {
          budget_standard: number
          costo_minimo_giocatore: number
          durata_timer: number
          durata_timer_rilancio: number
          fase_buste_aperta: boolean | null
          fase_mercato_aperta: boolean
          id: string
          indice_chiamata: number | null
          ordine_chiamata: string[] | null
          rilancio_minimo: number
          slot_a: number
          slot_c: number
          slot_d: number
          slot_p: number
          slot_totali: number
          super_admin_email: string | null
          turno_buste: number
        }
        Insert: {
          budget_standard?: number
          costo_minimo_giocatore?: number
          durata_timer?: number
          durata_timer_rilancio?: number
          fase_buste_aperta?: boolean | null
          fase_mercato_aperta?: boolean
          id?: string
          indice_chiamata?: number | null
          ordine_chiamata?: string[] | null
          rilancio_minimo?: number
          slot_a?: number
          slot_c?: number
          slot_d?: number
          slot_p?: number
          slot_totali?: number
          super_admin_email?: string | null
          turno_buste?: number
        }
        Update: {
          budget_standard?: number
          costo_minimo_giocatore?: number
          durata_timer?: number
          durata_timer_rilancio?: number
          fase_buste_aperta?: boolean | null
          fase_mercato_aperta?: boolean
          id?: string
          indice_chiamata?: number | null
          ordine_chiamata?: string[] | null
          rilancio_minimo?: number
          slot_a?: number
          slot_c?: number
          slot_d?: number
          slot_p?: number
          slot_totali?: number
          super_admin_email?: string | null
          turno_buste?: number
        }
        Relationships: []
      }
      squadre: {
        Row: {
          budget_iniziale: number
          created_at: string
          crediti_residui: number
          id: string
          nome: string
          slot_occupati: number
          slug: string
        }
        Insert: {
          budget_iniziale?: number
          created_at?: string
          crediti_residui?: number
          id?: string
          nome: string
          slot_occupati?: number
          slug: string
        }
        Update: {
          budget_iniziale?: number
          created_at?: string
          crediti_residui?: number
          id?: string
          nome?: string
          slot_occupati?: number
          slug?: string
        }
        Relationships: []
      }
      tesseramenti: {
        Row: {
          created_at: string
          giocatore_id: number
          id: string
          in_vendita: boolean
          prezzo_pagato: number
          prezzo_richiesto: number | null
          squadra_id: string
          stagione: string
        }
        Insert: {
          created_at?: string
          giocatore_id: number
          id?: string
          in_vendita?: boolean
          prezzo_pagato: number
          prezzo_richiesto?: number | null
          squadra_id: string
          stagione?: string
        }
        Update: {
          created_at?: string
          giocatore_id?: number
          id?: string
          in_vendita?: boolean
          prezzo_pagato?: number
          prezzo_richiesto?: number | null
          squadra_id?: string
          stagione?: string
        }
        Relationships: [
          {
            foreignKeyName: "tesseramenti_giocatore_id_fkey"
            columns: ["giocatore_id"]
            isOneToOne: true
            referencedRelation: "giocatori"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tesseramenti_squadra_id_fkey"
            columns: ["squadra_id"]
            isOneToOne: false
            referencedRelation: "squadre"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      abbandona_asta: {
        Args: { p_asta_id: string; p_squadra_delega?: string }
        Returns: Json
      }
      admin_annulla_acquisto: {
        Args: { p_asta_id: string }
        Returns: undefined
      }
      admin_elabora_buste: { Args: never; Returns: Json }
      admin_imposta_max_portieri: { Args: { p_max: number }; Returns: Json }
      admin_imposta_timer: {
        Args: { p_primo: number; p_rilancio: number }
        Returns: Json
      }
      admin_imposta_turno: { Args: { p_squadra_id: string }; Returns: Json }
      admin_modifica_budget: {
        Args: { p_delta: number; p_squadra_id: string }
        Returns: undefined
      }
      admin_risolvi_busta_pari: {
        Args: { p_giocatore_id: number; p_squadra_vincente_id: string }
        Returns: undefined
      }
      admin_set_ruolo: {
        Args: { p_nuovo_ruolo: string; p_target_user_id: string }
        Returns: undefined
      }
      admin_toggle_buste: { Args: { p_stato: boolean }; Returns: undefined }
      admin_toggle_mercato: { Args: { p_stato: boolean }; Returns: Json }
      avanza_turno_chiamata: { Args: never; Returns: undefined }
      avvia_asta_admin: { Args: { p_giocatore_id: number }; Returns: Json }
      avvia_timer_chiamata: { Args: { p_asta_id: string }; Returns: Json }
      calcola_massimo_offribile: {
        Args: { p_giocatore_in_asta_id: number; p_squadra_id: string }
        Returns: number
      }
      chiudi_asta: { Args: { p_asta_id: string }; Returns: Json }
      crea_offerta_trasferimento: {
        Args: {
          p_crediti?: number
          p_giocatore_id: number
          p_giocatori_offerti?: number[]
          p_messaggio?: string
        }
        Returns: Json
      }
      esegui_trasferimento: {
        Args: { p_approva?: boolean; p_offerta_id: string }
        Returns: Json
      }
      genera_ordine_chiamata: { Args: never; Returns: Json }
      hard_reset_sistema: { Args: never; Returns: Json }
      import_giocatori_batch: { Args: { payload: Json }; Returns: Json }
      imposta_massimo_asta: {
        Args: {
          p_asta_id: string
          p_importo: number
          p_squadra_delega?: string
        }
        Returns: Json
      }
      imposta_vetrina: {
        Args: {
          p_giocatore_id: number
          p_in_vendita: boolean
          p_prezzo?: number
        }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      mia_squadra_id: { Args: never; Returns: string }
      piazza_offerta_asta: {
        Args: {
          p_asta_id: string
          p_importo: number
          p_squadra_delega?: string
        }
        Returns: Json
      }
      portieri_disponibili: { Args: { p_squadra_id: string }; Returns: number }
      prenota_chiamata: { Args: { p_giocatore_id: number }; Returns: Json }
      rimuovi_massimo_asta: {
        Args: { p_asta_id: string; p_squadra_delega?: string }
        Returns: Json
      }
      risolvi_massimi: { Args: { p_asta_id: string }; Returns: undefined }
      rispondi_offerta_trasferimento: {
        Args: { p_accetta: boolean; p_offerta_id: string }
        Returns: Json
      }
      ritira_offerta_trasferimento: {
        Args: { p_offerta_id: string }
        Returns: Json
      }
      rosa_completa: { Args: { p_squadra_id: string }; Returns: boolean }
      ruolo_pieno: {
        Args: { p_giocatore_id: number; p_squadra_id: string }
        Returns: boolean
      }
      squadra_in_gara: {
        Args: { p_giocatore_id: number; p_squadra_id: string }
        Returns: boolean
      }
      submit_buste: { Args: { p_giocatori_ids: number[] }; Returns: Json }
      trattative_in_sospeso: { Args: never; Returns: number }
      verifica_scambio: {
        Args: {
          p_crediti: number
          p_giocatore_id: number
          p_offerti: number[]
          p_squadra_a: string
          p_squadra_da: string
        }
        Returns: string
      }
    }
    Enums: {
      esito_busta: "ATTESA" | "VINTO" | "CONTESO" | "PERSO"
      origine_offerta: "MANAGER" | "ADMIN_PER_CONTO" | "AUTOMATICO"
      ruolo_giocatore: "P" | "D" | "C" | "A"
      ruolo_utente: "ADMIN" | "MANAGER" | "SUPER_ADMIN"
      stato_asta:
        | "PROGRAMMATA"
        | "IN_CORSO"
        | "CHIUSA"
        | "ANNULLATA"
        | "CHIAMATA"
      stato_giocatore: "LIBERO" | "TESSERATO" | "IN_ASTA"
      stato_offerta_trasf:
        | "ATTESA"
        | "ACCETTATA"
        | "RIFIUTATA"
        | "RITIRATA"
        | "RESPINTA"
        | "DECADUTA"
        | "ESEGUITA"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      esito_busta: ["ATTESA", "VINTO", "CONTESO", "PERSO"],
      origine_offerta: ["MANAGER", "ADMIN_PER_CONTO", "AUTOMATICO"],
      ruolo_giocatore: ["P", "D", "C", "A"],
      ruolo_utente: ["ADMIN", "MANAGER", "SUPER_ADMIN"],
      stato_asta: [
        "PROGRAMMATA",
        "IN_CORSO",
        "CHIUSA",
        "ANNULLATA",
        "CHIAMATA",
      ],
      stato_giocatore: ["LIBERO", "TESSERATO", "IN_ASTA"],
      stato_offerta_trasf: [
        "ATTESA",
        "ACCETTATA",
        "RIFIUTATA",
        "RITIRATA",
        "RESPINTA",
        "DECADUTA",
        "ESEGUITA",
      ],
    },
  },
} as const
