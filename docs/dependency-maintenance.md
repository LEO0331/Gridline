# Dependency maintenance review — 2026-10-12

The failed Dependabot parser update was investigated. `react-scripts` constrains several transitive consumers to `postcss-selector-parser` 6.x. An override to the existing dependency's patched 7.1.6 release updates those paths. Clean installation, all 356 tests and production build passed locally, and the shared regression/build gate passed on GitHub Node 22. No new application dependency or Create React App major upgrade was introduced.

The registry audit recorded during the 2026-10-12 implementation reported 53 affected dependency entries: 48 high, five moderate, zero critical. This is dated evidence, not a permanent count; the latest PR/weekly audit is authoritative. These entries propagate from two direct advisory findings, rather than representing 53 unrelated flaws:

- [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): deeply nested brace patterns can exhaust the stack in `braces` through 3.0.3. The published advisory has no patched version. This package is used by the build/test/development toolchain; Gridline's public application and data adapters do not import it or expose glob-pattern processing. Do not feed untrusted patterns to toolchain commands.
- [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c): unbounded precision specifiers in `sprintf-js` through 1.1.3 can cause denial of service. It remains a moderate toolchain finding.

The high/critical PR audit remains blocking. There is no suppression, fabricated zero finding, forced audit fix, or downgrade to `react-scripts@0.0.0`. The security job audits the lockfile without installation and also runs on Monday at 11:11 Asia/Taipei. Dependabot checks npm updates Monday at 04:17 and GitHub Actions updates at 04:47 Asia/Taipei; compatible minor/patch npm updates are grouped, major npm updates remain separate, and action updates have their own group. These are scheduling targets, not execution guarantees. When fixes become available, update the smallest compatible dependency path and rerun clean installation, regression tests and build; do not apply a toolchain-wide migration merely to clear an advisory count.

Deployment regression/build verification remains separate from this security gate. A successful production deployment is not evidence of a clean dependency audit. The [Actions report](actions-maintenance.md) records the successful application checks and the expected security-gate failure separately.

The parser override crosses a transitive major-version constraint. Its compatibility is established for the exercised Gridline build/tests, rather than assumed for every possible consumer of the parser API. Future changes to the build toolchain must recheck this override.
