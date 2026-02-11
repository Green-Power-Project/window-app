/** Shared gallery category list – single source for public gallery and login page */
export const GALLERY_HEADER_TITLE = 'Grün Power – Galerie';

/** Category for offer-only items; hidden from normal gallery, shown only on /offer page. */
export const OFFERS_CATEGORY_KEY = 'Offers';

export const GALLERY_CATEGORIES = [
  'Pflaster & Einfahrten',
  'Terrassen & Plattenbeläge',
  'Naturstein & Feinsteinzeug',
  'Mauern, L-Steine & Hangbefestigung',
  'Treppen & Podeste',
  'Gartenwege & Eingänge',
  'Entwässerung & Drainage',
  'Erdarbeiten & Unterbau',
  'Rasen, Rollrasen & Grünflächen',
  'Bepflanzung & Gartengestaltung',
  'Zäune, Sichtschutz & Einfriedungen',
  'Außenanlagen Komplett',
  'Vorher / Nachher',
  'Highlights & Referenzprojekte',
  OFFERS_CATEGORY_KEY,
] as const;

export type GalleryCategory = (typeof GALLERY_CATEGORIES)[number];
