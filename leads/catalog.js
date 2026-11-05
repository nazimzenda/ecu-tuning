/**
 * Research catalog: priority markets, discovery vocabulary and compliance rules.
 *
 * The catalog is intentionally editable. Add cities/countries here and the
 * research runner, admin filters and documentation pick them up automatically.
 */

const RESEARCH_CONTACT =
  process.env.LEAD_RESEARCH_CONTACT || 'admin@ecu-tuning.example';

const USER_AGENT = `ECUTuningProLeadResearch/1.0 (+${RESEARCH_CONTACT})`;

const OVERPASS_ENDPOINTS = (
  process.env.OVERPASS_URLS ||
  [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.osm.ch/api/interpreter'
  ].join(',')
)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const NOMINATIM_ENDPOINT =
  process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';

/**
 * Priority rollout, mirroring the business plan:
 * 1. France + Germany, 2. UK, 3. Spain + Italy, 4. Belgium + Netherlands,
 * 5. US + Canada, 6. Australia, then the rest of the world.
 *
 * lat/lon is the city centre. radiusKm is deliberately conservative so a run
 * can complete quickly and does not hammer public Overpass infrastructure.
 */
const COUNTRIES = [
  {
    code: 'FR',
    name: 'France',
    priority: 1,
    region: 'Western Europe',
    cities: [
      { name: 'Paris', lat: 48.8566, lon: 2.3522, radiusKm: 30 },
      { name: 'Lyon', lat: 45.7640, lon: 4.8357, radiusKm: 30 },
      { name: 'Marseille', lat: 43.2965, lon: 5.3698, radiusKm: 30 },
      { name: 'Toulouse', lat: 43.6047, lon: 1.4442, radiusKm: 30 },
      { name: 'Bordeaux', lat: 44.8378, lon: -0.5792, radiusKm: 30 },
      { name: 'Lille', lat: 50.6292, lon: 3.0573, radiusKm: 30 },
      { name: 'Nantes', lat: 47.2184, lon: -1.5536, radiusKm: 30 },
      { name: 'Strasbourg', lat: 48.5734, lon: 7.7521, radiusKm: 30 }
    ]
  },
  {
    code: 'DE',
    name: 'Germany',
    priority: 1,
    region: 'Western Europe',
    cities: [
      { name: 'Berlin', lat: 52.5200, lon: 13.4050, radiusKm: 35 },
      { name: 'Munich', lat: 48.1351, lon: 11.5820, radiusKm: 35 },
      { name: 'Hamburg', lat: 53.5511, lon: 9.9937, radiusKm: 35 },
      { name: 'Stuttgart', lat: 48.7758, lon: 9.1829, radiusKm: 35 },
      { name: 'Cologne', lat: 50.9375, lon: 6.9603, radiusKm: 35 },
      { name: 'Frankfurt', lat: 50.1109, lon: 8.6821, radiusKm: 35 },
      { name: 'Düsseldorf', lat: 51.2277, lon: 6.7735, radiusKm: 35 },
      { name: 'Leipzig', lat: 51.3397, lon: 12.3731, radiusKm: 35 }
    ]
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    priority: 2,
    region: 'Western Europe',
    cities: [
      { name: 'London', lat: 51.5072, lon: -0.1276, radiusKm: 35 },
      { name: 'Manchester', lat: 53.4808, lon: -2.2426, radiusKm: 35 },
      { name: 'Birmingham', lat: 52.4862, lon: -1.8904, radiusKm: 35 },
      { name: 'Leeds', lat: 53.8008, lon: -1.5491, radiusKm: 35 },
      { name: 'Glasgow', lat: 55.8642, lon: -4.2518, radiusKm: 35 },
      { name: 'Bristol', lat: 51.4545, lon: -2.5879, radiusKm: 35 },
      { name: 'Liverpool', lat: 53.4084, lon: -2.9916, radiusKm: 35 },
      { name: 'Sheffield', lat: 53.3811, lon: -1.4701, radiusKm: 35 }
    ]
  },
  {
    code: 'ES',
    name: 'Spain',
    priority: 3,
    region: 'Southern Europe',
    cities: [
      { name: 'Madrid', lat: 40.4168, lon: -3.7038, radiusKm: 35 },
      { name: 'Barcelona', lat: 41.3874, lon: 2.1686, radiusKm: 35 },
      { name: 'Valencia', lat: 39.4699, lon: -0.3763, radiusKm: 35 },
      { name: 'Seville', lat: 37.3891, lon: -5.9845, radiusKm: 35 },
      { name: 'Zaragoza', lat: 41.6488, lon: -0.8891, radiusKm: 35 },
      { name: 'Málaga', lat: 36.7213, lon: -4.4214, radiusKm: 35 },
      { name: 'Bilbao', lat: 43.2630, lon: -2.9350, radiusKm: 35 }
    ]
  },
  {
    code: 'IT',
    name: 'Italy',
    priority: 3,
    region: 'Southern Europe',
    cities: [
      { name: 'Milan', lat: 45.4642, lon: 9.1900, radiusKm: 35 },
      { name: 'Rome', lat: 41.9028, lon: 12.4964, radiusKm: 35 },
      { name: 'Turin', lat: 45.0703, lon: 7.6869, radiusKm: 35 },
      { name: 'Naples', lat: 40.8518, lon: 14.2681, radiusKm: 35 },
      { name: 'Bologna', lat: 44.4949, lon: 11.3426, radiusKm: 35 },
      { name: 'Florence', lat: 43.7696, lon: 11.2558, radiusKm: 35 },
      { name: 'Verona', lat: 45.4384, lon: 10.9916, radiusKm: 35 },
      { name: 'Bari', lat: 41.1171, lon: 16.8719, radiusKm: 35 }
    ]
  },
  {
    code: 'BE',
    name: 'Belgium',
    priority: 4,
    region: 'Western Europe',
    cities: [
      { name: 'Brussels', lat: 50.8476, lon: 4.3572, radiusKm: 30 },
      { name: 'Antwerp', lat: 51.2194, lon: 4.4025, radiusKm: 30 },
      { name: 'Ghent', lat: 51.0543, lon: 3.7174, radiusKm: 30 },
      { name: 'Liège', lat: 50.6326, lon: 5.5797, radiusKm: 30 }
    ]
  },
  {
    code: 'NL',
    name: 'Netherlands',
    priority: 4,
    region: 'Western Europe',
    cities: [
      { name: 'Amsterdam', lat: 52.3676, lon: 4.9041, radiusKm: 30 },
      { name: 'Rotterdam', lat: 51.9244, lon: 4.4777, radiusKm: 30 },
      { name: 'Utrecht', lat: 52.0907, lon: 5.1214, radiusKm: 30 },
      { name: 'Eindhoven', lat: 51.4416, lon: 5.4697, radiusKm: 30 },
      { name: 'The Hague', lat: 52.0705, lon: 4.3007, radiusKm: 30 }
    ]
  },
  {
    code: 'US',
    name: 'United States',
    priority: 5,
    region: 'North America',
    cities: [
      { name: 'New York', lat: 40.7128, lon: -74.0060, radiusKm: 45 },
      { name: 'Los Angeles', lat: 34.0522, lon: -118.2437, radiusKm: 45 },
      { name: 'Chicago', lat: 41.8781, lon: -87.6298, radiusKm: 45 },
      { name: 'Houston', lat: 29.7604, lon: -95.3698, radiusKm: 45 },
      { name: 'Dallas', lat: 32.7767, lon: -96.7970, radiusKm: 45 },
      { name: 'Miami', lat: 25.7617, lon: -80.1918, radiusKm: 45 },
      { name: 'Atlanta', lat: 33.7490, lon: -84.3880, radiusKm: 45 },
      { name: 'Seattle', lat: 47.6062, lon: -122.3321, radiusKm: 45 },
      { name: 'Denver', lat: 39.7392, lon: -104.9903, radiusKm: 45 },
      { name: 'Boston', lat: 42.3601, lon: -71.0589, radiusKm: 45 }
    ]
  },
  {
    code: 'CA',
    name: 'Canada',
    priority: 5,
    region: 'North America',
    cities: [
      { name: 'Toronto', lat: 43.6532, lon: -79.3832, radiusKm: 45 },
      { name: 'Vancouver', lat: 49.2827, lon: -123.1207, radiusKm: 45 },
      { name: 'Montreal', lat: 45.5017, lon: -73.5673, radiusKm: 45 },
      { name: 'Calgary', lat: 51.0447, lon: -114.0719, radiusKm: 45 },
      { name: 'Ottawa', lat: 45.4215, lon: -75.6972, radiusKm: 45 },
      { name: 'Edmonton', lat: 53.5461, lon: -113.4938, radiusKm: 45 }
    ]
  },
  {
    code: 'AU',
    name: 'Australia',
    priority: 6,
    region: 'Oceania',
    cities: [
      { name: 'Sydney', lat: -33.8688, lon: 151.2093, radiusKm: 50 },
      { name: 'Melbourne', lat: -37.8136, lon: 144.9631, radiusKm: 50 },
      { name: 'Brisbane', lat: -27.4698, lon: 153.0251, radiusKm: 50 },
      { name: 'Perth', lat: -31.9505, lon: 115.8605, radiusKm: 50 },
      { name: 'Adelaide', lat: -34.9285, lon: 138.6007, radiusKm: 50 },
      { name: 'Gold Coast', lat: -28.0167, lon: 153.4000, radiusKm: 50 }
    ]
  },
  {
    code: 'IE',
    name: 'Ireland',
    priority: 7,
    region: 'Western Europe',
    cities: [
      { name: 'Dublin', lat: 53.3498, lon: -6.2603, radiusKm: 30 },
      { name: 'Cork', lat: 51.8985, lon: -8.4756, radiusKm: 30 }
    ]
  },
  {
    code: 'PT',
    name: 'Portugal',
    priority: 7,
    region: 'Southern Europe',
    cities: [
      { name: 'Lisbon', lat: 38.7223, lon: -9.1393, radiusKm: 30 },
      { name: 'Porto', lat: 41.1579, lon: -8.6291, radiusKm: 30 }
    ]
  },
  {
    code: 'CH',
    name: 'Switzerland',
    priority: 7,
    region: 'Western Europe',
    cities: [
      { name: 'Zurich', lat: 47.3769, lon: 8.5417, radiusKm: 30 },
      { name: 'Geneva', lat: 46.2044, lon: 6.1432, radiusKm: 30 },
      { name: 'Basel', lat: 47.5596, lon: 7.5886, radiusKm: 30 }
    ]
  },
  {
    code: 'AT',
    name: 'Austria',
    priority: 7,
    region: 'Western Europe',
    cities: [
      { name: 'Vienna', lat: 48.2082, lon: 16.3738, radiusKm: 30 },
      { name: 'Graz', lat: 47.0707, lon: 15.4395, radiusKm: 30 }
    ]
  },
  {
    code: 'PL',
    name: 'Poland',
    priority: 7,
    region: 'Central Europe',
    cities: [
      { name: 'Warsaw', lat: 52.2297, lon: 21.0122, radiusKm: 35 },
      { name: 'Kraków', lat: 50.0647, lon: 19.9450, radiusKm: 35 },
      { name: 'Poznań', lat: 52.4064, lon: 16.9252, radiusKm: 35 }
    ]
  },
  {
    code: 'CZ',
    name: 'Czechia',
    priority: 7,
    region: 'Central Europe',
    cities: [
      { name: 'Prague', lat: 50.0755, lon: 14.4378, radiusKm: 35 },
      { name: 'Brno', lat: 49.1951, lon: 16.6068, radiusKm: 35 }
    ]
  },
  {
    code: 'SE',
    name: 'Sweden',
    priority: 7,
    region: 'Northern Europe',
    cities: [
      { name: 'Stockholm', lat: 59.3293, lon: 18.0686, radiusKm: 35 },
      { name: 'Gothenburg', lat: 57.7089, lon: 11.9746, radiusKm: 35 }
    ]
  },
  {
    code: 'NO',
    name: 'Norway',
    priority: 7,
    region: 'Northern Europe',
    cities: [
      { name: 'Oslo', lat: 59.9139, lon: 10.7522, radiusKm: 35 },
      { name: 'Bergen', lat: 60.3913, lon: 5.3221, radiusKm: 35 }
    ]
  },
  {
    code: 'DK',
    name: 'Denmark',
    priority: 7,
    region: 'Northern Europe',
    cities: [
      { name: 'Copenhagen', lat: 55.6761, lon: 12.5683, radiusKm: 35 },
      { name: 'Aarhus', lat: 56.1629, lon: 10.2039, radiusKm: 35 }
    ]
  },
  {
    code: 'FI',
    name: 'Finland',
    priority: 7,
    region: 'Northern Europe',
    cities: [
      { name: 'Helsinki', lat: 60.1699, lon: 24.9384, radiusKm: 35 },
      { name: 'Tampere', lat: 61.4978, lon: 23.7610, radiusKm: 35 }
    ]
  },
  {
    code: 'JP',
    name: 'Japan',
    priority: 8,
    region: 'Asia-Pacific',
    cities: [
      { name: 'Tokyo', lat: 35.6762, lon: 139.6503, radiusKm: 45 },
      { name: 'Osaka', lat: 34.6937, lon: 135.5023, radiusKm: 45 },
      { name: 'Nagoya', lat: 35.1815, lon: 136.9066, radiusKm: 45 }
    ]
  },
  {
    code: 'ZA',
    name: 'South Africa',
    priority: 8,
    region: 'Africa',
    cities: [
      { name: 'Johannesburg', lat: -26.2041, lon: 28.0473, radiusKm: 45 },
      { name: 'Cape Town', lat: -33.9249, lon: 18.4241, radiusKm: 45 },
      { name: 'Durban', lat: -29.8587, lon: 31.0218, radiusKm: 45 }
    ]
  },
  {
    code: 'AE',
    name: 'United Arab Emirates',
    priority: 8,
    region: 'Middle East',
    cities: [
      { name: 'Dubai', lat: 25.2048, lon: 55.2708, radiusKm: 45 },
      { name: 'Abu Dhabi', lat: 24.4539, lon: 54.3773, radiusKm: 45 }
    ]
  },
  {
    code: 'NZ',
    name: 'New Zealand',
    priority: 8,
    region: 'Oceania',
    cities: [
      { name: 'Auckland', lat: -36.8485, lon: 174.7633, radiusKm: 45 },
      { name: 'Christchurch', lat: -43.5321, lon: 172.6362, radiusKm: 45 }
    ]
  },
  {
    code: 'MX',
    name: 'Mexico',
    priority: 8,
    region: 'Latin America',
    cities: [
      { name: 'Mexico City', lat: 19.4326, lon: -99.1332, radiusKm: 45 },
      { name: 'Guadalajara', lat: 20.6597, lon: -103.3496, radiusKm: 45 },
      { name: 'Monterrey', lat: 25.6866, lon: -100.3161, radiusKm: 45 }
    ]
  },
  {
    code: 'BR',
    name: 'Brazil',
    priority: 8,
    region: 'Latin America',
    cities: [
      { name: 'São Paulo', lat: -23.5505, lon: -46.6333, radiusKm: 50 },
      { name: 'Rio de Janeiro', lat: -22.9068, lon: -43.1729, radiusKm: 50 },
      { name: 'Belo Horizonte', lat: -19.9167, lon: -43.9345, radiusKm: 50 }
    ]
  },
  {
    code: 'IN',
    name: 'India',
    priority: 8,
    region: 'Asia-Pacific',
    cities: [
      { name: 'Delhi', lat: 28.6139, lon: 77.2090, radiusKm: 50 },
      { name: 'Mumbai', lat: 19.0760, lon: 72.8777, radiusKm: 50 },
      { name: 'Bangalore', lat: 12.9716, lon: 77.5946, radiusKm: 50 }
    ]
  }
];

