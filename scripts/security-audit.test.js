const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateAudit, runRegistryAudit } = require('./security-audit');
const policy = require('../config/security-exceptions.json');
const identity = policy.exceptions[0];
const now = new Date('2026-10-12T12:00:00+08:00');
const fingerprint = { lockfileSha256: 'a'.repeat(64), manifestSha256: 'b'.repeat(64), sourceTreeSha256: 'c'.repeat(64) };
const copy = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const advisory = { name: 'braces', dependency: 'braces', url: identity.url, range: identity.range, severity: 'high', cwe: identity.cwe, cvss: { vectorString: identity.cvssVector } };
  const audit = { auditReportVersion: 2, vulnerabilities: {
    braces: { name: 'braces', severity: 'high', via: [advisory], nodes: identity.nodes },
    micromatch: { name: 'micromatch', severity: 'high', via: ['braces'], nodes: ['node_modules/micromatch'] },
  }, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 2, critical: 0, total: 2 } } };
  const options = { now, fingerprint, policy: copy(policy), lock: { packages: { 'node_modules/braces': { version: identity.version, integrity: identity.integrity } } }, exposure: { reportVersion: 1, generatedAt: now.toISOString(), ok: true, errors: [], fingerprint: copy(fingerprint), bundle: { javascriptFiles: 1, mappedSources: 1 }, packages: [{ name: 'braces', version: identity.version, integrity: identity.integrity, instances: identity.nodes, toolingPaths: [['react-scripts', 'micromatch', 'braces']] }] } };
  return { audit, options };
}
test('accepts only the approved origin and its propagated high entries with fresh proof', () => {
  const { audit, options } = fixture(); const result = evaluateAudit(audit, options);
  assert.equal(result.ok, true); assert.equal(result.accepted.length, 2); assert.equal(result.counts.high, 2);
});
test('expiry is enforced at the exact Taipei deadline and cannot exceed thirty days', () => {
  const { audit, options } = fixture();
  assert.throws(() => evaluateAudit(audit, { ...options, now: identity.expiresAt }), /expired/);
  options.policy.exceptions[0].expiresAt = '2026-11-12T00:00:00+08:00';
  assert.throws(() => evaluateAudit(audit, options), /exceeds 30 days/);
});
test('new advisories, changed severity, range or attack vector block', () => {
  for (const change of [item => { item.url += '-new'; }, item => { item.severity = 'critical'; }, item => { item.range = '<=4.0.0'; }, item => { item.cvss.vectorString = 'different'; }]) {
    const { audit, options } = fixture(); change(audit.vulnerabilities.braces.via[0]);
    if (audit.vulnerabilities.braces.via[0].severity === 'critical') assert.throws(() => evaluateAudit(audit, options), /understates/);
    else assert.equal(evaluateAudit(audit, options).ok, false);
  }
});
test('new unknown high packages and critical propagated entries always block', () => {
  const { audit, options } = fixture();
  audit.vulnerabilities.micromatch.via.push({ name: 'micromatch', dependency: 'micromatch', severity: 'high', url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc', range: '*' });
  assert.equal(evaluateAudit(audit, options).ok, false);
  audit.vulnerabilities.micromatch.severity = 'critical'; audit.metadata.vulnerabilities.high--; audit.metadata.vulnerabilities.critical++;
  assert.equal(evaluateAudit(audit, options).ok, false);
});
test('dependency version, integrity and extra nested instances cannot reuse acceptance', () => {
  for (const change of [options => { options.lock.packages['node_modules/braces'].version = '3.0.4'; }, options => { options.lock.packages['node_modules/braces'].integrity = 'different'; }, options => { options.lock.packages['node_modules/tool/node_modules/braces'] = options.lock.packages['node_modules/braces']; }]) {
    const { audit, options } = fixture(); change(options); assert.equal(evaluateAudit(audit, options).ok, false);
  }
});
test('missing, failed, stale or mismatched exposure proof blocks', () => {
  for (const change of [options => { options.exposure = null; }, options => { options.exposure.ok = false; }, options => { options.exposure.generatedAt = '2026-10-01'; }, options => { options.exposure.fingerprint.lockfileSha256 = 'other'; }, options => { options.exposure.fingerprint.sourceTreeSha256 = 'other'; }, options => { options.exposure.bundle.mappedSources = 0; }]) {
    const { audit, options } = fixture(); change(options); assert.equal(evaluateAudit(audit, options).ok, false);
  }
});
test('malformed audit counts, missing origins and cycles fail closed', () => {
  for (const change of [audit => { audit.error = {}; }, audit => { audit.metadata.vulnerabilities.high = 0; }, audit => { audit.vulnerabilities.micromatch.via = ['unknown']; }, audit => { audit.vulnerabilities.braces.via = ['micromatch']; }]) {
    const { audit, options } = fixture(); change(audit); assert.throws(() => evaluateAudit(audit, options));
  }
});
test('lower-severity findings stay reported without needing a high exception', () => {
  const { audit, options } = fixture();
  audit.vulnerabilities.formatter = { name: 'formatter', severity: 'moderate', via: [{ name: 'formatter', dependency: 'formatter', severity: 'moderate', url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc', range: '*' }], nodes: ['node_modules/formatter'] };
  audit.vulnerabilities.micromatch.via.push('formatter'); audit.metadata.vulnerabilities.moderate++; audit.metadata.vulnerabilities.total++;
  const result = evaluateAudit(audit, options); assert.equal(result.ok, true); assert.equal(result.notices.length, 1);
  assert.deepEqual(result.accepted[1].advisories, [identity.url]);
});
test('registry errors, timeouts, nonstandard exit codes and invalid JSON never pass', () => {
  for (const response of [{ status: 2, stdout: '{}' }, { status: 0, stdout: 'invalid' }, { status: 0, stdout: '{"error":{}}' }, { error: new Error('Timeout'), status: null, stdout: '' }]) {
    assert.throws(() => runRegistryAudit(() => response));
  }
});

test('a downgraded aggregate severity cannot hide high or critical originating advisories', () => {
  for (const severity of ['high', 'critical']) {
    const { audit, options } = fixture();
    audit.vulnerabilities.fake = { name: 'fake', severity: 'moderate', nodes: ['node_modules/fake'], via: [{ name: 'fake', dependency: 'fake', severity, url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc', range: '*' }] };
    audit.metadata.vulnerabilities.moderate++; audit.metadata.vulnerabilities.total++;
    assert.throws(() => evaluateAudit(audit, options), /understates/);
  }
});

test('duplicate advisory identities with different attack metadata cannot hide behind a matching entry', () => {
  const { audit, options } = fixture();
  const changed = copy(audit.vulnerabilities.braces.via[0]); changed.cvss.vectorString = 'different';
  audit.vulnerabilities.braces.via.unshift(changed);
  assert.equal(evaluateAudit(audit, options).ok, false);
});
