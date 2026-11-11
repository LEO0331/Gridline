const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');

const REGISTRY = 'src/data/researchCatalysts.json';
const REVIEW_FILE = 'docs/calendar-candidate-review.md';
const SNAPSHOT_PATHS = new Set(['dashboard-snapshot.json', 'dashboard-overview.json', 'research-reports.json']
  .map(name => `public/data/${name}`));
const MAX_ATTEMPTS = 3;
const RACE = /non-fast-forward|fetch first|cannot lock ref|stale info/i;

function runner(cwd) {
  return (command, args, options = {}) => {
    const result = spawnSync(command, args, {
      cwd: options.cwd || cwd, env: options.env || process.env, encoding: 'utf8',
      stdio: options.inherit ? 'inherit' : 'pipe',
    });
    if (result.error) throw result.error;
    return { ...result, stdout: result.stdout || '', stderr: result.stderr || '' };
  };
}

function commands(execute) {
  const run = (command, args, options) => {
    const result = execute(command, args, options);
    if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
    return result.stdout.trim();
  };
  return { run, git: (...args) => run('git', args) };
}

const paths = value => value.split('\n').map(line => line.trim()).filter(Boolean);
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);

function assertRegistry(registry) {
  const { validateCatalysts } = require('../src/researchCalendarModel');
  const { rejected } = validateCatalysts(registry);
  if (rejected.length) throw new Error(`Calendar registry failed validation: ${JSON.stringify(rejected.slice(0, 10))}`);
}

function publishCalendar({
  cwd = path.resolve(__dirname, '..'), proposal, base, execute = runner(cwd),
  validate = assertRegistry, gate, env = process.env,
} = {}) {
  if (!sha(base)) throw new Error('Calendar publication requires the exact discovery revision.');
  const { git, run } = commands(execute);
  const tracked = () => git('status', '--porcelain', '--untracked-files=no');
  const assertOwned = (allowStaged = false) => {
    const staged = paths(git('diff', '--cached', '--no-renames', '--name-only', '--'));
    const unstaged = paths(git('diff', '--no-renames', '--name-only', '--'));
    if ((!allowStaged && staged.length) || [...staged, ...unstaged].some(file => file !== REGISTRY)) {
      throw new Error('Refusing calendar publication: tracked edits extend beyond calendar ownership.');
    }
  };
  if (git('branch', '--show-current') !== 'main' || tracked()) {
    throw new Error('Calendar publication requires a clean main checkout.');
  }
  const registryFile = path.join(cwd, REGISTRY);
  const original = JSON.parse(git('show', `${base}:${REGISTRY}`));
  validate(original);
  validate(proposal);
  const proposalText = `${JSON.stringify(proposal, null, 2)}\n`;
  const verify = gate || (() => {
    const build = fs.mkdtempSync(path.join(os.tmpdir(), 'gridline-calendar-build-'));
    try {
      const options = { inherit: true, env: { ...env, BUILD_PATH: build } };
      run('npm', ['run', 'verify'], options);
      run('npm', ['run', 'demo:check'], options);
    } finally {
      fs.rmSync(build, { recursive: true, force: true });
    }
  });
  let unpublishedBase = git('rev-parse', 'HEAD');
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    git('fetch', 'origin', 'main');
    const remote = git('rev-parse', 'origin/main');
    if (git('rev-parse', 'HEAD') !== unpublishedBase || tracked()) {
      throw new Error('Refusing calendar publication: local history or files changed.');
    }
    // A later snapshot-only commit can share this verified proposal. A new
    // registry or parser requires a fresh scan, so never apply stale evidence.
    if (remote !== base) {
      const ancestor = execute('git', ['merge-base', '--is-ancestor', base, remote]);
      if (ancestor.status !== 0 || paths(git('diff', '--no-renames', '--name-only', base, remote)).some(file => !SNAPSHOT_PATHS.has(file))) {
        throw new Error('Calendar discovery baseline changed outside snapshot artifacts. Rerun discovery against latest main.');
      }
    }
    git('merge', '--ff-only', 'origin/main');
    if (git('rev-parse', 'HEAD') !== remote) throw new Error('Refusing unpublished local commits.');
    unpublishedBase = remote;
    const current = readJson(registryFile);
    if (!isDeepStrictEqual(current, original)) throw new Error('Calendar registry changed after discovery.');
    if (isDeepStrictEqual(current, proposal)) return { changed: false, sha: remote };
    fs.writeFileSync(registryFile, proposalText);
    assertOwned();
    verify();
    assertOwned();
    if (fs.readFileSync(registryFile, 'utf8') !== proposalText || git('rev-parse', 'HEAD') !== remote) {
      throw new Error('Calendar proposal changed during validation.');
    }
    git('diff', '--check');
    git('fetch', 'origin', 'main');
    if (git('rev-parse', 'origin/main') !== remote) {
      git('restore', '--worktree', '--', REGISTRY);
      continue;
    }
    git('add', '--', REGISTRY);
    git('diff', '--cached', '--check');
    git('commit', '-m', 'Sync verified research calendar schedules');
    const commit = git('rev-parse', 'HEAD');
    const push = execute('git', ['push', 'origin', 'HEAD:refs/heads/main']);
    if (push.status === 0) return { changed: true, sha: commit };
    const failure = `${push.stderr}\n${push.stdout}`;
    if (!RACE.test(failure)) throw new Error(`Calendar push failed: ${failure}`);
    git('fetch', 'origin', 'main');
    if (git('rev-parse', 'origin/main') === remote) throw new Error(`Calendar push failed without a concurrent update: ${failure}`);
    if (git('rev-parse', 'HEAD') !== commit || git('rev-parse', 'HEAD^') !== remote ||
      !isDeepStrictEqual(paths(git('diff-tree', '--no-commit-id', '--name-only', '-r', commit)), [REGISTRY]) || tracked()) {
      throw new Error('Refusing retry: calendar commit ownership could not be verified.');
    }
    assertOwned();
    git('reset', '--soft', remote);
    git('restore', '--staged', '--worktree', '--', REGISTRY);
  }
  throw new Error('Calendar publication stopped after three concurrent-update attempts.');
}