/** Business-name terms used to target likely ECU/tuning prospects. */
const DISCOVERY_NAME_PATTERN =
  'chip.?tuning|chiptuning|ecu|remap|re-?map|tuning|diagnos|diesel|performance|motoroptimierung|reprogrammation|reprogramaci|centralina|elaborazione|engine';

/** Queries for Nominatim's fallback discovery path. */
const NOMINATIM_TERMS = [
  'chip tuning',
  'chiptuning',
  'ECU tuning',
  'ECU remap',
  'remapping',
  'engine tuning',
  'performance tuning',
  'diesel tuning',
  'car diagnostics'
];

/**
 * Relevance vocabularies. These are deliberately multilingual because the
 * first target markets are FR/DE/ES/IT/NL and the rest of the world follows.
 */
const SERVICE_PATTERNS = {
  ecuSpecialist: [
    /\becu\b/i,
    /\bengine\s*control\s*unit\b/i,
    /\belectronic\s*control\s*unit\b/i,
    /\bchiptuning\b/i
  ],
  remapping: [
    /\b(?:ecu|engine|car|vehicle|auto)?\s*remap(?:ping|s|ped)?\b/i,
    /\bchip\s*-?\s*tuning\b/i,
    /\b(?:ecu|engine)\s*tuning\b/i,
    /\b(?:stage|stufe|etapa|fase)\s*[1-4]\b/i,
    /\bfile\s*(?:service|tuning)\b/i,
    /\bcustom\s*tune\b/i,
    /\b(?:dyno|rolling\s*road|power\s*run)\b/i,
    /\b(?:motoroptimierung|leistungssteigerung|kennfeldoptimierung)\b/i,
    /\breprogrammation\b/i,
    /\breprogramaci[oó]n\b/i,
    /\bcentralina\b/i,
    /\belaborazione\b/i,
    /\bchiptuning\b/i,
    /\b(?:tuning|tuner)\b/i
  ],
  diagnostics: [
    /\bdiagnos(?:tic|tics|e|is|i|tik)\b/i,
    /\bfault\s*codes?\b/i,
    /\berror\s*codes?\b/i,
    /\bobd(?:2|ii)?\b/i,
    /\bfehlerspeicher\b/i,
    /\bdiagnosi\b/i,
    /\bdiagn[oó]stico\b/i,
    /\b(?:coding|retrofit|calibration)\b/i
  ],
  repair: [
    /\brepair(?:s|ing)?\b/i,
    /\bservic(?:e|ing)\b/i,
    /\bmaintenance\b/i,
    /\bworkshop\b/i,
    /\bgarage\b/i,
    /\bwerkstatt\b/i,
    /\batelier\b/i,
    /\btaller\b/i,
    /\bofficina\b/i,
    /\breparatie\b/i,
    /\bonderhoud\b/i
  ],
  emissionsRepair: [
    /\bdpf\s*(?:clean(?:ing)?|repair|service|reinigung|nettoyage|limpieza|pulizia)\b/i,
    /\begr\s*(?:clean(?:ing)?|repair|service|reinigung)\b/i,
    /\badblue\s*(?:repair|service|pump|injector)\b/i,
    /\bscr\s*(?:repair|service|catalyst)\b/i,
    /\bcatalyst\b/i,
    /\bparticulate\s*filter\s*(?:clean(?:ing)?|repair|service)\b/i,
    /\bemissions\s*(?:repair|service|diagnostics)\b/i,
    /\binjection\s*repair\b/i
  ],
  b2bFileService: [
    /\bfile\s*service\b/i,
    /\bmaster\s*(?:file|tool)\b/i,
    /\bslave\s*(?:file|tool)\b/i,
    /\b(?:b2b|dealer|reseller|partner)\b/i,
    /\bworkshop\s*(?:network|partner)\b/i,
    /\b(?:winols|autotuner|pcmflash|flex|cmd|byteshooter|kess|ktag)\b/i
  ]
};

