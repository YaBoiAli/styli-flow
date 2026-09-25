export type ApprovedBrand = {
  name: string;
  domain: string;
  hint: string;
  /** False when the brand's site only serves a tiny icon; show a monogram instead. */
  sharpLogo?: boolean;
};

const BRAND_LIST: ApprovedBrand[] = [
  { name: 'Zara', domain: 'zara.com', hint: 'Runway-fast trends' },
  { name: 'Hollister', domain: 'hollisterco.com', hint: 'SoCal casual' },
  { name: 'Old Navy', domain: 'oldnavy.com', hint: 'Everyday basics' },
  { name: 'Gap', domain: 'gap.com', hint: 'American classics', sharpLogo: false },
  { name: 'Gap Factory', domain: 'gapfactory.com', hint: 'Gap for less' },
  { name: 'American Eagle', domain: 'ae.com', hint: 'Denim and tees' },
  { name: "Levi's", domain: 'levi.com', hint: 'Iconic denim' },
  { name: 'J.Crew Factory', domain: 'factory.jcrew.com', hint: 'Preppy staples' },
  {
    name: 'Banana Republic Factory',
    domain: 'bananarepublicfactory.com',
    hint: 'Polished workwear',
  },
  { name: 'Abercrombie', domain: 'abercrombie.com', hint: 'Elevated casual' },
  { name: 'H&M', domain: 'hm.com', hint: 'Trend-led basics' },
  { name: 'Uniqlo', domain: 'uniqlo.com', hint: 'Minimal essentials' },
  { name: 'Nike', domain: 'nike.com', hint: 'Sport and sneakers' },
  { name: 'Adidas', domain: 'adidas.com', hint: 'Three-stripe classics' },
  { name: 'Puma', domain: 'puma.com', hint: 'Sport style' },
  { name: 'Champion', domain: 'champion.com', hint: 'Heritage athletic' },
  { name: 'Calvin Klein', domain: 'calvinklein.us', hint: 'Clean minimalism' },
  { name: 'Tommy Hilfiger', domain: 'tommy.com', hint: 'Preppy Americana' },
  { name: 'Ralph Lauren', domain: 'ralphlauren.com', hint: 'Timeless polish' },
  { name: 'PacSun', domain: 'pacsun.com', hint: 'Streetwear and surf' },
  { name: 'Forever 21', domain: 'forever21.com', hint: 'Playful trends' },
  { name: 'Urban Outfitters', domain: 'urbanoutfitters.com', hint: 'Indie and vintage' },
  { name: 'ASOS', domain: 'asos.com', hint: 'Endless variety' },
  { name: 'Mango', domain: 'mango.com', hint: 'Mediterranean chic' },
  { name: 'Express', domain: 'express.com', hint: 'Going-out and work' },
  { name: 'Reebok', domain: 'reebok.com', hint: 'Retro athletic' },
  { name: 'New Balance', domain: 'newbalance.com', hint: 'Dad-shoe icons' },
  { name: 'Carhartt', domain: 'carhartt.com', hint: 'Rugged workwear' },
  { name: 'Vans', domain: 'vans.com', hint: 'Skate classics' },
  { name: 'Converse', domain: 'converse.com', hint: 'Canvas icons', sharpLogo: false },
  { name: 'Marc Nolan', domain: 'marcnolan.com', hint: 'Dress loafers and boots' },
];

/** Brands the stylist is allowed to shop from, deduplicated by name. */
export const APPROVED_BRAND_DETAILS: ApprovedBrand[] = BRAND_LIST.filter(
  (brand, index) =>
    BRAND_LIST.findIndex((other) => other.name === brand.name) === index,
);

export const APPROVED_BRANDS: string[] = APPROVED_BRAND_DETAILS.map(
  (brand) => brand.name,
);

export const NO_PREFERENCE_LABEL = 'No Preference';

export function brandLogoUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}
