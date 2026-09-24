const BRAND_LIST = [
  'Zara',
  'Hollister',
  'Old Navy',
  'Gap',
  'Gap Factory',
  'American Eagle',
  "Levi's",
  'J.Crew Factory',
  'Banana Republic Factory',
  'Abercrombie',
  'H&M',
  'Uniqlo',
  'Nike',
  'Adidas',
  'Puma',
  'Champion',
  'Calvin Klein',
  'Tommy Hilfiger',
  'Ralph Lauren',
  'PacSun',
  'Forever 21',
  'Urban Outfitters',
  'ASOS',
  'Mango',
  'Express',
  'Reebok',
  'New Balance',
  'Dickies',
  'Carhartt',
  'Vans',
  'Converse',
];

/** Brands the stylist is allowed to shop from. */
export const APPROVED_BRANDS: string[] = [...new Set(BRAND_LIST)];

export const NO_PREFERENCE_LABEL = 'No Preference';
