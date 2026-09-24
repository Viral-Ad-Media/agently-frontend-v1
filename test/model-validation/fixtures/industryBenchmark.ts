/**
 * Labelled benchmark set for the industry matcher (MRM-001).
 *
 * Each case is something a real small-business owner might type into the
 * onboarding industry picker, paired with every label a reasonable reviewer
 * would accept as the right answer. The set is deliberately NOT generated from
 * the alias lists in lib/industries.ts: a benchmark built from the model's own
 * vocabulary can only ever tell you the model agrees with itself. Aliases are
 * one bucket; the rest are paraphrases, typos, plurals, sentence-style input
 * and out-of-domain noise the aliases were never written for.
 *
 * Changing a case to make the benchmark pass is a model change, not a test
 * fix — record it in docs/model-risk/VALIDATION_REPORT.md.
 */

export type BenchmarkBucket =
  | "alias" // a word that appears in an alias list
  | "paraphrase" // natural wording that is NOT an alias
  | "typo" // misspelling of a common term
  | "sentence" // the whole description, as people actually type it
  | "ambiguous" // more than one label is genuinely defensible
  | "ood"; // out-of-domain noise — the correct answer is "nothing confident"

export interface BenchmarkCase {
  query: string;
  bucket: BenchmarkBucket;
  /** Labels a reviewer would accept. Empty for `ood`. */
  accept: string[];
}

