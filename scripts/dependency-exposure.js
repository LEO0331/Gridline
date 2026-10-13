#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isBuiltin } = require('node:module');

const PACKAGES = ['braces', 'sprintf-js'];
const TOOL_ROOTS = new Set(['react-scripts', '@testing-library/jest-dom', '@testing-library/react', '@testing-library/user-event']);
const TOOL_FILES = new Set(['scripts/start.js', 'scripts/dev.js', 'scripts/dev-server-config.js', 'scripts/dependency-exposure.js', 'scripts/security-audit.js']);
const LIMITATIONS = ['Source-map and literal-import checks are evidence for this build, not a proof against deliberately obfuscated code.', 'Build and test tooling still processes repository-controlled patterns and format strings; untrusted pull requests remain a CI denial-of-service risk.', 'This verifier does not patch installed packages or accept new advisories.'];
const vulnerableSpecifier = value => /^(?:braces|sprintf-js)(?:\/|$)/.test(value);
const sourcePackage = value => /(?:^|[\\/])node_modules[\\/](?:braces|sprintf-js)(?:[\\/]|$)/.test(value);

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}

function importedSpecifiers(text) {
  const values = [];
  // Scan literals conservatively, including commented imports: a false positive fails closed.
  for (const pattern of [/\b(?:require|import)\s*\(\s*(['"])([^'"\r\n]+)\1/g, /\b(?:import|export)\s+(?:[^;\r\n]*?\s+from\s*)?(['"])([^'"\r\n]+)\1/g,
    /\b(?:import|export)\s+(?:\{[^}]*\}|\*(?:\s+as\s+[\w$]+)?|[\w$]+(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+[\w$]+))?)\s+from\s*(['"])([^'"\r\n]+)\1/g]) {
    for (const match of text.matchAll(pattern)) values.push(match[2]);
  }
  return [...new Set(values)];
}

function exposureFingerprint(root = path.resolve(__dirname, '..')) {
  const digest = value => crypto.createHash('sha256').update(value).digest('hex');
  const sourceFiles = ['src', 'server', 'scripts'].flatMap(directory => filesUnder(path.join(root, directory)))
    .filter(file => /\.(?:js|jsx|mjs|cjs)$/.test(file)).sort();
  const hash = crypto.createHash('sha256');
  for (const file of sourceFiles) {
    hash.update(path.relative(root, file).replace(/\\/g, '/')); hash.update('\0');
    hash.update(fs.readFileSync(file)); hash.update('\0');
  }
  return { lockfileSha256: digest(fs.readFileSync(path.join(root, 'package-lock.json'))), manifestSha256: digest(fs.readFileSync(path.join(root, 'package.json'))), sourceTreeSha256: hash.digest('hex') };
}

function resolvePackage(packages, importer, name) {
  let base = importer;
  while (true) {
    const candidate = `${base ? `${base}/` : ''}node_modules/${name}`;
    if (packages[candidate]) return candidate;
    if (!base) return null;
    const index = base.lastIndexOf('/node_modules/');
    base = index >= 0 ? base.slice(0, index) : '';
  }
}

function packageEvidence(lock, manifest, errors, runtimeImports = []) {
  const packages = lock.packages;
  if (!packages || !packages['']) { errors.push('Lockfile must contain the complete packages graph.'); return []; }
  const roots = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies }).map(name => ({ name, runtimeFile: null }));
  roots.push(...[...new Map(runtimeImports.map(item => [item.name, item])).values()].map(item => ({ name: item.name, runtimeFile: item.file })));
  const routes = new Map();
  for (const { name: rootName, runtimeFile } of roots) {
    const first = resolvePackage(packages, '', rootName);
    if (!first) { errors.push(runtimeFile ? `Unresolved runtime import: ${runtimeFile}: ${rootName}` : `Unresolved root dependency: ${rootName}`); continue; }
    const queue = [[first, [rootName]]];
    const seen = new Set();
    while (queue.length) {
      const [location, route] = queue.shift();
      if (seen.has(location)) continue;
      seen.add(location);
      const name = location.split('node_modules/').pop();
      if (PACKAGES.includes(name)) {
        if (!routes.has(location)) routes.set(location, []);
        routes.get(location).push({ root: rootName, path: route });
        if (runtimeFile || !TOOL_ROOTS.has(rootName)) errors.push(`Application dependency reaches ${name}: ${route.join(' > ')}${runtimeFile ? ` (runtime import in ${runtimeFile})` : ''}`);
      }
      for (const dependency of Object.keys({ ...packages[location].dependencies, ...packages[location].optionalDependencies, ...packages[location].peerDependencies })) {
        const target = resolvePackage(packages, location, dependency);
        if (target) queue.push([target, [...route, dependency]]);
        else if (packages[location].dependencies?.[dependency] && !packages[location].optionalDependencies?.[dependency]) errors.push(`Unresolved locked dependency: ${location} > ${dependency}`);
      }
    }
  }
  return PACKAGES.map(name => {
    const entries = Object.entries(packages).filter(([location]) => location.endsWith(`node_modules/${name}`));
    const identities = new Set(entries.map(([, item]) => `${item.version}|${item.integrity}`));
    if (identities.size > 1) errors.push(`Inconsistent locked versions/integrity for ${name}`);
    for (const [location, item] of entries) {
      if (!item.integrity || !item.version) errors.push(`Missing locked version/integrity: ${location}`);
      if (!routes.has(location)) errors.push(`Unclassified locked instance: ${location}`);
    }
    return { name, version: entries[0]?.[1].version || null, integrity: entries[0]?.[1].integrity || null, instances: entries.map(([location]) => location), toolingPaths: entries.flatMap(([location]) => (routes.get(location) || []).map(route => route.path)) };
  });
}

function verifyExposure({ root = path.resolve(__dirname, '..'), buildDir = path.join(root, 'build'), lock, manifest } = {}) {
  const errors = [];
  const bundle = { javascriptFiles: 0, mappedSources: 0 };
  const imports = { filesChecked: 0, excludedFiles: [] };
  const runtimeImports = [];
  const javascript = filesUnder(buildDir).filter(file => /\.(?:js|mjs)$/.test(file));
  if (!javascript.length) errors.push('No production JavaScript bundles found. Build with source maps first.');
  for (const file of javascript) {
    bundle.javascriptFiles++;
    try {
      const script = fs.readFileSync(file, 'utf8');
      const references = [...script.matchAll(/\/\/[#@]\s*sourceMappingURL=([^\s]+)/g)];
      const reference = references.at(-1)?.[1];
      if (!reference || reference !== `${path.basename(file)}.map`) throw new Error('missing or unexpected local sourceMappingURL');
      const map = JSON.parse(fs.readFileSync(`${file}.map`, 'utf8'));
      if (map.version !== 3 || !Array.isArray(map.sources) || !map.sources.length || !Array.isArray(map.sourcesContent) || map.sourcesContent.length !== map.sources.length) throw new Error('incomplete source map');
      map.sources.forEach((source, index) => {
        const content = map.sourcesContent[index];
        if (typeof source !== 'string' || typeof content !== 'string') throw new Error('missing mapped source content');
        bundle.mappedSources++;
        if (sourcePackage(source) || sourcePackage(content) || importedSpecifiers(content).some(vulnerableSpecifier)) errors.push(`Vulnerable package present in browser source map: ${path.relative(root, file)}: ${source}`);
      });
      if (sourcePackage(script) || importedSpecifiers(script).some(vulnerableSpecifier)) errors.push(`Vulnerable package reference in browser bundle: ${path.relative(root, file)}`);
    } catch (error) { errors.push(`${path.relative(root, file)}: ${error.message}`); }
  }
  for (const directory of ['src', 'server', 'scripts']) {
    for (const file of filesUnder(path.join(root, directory)).filter(file => /\.(?:js|jsx|mjs|cjs)$/.test(file))) {
      const relative = path.relative(root, file).replace(/\\/g, '/');
      if (/(?:^|\/)(?:__tests__|__mocks__)(?:\/|$)|\.(?:test|spec)\.[^.]+$/.test(relative) || relative === 'src/setupTests.js' || TOOL_FILES.has(relative)) {
        imports.excludedFiles.push(relative); continue;
      }
      imports.filesChecked++;
      const content = fs.readFileSync(file, 'utf8');
      if (/\b(?:require|import)\s*\(\s*(?!['"\s])/.test(content)) errors.push(`Opaque runtime import requires explicit review: ${relative}`);
      for (const call of content.matchAll(/\b(?:require|import)\s*\(\s*(['"])([^'"\r\n]*)\1([^)]*)\)/g)) {
        if (call[3].trim() || call[2].includes('\\')) errors.push(`Computed or escaped runtime import requires explicit review: ${relative}`);
      }
      for (const specifier of importedSpecifiers(content)) {
        if (vulnerableSpecifier(specifier) || sourcePackage(specifier)) errors.push(`Vulnerable direct runtime import: ${relative}: ${specifier}`);
        if (specifier.includes('\\')) errors.push(`Escaped runtime import requires explicit review: ${relative}`);
        if (isBuiltin(specifier) || specifier.startsWith('.') || specifier.startsWith('/')) continue;
        const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
        runtimeImports.push({ name, file: relative });
      }
    }
  }
  let packages = [];
  try {
    packages = packageEvidence(lock || JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8')), manifest || JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')), errors, runtimeImports);
  } catch (error) { errors.push(`Dependency graph unavailable: ${error.message}`); }
  let fingerprint = null;
  try { fingerprint = exposureFingerprint(root); } catch (error) { errors.push(`Exposure fingerprint unavailable: ${error.message}`); }
  return { reportVersion: 1, generatedAt: new Date().toISOString(), fingerprint, ok: errors.length === 0, errors, bundle, imports, packages, limitations: LIMITATIONS };
}

module.exports = { verifyExposure, importedSpecifiers, packageEvidence, exposureFingerprint };
if (require.main === module) {
  const result = verifyExposure();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}