/**
 * Services we must not market into. Detection is a review flag, not an
 * automatic legal determination. The system still records the business, but
 * blocks outreach until an admin reviews it.
 */
const DEFEAT_PATTERNS = [
  {
    id: 'dpf_delete',
    label: 'DPF / FAP delete or removal',
    pattern:
      /(?:\b(?:dpf|fap)\s*(?:delete|removal|remove|off|bypass|suppression|supprimer|entfernen|deaktivieren|eliminaci[oó]n|anulaci[oó]n|rimozione|esclusione|verwijderen|uitschakelen|usuni[eę]cie|wy[lł][aą]czenie)\b|\b(?:delete|remove|removal|suppression|supprimer|d[ée]sactivation|entfernen|deaktivieren|anulaci[oó]n|eliminaci[oó]n|rimozione|esclusione|verwijderen|uitschakelen)\s+(?:du\s+|de\s+|el\s+|la\s+|il\s+|the\s+)?(?:dpf|fap)\b)/i
  },
  {
    id: 'egr_delete',
    label: 'EGR / AGR delete or removal',
    pattern:
      /(?:\b(?:egr|agr|exhaust\s*gas\s*recirculation)\s*(?:delete|removal|remove|off|bypass|suppression|supprimer|d[ée]sactivation|entfernen|ausprogrammieren|deaktivieren|anulaci[oó]n|eliminaci[oó]n|rimozione|esclusione|verwijderen|uitschakelen|wy[lł][aą]czenie)\b|\b(?:delete|remove|removal|suppression|supprimer|d[ée]sactivation|entfernen|deaktivieren|anulaci[oó]n|eliminaci[oó]n|rimozione|esclusione|verwijderen|uitschakelen)\s+(?:du\s+|de\s+|el\s+|la\s+|il\s+|the\s+)?(?:egr|agr)\b)/i
  },
  {
    id: 'adblue_delete',
    label: 'AdBlue / SCR delete or removal',
    pattern:
      /(?:\b(?:adblue|scr)\s*(?:delete|removal|remove|off|bypass|suppression|supprimer|d[ée]sactivation|entfernen|deaktivieren|anulaci[oó]n|eliminaci[oó]n|rimozione|esclusione|verwijderen|uitschakelen|wy[lł][aą]czenie)\b|\b(?:delete|remove|removal|suppression|supprimer|d[ée]sactivation|entfernen|deaktivieren|anulaci[oó]n|eliminaci[oó]n|rimozione|esclusione|verwijderen|uitschakelen)\s+(?:du\s+|de\s+|el\s+|la\s+|il\s+|the\s+)?(?:adblue|scr)\b)/i
  },
  {
    id: 'dtc_delete',
    label: 'DTC / fault-code delete',
    pattern:
      /\b(?:dtc|fault\s*codes?|error\s*codes?)\s*(?:delete|removal|remove|off|suppression|supprimer|deaktivieren|ausblenden|effacer|borrar|rimozione|uitschakelen)\b/i
  },
  {
    id: 'defeat_verb_noun',
    label: 'Emissions-delete wording',
    pattern:
      /\b(?:delete|remove|removal|suppression|supprimer|d[ée]sactivation|entfernen|deaktivieren|anulaci[oó]n|eliminaci[oó]n|rimozione|esclusione|verwijderen|uitschakelen)\s+(?:du\s+|de\s+|el\s+|la\s+|il\s+|the\s+)?(?:dpf|fap|egr|agr|adblue|scr|dtc)\b/i
  },
  { id: 'vmax_delete', label: 'Speed-limiter removal', pattern: /\b(?:vmax|v-max|speed\s*limiter)\s*(?:delete|removal|remove|off|bypass)\b/i },
  { id: 'lambda_delete', label: 'Lambda / O2 delete', pattern: /\b(?:lambda|o2|oxygen)\s*(?:delete|removal|remove|off|bypass)\b/i },
  { id: 'pop_bang', label: 'Pop & bang / crackle map', pattern: /\b(?:pop\s*(?:&|and)\s*bang|crackle\s*map|hardcut)\b/i },
  { id: 'defeat_device', label: 'Defeat-device wording', pattern: /\bdefeat\s*device|emissions\s*(?:delete|removal|bypass)\b/i }
];

