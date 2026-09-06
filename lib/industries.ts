/**
 * Industry taxonomy + fuzzy matcher.
 *
 * The old list was 60 hand-written entries with no retail, no apparel, no
 * agriculture, no wholesale and no trades beyond a handful — so "clothing"
 * genuinely had nothing to match, and the picker looked broken rather than
 * merely incomplete.
 *
 * This list is organised by NAICS sector (the US/Canada/Mexico standard) and
 * flattened to the granularity a small business actually self-identifies with:
 * a barber picks "Barbershop & Hair Salon", not "812111 Barber Shops". Each
 * entry carries the NAICS sector it belongs to, plus the words real people
 * type — which is what the matcher searches.
 */

export interface Industry {
  /** What the user sees and what we store. */
  label: string;
  /** NAICS 2-digit sector, kept so reporting can roll these up later. */
  sector: string;
  /** Words people actually type. Never shown; only searched. */
  aliases: string[];
}

export const OTHER_INDUSTRY = "Other";

export const INDUSTRIES: Industry[] = [
  // ── 11 Agriculture, Forestry, Fishing and Hunting ──────────────────────
  { label: "Farming & Crop Production", sector: "11", aliases: ["farm", "agriculture", "agricultural", "crops", "grower", "orchard", "produce"] },
  { label: "Livestock & Ranching", sector: "11", aliases: ["cattle", "ranch", "poultry", "dairy", "livestock", "animal husbandry"] },
  { label: "Fishing & Aquaculture", sector: "11", aliases: ["fishery", "fish farm", "seafood harvesting", "aquaculture"] },
  { label: "Forestry & Logging", sector: "11", aliases: ["timber", "logging", "lumber harvesting", "forestry"] },

  // ── 21 Mining, Oil and Gas ─────────────────────────────────────────────
  { label: "Mining & Quarrying", sector: "21", aliases: ["mine", "quarry", "aggregate", "extraction", "minerals"] },
  { label: "Oil & Gas", sector: "21", aliases: ["petroleum", "drilling", "oilfield", "gas extraction"] },

  // ── 22 Utilities ───────────────────────────────────────────────────────
  { label: "Utilities & Energy", sector: "22", aliases: ["electric utility", "power", "water utility", "gas utility", "energy"] },
  { label: "Solar & Renewable Energy", sector: "22", aliases: ["solar", "photovoltaic", "renewable", "wind", "green energy", "panels"] },
  { label: "Waste & Recycling", sector: "22", aliases: ["waste", "garbage", "rubbish", "recycling", "junk removal", "dumpster"] },

  // ── 23 Construction & trades ───────────────────────────────────────────
  { label: "General Contracting", sector: "23", aliases: ["contractor", "builder", "general contractor", "construction company"] },
  { label: "Construction & Building", sector: "23", aliases: ["construction", "building", "civil works", "site work"] },
  { label: "Plumbing", sector: "23", aliases: ["plumber", "pipes", "drain", "leak", "sewer", "water heater"] },
  { label: "HVAC & Air Conditioning", sector: "23", aliases: ["hvac", "heating", "air conditioning", "ac repair", "furnace", "ventilation", "aircon"] },
  { label: "Electrical Services", sector: "23", aliases: ["electrician", "electrical", "wiring", "rewiring", "sparky"] },
  { label: "Roofing", sector: "23", aliases: ["roofer", "roof", "shingles", "gutters", "roof repair"] },
  { label: "Painting & Decorating", sector: "23", aliases: ["painter", "painting", "decorator", "wallpaper"] },
  { label: "Flooring & Tiling", sector: "23", aliases: ["flooring", "tiles", "tiler", "carpet fitting", "hardwood floors", "laminate"] },
  { label: "Carpentry & Joinery", sector: "23", aliases: ["carpenter", "joiner", "woodwork", "cabinetry", "framing"] },
  { label: "Masonry & Concrete", sector: "23", aliases: ["mason", "bricklayer", "concrete", "paving", "stonework", "driveway"] },
  { label: "Landscaping & Lawn Care", sector: "23", aliases: ["landscaper", "lawn", "garden", "gardener", "turf", "yard", "tree service", "mowing"] },
  { label: "Pool Installation & Service", sector: "23", aliases: ["pool", "swimming pool", "spa install", "hot tub"] },
  { label: "Fencing & Decking", sector: "23", aliases: ["fence", "fencing", "deck", "decking", "railing"] },
  { label: "Windows, Doors & Glazing", sector: "23", aliases: ["window", "glazing", "glass", "double glazing", "doors"] },
  { label: "Insulation & Weatherproofing", sector: "23", aliases: ["insulation", "loft", "cavity wall", "weatherproofing", "damp proofing"] },

  // ── 31-33 Manufacturing ────────────────────────────────────────────────
  { label: "Manufacturing", sector: "31-33", aliases: ["factory", "production", "manufacturer", "fabrication", "assembly"] },
  { label: "Food & Beverage Production", sector: "31-33", aliases: ["food production", "bakery wholesale", "brewery", "distillery", "winery", "bottling", "food manufacturing"] },
  { label: "Apparel & Textile Manufacturing", sector: "31-33", aliases: ["clothing manufacturer", "garment", "textile", "apparel manufacturing", "sewing", "fabric", "knitwear"] },
  { label: "Furniture & Woodworking", sector: "31-33", aliases: ["furniture", "cabinet maker", "woodworking", "upholstery"] },
  { label: "Metal Fabrication & Welding", sector: "31-33", aliases: ["welding", "welder", "metalwork", "steel", "machining", "fabricator"] },
  { label: "Printing & Signage", sector: "31-33", aliases: ["printer", "printing", "signage", "banners", "large format", "screen printing", "embroidery"] },
  { label: "Electronics & Equipment Manufacturing", sector: "31-33", aliases: ["electronics", "circuit", "device manufacturing", "hardware manufacturing"] },
  { label: "Chemicals, Plastics & Materials", sector: "31-33", aliases: ["chemical", "plastics", "polymer", "coatings", "materials"] },

  // ── 42 Wholesale ───────────────────────────────────────────────────────
  { label: "Wholesale & Distribution", sector: "42", aliases: ["wholesale", "wholesaler", "distributor", "distribution", "bulk supply", "importer", "exporter"] },

  // ── 44-45 Retail ───────────────────────────────────────────────────────
  { label: "Apparel & Fashion Retail", sector: "44-45", aliases: ["clothing", "clothes", "apparel", "fashion", "boutique", "shoes", "footwear", "menswear", "womenswear", "streetwear", "thrift"] },
  { label: "Grocery & Convenience Store", sector: "44-45", aliases: ["grocery", "supermarket", "convenience", "corner shop", "mini mart", "food store", "deli"] },
  { label: "Furniture & Home Goods Retail", sector: "44-45", aliases: ["furniture store", "homeware", "home goods", "mattress", "decor retail"] },
  { label: "Electronics & Phone Retail", sector: "44-45", aliases: ["electronics store", "phone shop", "mobile store", "computer store", "gadgets"] },
  { label: "Jewellery & Accessories", sector: "44-45", aliases: ["jewelry", "jewellery", "watches", "accessories", "goldsmith"] },
  { label: "Hardware & Building Supplies", sector: "44-45", aliases: ["hardware store", "builders merchant", "diy store", "tools", "timber yard"] },
  { label: "Pharmacy & Drugstore", sector: "44-45", aliases: ["pharmacy", "chemist", "drugstore", "dispensary"] },
  { label: "Florist & Garden Centre", sector: "44-45", aliases: ["florist", "flowers", "nursery", "garden centre", "plants"] },
  { label: "Auto Dealership & Sales", sector: "44-45", aliases: ["car dealer", "dealership", "used cars", "auto sales", "vehicle sales"] },
  { label: "E-commerce & Online Retail", sector: "44-45", aliases: ["ecommerce", "e-commerce", "online store", "shopify", "dropshipping", "online shop", "webshop"] },
  { label: "Specialty & General Retail", sector: "44-45", aliases: ["retail", "shop", "store", "boutique retail", "gift shop"] },

  // ── 48-49 Transportation & Warehousing ─────────────────────────────────
  { label: "Trucking & Freight", sector: "48-49", aliases: ["trucking", "haulage", "freight", "lorry", "carrier", "cargo"] },
  { label: "Courier & Last-Mile Delivery", sector: "48-49", aliases: ["courier", "delivery", "dispatch", "parcel", "last mile"] },
  { label: "Taxi, Rideshare & Chauffeur", sector: "48-49", aliases: ["taxi", "cab", "rideshare", "uber", "chauffeur", "limo", "private hire"] },
  { label: "Moving & Removals", sector: "48-49", aliases: ["movers", "moving company", "removals", "relocation", "man and van"] },
  { label: "Warehousing & Storage", sector: "48-49", aliases: ["warehouse", "storage", "self storage", "fulfilment", "fulfillment", "3pl"] },
  { label: "Logistics & Supply Chain", sector: "48-49", aliases: ["logistics", "supply chain", "shipping", "forwarding", "customs"] },

  // ── 51 Information / media / software ──────────────────────────────────
  { label: "Software & SaaS", sector: "51", aliases: ["saas", "software", "app", "platform", "developer", "tech startup", "product company"] },
  { label: "IT Services & Support", sector: "51", aliases: ["it support", "managed services", "msp", "helpdesk", "network", "sysadmin", "computer repair"] },
  { label: "Telecommunications", sector: "51", aliases: ["telecom", "isp", "broadband", "voip", "network operator"] },
  { label: "Media, Publishing & Broadcasting", sector: "51", aliases: ["media", "publisher", "magazine", "newspaper", "radio", "tv", "podcast"] },
  { label: "Film, Video & Production", sector: "51", aliases: ["film", "video production", "videography", "studio", "post production", "animation"] },
  { label: "Data & Analytics", sector: "51", aliases: ["data", "analytics", "business intelligence", "data science"] },

  // ── 52 Finance & Insurance ─────────────────────────────────────────────
  { label: "Accounting & Bookkeeping", sector: "52", aliases: ["accountant", "accounting", "bookkeeper", "cpa", "tax", "payroll", "audit"] },
  { label: "Financial Advisory & Wealth", sector: "52", aliases: ["financial advisor", "wealth", "investment", "planner", "fund", "broker"] },
  { label: "Banking & Credit Union", sector: "52", aliases: ["bank", "credit union", "savings", "microfinance"] },
  { label: "Mortgage & Lending", sector: "52", aliases: ["mortgage", "loans", "lender", "lending", "finance broker", "credit"] },
  { label: "Insurance", sector: "52", aliases: ["insurance", "insurer", "underwriting", "claims", "broker insurance", "policy"] },
  { label: "Debt Collection & Recovery", sector: "52", aliases: ["collections", "debt recovery", "receivables", "arrears"] },

  // ── 53 Real Estate & Rental ────────────────────────────────────────────
  { label: "Real Estate Agency", sector: "53", aliases: ["real estate", "realtor", "estate agent", "property sales", "broker property", "letting agent"] },
  { label: "Property Management", sector: "53", aliases: ["property management", "landlord", "rentals", "tenancy", "hoa", "body corporate"] },
  { label: "Equipment & Vehicle Rental", sector: "53", aliases: ["rental", "hire", "equipment hire", "car rental", "plant hire", "tool hire"] },

  // ── 54 Professional, Scientific & Technical ────────────────────────────
  { label: "Legal & Law Firm", sector: "54", aliases: ["lawyer", "law", "attorney", "solicitor", "legal", "barrister", "paralegal", "conveyancing"] },
  { label: "Management Consulting", sector: "54", aliases: ["consultant", "consulting", "advisory", "strategy", "business coach"] },
  { label: "Marketing & Advertising Agency", sector: "54", aliases: ["marketing", "advertising", "agency", "seo", "ads", "branding", "social media", "pr", "digital agency"] },
  { label: "Design & Creative Studio", sector: "54", aliases: ["design", "graphic design", "creative", "ux", "ui", "illustration", "brand studio"] },
  { label: "Architecture", sector: "54", aliases: ["architect", "architectural", "drafting", "building design"] },
  { label: "Engineering Services", sector: "54", aliases: ["engineer", "engineering", "structural", "mechanical", "surveying", "civil engineering"] },
  { label: "Photography", sector: "54", aliases: ["photographer", "photo", "headshots", "wedding photography", "studio photography"] },
  { label: "Interior Design", sector: "54", aliases: ["interior design", "interiors", "home staging", "decorating design"] },
  { label: "Recruitment & Staffing", sector: "54", aliases: ["recruitment", "recruiter", "staffing", "headhunter", "talent", "hiring agency", "employment agency"] },
  { label: "Translation & Language Services", sector: "54", aliases: ["translation", "translator", "interpreting", "localisation", "localization"] },
  { label: "Veterinary Services", sector: "54", aliases: ["vet", "veterinary", "animal clinic", "pet hospital"] },
  { label: "Research & Laboratory", sector: "54", aliases: ["research", "laboratory", "lab", "testing", "r&d", "clinical research"] },

  // ── 56 Administrative & Support ────────────────────────────────────────
  { label: "Cleaning Services", sector: "56", aliases: ["cleaner", "cleaning", "janitorial", "housekeeping", "maid", "commercial cleaning", "carpet cleaning"] },
  { label: "Security Services", sector: "56", aliases: ["security", "guard", "cctv", "alarm", "surveillance", "patrol"] },
  { label: "Pest Control", sector: "56", aliases: ["pest", "exterminator", "rodent", "termite", "fumigation"] },
  { label: "Call Centre & BPO", sector: "56", aliases: ["call center", "call centre", "bpo", "outsourcing", "answering service", "contact centre"] },
  { label: "Events & Conference Services", sector: "56", aliases: ["events", "event planning", "conference", "exhibition", "av hire", "party planning"] },
  { label: "Facilities Management", sector: "56", aliases: ["facilities", "building maintenance", "handyman", "property maintenance", "caretaking"] },
  { label: "Virtual Assistant & Admin Support", sector: "56", aliases: ["virtual assistant", "admin support", "secretarial", "back office"] },

  // ── 61 Education ───────────────────────────────────────────────────────
  { label: "Tutoring & Test Prep", sector: "61", aliases: ["tutor", "tutoring", "test prep", "exam", "lessons", "coaching academic"] },
  { label: "School & Early Education", sector: "61", aliases: ["school", "nursery", "preschool", "kindergarten", "daycare", "creche", "childcare"] },
  { label: "Higher Education & Training", sector: "61", aliases: ["college", "university", "training provider", "vocational", "bootcamp", "courses"] },
  { label: "Driving School", sector: "61", aliases: ["driving school", "driving instructor", "driving lessons"] },
  { label: "Music & Arts Instruction", sector: "61", aliases: ["music lessons", "music school", "dance school", "art class", "piano", "guitar"] },

  // ── 62 Health Care & Social Assistance ─────────────────────────────────
  { label: "Medical Practice & Clinic", sector: "62", aliases: ["doctor", "gp", "clinic", "medical", "physician", "family practice", "healthcare"] },
  { label: "Dental Practice", sector: "62", aliases: ["dentist", "dental", "orthodontist", "hygienist", "braces", "implants"] },
  { label: "Optometry & Eye Care", sector: "62", aliases: ["optometrist", "optician", "eye care", "glasses", "vision", "ophthalmology"] },
  { label: "Physiotherapy & Rehab", sector: "62", aliases: ["physio", "physiotherapy", "physical therapy", "rehab", "sports therapy", "osteopath"] },
  { label: "Chiropractic", sector: "62", aliases: ["chiropractor", "chiropractic", "spine", "adjustment"] },
  { label: "Mental Health & Counselling", sector: "62", aliases: ["therapist", "counselling", "counseling", "psychology", "psychiatrist", "mental health", "wellbeing"] },
  { label: "Home Care & Senior Care", sector: "62", aliases: ["home care", "caregiver", "senior care", "elderly", "nursing home", "assisted living", "domiciliary"] },
  { label: "Nursing & Medical Staffing", sector: "62", aliases: ["nurse", "nursing", "medical staffing", "locum"] },
  { label: "Diagnostics & Imaging", sector: "62", aliases: ["imaging", "radiology", "scan", "x-ray", "ultrasound", "pathology"] },
  { label: "Alternative & Holistic Medicine", sector: "62", aliases: ["acupuncture", "holistic", "naturopath", "herbal", "ayurveda", "homeopathy"] },
  { label: "Social Services & Charity", sector: "62", aliases: ["charity", "non profit", "nonprofit", "ngo", "social services", "community", "foundation"] },

  // ── 71 Arts, Entertainment & Recreation ────────────────────────────────
  { label: "Fitness, Gym & Personal Training", sector: "71", aliases: ["gym", "fitness", "personal trainer", "crossfit", "pilates", "yoga", "sport", "sports", "workout", "bootcamp"] },
  { label: "Sports Club & Coaching", sector: "71", aliases: ["sports club", "football", "soccer", "tennis", "academy", "coach", "athletics", "martial arts"] },
  { label: "Entertainment & Live Events", sector: "71", aliases: ["entertainment", "venue", "concert", "theatre", "nightclub", "dj", "band"] },
  { label: "Arts, Museums & Culture", sector: "71", aliases: ["gallery", "museum", "arts", "exhibition", "cultural"] },
  { label: "Recreation & Leisure", sector: "71", aliases: ["recreation", "leisure", "amusement", "bowling", "arcade", "adventure", "golf"] },

  // ── 72 Accommodation & Food Services ───────────────────────────────────
  { label: "Restaurant & Dining", sector: "72", aliases: ["restaurant", "diner", "eatery", "bistro", "kitchen", "food", "takeaway", "takeout", "pizzeria"] },
  { label: "Cafe, Bakery & Coffee Shop", sector: "72", aliases: ["cafe", "coffee", "bakery", "patisserie", "juice bar", "tea room"] },
  { label: "Bar, Pub & Nightlife", sector: "72", aliases: ["bar", "pub", "lounge", "cocktail", "tavern", "brewery tap"] },
  { label: "Catering & Food Trucks", sector: "72", aliases: ["catering", "caterer", "food truck", "private chef", "meal prep"] },
  { label: "Hotel & Accommodation", sector: "72", aliases: ["hotel", "motel", "inn", "bnb", "bed and breakfast", "guest house", "hostel", "airbnb", "hospitality"] },

  // ── 81 Other Services ──────────────────────────────────────────────────
  { label: "Barbershop & Hair Salon", sector: "81", aliases: ["barber", "hairdresser", "hair salon", "haircut", "stylist", "braids", "locs"] },
  { label: "Beauty Salon & Nails", sector: "81", aliases: ["beauty", "nails", "manicure", "pedicure", "lashes", "brows", "makeup", "aesthetics"] },
  { label: "Spa, Massage & Wellness", sector: "81", aliases: ["spa", "massage", "wellness", "sauna", "facial", "therapy massage", "skincare"] },
  { label: "Tattoo & Piercing Studio", sector: "81", aliases: ["tattoo", "piercing", "ink", "body art"] },
  { label: "Auto Repair & Mechanic", sector: "81", aliases: ["mechanic", "garage", "auto repair", "car repair", "mot", "servicing", "tyres", "tires", "bodyshop", "detailing"] },
  { label: "Equipment Repair & Maintenance", sector: "81", aliases: ["repair", "appliance repair", "machinery repair", "servicing equipment"] },
  { label: "Dry Cleaning & Laundry", sector: "81", aliases: ["dry cleaning", "laundry", "launderette", "laundromat", "ironing"] },
  { label: "Tailoring & Alterations", sector: "81", aliases: ["tailor", "alterations", "seamstress", "dressmaker", "bespoke"] },
  { label: "Pet Grooming & Services", sector: "81", aliases: ["pet", "grooming", "dog walking", "kennel", "cattery", "pet sitting", "dog trainer"] },
  { label: "Funeral & Memorial Services", sector: "81", aliases: ["funeral", "undertaker", "mortuary", "cremation", "memorial"] },
  { label: "Wedding & Bridal Services", sector: "81", aliases: ["wedding", "bridal", "wedding planner", "celebrant", "bride"] },
  { label: "Religious & Community Organisation", sector: "81", aliases: ["church", "mosque", "temple", "synagogue", "religious", "congregation", "ministry"] },
  { label: "Trade Union & Membership Body", sector: "81", aliases: ["union", "association", "membership", "professional body", "chamber"] },

  // ── 92 Public Administration ───────────────────────────────────────────
  { label: "Government & Public Sector", sector: "92", aliases: ["government", "council", "municipal", "public sector", "agency public"] },
];