function reviewKey(candidates) {
  const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().filter(key => !['checkedAt', 'verifiedAt', 'sourceCheckedAt'].includes(key))
      .map(key => [key, stable(value[key])])) : value;
  return createHash('sha256').update(JSON.stringify(candidates.map(candidate => JSON.stringify(stable(candidate))).sort()))
    .digest('hex').slice(0, 20);
}

function openCalendarReview({ cwd = path.resolve(__dirname, '..'), report, execute = runner(cwd), runUrl } = {}) {
  if (report?.schemaVersion !== 1 || !Array.isArray(report.candidates)) throw new Error('Invalid calendar review report.');
  if (!report.candidates.length) return { status: 'no-candidates' };
  const branch = `automation/calendar-review-${reviewKey(report.candidates)}`;
  const { git, run } = commands(execute);
  if (git('status', '--porcelain', '--untracked-files=no')) throw new Error('Calendar review requires a clean tracked checkout.');
  const prs = JSON.parse(run('gh', ['pr', 'list', '--base', 'main', '--head', branch, '--state', 'all', '--json', 'url']));
  if (prs.length) return { status: 'existing', url: prs[0].url };
  const ref = `refs/heads/${branch}`;
  if (!git('ls-remote', '--heads', 'origin', ref)) {
    git('fetch', 'origin', 'main');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gridline-calendar-review-'));
    try {
      git('worktree', 'add', '--detach', tmp, 'origin/main');
      const json = JSON.stringify(report.candidates.slice(0, 30), null, 2);
      const preview = json.length > 40_000 ? 'See the full structured review artifact from the workflow run.' : json.split('\n').map(line => `    ${line}`).join('\n');
      const note = [
        '# Calendar candidates requiring review', '',
        'This proposal contains evidence for human review. The bundled calendar registry is unchanged.', '',
        `Source check ${String(report.checkedAt || '').replace(/[^0-9TZ:+.\-]/g, '')}`, '',
        `${report.candidates.length} candidates. The workflow artifact contains the complete structured report.`, '',
        preview, '',
      ].join('\n');
      fs.mkdirSync(path.dirname(path.join(tmp, REVIEW_FILE)), { recursive: true });
      fs.writeFileSync(path.join(tmp, REVIEW_FILE), note);
      const gitInWorktree = (...args) => run('git', args, { cwd: tmp });
      gitInWorktree('add', '--', REVIEW_FILE);
      gitInWorktree('diff', '--cached', '--check');
      gitInWorktree('commit', '-m', 'Record calendar evidence requiring review');
      gitInWorktree('push', 'origin', `HEAD:${ref}`);
    } finally {
      // Remove only the temporary worktree created above. Leave dirty worktrees
      // in place for diagnostics if a commit could not be created.
      execute('git', ['worktree', 'remove', tmp]);
    }
  }
  const body = ['Review the official source evidence in the attached markdown and workflow artifact. The calendar registry is unchanged.',
    /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+$/.test(runUrl || '') ? runUrl : ''].filter(Boolean).join('\n\n');
  const url = run('gh', ['pr', 'create', '--base', 'main', '--head', branch, '--title', 'Review official calendar candidates', '--body', body]);
  return { status: 'created', url };
}

if (require.main === module) {
  try {
    const [mode, directory, base] = process.argv.slice(2);
    if (!directory || !['verified', 'review'].includes(mode)) throw new Error('Usage: publish-research-calendar.js verified|review <artifact-directory> [base-sha]');
    if (mode === 'review') {
      if (process.env.ENABLE_CALENDAR_REVIEW_PRS !== 'true') throw new Error('Calendar review PRs are not enabled.');
      const report = readJson(path.join(directory, 'review.json'));
      if (report.mode === 'dry-run') throw new Error('Dry-run results cannot create a pull request.');
      const result = openCalendarReview({ report, runUrl: process.env.CALENDAR_RUN_URL });
      console.log(`Calendar review: ${result.status}${result.url ? ` · ${result.url}` : ''}`);
    } else {
      if (process.env.ENABLE_CALENDAR_AUTO_PUBLISH !== 'true') throw new Error('Automatic calendar publication is not enabled.');
      const report = readJson(path.join(directory, 'review.json'));
      if (report.mode !== 'verified') throw new Error('Only verified-mode proposals may be published.');
      const result = publishCalendar({ proposal: readJson(path.join(directory, 'registry.json')), base });
      if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${result.changed}\npublished_sha=${result.sha}\n`);
      console.log(`Calendar registry ${result.changed ? 'pushed' : 'unchanged'} at ${result.sha}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { REGISTRY, publishCalendar, reviewKey, openCalendarReview };