const SOCIAL_HOSTS = {
  instagram: ['instagram.com'],
  facebook: ['facebook.com', 'fb.com'],
  linkedin: ['linkedin.com'],
  youtube: ['youtube.com', 'youtu.be'],
  tiktok: ['tiktok.com'],
  x: ['x.com', 'twitter.com']
};

const DIRECTORY_HOSTS = [
  'yelp.',
  'tripadvisor.',
  'yellowpages.',
  'pagesjaunes.',
  'yell.com',
  'bing.com',
  'google.com',
  'maps.google.',
  'foursquare.com',
  'waze.com',
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'youtube.com',
  'tiktok.com',
  'wikipedia.org',
  'osm.org',
  'openstreetmap.org'
];

/** Builds a south,west,north,east bbox around a city. */
function bboxAround(lat, lon, radiusKm) {
  const latDelta = radiusKm / 111.32;
  const lonDelta = radiusKm / (111.32 * Math.max(0.15, Math.cos((lat * Math.PI) / 180)));
  return [lat - latDelta, lon - lonDelta, lat + latDelta, lon + lonDelta];
}

/** Normalises a country code or name to the catalog's ISO2 code. */
function resolveCountry(value) {
  if (!value) return null;
  const needle = String(value).trim().toLowerCase();
  return (
    COUNTRIES.find(
      (country) =>
        country.code.toLowerCase() === needle ||
        country.name.toLowerCase() === needle
    ) || null
  );
}

