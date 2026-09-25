export type FashionCriticAssessment = 'strong' | 'acceptable' | 'weak';
export type FashionCriticSeverity = 'minor' | 'moderate' | 'major';

export type FashionCriticProduct = {
  product_id: string;
  name: string;
  brand: string;
  category: string;
  subcategory: string | null;
  color: string;
  colors: string[];
  material: string | null;
  fit: string | null;
  silhouette: string | null;
  style_tags: string[];
  aesthetic_tags: string[];
  occasion_tags: string[];
  image_url: string | null;
  image_available: boolean;
};

export type FashionCriticInput = {
  style: string;
  occasion: string;
  skinTone?: string | null;
  measurements?: Record<string, number | string> | null;
  season?: string;
  products: FashionCriticProduct[];
};

export type FashionCriticIssue = {
  type: string;
  severity: FashionCriticSeverity;
  product_id?: string;
};

export type FashionCriticResult = {
  overall_assessment: FashionCriticAssessment;
  style_match: number;
  color_harmony: number;
  proportion: number;
  occasion_match: number;
  cohesion: number;
  strengths: string[];
  issues: FashionCriticIssue[];
  recommendations: string[];
};

export type FashionCriticAttachment = {
  fashion_critic_available: boolean;
  fashion_critic?: FashionCriticResult;
};

export type FashionRevisionCatalogProduct = {
  product_id: string;
  name: string;
  brand: string;
  category: string;
  subcategory: string | null;
  color: string;
  colors: string[];
  material: string | null;
  fit: string | null;
  silhouette: string | null;
  style_tags: string[];
  aesthetic_tags: string[];
  occasion_tags: string[];
};

export type FashionRevisionInput = {
  style: string;
  occasion: string;
  skinTone?: string | null;
  measurements?: Record<string, number | string> | null;
  season?: string;
  currentOutfit: FashionCriticProduct[];
  critic: FashionCriticResult;
  catalog: FashionRevisionCatalogProduct[];
};

export type FashionRevisionResult = {
  items: Array<{ product_id: string; reason?: string }>;
  outfit_name?: string;
  styling_tip?: string;
};

/**
 * Provider-agnostic fashion AI. Generation stays in generate-outfit for now.
 * critiqueOutfit is Phase 2B. reviseOutfit is Phase 3. generateOutfits is reserved.
 */
export interface FashionAIProvider {
  readonly name: string;
  generateOutfits(input: unknown): Promise<unknown>;
  critiqueOutfit(input: FashionCriticInput): Promise<FashionCriticResult | null>;
  reviseOutfit(input: FashionRevisionInput): Promise<FashionRevisionResult | null>;
}
