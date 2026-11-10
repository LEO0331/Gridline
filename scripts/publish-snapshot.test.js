const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { publishSnapshot, SNAPSHOT_FILES, ARCHIVE_FILE } = require('./publish-snapshot');
const { updateResearchArchive } = require('../server/research-report-archive');

const emptyArchive = { schemaVersion: 1, trimmedEditions: 0, editions: [] };
const snapshotFor = (day, value = 100) => ({
  generatedAt: `${day}T22:00:00.000Z`,
  trackedTickers: ['NBIS'],
  observations: [{
    id: `nbis-${day}`, source: 'prices', type: 'close', ticker: 'NBIS', value,
    observedAt: `${day}T00:00:00.000Z`, retrievedAt: `${day}T21:30:00.000Z`,
    providerName: 'Fixture', sourceUrl: 'https://example.com/prices',
  }],
});
const readArtifact = (cwd, file) => JSON.parse(fs.readFileSync(path.join(cwd, file), 'utf8'));
const writeArtifact = (cwd, file, value) => fs.writeFileSync(path.join(cwd, file), `${JSON.stringify(value)}\n`);
const writeSnapshot = (cwd, snapshot) => SNAPSHOT_FILES.forEach(file => writeArtifact(cwd, file, snapshot));

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gridline-publish-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const run = (cwd, args) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const remote = path.join(root, 'remote.git');
  run(root, ['init', '--bare', remote]);
  const local = path.join(root, 'local');
  run(root, ['clone', remote, local]);
  run(local, ['checkout', '-b', 'main']);
  run(local, ['config', 'user.email', 'test@example.invalid']);
  run(local, ['config', 'user.name', 'Snapshot test']);
  fs.mkdirSync(path.join(local, 'public', 'data'), { recursive: true });
  writeSnapshot(local, snapshotFor('2026-11-09'));
  writeArtifact(local, ARCHIVE_FILE, emptyArchive);
  fs.writeFileSync(path.join(local, 'app.txt'), 'initial\n');
  run(local, ['add', '.']);
  run(local, ['commit', '-m', 'initial']);
  run(local, ['push', '-u', 'origin', 'main']);
  const other = path.join(root, 'other');
  run(root, ['clone', '--branch', 'main', remote, other]);
  run(other, ['config', 'user.email', 'test@example.invalid']);
  run(other, ['config', 'user.name', 'Concurrent test']);
  const advance = ({ session, archive } = {}) => {
    const paths = ['app.txt'];
    fs.appendFileSync(path.join(other, 'app.txt'), 'concurrent\n');
    if (session) {
      const next = snapshotFor(session);
      const previous = readArtifact(other, SNAPSHOT_FILES[0]);
      const baseline = readArtifact(other, ARCHIVE_FILE);
      writeArtifact(other, ARCHIVE_FILE, updateResearchArchive(baseline, next, previous));
      writeSnapshot(other, next);
      paths.push(...SNAPSHOT_FILES, ARCHIVE_FILE);
    }
    if (archive !== undefined) {
      writeArtifact(other, ARCHIVE_FILE, archive);
      paths.push(ARCHIVE_FILE);
    }
    run(other, ['add', ...paths]);
    run(other, ['commit', '-m', 'concurrent code']);
    run(other, ['push', 'origin', 'main']);
  };
  const outputFile = path.join(root, 'output');
  let collections = 0;
  const collect = () => {
    collections += 1;
    writeSnapshot(local, snapshotFor(`2026-11-${9 + collections}`, 100 + collections));
  };
  return { root, local, other, remote, run, advance, collect, outputFile, count: () => collections };
}

test('regenerates against concurrent main updates before committing', t => {
  const f = fixture(t);
  const result = publishSnapshot({ cwd: f.local, outputFile: f.outputFile, validate() {}, collect() {
    f.collect();
    if (f.count() === 1) f.advance();
  } });
  assert.equal(f.count(), 2);
  assert.equal(result.changed, true);
  assert.match(fs.readFileSync(path.join(f.local, 'app.txt'), 'utf8'), /concurrent/);
  assert.equal(f.run(f.remote, ['rev-parse', 'main']), result.sha);
  assert.match(fs.readFileSync(f.outputFile, 'utf8'), /changed=true\npublished_sha=/);
});

