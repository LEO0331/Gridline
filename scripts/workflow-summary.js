const fs = require('node:fs');

const DAY = 24 * 60 * 60 * 1000;
const clean = (value) => String(value ?? '—').replace(/[\r\n|]/g, ' ').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const date = (value) => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : '—';
const hasDate = (value) => Number.isFinite(Date.parse(value));

function coverage(row = {}) {
  const checks = row.sourceChecks || [];
  const verified = checks.filter((item) => ['primary-verified', 'official-fallback-verified'].includes(item.coverage)).length;
  const retained = checks.filter((item) => item.coverage === 'retained-reviewed').length;
  const unavailable = checks.filter((item) => item.coverage === 'unavailable').length;
  if (checks.length) return `${verified} verified / ${retained} retained / ${unavailable} unavailable`;
  if (['ok', 'cached'].includes(row.status) && row.recordCount > 0) return 'verified';
  return hasDate(row.lastSuccessAt) ? 'retained (refresh incomplete)' : 'unavailable';
}

function snapshotSummary(snapshot, { now = new Date(), sources, refreshOutcome = 'success' } = {}) {
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(nowMs)) throw new Error('Summary time must be a valid date.');
  const annotations = [];
  const detailsLines = [];
  const selected = sources || Object.keys(snapshot.sourceHealth || {});
  const lines = ['## Dashboard refresh coverage', '', `Snapshot generated: ${date(snapshot.generatedAt)}. Refresh step: ${clean(refreshOutcome)}.`, '',
    'Verified means a successful source check; retained means previously reviewed data remains available. Partial coverage is expected for publisher restrictions and fields not separately reported.', '',
    '| Source | Status | Records | Checked (UTC) | Last success (UTC) |', '| --- | --- | ---: | --- | --- |'];
  if (refreshOutcome !== 'success') annotations.push('Dashboard refresh did not succeed; the summary may describe the previously published snapshot.');
  for (const source of selected) {
    const health = snapshot.sourceHealth?.[source];
    if (!health) {
      lines.push(`| ${clean(source)} | unavailable | 0 | — | — |`);
      annotations.push(`${source}: no source health is available.`);
      continue;
    }
    lines.push(`| ${clean(source)} | ${clean(health.status)} | ${Number(health.recordCount) || 0} | ${date(health.checkedAt)} | ${date(health.lastSuccessAt)} |`);
    if (!hasDate(health.lastSuccessAt) || nowMs - Date.parse(health.lastSuccessAt) > 3 * DAY) {
      annotations.push(`${source}: no successful refresh within 72 hours; inspect retained coverage and the source error logs.`);
    }
    if (source !== 'company-research' && health.recordCount === 0) annotations.push(`${source}: zero refreshed records; inspect the source logs before assuming coverage is current.`);
    const tickers = Object.entries(health.tickers || {});
    if (tickers.length) {
      detailsLines.push('', `### ${clean(source)} ticker coverage`, '', '| Ticker | Coverage | Last success (UTC) | Data period / missing fields |', '| --- | --- | --- | --- |');
      for (const [ticker, row] of tickers) {
        const fields = Object.entries(row.factCoverage || {});
        const periods = [...new Set(fields.filter(([, field]) => field.available).map(([, field]) => field.periodEnd).filter(Boolean))];
        const missing = fields.filter(([, field]) => !field.available).map(([name, field]) => `${name}: ${field.classification || 'unavailable'}`);
        const details = [row.latestSession && `session ${row.latestSession}`, periods.length && `periods ${periods.join(', ')}`, ...missing].filter(Boolean).join('; ') || '—';
        detailsLines.push(`| ${clean(ticker)} | ${clean(coverage(row))} | ${date(row.lastSuccessAt)} | ${clean(details)} |`);
        if (source === 'prices' && hasDate(row.latestSession) && nowMs - Date.parse(row.latestSession) > 7 * DAY) annotations.push(`${ticker}: latest price session is more than seven days old.`);
        const staleFields = fields.filter(([, field]) => field.classification === 'stale-data' || (field.available && hasDate(field.periodEnd) && nowMs - Date.parse(field.periodEnd) > 400 * DAY));
        if (staleFields.length) annotations.push(`${ticker}: stale financial fields (${staleFields.map(([name]) => name).join(', ')}); use the reported dates.`);
      }
    }
  }
  lines.push(...detailsLines);
  if (annotations.length) lines.push('', '### Attention', '', ...annotations.map((message) => `- ${clean(message)}`));
  return { markdown: `${lines.join('\n')}\n`, annotations };
}

function heartbeatSummary(outcome, now = new Date()) {
  const successful = outcome === 'success';
  return {
    markdown: `## Supabase database health\n\nCheck outcome: **${clean(outcome)}**. Checked at: ${new Date(now).toISOString()}.\n\n${successful ? 'Three database health RPC requests succeeded. This run is a successful heartbeat.' : 'No successful heartbeat is confirmed by this run. Inspect the failed check and manually run the workflow after resolving the issue.'}\n\nFor the last confirmed heartbeat, open the latest successful run of this workflow. Scheduled runs can be delayed or disabled by GitHub; monitor failures and prolonged gaps. No account records or credentials are included in this summary.\n`,
    annotations: successful ? [] : ['Supabase heartbeat did not succeed; inspect the failed check and the last successful workflow run.'],
  };
}

function writeReport(report, env = process.env) {
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, report.markdown);
  else process.stdout.write(report.markdown);
  for (const message of report.annotations) {
    console.log(`::warning::${message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`);
  }
}

function main(args = process.argv.slice(2), env = process.env) {
  const now = env.SUMMARY_NOW || new Date();
  if (args[0] === 'supabase') return writeReport(heartbeatSummary(env.HEALTH_OUTCOME || 'unknown', now), env);
  if (args[0] !== 'snapshot' || !args[1]) throw new Error('Usage: node scripts/workflow-summary.js snapshot <snapshot.json> [source,source] | supabase');
  const snapshot = JSON.parse(fs.readFileSync(args[1], 'utf8'));
  writeReport(snapshotSummary(snapshot, { now, sources: args[2]?.split(',').filter(Boolean), refreshOutcome: env.REFRESH_OUTCOME || 'success' }), env);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(`Workflow summary could not be produced: ${error.message}`); process.exitCode = 1; }
}

module.exports = { coverage, snapshotSummary, heartbeatSummary, writeReport, main };
