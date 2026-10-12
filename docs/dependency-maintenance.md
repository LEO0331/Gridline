# Dependency maintenance review — 2026-10-12

The failed Dependabot parser update was investigated. `react-scripts` constrains several transitive consumers to `postcss-selector-parser` 6.x. An override to the existing dependency's patched 7.1.6 release updates those paths; the clean installation, full regression suite and production build must pass before this compatibility decision is accepted. No new application dependency or Create React App major upgrade is introduced.

The post-update registry audit reports 53 affected dependency entries: 48 high, five moderate, zero critical. These entries propagate from two direct advisory findings, rather than representing 53 unrelated flaws:

- [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): deeply nested brace patterns can exhaust the stack in `braces` through 3.0.3. The published advisory has no patched version. This package is used by the build/test/development toolchain; Gridline's public application and data adapters do not import it or expose glob-pattern processing. Do not feed untrusted patterns to toolchain commands.
- [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c): unbounded precision specifiers in `sprintf-js` through 1.1.3 can cause denial of service. It remains a moderate toolchain finding.

The high/critical PR audit remains blocking. There is no suppression, fabricated zero finding, forced audit fix, or downgrade to `react-scripts@0.0.0`. Weekly audits and grouped Dependabot checks will surface patched releases. When fixes become available, update the smallest compatible dependency path and rerun clean installation, regression tests and build; do not apply a toolchain-wide migration merely to clear an advisory count.

The parser override crosses a transitive major-version constraint. Its compatibility is established for the exercised Gridline build/tests, rather than assumed for every possible consumer of the parser API. Future changes to the build toolchain must recheck this override.
