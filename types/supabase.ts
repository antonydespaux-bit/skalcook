/**
 * Types manuels alignés sur le schéma Supabase (compléter au fil des migrations).
 * Génération automatique possible plus tard : `supabase gen types typescript`.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

/** Ligne telle que retournée par `select *` sur `ventes_journalieres`. */
export type VentesJournalieresRow = {
  id: string
  client_id: string
  jour: string
  fiche_id: string
  quantite_vendue: number
  prix_vente_net: number
  created_at: string
}

/**
 * Insertion via le client Supabase.
 * `client_id` est renseigné côté base par le trigger si omis (recommandé : laisser la base le déduire de `fiche_id`).
 */
export type VentesJournalieresInsert = {
  id?: string
  client_id?: string
  jour: string
  fiche_id: string
  quantite_vendue: number
  prix_vente_net: number
  created_at?: string
}

export type VentesJournalieresUpdate = Partial<
  Omit<VentesJournalieresRow, 'id' | 'created_at'>
> & {
  id?: string
  created_at?: string
}

/** Sous-ensemble utile pour typage des réponses `.select(...)` ciblées. */
export type VentesJournalieresPreview = Pick<
  VentesJournalieresRow,
  'id' | 'jour' | 'fiche_id' | 'quantite_vendue' | 'prix_vente_net'
>

/** Mémorisation Lightspeed → fiche (`designation_norm` est généré côté base). */
export type MappingVentesRow = {
  id: string
  client_id: string
  designation_lightspeed: string
  fiche_id: string
  source_table: 'fiches' | 'fiches_bar'
  designation_norm: string
  created_at: string
  updated_at: string
}

export type MappingVentesInsert = {
  id?: string
  client_id: string
  designation_lightspeed: string
  fiche_id: string
  source_table: 'fiches' | 'fiches_bar'
  /** Rempli par trigger si omis */
  designation_norm?: string
  created_at?: string
  updated_at?: string
}

/* ─── CA journalier ──────────────────────────────────────────────────────── */

export type Service = 'lunch' | 'dinner'

/** 1 = lundi … 7 = dimanche (ISO 8601, aligné sur EXTRACT(isodow)). */
export type JourSemaine = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type LieuxServiceRow = {
  id: string
  client_id: string
  nom: string
  ordre: number
  actif: boolean
  created_at: string
  updated_at: string
}

export type LieuxServiceInsert = {
  id?: string
  client_id: string
  nom: string
  ordre?: number
  actif?: boolean
  created_at?: string
  updated_at?: string
}

export type CaJournalierRow = {
  id: string
  client_id: string
  jour: string
  lieu_service_id: string
  service: Service
  couverts: number
  ca_food: number
  ca_bev_20: number
  ca_bev_10: number
  ca_autre: number
  created_at: string
  updated_at: string
}

export type CaJournalierInsert = {
  id?: string
  client_id: string
  jour: string
  lieu_service_id: string
  service: Service
  couverts?: number
  ca_food?: number
  ca_bev_20?: number
  ca_bev_10?: number
  ca_autre?: number
  created_at?: string
  updated_at?: string
}

export type CaBudgetsRow = {
  id: string
  client_id: string
  jour_semaine: JourSemaine
  lieu_service_id: string
  service: Service
  couverts_cible: number
  ca_food_cible: number
  ca_bev_20_cible: number
  ca_bev_10_cible: number
  ca_autre_cible: number
  created_at: string
  updated_at: string
}

export type CaBudgetsInsert = {
  id?: string
  client_id: string
  jour_semaine: JourSemaine
  lieu_service_id: string
  service: Service
  couverts_cible?: number
  ca_food_cible?: number
  ca_bev_20_cible?: number
  ca_bev_10_cible?: number
  ca_autre_cible?: number
  created_at?: string
  updated_at?: string
}

export type CaOffertsRow = {
  id: string
  client_id: string
  jour: string
  lieu_service_id: string | null
  service: Service | null
  table_motif: string | null
  garcon: string | null
  libelle: string
  quantite: number
  montant: number
  created_at: string
  updated_at: string
}

export type CaOffertsInsert = {
  id?: string
  client_id: string
  jour: string
  lieu_service_id?: string | null
  service?: Service | null
  table_motif?: string | null
  garcon?: string | null
  libelle: string
  quantite?: number
  montant?: number
  created_at?: string
  updated_at?: string
}

export type Database = {
  public: {
    Tables: {
      mapping_ventes: {
        Row: MappingVentesRow
        Insert: MappingVentesInsert
        Update: Partial<MappingVentesInsert>
        Relationships: [
          {
            foreignKeyName: 'mapping_ventes_client_id_fkey'
            columns: ['client_id']
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
        ]
      }
      ventes_journalieres: {
        Row: VentesJournalieresRow
        Insert: VentesJournalieresInsert
        Update: VentesJournalieresUpdate
        Relationships: [
          {
            foreignKeyName: 'ventes_journalieres_client_id_fkey'
            columns: ['client_id']
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ventes_journalieres_fiche_id_fkey'
            columns: ['fiche_id']
            referencedRelation: 'fiches'
            referencedColumns: ['id']
          },
        ]
      }
      lieux_service: {
        Row: LieuxServiceRow
        Insert: LieuxServiceInsert
        Update: Partial<LieuxServiceInsert>
        Relationships: [
          {
            foreignKeyName: 'lieux_service_client_id_fkey'
            columns: ['client_id']
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
        ]
      }
      ca_journalier: {
        Row: CaJournalierRow
        Insert: CaJournalierInsert
        Update: Partial<CaJournalierInsert>
        Relationships: [
          {
            foreignKeyName: 'ca_journalier_client_id_fkey'
            columns: ['client_id']
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ca_journalier_lieu_service_id_fkey'
            columns: ['lieu_service_id']
            referencedRelation: 'lieux_service'
            referencedColumns: ['id']
          },
        ]
      }
      ca_budgets: {
        Row: CaBudgetsRow
        Insert: CaBudgetsInsert
        Update: Partial<CaBudgetsInsert>
        Relationships: [
          {
            foreignKeyName: 'ca_budgets_client_id_fkey'
            columns: ['client_id']
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ca_budgets_lieu_service_id_fkey'
            columns: ['lieu_service_id']
            referencedRelation: 'lieux_service'
            referencedColumns: ['id']
          },
        ]
      }
      ca_offerts: {
        Row: CaOffertsRow
        Insert: CaOffertsInsert
        Update: Partial<CaOffertsInsert>
        Relationships: [
          {
            foreignKeyName: 'ca_offerts_client_id_fkey'
            columns: ['client_id']
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ca_offerts_lieu_service_id_fkey'
            columns: ['lieu_service_id']
            referencedRelation: 'lieux_service'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type PublicTableName = keyof Database['public']['Tables']
