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

export type UserPreferences = {
  selectedStyle: Style | null;
  selectedOccasion: Occasion | null;
  selectedBudget: number | null;
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
