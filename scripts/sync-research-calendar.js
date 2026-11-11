const fs = require('node:fs/promises');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { macroSources } = require('../server/calendar-sources/macro');
const { sectorSources } = require('../server/calendar-sources/sector');
const { readCalendarSource } = require('../server/calendar-source-reader');
const { reconcileCalendar } = require('../server/calendar-reconciliation');

const DEFAULT_REGISTRY = path.resolve(__dirname, '../src/data/researchCatalysts.json');
const modes = ['dry-run', 'review', 'verified'];
const maxCandidates = 1200;

async function discover(source, now, read) {
  try {
    const input = await read(source.id, source.url);
    let remaining = 4;
    const parsed = await source.parse(input, { now, read: url => {
      if (remaining-- <= 0) throw new Error('Source detail request limit reached.');
      return read(source.id, url);
    } });
    if (!Array.isArray(parsed) || parsed.length > maxCandidates) throw new Error('Invalid parser output.');
    return {
      health: { method: source.id, url: source.url, status: 'checked', candidates: parsed.length },
      candidates: parsed.map(candidate => ({ ...candidate, method: source.id, endpoint: candidate.checkedUrl || source.url })),
    };
  } catch (error) {
    return {
      health: { method: source.id, url: source.url, status: 'unavailable', reason: error.code || 'unsupported-source-structure', candidates: 0 },
      candidates: [],
    };
  }
}

async function syncCalendar(registry, {
  mode = 'dry-run', pastDays = 30, futureDays = 90, now = new Date(),
  sources = [...macroSources, ...sectorSources], read = readCalendarSource,
} = {}) {
  if (!modes.includes(mode) || !Number.isInteger(pastDays) || pastDays < 0 || pastDays > 60 ||
    !Number.isInteger(futureDays) || futureDays < 1 || futureDays > 180) throw new Error('Invalid calendar mode or discovery window.');
  const scans = [];
  for (let index = 0; index < sources.length; index += 3) {
    scans.push(...await Promise.all(sources.slice(index, index + 3).map(source => discover(source, now, read))));
  }
  const { registry: proposal, ...report } = reconcileCalendar(registry, scans.flatMap(scan => scan.candidates), { now, pastDays, futureDays });
  return {
    proposal,
    report: { schemaVersion: 1, mode, ...report, sources: scans.map(scan => scan.health) },
  };
}

async function main() {
  const { values } = parseArgs({ options: {
    mode: { type: 'string', default: 'dry-run' },
    output: { type: 'string' },
    'past-days': { type: 'string', default: '30' },
    'future-days': { type: 'string', default: '90' },
  } });
  if (!values.output) throw new Error('Provide --output with a directory for the proposal and review report.');
  const registry = JSON.parse(await fs.readFile(DEFAULT_REGISTRY, 'utf8'));
  const { proposal, report } = await syncCalendar(registry, {
    mode: values.mode, pastDays: Number(values['past-days']), futureDays: Number(values['future-days']),
  });
  const directory = path.resolve(values.output);
  await fs.mkdir(directory, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(directory, 'registry.json'), `${JSON.stringify(proposal, null, 2)}\n`),
    fs.writeFile(path.join(directory, 'review.json'), `${JSON.stringify(report, null, 2)}\n`),
  ]);
  const changed = JSON.stringify(proposal) !== JSON.stringify(registry);
  const summary = [
    '## Research calendar scan', '',
    `Mode ${report.mode} · ${report.window.start} through ${report.window.end}`, '',
    ...Object.entries(report.counts).map(([key, count]) => `- ${key} ${count}`), '',
    ...report.sources.map(source => `- ${source.method} · ${source.status} · ${source.reason || `${source.candidates} candidates`}`),
  ].join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\nreview=${report.candidates.length > 0}\n`);
}

if (require.main === module) main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = { syncCalendar };
