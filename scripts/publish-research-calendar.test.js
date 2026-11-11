const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { REGISTRY, publishCalendar, reviewKey } = require('./publish-research-calendar');

const proposal = require('../src/data/researchCatalysts.json').slice(0, 1);
const snapshotFile = 'public/data/dashboard-snapshot.json';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gridline-calendar-publish-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (cwd, ...args) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const local = path.join(root, 'local');
  const other = path.join(root, 'other');
  git(root, 'init', '--bare', 'remote.git');
  git(root, 'clone', 'remote.git', 'local');
  git(local, 'checkout', '-b', 'main');
  const write = (cwd, file, value) => {
    const target = path.join(cwd, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, value);
  };
  const identity = cwd => {
    git(cwd, 'config', 'user.name', 'Calendar Test');
    git(cwd, 'config', 'user.email', 'calendar@example.invalid');
  };
  identity(local);
  write(local, REGISTRY, '[]\n');
  write(local, snapshotFile, '{}\n');
  git(local, 'add', '--', REGISTRY, snapshotFile);
  git(local, 'commit', '-m', 'Initial data');
  git(local, 'push', 'origin', 'main');
  git(root, 'clone', '--branch', 'main', 'remote.git', 'other');
  identity(other);
  const advance = (file, value) => {
    write(other, file, value);
    git(other, 'add', '--', file);
    git(other, 'commit', '-m', 'Concurrent update');
    git(other, 'push', 'origin', 'main');
  };
  const base = git(local, 'rev-parse', 'HEAD');
  const remote = () => git(local, 'ls-remote', 'origin', 'refs/heads/main').split(/\s/)[0];
  return { local, git, base, remote, advance, write };
}

test('calendar publishes one owned file, and unchanged proposals avoid commits', t => {
  const { local, git, base, remote } = fixture(t);
  let gates = 0;
  const gate = () => { gates += 1; };
  const result = publishCalendar({ cwd: local, base, proposal, gate });
  assert.equal(result.changed, true);
  assert.equal(remote(), result.sha);
  assert.equal(git(local, 'diff-tree', '--no-commit-id', '--name-only', '-r', result.sha), REGISTRY);
  assert.equal(publishCalendar({ cwd: local, base: result.sha, proposal, gate }).changed, false);
  assert.equal(gates, 1);
});

test('calendar revalidates on a snapshot-only race and keeps the concurrent artifact', t => {
  const { local, git, base, advance, remote } = fixture(t);
  let gates = 0;
  const result = publishCalendar({ cwd: local, base, proposal, gate: () => {
    gates += 1;
    if (gates === 1) advance(snapshotFile, '{"updated":true}\n');
  } });
  assert.equal(gates, 2);
  assert.equal(remote(), result.sha);
  assert.equal(git(local, 'show', `HEAD:${snapshotFile}`), '{"updated":true}');
});

test('calendar refuses to replace a concurrent registry or local tracked edit', t => {
  const { local, base, advance, remote, write } = fixture(t);
  advance(REGISTRY, JSON.stringify(proposal) + '\n');
  const concurrent = remote();
  assert.throws(() => publishCalendar({ cwd: local, base, proposal, gate: () => assert.fail() }), /baseline changed/);
  assert.equal(remote(), concurrent);
  write(local, snapshotFile, '{"local":true}\n');
  assert.throws(() => publishCalendar({ cwd: local, base, proposal }), /clean main checkout/);
});

test('failed gates and denied pushes do not report publication', t => {
  const { local, base, remote, git } = fixture(t);
  assert.throws(() => publishCalendar({ cwd: local, base, proposal, gate: () => { throw new Error('gate failed'); } }), /gate failed/);
  assert.equal(remote(), base);
  git(local, 'restore', '--', REGISTRY);
  const execute = (command, args) => args[0] === 'push' ? { status: 1, stdout: '', stderr: 'permission denied' }
    : spawnSync(command, args, { cwd: local, encoding: 'utf8' });
  assert.throws(() => publishCalendar({ cwd: local, base, proposal, execute, gate: () => {} }), /permission denied/);
  assert.equal(remote(), base);
});

test('candidate review identity ignores scan timestamps and array ordering', () => {
  const first = { identity: 'a', reason: 'uncertain', checkedAt: '2026-11-11' };
  const second = { identity: 'b', reason: 'uncertain' };
  assert.equal(reviewKey([first, second]), reviewKey([second, { ...first, checkedAt: '2026-11-18' }]));
  assert.notEqual(reviewKey([first, second]), reviewKey([first, { ...second, reason: 'conflict' }]));
});
