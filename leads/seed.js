/**
 * Curated starter set for the lead-research workspace.
 *
 * Every row below is a real public business record from OpenStreetMap /
 * Nominatim. The original OSM object is kept in source_url and external_id so
 * the record can be checked and re-verified. None of these are invented demo
 * rows, and the UI will only call a row "verified" after the normal scoring and
 * website checks pass.
 *
 * Run:
 *   npm run leads:seed
 *   npm run leads:seed -- --no-enrich
 *
 * Enrichment fetches only the businesses' public websites, respects robots.txt
 * and may take a couple of minutes for the full starter set.
 */

const store = require('./store');
const { enrichLead } = require('./enrich');
const { applyScore, detectServices } = require('./score');

const ARGS = new Set(process.argv.slice(2));
const ENRICH = !ARGS.has('--no-enrich');

function osm(type, id, data) {
  const sourceUrl = `https://www.openstreetmap.org/${type}/${id}`;
  return {
    ...data,
    external_id: `osm:${type}:${id}`,
    source: 'osm-nominatim',
    source_id: `${type}/${id}`,
    source_url: sourceUrl,
    evidence_url: sourceUrl,
    geo_precision: type === 'node' ? 'rooftop' : 'street',
    raw_data: {
      osm: { type, id, url: sourceUrl },
      seed: true
    }
  };
}

