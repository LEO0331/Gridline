# Dependency maintenance review — 2026-10-12

The failed Dependabot parser update was investigated. `react-scripts` constrains several transitive consumers to `postcss-selector-parser` 6.x. An override to the existing dependency's patched 7.1.6 release updates those paths. Clean installation, all 356 tests and production build passed locally, and the shared regression/build gate passed on GitHub Node 22. No new application dependency or Create React App major upgrade was introduced.

The registry audit recorded during the 2026-10-12 implementation reported 53 affected dependency entries: 48 high, five moderate, zero critical. This is dated evidence, not a permanent count; the latest PR/weekly audit is authoritative. These entries propagate from two direct advisory findings, rather than representing 53 unrelated flaws:

- [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): deeply nested brace patterns can exhaust the stack in `braces` through 3.0.3. The published advisory has no patched version. This package is used by the build/test/development toolchain; Gridline's public application and data adapters do not import it or expose glob-pattern processing. Do not feed untrusted patterns to toolchain commands.
- [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c): unbounded precision specifiers in `sprintf-js` through 1.1.3 can cause denial of service. It remains a moderate toolchain finding.

The security gate remains blocking, with one owner-approved temporary exception for the exact reviewed `braces@3.0.3` advisory and integrity. It expires at 2026-11-11 00:00 Asia/Taipei. No new/changed high or critical advisory inherits that acceptance, and invalid registry results or missing/failing exposure proof block. Raw findings are reported rather than fabricated as zero. The PR/weekly job audits without another installation after fresh build/exposure verification; Pages enforces the same policy before uploading artifacts. See [exception enforcement](security-exception-policy.md).

A successful accepted-risk security check is not a clean dependency audit or a package patch. The [Actions report](actions-maintenance.md) retains the historical blocked audit and records the new policy separately. Weekly reviews and grouped Dependabot updates continue; renewal is a new owner decision, not an automatic date change.

The parser override crosses a transitive major-version constraint. Its compatibility is established for the exercised Gridline build/tests, rather than assumed for every possible consumer of the parser API. Future changes to the build toolchain must recheck this override.

The production toolchain remains Create React App. Outdated local replacement experiments have been removed. See the [current security review](security-exception-policy.md#current-review--2026-10-28) for patched dependencies, retired approvals and remaining advisories.

## React compatibility repair — 2026-10-13

The merged React DOM 19 and Testing Library React 16 updates conflicted with the application's React 17 dependency and legacy renderer. The release keeps React and React DOM aligned at 17.0.2 and uses Testing Library React 12.1.5, whose peers explicitly support React versions below 18. The npm 10 lockfile was regenerated and clean installation succeeded without `--force` or `--legacy-peer-deps`.

Dependabot excludes React/React DOM versions 18+ and Testing Library React versions 13+ until a coordinated framework migration. Compatible patch/minor updates still proceed; remove those exclusions only as part of that migration. The other merged SDK, matcher and Actions updates remain in place. The optional performance reporter uses the merged web-vitals 6 `on*` APIs and INP instead of the removed FID API; reporting remains disabled unless a callback is provided.

The [GitHub quality run](https://github.com/LEO0331/Gridline/actions/runs/38331045040) passed clean installation, all 380 tests, build, fresh exposure verification and dependency policy. The [publication run](https://github.com/LEO0331/Gridline/actions/runs/38331039892) passed production verification, Pages deployment and Lighthouse. This repairs the peer conflict without bypassing resolution or upgrading the React framework major.

## YAML optional-peer lockfile repair — 2026-10-13

The subsequent user-event update removed Tailwind's nested optional `yaml@2.9.1` peer from the lockfile while retaining YAML 1 at the root. The npm 10 runner then rejected `npm ci` as out of sync. The existing transitive YAML package is now overridden to exactly 2.9.1 across its consumers, so the required root dependency also satisfies the optional peer and the resolver does not depend on a separately removable nested entry. No new package was introduced.

Regenerate with npm 10 and verify clean installation. An isolated npm 11 regeneration followed by npm 10 `ci --dry-run` also validated successfully, retaining `node_modules/yaml` at 2.9.1. This checks compatibility of the resulting lockfile; it does not replace CI or justify `--force`/`--legacy-peer-deps`. Keep full workflow/parser tests and production build checks when changing this override.

The [replacement quality run](https://github.com/LEO0331/Gridline/actions/runs/38332730330) passed clean installation, all 380 tests, build and security policy. The [replacement publication run](https://github.com/LEO0331/Gridline/actions/runs/38332725690) passed installation/build, Pages deployment and Lighthouse; it supersedes the failed historical run 38331550947.
