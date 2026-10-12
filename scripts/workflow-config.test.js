const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
// YAML is already supplied by the existing React build toolchain.
const YAML = require('yaml');
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
  const summary = steps.find(step => step.run?.includes('workflow-summary.js'));
  assert.equal(summary.if, 'always()');
  assert.ok(summary.env.REFRESH_OUTCOME.includes('publish-snapshot.outcome'));
  const dispatch = steps.find(step => step.run?.includes('gh workflow run'));
  assert.ok(dispatch.if.includes("steps.publish-snapshot.outputs.changed == 'true'"));
  assert.ok(dispatch.run.includes('-f reason=snapshot'));
});

test('dependency audit remains blocking and runs weekly without installing packages', () => {
  const workflow = load('workflows/pr-ci.yml');
  assert.ok(workflow.on.schedule.length);
  const audit = workflow.jobs['dependency-audit'];
  assert.ok(!audit['continue-on-error']);
  assert.ok(audit.steps.some(step => step.run === 'npm audit --package-lock-only --audit-level=high'));
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
