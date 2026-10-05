// Read-only live diagnostic: same discovery and verification path as daily snapshots.
const fs = require('fs/promises');
const { ingestEvents } = require('../server/event-ingestion');

async function main() {
  const result = await ingestEvents();
  const report = { checkedAt: new Date().toISOString(), status: result.status, coverage: result.coverage, verifiedArticles: result.observations.map(item => ({ url: item.sourceUrl, publishedAt: item.observedAt, title: item.value.title })) };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (process.argv[2]) await fs.writeFile(process.argv[2], json);
  console.log(json);
  if (result.status === 'degraded') process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
