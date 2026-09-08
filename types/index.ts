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
  | 'Grunge';

export type Occasion =
  | 'Everyday'
  | 'Date'
  | 'Party'
  | 'School'
  | 'Work'
  | 'Vacation'
  | 'Event'
  | 'Night Out';

export type Product = {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  category: 'top' | 'bottom' | 'footwear' | 'outerwear' | 'accessory';
};

export type Outfit = {
  id: string;
  name: string;
  style: Style;
  occasion: Occasion;
  products: Product[];
  total: number;
  explanation: string;
};

export type UserPreferences = {
  selectedStyle: Style | null;
  selectedOccasion: Occasion | null;
  selectedBudget: number | null;
};

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
