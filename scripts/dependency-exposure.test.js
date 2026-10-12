const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifyExposure, exposureFingerprint } = require('./dependency-exposure');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gridline-exposure-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), typeof content === 'string' ? content : JSON.stringify(content));
  };
  write('package.json', { dependencies: { 'react-scripts': '5.0.1' } });
  write('package-lock.json', { lockfileVersion: 2, packages: {
    '': { dependencies: { 'react-scripts': '5.0.1' } },
    'node_modules/react-scripts': { dependencies: { braces: '3.0.3', 'sprintf-js': '1.0.3' } },
    'node_modules/braces': { version: '3.0.3', integrity: 'sha512-example' },
    'node_modules/sprintf-js': { version: '1.0.3', integrity: 'sha512-example-format' }
  } });
  write('src/index.js', "import React from 'react';");
  write('server/index.js', "const http = require('node:http');");
  write('build/static/js/main.js', 'console.log(1);\n//# sourceMappingURL=main.js.map');
  write('build/static/js/main.js.map', { version: 3, sources: ['webpack:///src/index.js'], sourcesContent: ["import React from 'react';"], mappings: 'AAAA' });
  return { root, write, check: () => verifyExposure({ root }) };
}

test('classifies tooling-only packages and fingerprints evidence', t => {
  const { root, check, write } = fixture(t);
  const result = check();
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.reportVersion, 1);
  assert.equal(result.bundle.javascriptFiles, 1);
  assert.deepEqual(result.packages[0].toolingPaths, [['react-scripts', 'braces']]);
  assert.match(result.fingerprint.lockfileSha256, /^[a-f0-9]{64}$/);
  write('server/index.js', '// a source change');
  assert.notEqual(exposureFingerprint(root).sourceTreeSha256, result.fingerprint.sourceTreeSha256);
});

test('fails closed on missing or incomplete production source maps', t => {
  const { root, write, check } = fixture(t);
  fs.unlinkSync(path.join(root, 'build/static/js/main.js.map'));
  assert.equal(check().ok, false);
  write('build/static/js/main.js.map', { version: 3, sources: ['src/index.js'], sourcesContent: [null] });
  assert.ok(check().errors.some(error => error.includes('missing mapped source content')));
});

test('rejects vulnerable package paths in mapped browser sources', t => {
  const { write, check } = fixture(t);
  write('build/static/js/main.js.map', { version: 3, sources: ['webpack:///./node_modules/braces/index.js'], sourcesContent: ['module.exports = {};'] });
  assert.ok(check().errors.some(error => error.includes('Vulnerable package present')));
});

test('rejects vulnerable imports inside source content even if source path hides package', t => {
  const { write, check } = fixture(t);
  write('build/static/js/main.js.map', { version: 3, sources: ['webpack:///src/index.js'], sourcesContent: ["const format = require('sprintf-js');"] });
  assert.equal(check().ok, false);
});

test('rejects direct application and adapter imports while distinguishing tests', t => {
  const { write, check } = fixture(t);
  write('src/example.test.js', "require('braces');");
  assert.equal(check().ok, true);
  write('server/adapter.js', "const parse = require('braces/lib/parse');");
  assert.ok(check().errors.some(error => error.includes('Vulnerable direct runtime import')));
});

test('rejects computed runtime imports', t => {
  const { write, check } = fixture(t);
  write('server/adapter.js', 'const parse = require(packageName);');
  assert.ok(check().errors.some(error => error.includes('Opaque runtime import')));
});

test('rejects runtime dependency graph routes and unclassified locked instances', t => {
  const { write, check } = fixture(t);
  write('package.json', { dependencies: { app: '1.0.0' } });
  write('package-lock.json', { packages: { '': {}, 'node_modules/app': { dependencies: { braces: '3.0.3' } }, 'node_modules/braces': { version: '3.0.3', integrity: 'sha512-example' }, 'node_modules/orphan/node_modules/sprintf-js': { version: '1.0.3', integrity: 'sha512-example-format' } } });
  const result = check();
  assert.ok(result.errors.some(error => error.includes('Application dependency reaches braces')));
  assert.ok(result.errors.some(error => error.includes('Unclassified locked instance')));
});

test('rejects differing affected instance versions or integrity', t => {
  const { root, write, check } = fixture(t);
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
  lock.packages['node_modules/react-scripts/node_modules/braces'] = { version: '3.0.2', integrity: 'sha512-other' };
  write('package-lock.json', lock);
  assert.ok(check().errors.some(error => error.includes('Inconsistent locked versions/integrity')));
});
