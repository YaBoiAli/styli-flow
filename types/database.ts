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

/** Database row for public.products */
export type Product = {
  id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  price: number;
  color: string;
  image_url: string;
  purchase_url: string;
  style_tags: string[];
  occasion_tags: string[];
  created_at: string;
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

export type Database = {
  public: {
    Tables: {
      products: {
        Row: Product;
        Insert: Omit<Product, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Product>;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