export const INDUSTRY_BENCHMARK: BenchmarkCase[] = [
  // ── alias ──────────────────────────────────────────────────────────────
  { query: "plumber", bucket: "alias", accept: ["Plumbing"] },
  { query: "dentist", bucket: "alias", accept: ["Dental Practice"] },
  { query: "barber", bucket: "alias", accept: ["Barbershop & Hair Salon"] },
  { query: "realtor", bucket: "alias", accept: ["Real Estate Agency"] },
  { query: "hvac", bucket: "alias", accept: ["HVAC & Air Conditioning"] },
  { query: "electrician", bucket: "alias", accept: ["Electrical Services"] },
  { query: "roofer", bucket: "alias", accept: ["Roofing"] },
  { query: "attorney", bucket: "alias", accept: ["Legal & Law Firm"] },
  { query: "chiropractor", bucket: "alias", accept: ["Chiropractic"] },
  { query: "mechanic", bucket: "alias", accept: ["Auto Repair & Mechanic"] },
  { query: "florist", bucket: "alias", accept: ["Florist & Garden Centre"] },
  { query: "pharmacy", bucket: "alias", accept: ["Pharmacy & Drugstore"] },
  { query: "gym", bucket: "alias", accept: ["Fitness, Gym & Personal Training"] },
  { query: "tattoo", bucket: "alias", accept: ["Tattoo & Piercing Studio"] },
  { query: "saas", bucket: "alias", accept: ["Software & SaaS"] },
  { query: "clothing", bucket: "alias", accept: ["Apparel & Fashion Retail"] },
  { query: "hotel", bucket: "alias", accept: ["Hotel & Accommodation"] },
  { query: "catering", bucket: "alias", accept: ["Catering & Food Trucks"] },
  { query: "mortgage", bucket: "alias", accept: ["Mortgage & Lending"] },
  { query: "insurance", bucket: "alias", accept: ["Insurance"] },
  { query: "accountant", bucket: "alias", accept: ["Accounting & Bookkeeping"] },
  { query: "vet", bucket: "alias", accept: ["Veterinary Services"] },
  { query: "daycare", bucket: "alias", accept: ["School & Early Education"] },
  { query: "funeral", bucket: "alias", accept: ["Funeral & Memorial Services"] },
  { query: "pest", bucket: "alias", accept: ["Pest Control"] },
  { query: "locksmith", bucket: "paraphrase", accept: ["Security Services", "Windows, Doors & Glazing"] },
  { query: "towing", bucket: "paraphrase", accept: ["Auto Repair & Mechanic", "Trucking & Freight"] },
  { query: "car wash", bucket: "paraphrase", accept: ["Auto Repair & Mechanic"] },
  { query: "massage", bucket: "alias", accept: ["Spa, Massage & Wellness"] },
  { query: "nails", bucket: "alias", accept: ["Beauty Salon & Nails"] },
  { query: "courier", bucket: "alias", accept: ["Courier & Last-Mile Delivery"] },
  { query: "movers", bucket: "alias", accept: ["Moving & Removals"] },
  { query: "church", bucket: "alias", accept: ["Religious & Community Organisation"] },
  { query: "nonprofit", bucket: "alias", accept: ["Social Services & Charity"] },
  { query: "tutor", bucket: "alias", accept: ["Tutoring & Test Prep"] },
  { query: "photographer", bucket: "alias", accept: ["Photography"] },
  { query: "landscaper", bucket: "alias", accept: ["Landscaping & Lawn Care"] },
  { query: "pizzeria", bucket: "alias", accept: ["Restaurant & Dining"] },
  { query: "bakery", bucket: "alias", accept: ["Cafe, Bakery & Coffee Shop"] },
  { query: "recruiter", bucket: "alias", accept: ["Recruitment & Staffing"] },

  // ── paraphrase ─────────────────────────────────────────────────────────
  { query: "dental office", bucket: "paraphrase", accept: ["Dental Practice"] },
  { query: "law firm", bucket: "paraphrase", accept: ["Legal & Law Firm"] },
  { query: "coffee shop", bucket: "paraphrase", accept: ["Cafe, Bakery & Coffee Shop"] },
  { query: "hair salon", bucket: "paraphrase", accept: ["Barbershop & Hair Salon"] },
  { query: "nail salon", bucket: "paraphrase", accept: ["Beauty Salon & Nails"] },
  { query: "auto body shop", bucket: "paraphrase", accept: ["Auto Repair & Mechanic"] },
  { query: "medical spa", bucket: "paraphrase", accept: ["Spa, Massage & Wellness", "Beauty Salon & Nails", "Medical Practice & Clinic"] },
  { query: "urgent care", bucket: "paraphrase", accept: ["Medical Practice & Clinic"] },
  { query: "pediatrician", bucket: "paraphrase", accept: ["Medical Practice & Clinic"] },
  { query: "dermatologist", bucket: "paraphrase", accept: ["Medical Practice & Clinic"] },
  { query: "pet store", bucket: "paraphrase", accept: ["Pet Grooming & Services", "Specialty & General Retail"] },
  { query: "dog groomer", bucket: "paraphrase", accept: ["Pet Grooming & Services"] },
  { query: "personal injury lawyer", bucket: "paraphrase", accept: ["Legal & Law Firm"] },
  { query: "tax preparation", bucket: "paraphrase", accept: ["Accounting & Bookkeeping"] },
  { query: "home builder", bucket: "paraphrase", accept: ["General Contracting", "Construction & Building"] },
  { query: "handyman", bucket: "alias", accept: ["Facilities Management"] },
  { query: "garage door repair", bucket: "paraphrase", accept: ["Windows, Doors & Glazing", "Equipment Repair & Maintenance"] },
  { query: "carpet cleaning", bucket: "alias", accept: ["Cleaning Services"] },
  { query: "maid service", bucket: "paraphrase", accept: ["Cleaning Services"] },
  { query: "martial arts school", bucket: "paraphrase", accept: ["Sports Club & Coaching", "Music & Arts Instruction"] },
  { query: "yoga studio", bucket: "paraphrase", accept: ["Fitness, Gym & Personal Training"] },
  { query: "food truck", bucket: "alias", accept: ["Catering & Food Trucks"] },
  { query: "brewery", bucket: "ambiguous", accept: ["Food & Beverage Production", "Bar, Pub & Nightlife"] },
  { query: "boutique", bucket: "alias", accept: ["Apparel & Fashion Retail", "Specialty & General Retail"] },
  { query: "car dealership", bucket: "paraphrase", accept: ["Auto Dealership & Sales"] },
  { query: "tire shop", bucket: "paraphrase", accept: ["Auto Repair & Mechanic"] },
  { query: "senior living", bucket: "paraphrase", accept: ["Home Care & Senior Care"] },
  { query: "physical therapist", bucket: "paraphrase", accept: ["Physiotherapy & Rehab"] },
  { query: "eye doctor", bucket: "paraphrase", accept: ["Optometry & Eye Care"] },
  { query: "web design", bucket: "paraphrase", accept: ["Design & Creative Studio", "Marketing & Advertising Agency"] },
  { query: "digital marketing", bucket: "paraphrase", accept: ["Marketing & Advertising Agency"] },
  { query: "property manager", bucket: "paraphrase", accept: ["Property Management"] },
  { query: "wedding venue", bucket: "ambiguous", accept: ["Wedding & Bridal Services", "Entertainment & Live Events", "Hotel & Accommodation"] },
  { query: "estate agent", bucket: "alias", accept: ["Real Estate Agency"] },
  { query: "solar installer", bucket: "paraphrase", accept: ["Solar & Renewable Energy"] },
  { query: "junk removal", bucket: "alias", accept: ["Waste & Recycling"] },
  { query: "window cleaning", bucket: "ambiguous", accept: ["Cleaning Services", "Windows, Doors & Glazing"] },
  { query: "spa", bucket: "alias", accept: ["Spa, Massage & Wellness"] },
  { query: "clinic", bucket: "alias", accept: ["Medical Practice & Clinic"] },
  { query: "trucking company", bucket: "paraphrase", accept: ["Trucking & Freight"] },
  { query: "it company", bucket: "paraphrase", accept: ["IT Services & Support"] },
  { query: "restaurant", bucket: "alias", accept: ["Restaurant & Dining"] },
  { query: "bar", bucket: "alias", accept: ["Bar, Pub & Nightlife"] },

  // ── typo ───────────────────────────────────────────────────────────────
  { query: "plumbr", bucket: "typo", accept: ["Plumbing"] },
  { query: "dentst", bucket: "typo", accept: ["Dental Practice"] },
  { query: "barbar", bucket: "typo", accept: ["Barbershop & Hair Salon"] },
  { query: "cloths", bucket: "typo", accept: ["Apparel & Fashion Retail"] },
  { query: "resturant", bucket: "typo", accept: ["Restaurant & Dining"] },
  { query: "chiropracter", bucket: "typo", accept: ["Chiropractic"] },
  { query: "electrition", bucket: "typo", accept: ["Electrical Services"] },
  { query: "acountant", bucket: "typo", accept: ["Accounting & Bookkeeping"] },
  { query: "lanscaping", bucket: "typo", accept: ["Landscaping & Lawn Care"] },
  { query: "photograper", bucket: "typo", accept: ["Photography"] },
  { query: "insurence", bucket: "typo", accept: ["Insurance"] },
  { query: "mortage", bucket: "typo", accept: ["Mortgage & Lending"] },
  { query: "pharmecy", bucket: "typo", accept: ["Pharmacy & Drugstore"] },
  { query: "roffing", bucket: "typo", accept: ["Roofing"] },
  { query: "jewelery", bucket: "typo", accept: ["Jewellery & Accessories"] },
  { query: "veterinarian", bucket: "typo", accept: ["Veterinary Services"] },
  { query: "mechanik", bucket: "typo", accept: ["Auto Repair & Mechanic"] },
  { query: "hvak", bucket: "typo", accept: ["HVAC & Air Conditioning"] },
  { query: "reeltor", bucket: "typo", accept: ["Real Estate Agency"] },
  { query: "tatoo", bucket: "typo", accept: ["Tattoo & Piercing Studio"] },

  // ── sentence ───────────────────────────────────────────────────────────
  { query: "we are a plumbing company", bucket: "sentence", accept: ["Plumbing"] },
  { query: "family owned dental clinic", bucket: "sentence", accept: ["Dental Practice", "Medical Practice & Clinic"] },
  { query: "I run a barbershop", bucket: "sentence", accept: ["Barbershop & Hair Salon"] },
  { query: "online clothing store", bucket: "sentence", accept: ["Apparel & Fashion Retail", "E-commerce & Online Retail"] },
  { query: "24/7 emergency plumber", bucket: "sentence", accept: ["Plumbing"] },
  { query: "residential roofing contractor", bucket: "sentence", accept: ["Roofing", "General Contracting"] },
  { query: "small italian restaurant", bucket: "sentence", accept: ["Restaurant & Dining"] },
  { query: "real estate brokerage", bucket: "sentence", accept: ["Real Estate Agency"] },
  { query: "independent insurance agency", bucket: "sentence", accept: ["Insurance"] },
  { query: "luxury hair and nail salon", bucket: "sentence", accept: ["Barbershop & Hair Salon", "Beauty Salon & Nails"] },
  { query: "commercial cleaning company", bucket: "sentence", accept: ["Cleaning Services"] },
  { query: "used car dealer", bucket: "sentence", accept: ["Auto Dealership & Sales"] },
  { query: "heating and air conditioning repair", bucket: "sentence", accept: ["HVAC & Air Conditioning"] },
  { query: "dog walking and pet sitting", bucket: "sentence", accept: ["Pet Grooming & Services"] },
  { query: "boutique fitness studio", bucket: "sentence", accept: ["Fitness, Gym & Personal Training"] },

  // ── ood: the right answer is "nothing confident" ───────────────────────
  { query: "asdfgh", bucket: "ood", accept: [] },
  { query: "qwerty", bucket: "ood", accept: [] },
  { query: "zzzz", bucket: "ood", accept: [] },
  { query: "xj9", bucket: "ood", accept: [] },
  { query: "lorem ipsum", bucket: "ood", accept: [] },
  { query: "123456", bucket: "ood", accept: [] },
  { query: "hello world", bucket: "ood", accept: [] },
  { query: "test test", bucket: "ood", accept: [] },
  { query: "!!!!", bucket: "ood", accept: [] },
  { query: "kjhgfd", bucket: "ood", accept: [] },
];
