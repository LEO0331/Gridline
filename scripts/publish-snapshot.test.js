const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { publishSnapshot, SNAPSHOT_FILES } = require('./publish-snapshot');

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
  for (const file of SNAPSHOT_FILES) fs.writeFileSync(path.join(local, file), '{}\n');
  fs.writeFileSync(path.join(local, 'app.txt'), 'initial\n');
  run(local, ['add', '.']);
  run(local, ['commit', '-m', 'initial']);
  run(local, ['push', '-u', 'origin', 'main']);
  const other = path.join(root, 'other');
  run(root, ['clone', '--branch', 'main', remote, other]);
  run(other, ['config', 'user.email', 'test@example.invalid']);
  run(other, ['config', 'user.name', 'Concurrent test']);
  const advance = () => {
    fs.appendFileSync(path.join(other, 'app.txt'), 'concurrent\n');
    run(other, ['add', 'app.txt']);
    run(other, ['commit', '-m', 'concurrent code']);
    run(other, ['push', 'origin', 'main']);
  };
  const outputFile = path.join(root, 'output');
  let collections = 0;
  const collect = () => {
    collections += 1;
    for (const file of SNAPSHOT_FILES) fs.writeFileSync(path.join(local, file), JSON.stringify({ collection: collections }));
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

test('undoes only its snapshot commit after a rejected push and regenerates', t => {
  const f = fixture(t);
  let firstPush = true;
  const execute = (command, args) => {
    if (command === 'git' && args[0] === 'push' && firstPush) {
      firstPush = false;
      f.advance();
    }
    const result = spawnSync(command, args, { cwd: f.local, encoding: 'utf8' });
    return result;
  };
  const result = publishSnapshot({ cwd: f.local, outputFile: f.outputFile, execute, collect: f.collect, validate() {} });
  assert.equal(f.count(), 2);
  assert.equal(f.run(f.local, ['rev-list', '--count', 'HEAD']), '3');
  assert.equal(f.run(f.remote, ['rev-parse', 'main']), result.sha);
  assert.match(f.run(f.local, ['log', '-1', '--format=%B']), /Scope-risk: narrow/);
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
});

test('does not commit or publish failed validation', t => {
  const f = fixture(t);
  assert.throws(() => publishSnapshot({ cwd: f.local, outputFile: f.outputFile, collect: f.collect, validate() { throw new Error('invalid snapshot'); } }), /invalid snapshot/);
  assert.equal(f.run(f.local, ['rev-list', '--count', 'HEAD']), '1');
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
  assert.throws(() => publishSnapshot({ cwd: f.local, outputFile: f.outputFile, collect() { fs.writeFileSync(path.join(f.local, 'app.txt'), 'oops'); } }), /beyond the two snapshot/);
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

test('refuses pre-existing unpublished local commits', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.local, 'app.txt'), 'local unpublished');
  f.run(f.local, ['add', 'app.txt']);
  f.run(f.local, ['commit', '-m', 'user commit']);
  assert.throws(() => publishSnapshot({ cwd: f.local, outputFile: f.outputFile, collect: f.collect }), /pre-existing local commits/);
  assert.equal(f.count(), 0);
  assert.equal(f.run(f.local, ['rev-list', '--count', 'HEAD']), '2');
});
