export type Style =
  | 'Streetwear'
  | 'Y2K'
  | 'Old Money'
  | 'Minimalist'
  | 'Preppy'
  | 'Athleisure'
  | 'Casual'
  | 'Formal'
  | 'Clean Girl'
  | 'Grunge'
  | 'Runway'
  | 'Quiet Luxury'
  | 'Dark Academia'
  | 'Elevated Streetwear';

export type Occasion =
  | 'Everyday'
  | 'Date'
  | 'Party'
  | 'School'
  | 'Work'
  | 'Vacation'
  | 'Event'
  | 'Night Out';

/** UI/display product shape used by existing screens/components. */
export type Product = {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  category: 'top' | 'bottom' | 'footwear' | 'outerwear' | 'accessory';
  reason?: string;
  purchaseUrl?: string;
};

/** UI/display outfit shape used by existing screens/components. */
export type Outfit = {
  id: string;
  name: string;
  style: Style;
  occasion: Occasion;
  products: Product[];
  total: number;
  explanation: string;
  itemReasons?: Array<{ productId: string; reason: string }>;
};

export type MeasurementUnit = 'imperial' | 'metric';

/** Stored in centimeters and kilograms so later fit logic stays unit-agnostic. */
export type BodyMeasurements = {
  unit: MeasurementUnit;
  heightCm: number;
  weightKg: number;
  shouldersCm: number | null;
  chestCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  thighCm: number | null;
  inseamCm: number | null;
};

export type InspirationLinkKind = 'link' | 'pinterest' | 'instagram';

export type InspirationImage = {
  uri: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  width: number;
  height: number;
};

export type InspirationSource =
  | { id: string; kind: 'image'; image: InspirationImage }
  | { id: string; kind: InspirationLinkKind; url: string };

/** Catalog status of a brand; only `supported` brands have real, shoppable products. */
export type BrandCatalogStatus = 'pending' | 'checking' | 'supported' | 'unsupported' | 'error';

/** A brand the user added. Only shopped from once its catalog was imported (`supported`). */
export type BrandRequest = {
  id: string;
  name: string;
  website: string;
  status: 'requested' | BrandCatalogStatus;
  productCount?: number;
  statusReason?: string | null;
  createdAt: string;
};

/** Which department to shop; `any` allows both. */
export type GenderPreference = 'men' | 'women' | 'any';

export type UserPreferences = {
  selectedStyle: Style | null;
  selectedOccasion: Occasion | null;
  selectedBudget: number | null;
  /** When false, `selectedBudget` excludes shoes and `shoeBudget` caps them. */
  shoesInBudget: boolean;
  shoeBudget: number | null;
  bodyMeasurements: BodyMeasurements | null;
  gender: GenderPreference | null;
  /** Whole years; set on the You step before Fit. */
  age: number | null;
  inspirationSources: InspirationSource[];
  /** Empty means "No Preference": every approved brand is eligible. */
  selectedBrands: string[];
  brandRequests: BrandRequest[];
};

export type {
  Product as DbProduct,
  Profile,
  Outfit as DbOutfit,
  OutfitItem,
  ProductCategory,
} from '@/types/database';

export const STYLES: Style[] = [
  'Streetwear',
  'Y2K',
  'Old Money',
  'Minimalist',
  'Preppy',
  'Athleisure',
  'Casual',
  'Formal',
  'Clean Girl',
  'Grunge',
  'Runway',
  'Quiet Luxury',
  'Dark Academia',
  'Elevated Streetwear',
];

export const OCCASIONS: Occasion[] = [
  'Everyday',
  'Date',
  'Party',
  'School',
  'Work',
  'Vacation',
  'Event',
  'Night Out',
];

export const BUDGET_PRESETS: number[] = [50, 75, 100, 150, 200];
