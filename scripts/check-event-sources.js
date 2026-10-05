// Read-only live diagnostic: same discovery and verification path as daily snapshots.
const fs = require('fs/promises');
const { ingestEvents } = require('../server/event-ingestion');
const { ACTIVE_PROVIDERS, ALTERNATIVE_PROVIDERS } = require('../server/event-discovery');

// These representative articles prove article access even when a listing currently
// contains no matching headlines. They are probe-only and never enter snapshots.
const probeArticles = [
  { source: 'Oracle OCI Blog', title: 'Announcing Oracle Alloy Reserved Regions', category: 'CAPEX', region: 'All regions', url: 'https://blogs.oracle.com/cloud-infrastructure/oracle-alloy-reserved-regions' },
  { source: 'Texas Governor', title: 'Governor Abbott Directs TCEQ To Halt Data Center Permits', category: 'PERMIT', region: 'Texas', url: 'https://gov.texas.gov/news/post/governor-abbott-directs-tceq-to-halt-data-center-permits' },
  { source: 'FERC', title: 'FERC Launches Aggressive Targeted Action to Speed Large Load Integration', category: 'GRID', region: 'All regions', url: 'https://www.ferc.gov/news-events/news/ferc-launches-aggressive-targeted-action-speed-large-load-integration' },
];

async function main() {
  const includeAlternatives = process.argv.includes('--alternatives') || process.env.PROBE_EVENT_ALTERNATIVES === 'true';
  const providerNames = includeAlternatives ? [...new Set([...ACTIVE_PROVIDERS, ...ALTERNATIVE_PROVIDERS])] : ACTIVE_PROVIDERS;
  const result = await ingestEvents({}, {
    providerNames,
    ...(includeAlternatives ? { readFile: async file => JSON.stringify([...JSON.parse(await fs.readFile(file, 'utf8')), ...probeArticles]) } : {}),
  });
  const report = { checkedAt: new Date().toISOString(), dailyProviders: ACTIVE_PROVIDERS, probeOnlyProviders: providerNames.filter(name => !ACTIVE_PROVIDERS.includes(name)), status: result.status, coverage: result.coverage, verifiedArticles: result.observations.map(item => ({ source: item.value.source, url: item.sourceUrl, publishedAt: item.observedAt, title: item.value.title })) };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const output = process.argv.slice(2).find(argument => !argument.startsWith('--'));
  if (output) await fs.writeFile(output, json);
  console.log(json);
  if (result.status === 'degraded') process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
