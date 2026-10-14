const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
// YAML is already supplied by the existing React build toolchain.
const YAML = require('yaml');
const { easternParts, latestExpectedPriceSession } = require('../server/us-market-calendar');
const load = name => YAML.parse(fs.readFileSync(path.join(__dirname, '..', '.github', name), 'utf8'));

test('pull requests and deployments use the same regression gate', () => {
  for (const [name, job] of [['pr-ci.yml', 'verify'], ['deploy-pages.yml', 'build']]) {
    const steps = load(`workflows/${name}`).jobs[job].steps;
    const gate = steps.findIndex(step => step.uses === './.github/actions/verify');
    const build = steps.findIndex(step => step.run === 'npm run build');
    assert.ok(gate >= 0 && build > gate);
    assert.ok(steps.some(step => step.run === 'npm run demo:check'));
  }
  assert.equal(load('workflows/deploy-pages.yml').jobs.deploy.needs, 'build');
  const shared = load('actions/verify/action.yml').runs.steps.map(step => step.run);
  assert.ok(shared.includes('npm run test:workflows'));
  assert.ok(shared.includes('npm run test:unit'));
  assert.ok(shared.includes('npm run test:api'));
});

test('production verification runs for manual snapshots as well as main pushes', () => {
  const workflow = load('workflows/deploy-pages.yml');
  assert.deepEqual(workflow.on.push.branches, ['main']);
  assert.ok(workflow.jobs.build.if.includes("github.ref == 'refs/heads/main'"));
  assert.ok(!workflow.jobs.build.if.includes('inputs.reason'));
  assert.ok(!workflow.jobs.build.if.includes('lighthouse'));
  assert.ok(workflow.on.push['paths-ignore'].includes('docs/**'));
});

test('weekly Lighthouse skips publication and snapshot audits do not skip verification', () => {
  const workflow = load('workflows/deploy-pages.yml');
  assert.ok(workflow.on.schedule.length);
  assert.ok(workflow.jobs.build.if.includes("github.event_name != 'schedule'"));
  assert.ok(workflow.jobs.lighthouse.if.includes("github.event_name == 'schedule'"));
  assert.ok(workflow.jobs.lighthouse.if.includes("needs.deploy.result == 'success'"));
  assert.ok(workflow.jobs.lighthouse.if.includes('always()'));
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
});

test('data refresh avoids frontend installs and uses safe bounded publishing', () => {
  const workflow = load('workflows/daily-snapshot.yml');
  const steps = workflow.jobs.refresh.steps;
  assert.ok(!steps.some(step => /npm ci/.test(step.run || '')));
  const publisher = steps.find(step => step.id === 'publish-snapshot');
  assert.ok(publisher.run.includes('node scripts/publish-snapshot.js'));
  assert.ok(publisher.env.SEC_USER_AGENT);
  assert.ok(publisher.env.SNAPSHOT_REFRESH_REPORT);
  assert.ok(publisher.if.includes('price-retry.outputs.needed'));
  assert.ok(publisher.env.SCHEDULE_SOURCES.includes("'prices'"));
  const preflight = steps.find(step => step.id === 'price-retry');
  assert.ok(preflight.run.includes('scripts/price-retry-plan.js'));
  assert.ok(preflight.if.includes('github.event.schedule'));
  const summary = steps.find(step => step.run?.includes('workflow-summary.js'));
  assert.equal(summary.if, "always() && steps.publish-snapshot.outcome != 'skipped'");
  assert.ok(summary.env.REFRESH_OUTCOME.includes('publish-snapshot.outcome'));
  assert.ok(summary.env.SNAPSHOT_REFRESH_REPORT);
  assert.ok(summary.env.RETRY_STAGE.includes("'final'"));
  const dispatch = steps.find(step => step.run?.includes('gh workflow run'));
  assert.ok(dispatch.if.includes("steps.publish-snapshot.outputs.changed == 'true'"));
  assert.ok(dispatch.run.includes('-f reason=snapshot'));
});

test('daily snapshot runs the next US morning after price feeds have settled', () => {
  const workflow = load('workflows/daily-snapshot.yml');
  assert.deepEqual(workflow.on.schedule.map(item => item.cron), ['17 12 * * *', '17 15 * * *', '17 18 * * *']);
  for (const [runAt, expectedHour, expectedSession] of [
    ['2026-10-14T12:17:00Z', '08', '2026-10-13'], // EDT
    ['2026-11-04T12:17:00Z', '07', '2026-11-03'], // EST
    ['2026-10-19T12:17:00Z', '08', '2026-10-16'], // Monday after weekend
  ]) {
    const at = new Date(runAt);
    assert.equal(easternParts(at).hour, expectedHour, runAt);
    assert.equal(latestExpectedPriceSession(at), expectedSession, runAt);
  }
});

test('dependency audit requires fresh build proof and remains blocking on policy failure', () => {
  const workflow = load('workflows/pr-ci.yml');
  assert.ok(workflow.on.schedule.length);
  const audit = workflow.jobs['dependency-audit'];
  assert.ok(!audit['continue-on-error']);
  assert.equal(audit.needs, 'verify');
  assert.equal(audit.if, 'always()');
  assert.ok(workflow.jobs.verify.steps.some(step => step.run === 'node scripts/dependency-exposure.js > dependency-exposure.json'));
  assert.ok(audit.steps.some(step => step.run === 'npm run security:audit -- dependency-exposure.json'));
  assert.ok(!audit.steps.some(step => step.run === 'npm ci'));
});

test('Supabase heartbeat always reports the actual check result', () => {
  const steps = load('workflows/supabase-health.yml').jobs.health.steps;
  const check = steps.find(step => step.run === 'npm run health:supabase');
  const summary = steps.find(step => step.run?.includes('workflow-summary.js'));
  assert.ok(check.id);
  assert.equal(summary.if, 'always()');
  assert.ok(summary.env.HEALTH_OUTCOME.includes(`${check.id}.outcome`));
});
