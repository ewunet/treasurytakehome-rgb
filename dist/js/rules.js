// What the checker knows about TTB labels. Kept in one place so it is easy to review and extend.
// Sources: TTB "Mandatory Label Information" pages for distilled spirits (27 CFR Part 5),
// malt beverages (27 CFR Part 7) and wine (27 CFR Part 4); health warning is 27 CFR Part 16.

/** The statement must appear word for word. */
export const WARNING_TEXT =
  'GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages ' +
  'during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs ' +
  'your ability to drive a car or operate machinery, and may cause health problems.';

export const BEVERAGES = {
  spirits: {
    name: 'Distilled spirits',
    cfr: '27 CFR Part 5',
    abv: 'required', // alcohol content is always required; proof is optional
    units: 'metric', // net contents in metric (standards of fill: 50, 100, 200, 375, 750 mL, 1 L, 1.75 L)
  },
  wine: {
    name: 'Wine',
    cfr: '27 CFR Part 4',
    abv: 'required', // exception: 7-14% wine may say "table wine" / "light wine" instead of a number
    units: 'metric',
  },
  beer: {
    name: 'Beer / malt beverage',
    cfr: '27 CFR Part 7',
    abv: 'optional', // only required if alcohol comes from added flavors/non-beverage ingredients (or state law)
    units: 'us', // U.S. measures (fl. oz., pints...) are required; metric may be added, never used alone
  },
};

// Columns we accept in the batch CSV, with the alternative names people tend to use.
export const CSV_ALIASES = {
  filename: ['filename', 'file', 'image', 'image_file', 'label', 'label_file'],
  type: ['beverage_type', 'type', 'beverage', 'product_type'],
  brand: ['brand_name', 'brand'],
  classType: ['class_type', 'class', 'class/type', 'type_designation', 'designation'],
  abv: ['alcohol_content', 'abv', 'alcohol', 'alc_vol'],
  net: ['net_contents', 'net', 'volume', 'size'],
  producer: ['bottler', 'producer', 'name_address', 'bottler_name_address', 'producer_name_address', 'name_and_address'],
  country: ['country_of_origin', 'country', 'origin'],
};

export function guessBeverageType(value) {
  const v = String(value || '').toLowerCase();
  if (/wine|cider|sake|mead/.test(v)) return 'wine';
  if (/beer|malt|ale|lager|stout|ipa/.test(v)) return 'beer';
  return 'spirits';
}
