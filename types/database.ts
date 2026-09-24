export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ProductCategory =
  | 'top'
  | 'bottom'
  | 'shoes'
  | 'outerwear'
  | 'accessory';

export type CatalogSourceType =
  | 'official_api'
  | 'affiliate_feed'
  | 'shopify'
  | 'structured_data'
  | 'direct_website'
  | 'external_search';

/** Database row for public.products (`name` = product name, `purchase_url` = product URL) */
export type Product = {
  id: string;
  name: string;
  brand: string;
  brand_id: string | null;
  description: string | null;
  category: ProductCategory;
  subcategory: string | null;
  price: number;
  currency: string;
  color: string;
  colors: string[];
  sizes: string[];
  material: string | null;
  gender: 'men' | 'women' | 'unisex' | null;
  availability: 'in_stock' | 'out_of_stock' | 'unknown' | 'discontinued';
  image_url: string;
  purchase_url: string;
  style_tags: string[];
  occasion_tags: string[];
  /** 'demo' rows are development data and never recommended in production. */
  source: 'demo' | CatalogSourceType;
  source_product_id: string | null;
  last_checked: string | null;
  created_at: string;
  updated_at: string;
};

type ProductDefaultedColumns =
  | 'id'
  | 'created_at'
  | 'updated_at'
  | 'brand_id'
  | 'description'
  | 'subcategory'
  | 'currency'
  | 'colors'
  | 'sizes'
  | 'material'
  | 'gender'
  | 'availability'
  | 'source'
  | 'source_product_id'
  | 'last_checked';

/** Database row for public.brands; `supported` only after real products were imported. */
export type BrandRow = {
  id: string;
  name: string;
  domain: string;
  is_approved: boolean;
  status: 'pending' | 'checking' | 'supported' | 'unsupported' | 'error';
  source_type: CatalogSourceType | null;
  source_config: Json;
  unsupported_reason: string | null;
  product_count: number;
  last_synced_at: string | null;
  last_sync_status: 'succeeded' | 'failed' | null;
  last_sync_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Database row for public.profiles */
export type Profile = {
  id: string;
  email: string | null;
  preferred_styles: string[];
  preferred_occasions: string[];
  onboarding_completed: boolean;
  created_at: string;
};

/** Database row for public.outfits */
export type Outfit = {
  id: string;
  user_id: string;
  outfit_name: string;
  style: string;
  occasion: string;
  budget: number;
  total_price: number;
  styling_tip: string;
  created_at: string;
};

/** Database row for public.outfit_items */
export type OutfitItem = {
  id: string;
  outfit_id: string;
  product_id: string;
  reason: string;
};

/** Database row for public.brand_requests (user-suggested, unreviewed brands) */
export type BrandRequestRow = {
  id: string;
  user_id: string | null;
  brand_name: string;
  website_url: string;
  status: 'requested' | 'approved' | 'rejected';
  brand_id: string | null;
  created_at: string;
};

/** Database row for public.ingestion_runs (service-role only). */
export type IngestionRun = {
  id: string;
  brand_id: string;
  trigger: 'resolve' | 'sync' | 'manual';
  source_type: CatalogSourceType | null;
  status: 'running' | 'succeeded' | 'failed';
  products_found: number;
  products_upserted: number;
  products_marked_unavailable: number;
  attempts: Json;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

export type Database = {
  public: {
    Tables: {
      products: {
        Row: Product;
        Insert: Omit<Product, ProductDefaultedColumns> &
          Partial<Pick<Product, ProductDefaultedColumns>>;
        Update: Partial<Product>;
        Relationships: [];
      };
      brands: {
        Row: BrandRow;
        Insert: Pick<BrandRow, 'name' | 'domain'> & Partial<BrandRow>;
        Update: Partial<BrandRow>;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at'> & {
          created_at?: string;
        };
        Update: Partial<Profile>;
        Relationships: [];
      };
      outfits: {
        Row: Outfit;
        Insert: Omit<Outfit, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Outfit>;
        Relationships: [];
      };
      outfit_items: {
        Row: OutfitItem;
        Insert: Omit<OutfitItem, 'id'> & { id?: string };
        Update: Partial<OutfitItem>;
        Relationships: [];
      };
      brand_requests: {
        Row: BrandRequestRow;
        Insert: Omit<BrandRequestRow, 'id' | 'status' | 'created_at' | 'brand_id'> & {
          id?: string;
        };
        Update: Partial<BrandRequestRow>;
        Relationships: [];
      };
      ingestion_runs: {
        Row: IngestionRun;
        Insert: Pick<IngestionRun, 'brand_id'> & Partial<IngestionRun>;
        Update: Partial<IngestionRun>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
