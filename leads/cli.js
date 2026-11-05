#!/usr/bin/env node
/**
 * CLI for the research agent.
 *
 * Examples:
 *   node leads/cli.js --countries FR,DE --limit 50
 *   node leads/cli.js --cities "Lyon, Berlin" --limit 30
 *   node leads/cli.js --countries GB --source nominatim --no-enrich
 *   node leads/cli.js --countries US --limit 100 --include-general
 */

const store = require('./store');
const { runResearch } = require('./agent');

function parseArgs(argv) {
  const args = { countries: '', cities: '', limit: 50, source: 'auto', enrich: true, includeGeneral: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--countries' || arg === '--country') args.countries = argv[++index] || '';
    else if (arg === '--cities' || arg === '--city') args.cities = argv[++index] || '';
    else if (arg === '--limit') args.limit = Number(argv[++index]) || 50;
    else if (arg === '--source') args.source = argv[++index] || 'auto';
    else if (arg === '--no-enrich') args.enrich = false;
    else if (arg === '--include-general') args.includeGeneral = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`ECU Tuning Pro — lead research CLI

Options:
  --countries FR,DE,GB    ISO2 country codes (priority cities are used)
  --cities "Lyon,Berlin"  Specific cities; can be combined with countries
  --limit 50              Candidate limit (5–500)
  --source auto           auto | overpass | nominatim
  --no-enrich             Skip official-website enrichment
  --include-general       Include general repair garages
  --help                  Show this help

Data policy: public business data only; lawful calibration, diagnostics and
emissions-system repair. No automated outreach.`);
      process.exit(0);
    }
  }
  return args;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  await store.init();

  const summary = await runResearch(
    {
      countries: args.countries ? args.countries.split(',') : [],
      cities: args.cities ? args.cities.split(',') : [],
      limit: args.limit,
      source: args.source,
      enrich: args.enrich,
      includeGeneral: args.includeGeneral
    },
    {
      onLog: (entry) => console.log(`[${entry.level}] ${entry.message}`),
      onProgress: (progress) => {
        if (progress.stage === 'saving' || progress.stage === 'complete') {
          console.log(
            `  ${progress.progress}% · found ${progress.found || 0} · added ${progress.added || 0} · merged ${progress.updated || 0} · enriched ${progress.enriched || 0}`
          );
        }
      }
    }
  );

  console.log('\nResearch complete.');
  console.log(`  targets:  ${summary.targets}`);
  console.log(`  found:    ${summary.found}`);
  console.log(`  added:    ${summary.added}`);
  console.log(`  merged:   ${summary.updated}`);
  console.log(`  enriched: ${summary.enriched}`);
  console.log(`  skipped:  ${summary.skipped}`);
  if (summary.errors.length) {
    console.log(`  warnings: ${summary.errors.length}`);
    for (const error of summary.errors.slice(0, 10)) console.log(`    - ${error}`);
  }
})().catch((error) => {
  console.error('Research failed:', error.message);
  process.exit(1);
});
