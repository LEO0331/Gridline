#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { evaluateDemoReadiness } = require('../server/demo-readiness');
const { runtimeSnapshotMatches } = require('../server/snapshot-artifacts');
const { validateArchiveAgainstSnapshot } = require('../server/research-report-archive');
const { MAX_ARCHIVE_BYTES } = require('../src/researchReportArchive');

const target = process.argv[2] || path.resolve(__dirname, '..', 'public', 'data', 'dashboard-snapshot.json');
let snapshot;
try {
  snapshot = JSON.parse(fs.readFileSync(target, 'utf8'));
} catch (error) {
  console.error(`Demo readiness: unable to read ${target}: ${error.message}`);
  process.exit(1);
}

const result = evaluateDemoReadiness(snapshot);
const runtimeFile = path.join(path.dirname(target), 'dashboard-overview.json');
let runtimeValid = false;
try {
  runtimeValid = runtimeSnapshotMatches(snapshot, JSON.parse(fs.readFileSync(runtimeFile, 'utf8')));
} catch { runtimeValid = false; }
const reviewFile = path.resolve(__dirname, '..', 'public', 'data', 'event-review.json');
let reviewValid = true;
if (fs.existsSync(reviewFile)) {
  try {
    const review = JSON.parse(fs.readFileSync(reviewFile, 'utf8'));
    const records = review.observations || [];
    reviewValid = Number.isFinite(Date.parse(review.checkedAt)) && /^\d{4}-\d{2}-\d{2}$/.test(review.coverageThrough) &&
      review.sourceHealth?.events?.checkedAt === review.checkedAt && review.sourceHealth.events.recordCount === records.length && records.every(item => {
        try { return item.source === 'events' && item.type === 'infrastructureEvent' && item.id && item.value?.publishedAt <= `${review.coverageThrough}T23:59:59Z` &&
          Number.isFinite(Date.parse(`${item.value?.dateText} UTC`)) && new Date(`${item.value.dateText} UTC`).toISOString().slice(0, 10) === item.value.publishedAt.slice(0, 10) &&
          new URL(item.value?.url).protocol === 'https:'; }
        catch { return false; }
      });
  } catch { reviewValid = false; }
}
const mark = item => item.ok ? 'PASS' : item.severity === 'warning' ? 'WARN' : 'FAIL';
const archiveFile = path.join(path.dirname(target), 'research-reports.json');
let archiveError = null;
try {
  if (fs.statSync(archiveFile).size > MAX_ARCHIVE_BYTES + 2) throw new Error('Research archive exceeds its file-size limit.');
  validateArchiveAgainstSnapshot(JSON.parse(fs.readFileSync(archiveFile, 'utf8')), snapshot);
} catch (error) { archiveError = error.message; }
const blockerCount = result.blockerCount + [reviewValid, runtimeValid, archiveError === null].filter(ok => !ok).length;
console.log(`Gridline demo readiness: ${blockerCount ? 'BLOCKED' : result.status.toUpperCase()}`);
for (const item of result.checks) {
  const detail = item.detail ? ` ${JSON.stringify(item.detail)}` : '';
  console.log(`${mark(item).padEnd(4)}  ${item.id.padEnd(28)} ${item.message}${detail}`);
}
console.log(`\nBlockers: ${blockerCount} | Warnings: ${result.warningCount}`);
console.log(`${reviewValid ? 'PASS' : 'FAIL'}  dated-event-review             Manual event review has dated scope and HTTPS primary URLs.`);
console.log(`${runtimeValid ? 'PASS' : 'FAIL'}  runtime-snapshot-match         Compact dashboard matches the full snapshot.`);
console.log(archiveError
  ? `FAIL  research-report-archive        ${archiveError}`
  : 'PASS  research-report-archive        Versioned research history is valid for the published snapshot.');
if (blockerCount) process.exit(1);
