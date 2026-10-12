#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SNAPSHOT_FILES = ['public/data/dashboard-snapshot.json', 'public/data/dashboard-overview.json'];

function publishSnapshot(options = {}) {
  const cwd = options.cwd || path.resolve(__dirname, '..');
  const execute = options.execute || ((command, args) => {
    const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: process.env });
    if (result.error) throw result.error;
    return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
  });
  const run = (command, args) => {
    const result = execute(command, args);
    if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
    return result.stdout.trim();
  };
  const git = (...args) => run('git', args);
  const changes = () => git('status', '--porcelain', '--untracked-files=no');
  const assertOwnedChanges = () => {
    const entries = git('diff', '--name-only', 'HEAD', '--').split('\n').filter(Boolean);
    // JSON paths have no whitespace or rename ambiguity. Reject every other tracked edit.
    if (entries.some(entry => !SNAPSHOT_FILES.includes(entry))) {
      throw new Error('Refusing to publish: tracked changes extend beyond the two snapshot files.');
    }
  };
  const discardGenerated = () => {
    assertOwnedChanges();
    git('restore', '--staged', '--worktree', '--', ...SNAPSHOT_FILES);
  };
  const output = result => {
    const outputFile = options.outputFile === undefined ? process.env.GITHUB_OUTPUT : options.outputFile;
    if (outputFile) fs.appendFileSync(outputFile, `changed=${result.changed}\npublished_sha=${result.sha}\n`);
    return result;
  };

  if (changes()) throw new Error('Refusing to publish from a checkout with tracked changes.');
  if (git('branch', '--show-current') !== 'main') throw new Error('Snapshot publishing requires the main branch.');
  git('fetch', 'origin', 'main');
  // Fast-forward is safe; any local unpublished commit or divergent history must be reviewed.
  git('merge', '--ff-only', 'origin/main');
  if (git('rev-parse', 'HEAD') !== git('rev-parse', 'origin/main')) {
    throw new Error('Refusing to publish pre-existing local commits.');
  }

  const collect = options.collect || (() => run(process.execPath, ['server/export-static-snapshot.js']));
  const validate = options.validate || (() => run(process.execPath, ['scripts/verify-demo-snapshot.js']));
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const base = git('rev-parse', 'HEAD');
    collect();
    assertOwnedChanges();
    validate();
    assertOwnedChanges();
    git('fetch', 'origin', 'main');
    if (git('rev-parse', 'origin/main') !== base) {
      discardGenerated();
      git('merge', '--ff-only', 'origin/main');
      continue;
    }
    if (!changes()) return output({ changed: false, sha: base });
    git('add', '--', ...SNAPSHOT_FILES);
    git('commit', '-m', 'Keep dashboard evidence current after source refresh', '-m',
      'Publish validated source observations against the latest main snapshot.\n\nConfidence: high\nScope-risk: narrow\nDirective: Regenerate after concurrent main changes; never force-push snapshots\nTested: Snapshot readiness and runtime consistency');
    const commit = git('rev-parse', 'HEAD');
    const push = execute('git', ['push', 'origin', 'HEAD:main']);
    if (push.status === 0) return output({ changed: true, sha: commit });
    const failure = `${push.stderr || ''}\n${push.stdout || ''}`;
    if (!/non-fast-forward|fetch first/i.test(failure)) throw new Error(`Snapshot push failed: ${failure}`);
    git('fetch', 'origin', 'main');
    if (git('rev-parse', 'origin/main') === base) throw new Error(`Snapshot push failed without a concurrent update: ${failure}`);
    if (git('rev-parse', 'HEAD') !== commit || git('rev-parse', 'HEAD^') !== base) {
      throw new Error('Refusing retry: local commit changed during publication.');
    }
    const committedFiles = git('diff-tree', '--no-commit-id', '--name-only', '-r', commit).split('\n').filter(Boolean);
    if (!committedFiles.length || committedFiles.some(file => !SNAPSHOT_FILES.includes(file))) {
      throw new Error('Refusing retry: unpublished commit includes files outside snapshot ownership.');
    }
    assertOwnedChanges();
    // Undo only our verified commit. Never reset hard or discard unrelated files.
    git('reset', '--soft', base);
    discardGenerated();
    git('merge', '--ff-only', 'origin/main');
  }
  throw new Error('Snapshot publication stopped after three concurrent-update attempts.');
}

if (require.main === module) {
  try {
    const result = publishSnapshot();
    console.log(`Snapshot ${result.changed ? 'published' : 'unchanged'} at ${result.sha}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { publishSnapshot, SNAPSHOT_FILES };