test('publishes the first genuine report and both snapshot artifacts in one commit', t => {
  const f = fixture(t);
  const result = publishSnapshot({ cwd: f.local, outputFile: f.outputFile, collect: f.collect, validate() {} });
  const files = f.run(f.remote, ['diff-tree', '--no-commit-id', '--name-only', '-r', result.sha]).split('\n');
  const archived = JSON.parse(f.run(f.remote, ['show', `main:${ARCHIVE_FILE}`]));
  assert.deepEqual(files.sort(), [...SNAPSHOT_FILES, ARCHIVE_FILE].sort());
  assert.equal(archived.editions.length, 1);
  assert.equal(archived.editions[0].session, '2026-11-10');
  assert.equal(archived.editions[0].generatedAt, readArtifact(f.local, SNAPSHOT_FILES[0]).generatedAt);
});

test('undoes only its snapshot commit after a rejected push and regenerates', t => {
  const f = fixture(t);
  let firstPush = true;
  const execute = (command, args) => {
    if (command === 'git' && args[0] === 'push' && firstPush) {
      firstPush = false;
      f.advance({ session: '2026-11-10' });
    }
    const result = spawnSync(command, args, { cwd: f.local, encoding: 'utf8' });
    return result;
  };
  const result = publishSnapshot({ cwd: f.local, outputFile: f.outputFile, execute, collect: f.collect, validate() {} });
  assert.equal(f.count(), 2);
  assert.equal(f.run(f.local, ['rev-list', '--count', 'HEAD']), '3');
  assert.equal(f.run(f.remote, ['rev-parse', 'main']), result.sha);
  assert.match(f.run(f.local, ['log', '-1', '--format=%B']), /Scope-risk: narrow/);
  const archived = JSON.parse(f.run(f.remote, ['show', `main:${ARCHIVE_FILE}`]));
  const prior = readArtifact(f.other, ARCHIVE_FILE).editions[0];
  assert.equal(archived.editions.length, 2);
  assert.deepEqual(archived.editions.find(edition => edition.session === prior.session), prior);
  assert.equal(archived.editions.find(edition => edition.session === '2026-11-11').generatedAt, '2026-11-11T22:00:00.000Z');
});

test('stops on permission failures without reporting publication', t => {
  const f = fixture(t);
  const original = f.run(f.remote, ['rev-parse', 'main']);
  const execute = (command, args) => args[0] === 'push'
    ? { status: 1, stdout: '', stderr: 'Permission denied' }
    : spawnSync(command, args, { cwd: f.local, encoding: 'utf8' });
  assert.throws(() => publishSnapshot({ cwd: f.local, outputFile: f.outputFile, execute, collect: f.collect, validate() {} }), /Permission denied/);
  assert.equal(f.count(), 1);
  assert.equal(f.run(f.remote, ['rev-parse', 'main']), original);
  assert.deepEqual(JSON.parse(f.run(f.remote, ['show', `main:${ARCHIVE_FILE}`])), emptyArchive);
  assert.equal(fs.existsSync(f.outputFile), false);
});

test('reports unchanged only after validation', t => {
  const f = fixture(t);
  let validated = false;
  const result = publishSnapshot({ cwd: f.local, outputFile: f.outputFile, collect() {}, validate() { validated = true; } });
  assert.equal(validated, true);
  assert.equal(result.changed, false);
  assert.match(fs.readFileSync(f.outputFile, 'utf8'), /changed=false/);
  assert.equal(f.run(f.local, ['rev-list', '--count', 'HEAD']), '1');
  assert.deepEqual(readArtifact(f.local, ARCHIVE_FILE), emptyArchive);
});

test('does not commit or publish failed validation', t => {
  const f = fixture(t);
  f.advance({ session: '2026-11-10' });
  const remoteHead = f.run(f.remote, ['rev-parse', 'main']);
  const baseline = readArtifact(f.other, ARCHIVE_FILE);
  assert.throws(() => publishSnapshot({ cwd: f.local, outputFile: f.outputFile, collect: f.collect, validate() { throw new Error('invalid snapshot'); } }), /invalid snapshot/);
  assert.equal(f.run(f.local, ['rev-parse', 'HEAD']), remoteHead);
  assert.equal(f.run(f.remote, ['rev-parse', 'main']), remoteHead);
  assert.deepEqual(readArtifact(f.local, ARCHIVE_FILE), baseline);
  assert.equal(fs.existsSync(f.outputFile), false);
});