/** Bigram Dice coefficient: tolerant of typos and word-order differences. */
const bigrams = (value: string) => {
  const s = ` ${value} `;
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i += 1) out.add(s.slice(i, i + 2));
  return out;
};

const dice = (a: string, b: string) => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  let shared = 0;
  A.forEach((g) => {
    if (B.has(g)) shared += 1;
  });
  return (2 * shared) / (A.size + B.size);
};

const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export interface IndustryMatch {
  industry: Industry;
  score: number;
}

/**
 * Ranked search. Exact and prefix hits win outright; alias hits come next;
 * fuzzy similarity is the safety net so "cloths" or "barbar" still land
 * somewhere sensible instead of returning an empty list.
 */
export const searchIndustries = (query: string, limit = 40): IndustryMatch[] => {
  const q = norm(query);
  if (!q) return INDUSTRIES.map((industry) => ({ industry, score: 0 }));

  const scored: IndustryMatch[] = [];

  for (const industry of INDUSTRIES) {
    const label = norm(industry.label);
    const labelTokens = label.split(" ");
    let score = 0;

    if (label === q) score = 100;
    else if (label.startsWith(q)) score = 92;
    else if (label.includes(q)) score = 84;
    else if (labelTokens.some((t) => t.startsWith(q) && q.length >= 3)) score = 78;

    for (const rawAlias of industry.aliases) {
      const alias = norm(rawAlias);
      let aliasScore = 0;
      if (alias === q) aliasScore = 96;
      else if (alias.startsWith(q) && q.length >= 3) aliasScore = 88;
      else if (alias.includes(q) && q.length >= 4) aliasScore = 80;
      else if (q.includes(alias) && alias.length >= 4) aliasScore = 74;
      if (aliasScore > score) score = aliasScore;
    }

    if (score === 0) {
      // Fuzzy fallback against the label and every alias.
      let best = dice(q, label);
      for (const alias of industry.aliases) {
        const d = dice(q, norm(alias));
        if (d > best) best = d;
      }
      if (best >= 0.34) score = Math.round(best * 60); // caps below exact hits
    }

    if (score > 0) scored.push({ industry, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.industry.label.localeCompare(b.industry.label))
    .slice(0, limit);
};

export const INDUSTRY_LABELS = INDUSTRIES.map((i) => i.label);

/** True when the stored value is a free-text industry the user typed. */
export const isCustomIndustry = (value: string) =>
  Boolean(value) && value !== OTHER_INDUSTRY && !INDUSTRY_LABELS.includes(value);