/** Finds a city by name, optionally constrained to a country code. */
function resolveCity(name, countryCode) {
  if (!name) return null;
  const needle = String(name).trim().toLowerCase();
  for (const country of COUNTRIES) {
    if (countryCode && country.code !== String(countryCode).toUpperCase()) continue;
    const city = country.cities.find((entry) => entry.name.toLowerCase() === needle);
    if (city) return { ...city, countryCode: country.code, countryName: country.name };
  }
  return null;
}

function countryByCode(code) {
  return COUNTRIES.find((country) => country.code === String(code).toUpperCase()) || null;
}

function isDirectoryHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return DIRECTORY_HOSTS.some((needle) => host.includes(needle));
}

function socialNetworkForHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  for (const [network, hosts] of Object.entries(SOCIAL_HOSTS)) {
    if (hosts.some((needle) => host === needle || host.endsWith(`.${needle}`))) {
      return network;
    }
  }
  return null;
}

module.exports = {
  RESEARCH_CONTACT,
  USER_AGENT,
  OVERPASS_ENDPOINTS,
  NOMINATIM_ENDPOINT,
  COUNTRIES,
  DISCOVERY_NAME_PATTERN,
  NOMINATIM_TERMS,
  SERVICE_PATTERNS,
  DEFEAT_PATTERNS,
  bboxAround,
  resolveCountry,
  resolveCity,
  countryByCode,
  isDirectoryHost,
  socialNetworkForHost
};
