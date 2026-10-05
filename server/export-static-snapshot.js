const fs = require('fs/promises');
const path = require('path');
const config = require('./config');
const { createService } = require('./service');
const { mergeCompanyHistory } = require('./company-history');
const { mergeSnapshotObservations, mergeSnapshotHealth } = require('./snapshot-merge');
const { buildSnapshotChanges } = require('./snapshot-changes');
const { buildRuntimeSnapshot } = require('./runtime-snapshot');
const { evaluateDemoReadiness } = require('./demo-readiness');
const { easternParts, isNyseTradingDay } = require('./us-market-calendar');
const {
  reconstructionSummary,
} = require('./historical-reconstruction');
const { scoreCompanies, VERSION: companyScoreVersion } = require('./scoring/engine');
const companies = require('../src/data/companyExposure.json');

const output = path.resolve(__dirname, '..', 'public', 'data', 'dashboard-snapshot.json');
const runtimeOutput = path.resolve(__dirname, '..', 'public', 'data', 'dashboard-overview.json');
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function readPrevious() { try { return JSON.parse(await fs.readFile(output, 'utf8')); } catch { return { observations: [], sourceHealth: {}, companyHistory: [], scores: [] }; } }
async function refreshWithRetry(service, source, attempts = 3) {
  let result;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    result = await service.ingest(source, true);
    if (result.status === 'ok') return { ...result, attempts: attempt };
    if (attempt < attempts) await delay(1000 * (2 ** (attempt - 1)));
  }
  return { ...result, attempts };
}
async function main() {
  const service = createService(config); const previous = await readPrevious(); const outcomes = [];
  const marketSession = isNyseTradingDay(easternParts());
  for (const source of config.scheduleSources) {
    if (source === 'prices' && !marketSession) continue;
    outcomes.push(await refreshWithRetry(service, source));
  }
  const fresh = await service.observations();
  const currentHealth = await service.health();
  const successful = new Set(outcomes.filter(item => item.status === 'ok' || item.status === 'partial').map(item => item.source));
  const observations = mergeSnapshotObservations(previous.observations || [], fresh, outcomes);
  const health = mergeSnapshotHealth(previous.sourceHealth || {}, currentHealth, observations);
  const generatedAt = new Date().toISOString();
  const scores = scoreCompanies(companies, observations, generatedAt);
  const scoreSnapshots = scores.filter(score => score.marketSignal.available).map(score => ({
    ticker: score.ticker,
    asOf: score.asOf,
    marketSignal: score.marketSignal,
    methodologyVersion: score.methodologyVersion,
    lineage: score.lineage || [],
    origin: 'recorded',
    pointInTimeQuality: 'recorded',
  }));

  const companyHistory = mergeCompanyHistory(previous.companyHistory || [], scoreSnapshots, generatedAt);
  const backtestCoverage = reconstructionSummary(companyHistory);

  await service.store.saveScoreSnapshots(scores.filter(score => score.marketSignal.available));

  const snapshot = {
    schemaVersion: 4,
    generatedAt,
    freshness: outcomes.every(item => item.status === 'ok') ? 'fresh' : successful.size ? 'partial' : 'stale',
    sourceHealth: health,
    outcomes,
    observations,
    scores,
    methodologies: { companyScore: companyScoreVersion },
    companyHistory,
    backtestCoverage,
    note: 'Static dashboard snapshot. Successful sources replace their prior static data; degraded sources retain last-known-good observations and last-success metadata. Market signals use cited daily closes and the published MA5/MA10 formula. Fundamental, exposure, emotion, confidence, and expectations-gap scores are unavailable pending sourced methodology. No historical scores are reconstructed. Snapshot changes compare only material customer-facing fields against the immediately preceding committed snapshot. Not investment advice.',
  };
  const trackedTickers = config.tickers || companies.map(company => company.ticker);
  snapshot.snapshotChanges = buildSnapshotChanges(previous, snapshot, { tickers: trackedTickers });
  const readiness = evaluateDemoReadiness(snapshot, { tickers: trackedTickers, now: generatedAt });
  snapshot.demoReadiness = {
    status: readiness.status,
    ready: readiness.ready,
    blockerCount: readiness.blockerCount,
    warningCount: readiness.warningCount,
    priceCoverage: readiness.priceCoverage,
  };
  const runtimeSnapshot = buildRuntimeSnapshot(snapshot);
  const runtimeJson = `${JSON.stringify(runtimeSnapshot)}\n`;
  await fs.mkdir(path.dirname(output), { recursive: true });
  await Promise.all([
    fs.writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`),
    fs.writeFile(runtimeOutput, runtimeJson),
  ]);
  console.log(JSON.stringify({
    freshness: snapshot.freshness,
    demoReadiness: snapshot.demoReadiness,
    companyHistoryRecords: companyHistory.length,
    reconstructedRecords: backtestCoverage.reconstructed,
    backtestCoverage,
    methodology: companyScoreVersion,
    runtimeSnapshot: {
      profile: runtimeSnapshot.runtimeProfile,
      observationCount: runtimeSnapshot.observations.length,
      bytes: Buffer.byteLength(runtimeJson),
    },
    snapshotChanges: {
      available: snapshot.snapshotChanges.available,
      from: snapshot.snapshotChanges.from,
      total: snapshot.snapshotChanges.summary.total,
      summary: snapshot.snapshotChanges.summary,
    },
    sources: outcomes.map(item => ({ source: item.source, status: item.status, attempts: item.attempts, recordCount: item.recordCount ?? null, message: item.message })),
    marketSession,
  }, null, 2));
}
main().catch(error => { console.error(error); process.exit(1); });