const SEEDS = [
  // France
  osm('way', 76296654, {
    name: 'Auto Passion Tuning',
    category: 'tuning',
    address: 'Chemin du Sang de Serp',
    city: 'Toulouse',
    region: 'Occitania',
    postal_code: '31200',
    country_code: 'FR',
    country: 'France',
    latitude: 43.6216829,
    longitude: 1.4222005
  }),
  osm('way', 221413400, {
    name: 'Comptoir du Tuning',
    category: 'tuning',
    address: 'Avenue Georges Clemenceau',
    city: 'Nanterre',
    region: 'Ile-de-France',
    postal_code: '92000',
    country_code: 'FR',
    country: 'France',
    latitude: 48.8869739,
    longitude: 2.2059879,
    phone: '+33147213661'
  }),

  // Germany
  osm('way', 25793261, {
    name: 'Arndt tuning',
    category: 'tuning',
    address: 'Weißenseer Weg',
    city: 'Berlin',
    postal_code: '13053',
    country_code: 'DE',
    country: 'Germany',
    latitude: 52.5392305,
    longitude: 13.4689915,
    website: 'https://www.arndt-tuning.de'
  }),
  osm('node', 1935182226, {
    name: 'ksfh-Tuning',
    category: 'tuning',
    address: 'Rudower Chaussee',
    city: 'Berlin',
    postal_code: '12489',
    country_code: 'DE',
    country: 'Germany',
    latitude: 52.4289391,
    longitude: 13.5215833,
    website: 'https://www.ksfh-tuning.de/'
  }),
  osm('way', 37208025, {
    name: 'Schätz Tuning Motorsports GmbH',
    category: 'tuning',
    address: '364 Dachauer Straße',
    city: 'Munich',
    region: 'Bavaria',
    postal_code: '80993',
    country_code: 'DE',
    country: 'Germany',
    latitude: 48.1898837,
    longitude: 11.5032023
  }),
  osm('node', 8415403635, {
    name: 'RexXer ECU Tuning',
    category: 'tuning',
    address: '41 Astheimer Straße',
    city: 'Rüsselsheim am Main',
    region: 'Hesse',
    postal_code: '65428',
    country_code: 'DE',
    country: 'Germany',
    latitude: 49.9615197,
    longitude: 8.4448791,
    website: 'https://www.rexxer.eu/',
    phone: '+49 6142 793971-203'
  }),
  osm('node', 3328346424, {
    name: 'Wagenthaler Performance Sportwagenservice & Tuning',
    category: 'tuning',
    address: '7 Gewerbering',
    city: 'Eismerszell',
    region: 'Bavaria',
    postal_code: '82272',
    country_code: 'DE',
    country: 'Germany',
    latitude: 48.1557132,
    longitude: 11.0860167,
    website: 'https://www.wagenthaler.com/'
  }),

  // United Kingdom
  osm('node', 10808180354, {
    name: 'ECU Tech Tune',
    category: 'tuning',
    address: '12a Eccles New Road',
    city: 'Salford',
    region: 'Greater Manchester',
    postal_code: 'M50 2NP',
    country_code: 'GB',
    country: 'United Kingdom',
    latitude: 53.4802645,
    longitude: -2.2987170,
    website: 'https://ecutechtune.co.uk',
    phone: '+44 7950 000113'
  }),
  osm('way', 143954626, {
    name: 'Advanced Car Tuning',
    category: 'tuning',
    address: '5 Gravelly Lane',
    city: 'Birmingham',
    region: 'West Midlands',
    postal_code: 'B23 6UJ',
    country_code: 'GB',
    country: 'United Kingdom',
    latitude: 52.5264297,
    longitude: -1.8423251
  }),
  osm('node', 11312570257, {
    name: '4Tek Remap Automotive',
    category: 'tuning',
    address: '16 Burrel Road',
    city: 'St Ives',
    region: 'Cambridgeshire',
    postal_code: 'PE27 3LE',
    country_code: 'GB',
    country: 'United Kingdom',
    latitude: 52.3381336,
    longitude: -0.0649717,
    website: 'https://www.4tek-remaps.co.uk/',
    phone: '+44 1480 700040'
  }),
  osm('way', 1302364103, {
    name: 'BGJ MotorSport Remap and Vehicle Security',
    category: 'tuning',
    address: 'Howard Street',
    city: 'Sandwell',
    region: 'West Midlands',
    postal_code: 'B70 0ST',
    country_code: 'GB',
    country: 'United Kingdom',
    latitude: 52.5383952,
    longitude: -2.0180648
  }),
  osm('way', 99243456, {
    name: 'D&B Engine Tuning',
    category: 'tuning',
    address: 'Cattle Market Road',
    city: 'Nottingham',
    region: 'East Midlands',
    postal_code: 'NG2 3GY',
    country_code: 'GB',
    country: 'United Kingdom',
    latitude: 52.9440655,
    longitude: -1.1362377
  }),
  osm('node', 10698010846, {
    name: 'Ric Wood Engine Tuning',
    category: 'tuning',
    address: 'Oakfield Road',
    city: 'Stockport',
    region: 'Greater Manchester',
    postal_code: 'SK3 8SB',
    country_code: 'GB',
    country: 'United Kingdom',
    latitude: 53.3906523,
    longitude: -2.1538235
  }),
  osm('way', 446322056, {
    name: 'Performance & Tuning RaceBits',
    category: 'tuning',
    address: '194 Walsall Wood Road',
    city: 'Aldridge',
    region: 'West Midlands',
    postal_code: 'WS9 8HE',
    country_code: 'GB',
    country: 'United Kingdom',
    latitude: 52.6152953,
    longitude: -1.9146758
  }),
  osm('way', 583913484, {
    name: 'tunit Performance Tuning',
    category: 'tuning',
    address: 'Clarence Street',
    city: 'Chorley',
    region: 'Lancashire',
    postal_code: 'PR7 2BJ',
    country_code: 'GB',
    country: 'United Kingdom',
    latitude: 53.6507464,
    longitude: -2.6274691
  }),

  // Spain
  osm('node', 13512568006, {
    name: 'Tuning Puga',
    category: 'tuning',
    address: 'Calle de Diciembre',
    city: 'Madrid',
    region: 'Community of Madrid',
    postal_code: '28821',
    country_code: 'ES',
    country: 'Spain',
    latitude: 40.4475107,
    longitude: -3.5695056,
    phone: '+34658613969'
  }),

  // Italy
  osm('node', 10715880261, {
    name: 'Mittiga Tuning',
    category: 'tuning',
    address: '53 Via Luigi Vittorio Bertarelli',
    city: 'Rome',
    region: 'Lazio',
    postal_code: '00159',
    country_code: 'IT',
    country: 'Italy',
    latitude: 41.9069953,
    longitude: 12.5357093,
    website: 'https://www.mittigatuning.com/',
    phone: '+39 06 4381504',
    email: 'info@mittigatuning.com'
  }),
  osm('node', 10705435821, {
    name: 'TOP TUNING MILANO',
    category: 'tuning',
    address: '1 Via Este',
    city: 'Meda',
    region: 'Lombardy',
    postal_code: '20821',
    country_code: 'IT',
    country: 'Italy',
    latitude: 45.6509695,
    longitude: 9.1585338,
    website: 'https://www.toptuning.it/it/news/TOPTUNING-MILANO_657.htm',
    phone: '+3903621637566',
    email: 'milano@toptuning.it'
  }),

  // Belgium / Netherlands
  osm('way', 740270004, {
    name: 'AKB-Tuning.be',
    category: 'tuning',
    address: '76 Katelijnestraat',
    city: 'Hoogstraten',
    region: 'Antwerp',
    postal_code: '2320',
    country_code: 'BE',
    country: 'Belgium',
    latitude: 51.3974597,
    longitude: 4.7488297,
    website: 'https://akb-tuning.be'
  }),
  osm('node', 2894409024, {
    name: 'Chiptuning Zuid Holland',
    category: 'tuning',
    address: '120C Rijnsburgerweg',
    city: 'Rijnsburg',
    region: 'Zuid-Holland',
    postal_code: '2231 AG',
    country_code: 'NL',
    country: 'Netherlands',
    latitude: 52.1863025,
    longitude: 4.4484028,
    website: 'https://chiptuningzuidholland.nl'
  }),
  osm('node', 8614274395, {
    name: 'Biggelaar performance & tuning',
    category: 'tuning',
    address: '20 Pastoor van Beugenstraat',
    city: 'Oisterwijk',
    region: 'Noord-Brabant',
    postal_code: '5061 CS',
    country_code: 'NL',
    country: 'Netherlands',
    latitude: 51.5790564,
    longitude: 5.1833187,
    website: 'http://www.biggelaar-performance.com',
    phone: '+31 13 528 2329'
  }),

  // United States / Canada
  osm('way', 249586853, {
    name: 'Blaze Tuning',
    category: 'tuning',
    address: '226 55th Street',
    city: 'New York',
    region: 'New York',
    postal_code: '11220',
    country_code: 'US',
    country: 'United States',
    latitude: 40.6457386,
    longitude: -74.0192847,
    phone: '+1-718-954-7029'
  }),
  osm('way', 992871965, {
    name: '875 Performance Tuning',
    category: 'tuning',
    address: '3268 Fairview Drive',
    city: 'Marietta',
    region: 'Georgia',
    postal_code: '30066',
    country_code: 'US',
    country: 'United States',
    latitude: 34.0306200,
    longitude: -84.5262626,
    phone: '+1 470-888-0875',
    email: '875performance@gmail.com',
    notes: 'City inferred from ZIP 30066; verify before outreach.'
  }),
  osm('way', 755280016, {
    name: 'Hidden Performance Tuning',
    category: 'tuning',
    address: 'Gornto Road',
    city: 'Valdosta',
    region: 'Georgia',
    postal_code: '31602',
    country_code: 'US',
    country: 'United States',
    latitude: 30.8458829,
    longitude: -83.3250077
  }),
  osm('way', 470933398, {
    name: 'Black Knight Diesel Tuning & Repair',
    category: 'tuning',
    address: 'North Flynn Avenue',
    city: 'Oklahoma City',
    region: 'Oklahoma',
    postal_code: '73112',
    country_code: 'US',
    country: 'United States',
    latitude: 35.5110633,
    longitude: -97.5503657
  }),

  // Australia / New Zealand
  osm('node', 3178217140, {
    name: 'Cherry Tuning & Performance',
    category: 'tuning',
    address: 'Hunter Lane',
    city: 'Sydney',
    region: 'New South Wales',
    postal_code: '2077',
    country_code: 'AU',
    country: 'Australia',
    latitude: -33.6997106,
    longitude: 151.1009618
  }),
  osm('way', 813623901, {
    name: 'Rowville Tuning & Service Centre',
    category: 'garage',
    address: '13 Laser Drive',
    city: 'Melbourne',
    region: 'Victoria',
    postal_code: '3178',
    country_code: 'AU',
    country: 'Australia',
    latitude: -37.9093842,
    longitude: 145.2439404
  }),
  osm('node', 10548082538, {
    name: 'Custom tuning services',
    category: 'tuning',
    address: '358 Reserve Road',
    city: 'Melbourne',
    region: 'Victoria',
    postal_code: '3192',
    country_code: 'AU',
    country: 'Australia',
    latitude: -37.9588407,
    longitude: 145.0394894
  }),
  osm('way', 885523645, {
    name: 'Forced Performance Tuning',
    category: 'tuning',
    address: '40 Toowoomba City',
    city: 'Toowoomba',
    region: 'Queensland',
    postal_code: '4350',
    country_code: 'AU',
    country: 'Australia',
    latitude: -27.5670511,
    longitude: 151.9494525
  }),
  osm('node', 6282044511, {
    name: 'Next Up Performance & Dyno Tuning',
    category: 'tuning',
    address: '115 Dollis Street',
    city: 'Brisbane',
    region: 'Queensland',
    postal_code: '4106',
    country_code: 'AU',
    country: 'Australia',
    latitude: -27.5575224,
    longitude: 153.0221616,
    website: 'https://www.facebook.com/next.up.5/'
  }),

  // Rest of world
  osm('way', 761106398, {
    name: 'Safe Chip Tuning',
    category: 'tuning',
    address: 'Нова 93',
    city: 'Novi Sad',
    region: 'Vojvodina',
    postal_code: '21203',
    country_code: 'RS',
    country: 'Serbia',
    latitude: 45.2409783,
    longitude: 19.7551695,
    website: 'https://sct.rs',
    phone: '+381 62 548 430',
    email: 'safe.chip.tuning@gmail.com'
  }),
  osm('node', 4853418824, {
    name: 'Vimota chiptuning',
    category: 'tuning',
    address: '94A Taikos pr.',
    city: 'Kaunas',
    region: 'Kaunas',
    postal_code: '51179',
    country_code: 'LT',
    country: 'Lithuania',
    latitude: 54.9154595,
    longitude: 24.0003722,
    website: 'https://www.vimota.lt',
    phone: '+37066846682',
    email: 'info@vimota.lt'
  }),
  osm('way', 660523174, {
    name: 'Diagnostica, Chiptuning și Altele',
    category: 'tuning',
    address: '14/3 Strada Calea Ieșilor',
    city: 'Chișinău',
    postal_code: 'MD-2069',
    country_code: 'MD',
    country: 'Moldova',
    latitude: 47.0435323,
    longitude: 28.7955351,
    website: 'https://www.sites.google.com/site/avtomoldova/',
    phone: '+37369352100'
  }),
  osm('way', 132553602, {
    name: 'CompSport chiptuning',
    category: 'tuning',
    address: '45 Cieszyńska',
    city: 'Bielsko-Biała',
    region: 'Silesia',
    postal_code: '43-300',
    country_code: 'PL',
    country: 'Poland',
    latitude: 49.8182273,
    longitude: 19.0375931,
    website: 'https://www.compsport.pl'
  }),
  osm('node', 10596345889, {
    name: 'PowerTEC - značkový chiptuning s.r.o.',
    category: 'tuning',
    address: 'Zemědělců',
    city: 'Srby',
    region: 'Central Bohemia',
    postal_code: '273 02',
    country_code: 'CZ',
    country: 'Czechia',
    latitude: 50.1392185,
    longitude: 13.9902832,
    website: 'https://www.chiptuning.cz'
  }),
  osm('node', 5308438191, {
    name: 'AC Chip Tuning',
    category: 'tuning',
    address: '11 Majke Jevrosime',
    city: 'Modriča',
    region: 'Republika Srpska',
    postal_code: '74480',
    country_code: 'BA',
    country: 'Bosnia and Herzegovina',
    latitude: 44.9557044,
    longitude: 18.3066854,
    website: 'http://www.acchiptuning.com',
    phone: '+387 65931953',
    email: 'info@acchiptuning.com'
  }),
  osm('node', 5329335974, {
    name: 'Rk chip tuning',
    category: 'tuning',
    address: 'Kuran Kursu Caddesi',
    city: 'Istanbul',
    region: 'Sultanbeyli',
    postal_code: '34920',
    country_code: 'TR',
    country: 'Türkiye',
    latitude: 40.9592819,
    longitude: 29.2643975,
    phone: '+90 531 230 00 02'
  }),
  osm('node', 5494009868, {
    name: 'Чип тунинг и ремап - Тунинг Про',
    category: 'tuning',
    address: '1871 бул. Сливница',
    city: 'Varna',
    postal_code: '9019',
    country_code: 'BG',
    country: 'Bulgaria',
    latitude: 43.2281602,
    longitude: 27.8737689,
    website: 'https://www.tuningpro-bg.com/',
    phone: '+359 88 720 0806'
  }),
  osm('node', 11069210259, {
    name: 'Remap Autopeças e Autoelétrica',
    category: 'tuning',
    address: 'Avenida Areia Branca',
    city: 'Rio de Janeiro',
    region: 'Rio de Janeiro',
    postal_code: '23550-740',
    country_code: 'BR',
    country: 'Brazil',
    latitude: -22.9397988,
    longitude: -43.6854483
  }),
  osm('way', 1349012699, {
    name: 'Megatuner Performance Remap',
    category: 'tuning',
    address: '1 Avenida Amélia Latorre',
    city: 'Jundiaí',
    region: 'São Paulo',
    postal_code: '13211-000',
    country_code: 'BR',
    country: 'Brazil',
    latitude: -23.1773905,
    longitude: -46.9169252
  }),
  osm('node', 10815277533, {
    name: 'ایسیو ریمپ — ECU Remap',
    category: 'tuning',
    address: 'اسدنژاد',
    city: 'Tehran',
    region: 'Tehran',
    postal_code: '13617-33111',
    country_code: 'IR',
    country: 'Iran',
    latitude: 35.6637774,
    longitude: 51.3443966,
    website: 'https://ecuremaptune.com/',
    phone: '+982166649358',
    email: 'ecuremapiran@gmail.com'
  }),
  osm('node', 12006625847, {
    name: 'RW Ecu Remap By Thai Style',
    category: 'tuning',
    address: '11539 Lorong Niaga Utama',
    city: 'Miri',
    region: 'Sarawak',
    postal_code: '98000',
    country_code: 'MY',
    country: 'Malaysia',
    latitude: 4.5029338,
    longitude: 114.0350935
  }),
  osm('node', 4772594679, {
    name: 'TALUS Performance Tuning',
    category: 'tuning',
    address: '1 Eggenfelder Straße',
    city: 'Gratkorn',
    region: 'Styria',
    postal_code: '8101',
    country_code: 'AT',
    country: 'Austria',
    latitude: 47.1417276,
    longitude: 15.3333789
  })
];

async function main() {
  await store.init();
  let added = 0;
  let updated = 0;
  let enriched = 0;
  let skipped = 0;

  for (const seed of SEEDS) {
    try {
      let lead = {
        ...seed,
        services: detectServices(`${seed.name} ${seed.description || ''}`)
      };
      if (ENRICH && lead.website) {
        lead = await enrichLead(lead);
        if (lead.website_status === 'ok') enriched += 1;
        // Be polite to the websites being checked.
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      lead = applyScore(lead);
      const result = await store.upsertLead(lead);
      if (result.action === 'inserted') added += 1;
      else updated += 1;
      console.log(
        `• ${seed.country_code} ${seed.name} — ${result.action}` +
          `${lead.website ? ` · ${lead.email || lead.phone || lead.website_status || 'website'}` : ' · map record only'}`
      );
    } catch (error) {
      skipped += 1;
      console.error(`✖ ${seed.name}: ${error.message}`);
    }
  }

  console.log(`\nSeed complete: ${added} added, ${updated} merged, ${enriched} websites enriched, ${skipped} skipped.`);
  console.log('Run the admin workspace and open Lead Research to review the records.');
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
