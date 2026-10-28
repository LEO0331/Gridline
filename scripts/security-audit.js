const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { exposureFingerprint } = require('./dependency-exposure');

const LEVELS = ['info', 'low', 'moderate', 'high', 'critical'];
const safe = value => String(value).replace(/[\r\n|<>]/g, ' ');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function evaluateAudit(audit, { policy, lock, exposure, fingerprint, now = new Date() } = {}) {
  const blocked = []; const accepted = []; const notices = [];
  const fail = message => { throw new Error(message); };
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(nowMs)) fail('Invalid audit time.');
  if (!audit || audit.error || audit.auditReportVersion !== 2 || !audit.vulnerabilities || typeof audit.vulnerabilities !== 'object' || Array.isArray(audit.vulnerabilities) || !audit.metadata?.vulnerabilities) fail('Registry audit failed or returned an unsupported report.');
  const entries = Object.entries(audit.vulnerabilities);
  const counts = audit.metadata.vulnerabilities;
  for (const level of [...LEVELS, 'total']) if (!Number.isInteger(counts[level]) || counts[level] < 0) fail('Audit vulnerability counts are invalid.');
  if (counts.total !== entries.length || LEVELS.some(level => counts[level] !== entries.filter(([, item]) => item.severity === level).length)) fail('Audit counts do not match reported findings.');
  for (const [name, item] of entries) {
    if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(name) || name.length > 214 || item.name !== name || !LEVELS.includes(item.severity) || !Array.isArray(item.via) || !item.via.length || !Array.isArray(item.nodes) || !item.nodes.length) fail('Audit finding metadata is incomplete.');
  }
  if (policy?.version !== 1 || !Array.isArray(policy.exceptions)) fail('Security exception policy is invalid.');
  const identities = new Set();
  for (const exception of policy.exceptions) {
    const start = Date.parse(exception.approvedAt); const end = Date.parse(exception.expiresAt);
    if (!/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(exception.advisory || '') || exception.url !== `https://github.com/advisories/${exception.advisory}` || exception.severity !== 'high' || !exception.reason || !exception.review || !exception.approvedBy || !exception.version || !exception.range || !exception.integrity || !Array.isArray(exception.nodes) || !exception.nodes.length || !Array.isArray(exception.cwe) || !exception.cwe.length || typeof exception.cvssVector !== 'string' || !exception.cvssVector.startsWith('CVSS:')) fail('Exception approval or exact matching metadata is missing.');
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > nowMs || end <= nowMs || end <= start || end - start > 30 * 86400000) fail(`Exception ${exception.advisory} is expired, future-dated or exceeds 30 days.`);
    if (identities.has(exception.advisory)) fail('Duplicate advisory exceptions are not allowed.');
    identities.add(exception.advisory);
  }
  const memo = new Map();
  const origins = (name, stack = new Set()) => {
    if (memo.has(name)) return memo.get(name);
    if (stack.has(name)) fail('Audit advisory graph contains a cycle.');
    const item = audit.vulnerabilities[name];
    if (!item) fail('Audit advisory graph refers to an unknown package.');
    const next = new Set([...stack, name]);
    const result = item.via.flatMap(via => {
      if (typeof via === 'string') return origins(via, next);
      if (!via || via.name !== name || via.dependency !== name || !LEVELS.includes(via.severity) || typeof via.url !== 'string' || typeof via.range !== 'string') fail('Originating advisory metadata is invalid.');
      return [{ package: name, advisory: via, finding: item }];
    });
    const unique = [...new Map(result.map(item => [JSON.stringify([item.package, item.advisory.url, item.advisory.range, item.advisory.severity, item.advisory.cwe, item.advisory.cvss?.vectorString]), item])).values()];
    memo.set(name, unique); return unique;
  };
  const proofValid = () => fingerprint && ['lockfileSha256', 'manifestSha256', 'sourceTreeSha256'].every(key => /^[a-f0-9]{64}$/.test(fingerprint[key] || '')) && exposure?.reportVersion === 1 && exposure.ok === true && Array.isArray(exposure.errors) && !exposure.errors.length && exposure.bundle?.javascriptFiles > 0 && exposure.bundle?.mappedSources > 0 && same(exposure.fingerprint, fingerprint) &&
    Number.isFinite(Date.parse(exposure.generatedAt)) && Date.parse(exposure.generatedAt) <= nowMs + 60000 && nowMs - Date.parse(exposure.generatedAt) <= 6 * 3600000;
  const matches = origin => {
    const exception = policy.exceptions.find(item => item.package === origin.package && item.url === origin.advisory.url && item.range === origin.advisory.range && item.severity === origin.advisory.severity && same(item.cwe, origin.advisory.cwe) && item.cvssVector === origin.advisory.cvss?.vectorString);
    if (!exception || !proofValid()) return false;
    const instances = Object.entries(lock?.packages || {}).filter(([node]) => node === `node_modules/${exception.package}` || node.endsWith(`/node_modules/${exception.package}`));
    if (!instances.length || !same(instances.map(([node]) => node).sort(), [...exception.nodes].sort()) || !same([...origin.finding.nodes].sort(), [...exception.nodes].sort()) || instances.some(([, item]) => item.version !== exception.version || item.integrity !== exception.integrity)) return false;
    const checked = exposure.packages?.find(item => item.name === exception.package);
    const toolRoots = ['react-scripts', '@testing-library/jest-dom', '@testing-library/react', '@testing-library/user-event'];
    return checked?.version === exception.version && checked.integrity === exception.integrity && Array.isArray(checked.instances) && same([...checked.instances].sort(), [...exception.nodes].sort()) && Array.isArray(checked.toolingPaths) && checked.toolingPaths.length > 0 && checked.toolingPaths.every(route => Array.isArray(route) && route.length > 1 && toolRoots.includes(route[0]) && route.at(-1) === exception.package);
  };
  for (const [name, finding] of entries) {
    const causes = origins(name);
    if (causes.some(origin => LEVELS.indexOf(origin.advisory.severity) > LEVELS.indexOf(finding.severity))) fail('Audit finding understates its originating advisory severity.');
    if (finding.severity === 'critical') { blocked.push({ package: name, reason: 'Critical findings cannot be excepted.' }); continue; }
    if (finding.severity !== 'high') { notices.push({ package: name, severity: finding.severity }); continue; }
    const blockingCauses = causes.filter(origin => ['high', 'critical'].includes(origin.advisory.severity));
    if (!blockingCauses.length || !blockingCauses.every(origin => origin.advisory.severity !== 'critical' && matches(origin))) {
      blocked.push({ package: name, reason: 'Unapproved high advisory, changed dependency identity, or missing/current exposure proof.' });
    } else accepted.push({ package: name, advisories: [...new Set(blockingCauses.map(origin => origin.advisory.url))] });
  }
  return { ok: blocked.length === 0, counts, blocked, accepted, notices, exceptions: policy.exceptions.map(({ advisory, expiresAt, reason }) => ({ advisory, expiresAt, reason })) };
}