test('rejects unrelated tracked edits before collection', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.local, 'app.txt'), 'user change');
  assert.throws(() => publishSnapshot({ cwd: f.local, outputFile: f.outputFile, collect: f.collect }), /tracked changes/);
  assert.equal(f.count(), 0);
});

test('rejects generators that change files outside snapshot ownership', t => {
  const f = fixture(t);
  assert.throws(() => publishSnapshot({ cwd: f.local, outputFile: f.outputFile, collect() { fs.writeFileSync(path.join(f.local, 'app.txt'), 'oops'); } }), /beyond artifact ownership/);
  assert.equal(f.run(f.local, ['rev-list', '--count', 'HEAD']), '1');
});

test('bounds retries and leaves a clean latest-main checkout', t => {
  const f = fixture(t);
  assert.throws(() => publishSnapshot({ cwd: f.local, outputFile: f.outputFile, collect() {
    f.collect();
    f.advance();
  }, validate() {} }), /three concurrent-update attempts/);
  assert.equal(f.count(), 3);
  assert.equal(f.run(f.local, ['status', '--porcelain']), '');
  assert.equal(f.run(f.local, ['rev-parse', 'HEAD']), f.run(f.remote, ['rev-parse', 'main']));
  assert.equal(fs.existsSync(f.outputFile), false);
});

test('rejects a collector that writes the archive before candidate validation', t => {
  const f = fixture(t);
  let validated = false;
  assert.throws(() => publishSnapshot({ cwd: f.local, outputFile: f.outputFile, collect() {
    f.collect();
    writeArtifact(f.local, ARCHIVE_FILE, { ...emptyArchive, trimmedEditions: 1 });
  }, validate() { validated = true; } }), /beyond artifact ownership/);
  assert.equal(validated, false);
  assert.deepEqual(JSON.parse(f.run(f.remote, ['show', `main:${ARCHIVE_FILE}`])), emptyArchive);
});

test('fails closed on a corrupt committed archive after advancing to a concurrent baseline', t => {
  const f = fixture(t);
  let remoteHead;
  assert.throws(() => publishSnapshot({ cwd: f.local, outputFile: f.outputFile, collect() {
    f.collect();
    f.advance({ archive: { schemaVersion: 999, editions: [] } });
    remoteHead = f.run(f.remote, ['rev-parse', 'main']);
  }, validate() {} }), /archive|schema/i);
  assert.equal(f.count(), 1);
  assert.equal(f.run(f.remote, ['rev-parse', 'main']), remoteHead);
  assert.equal(f.run(f.local, ['status', '--porcelain']), '');
  assert.equal(fs.existsSync(f.outputFile), false);
});

test('public demo verification rejects malformed or incompatible history alongside otherwise valid artifacts', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gridline-archive-gate-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const file of SNAPSHOT_FILES) fs.copyFileSync(path.resolve(__dirname, '..', file), path.join(dir, path.basename(file)));
  const target = path.join(dir, 'dashboard-snapshot.json');
  const archiveFile = path.join(dir, 'research-reports.json');
  const verify = () => spawnSync(process.execPath, [path.resolve(__dirname, 'verify-demo-snapshot.js'), target], { encoding: 'utf8' });
  fs.writeFileSync(archiveFile, JSON.stringify(emptyArchive));
  const valid = verify();
  assert.equal(valid.status, 0, valid.stdout || valid.stderr);
  assert.match(valid.stdout, /PASS\s+research-report-archive/);
  for (const bad of ['{broken', JSON.stringify({ ...emptyArchive, schemaVersion: 999 })]) {
    fs.writeFileSync(archiveFile, bad);
    const invalid = verify();
    assert.equal(invalid.status, 1, invalid.stdout || invalid.stderr);
    assert.match(invalid.stdout, /FAIL\s+research-report-archive/);
    assert.match(invalid.stdout, /PASS\s+runtime-snapshot-match/);
  }
});

test('refuses pre-existing unpublished local commits', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.local, 'app.txt'), 'local unpublished');
  f.run(f.local, ['add', 'app.txt']);
  f.run(f.local, ['commit', '-m', 'user commit']);
  assert.throws(() => publishSnapshot({ cwd: f.local, outputFile: f.outputFile, collect: f.collect }), /pre-existing local commits/);
  assert.equal(f.count(), 0);
  assert.equal(f.run(f.local, ['rev-list', '--count', 'HEAD']), '2');
});
