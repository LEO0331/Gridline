#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_TICKERS } = require('../server/demo-readiness');
const { priceRefreshTickers } = require('../server/export-static-snapshot');
const { latestExpectedPriceSession } = require('../server/us-market-calendar');

function planPriceRetry(snapshot, now = new Date()) {
  const declared = snapshot?.trackedTickers;
  const valid = Array.isArray(declared) && declared.length > 0 &&
    declared.every(ticker => DEFAULT_TICKERS.includes(ticker)) &&
    new Set(declared).size === declared.length;
  const tickers = valid ? declared : DEFAULT_TICKERS;
  const benchmarks = ['SPY', 'QQQ'];
  const missing = priceRefreshTickers(snapshot, [...new Set([...tickers, ...benchmarks])], now);
  return { expectedSession: latestExpectedPriceSession(now), needed: missing.length > 0,
    missing, trackedCount: tickers.length, benchmarkCount: benchmarks.length };
}

function main(args = process.argv.slice(2), env = process.env) {
  const file = args[0] || path.resolve(__dirname, '..', 'public/data/dashboard-snapshot.json');
  let snapshot;
  try { snapshot = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    console.log(`Snapshot unavailable for retry preflight: ${error.message}. Rechecking the full tracked universe.`);
    snapshot = {};
  }
  const plan = planPriceRetry(snapshot, env.RETRY_NOW ? new Date(env.RETRY_NOW) : new Date());
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `needed=${plan.needed}\n`);
  console.log(`Price retry for NYSE session ${plan.expectedSession}: ${plan.missing.length}/${plan.trackedCount + plan.benchmarkCount} instruments need recovery${plan.missing.length ? ` (${plan.missing.join(', ')})` : ''}.`);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY,
    `## Price retry preflight\n\nExpected NYSE session: ${plan.expectedSession}. Missing or incomplete instruments: ${plan.missing.length}/${plan.trackedCount + plan.benchmarkCount} (${plan.trackedCount} companies and ${plan.benchmarkCount} benchmarks). ${plan.needed ? 'Only those tickers will be requested.' : 'Snapshot is current; no retry or deployment is needed.'}\n\n`);
  return plan;
}

if (require.main === module) main();
module.exports = { planPriceRetry, main };