function runRegistryAudit(execute = spawnSync) {
  const result = execute('npm audit --package-lock-only --include=dev --include=optional --include=peer --audit-level=high --json', { shell: true, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || ![0, 1].includes(result.status)) throw new Error('Registry audit request failed or timed out.');
  let report;
  try { report = JSON.parse(result.stdout); } catch { throw new Error('Registry audit returned invalid JSON.'); }
  if (report.error) throw new Error('Registry audit returned an error.');
  return report;
}

function main(args = process.argv.slice(2), env = process.env) {
  const root = path.resolve(__dirname, '..');
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  let summary;
  try {
    if (args.length !== 1) throw new Error('Usage: node scripts/security-audit.js <fresh-exposure-report.json>');
    const audit = runRegistryAudit();
    const result = evaluateAudit(audit, { policy: read('config/security-exceptions.json'), lock: read('package-lock.json'), exposure: read(args[0]), fingerprint: exposureFingerprint(root) });
    const verdict = !result.ok ? 'Blocked' : result.accepted.length ? 'Passed with temporary accepted risk' : 'Passed without exceptions';
    summary = `### Dependency security gate\n\nResult: **${verdict}**. Raw audit: ${result.counts.high} high, ${result.counts.critical} critical, ${result.counts.moderate} moderate affected entries.\n\n`;
    if (result.accepted.length) summary += `Accepted ${result.accepted.length} propagated entries under an exact advisory exception, verified against a fresh build and locked tooling-only paths. This is risk acceptance, not a vulnerability fix.\n\n${result.exceptions.map(item => `- ${safe(item.advisory)} expires ${safe(item.expiresAt)}. ${safe(item.reason)}`).join('\n')}\n\n`;
    if (result.blocked.length) summary += `Blocked findings:\n${result.blocked.map(item => `- ${safe(item.package)}: ${safe(item.reason)}`).join('\n')}\n`;
    if (result.notices.length) summary += `\n${result.notices.length} lower-severity entries remain reported by the raw audit.\n`;
    console.log(JSON.stringify(result, null, 2));
    if (result.accepted.length) console.log('::warning::Temporary braces risk acceptance is active; review the expiry and remediation report.');
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    summary = `### Dependency security gate\n\n**Blocked:** ${safe(error.message)}\n`;
    console.error(error.message); process.exitCode = 1;
  } finally {
    if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, summary);
  }
}
if (require.main === module) main();
module.exports = { evaluateAudit, runRegistryAudit };
