# Build dependency exposure evidence

Reviewed on 2026-10-13. This report separates the browser/application exposure check from the remaining risk of running vulnerable build tools. It does not claim that those tools have been patched.

## Repeatable check

Run a fresh production build with source maps enabled, then:

```sh
node scripts/dependency-exposure.js
node --test scripts/dependency-exposure.test.js
```

The verifier exits unsuccessfully if production JavaScript or its source maps are missing, mapped source content is incomplete, a mapped package path or literal import identifies `braces` or `sprintf-js`, application/data-adapter code directly imports them, or a runtime dependency can reach an affected locked instance. Computed, concatenated or escaped imports in nonexcluded runtime files require explicit review and fail the check. Multiline static imports and reexports are included in import scanning.

It inspects every JavaScript bundle under `build`, including lazy chunks, and both source-map paths and source content. It scans JS/JSX/MJS/CJS files under `src`, `server` and `scripts`. Test files, test setup and explicitly named development/audit tooling are separately listed as exclusions in the report. These exclusions do not make the packages safe to run in CI.

The lockfile graph is traversed using dependencies, optional dependencies and installed peers with Node-style package resolution. `react-scripts` and the three existing Testing Library roots are explicitly classified as tooling. This classification uses their role, not their `dependencies` versus `devDependencies` placement. The scanner also resolves bare package imports found in nonexcluded runtime files and traverses them as runtime roots, including hoisted transitive packages absent from the manifest. For example, a server importing `micromatch` is rejected because it reaches `braces`, even when only CRA declares `micromatch`. Builtins identified by Node's `isBuiltin` and relative/local imports are skipped as package roots; unresolved bare imports fail closed. Every affected locked instance must be reachable through tooling; application roots reaching either package fail the check. Duplicate instances must have the same version and integrity. The report includes representative shortest routes from each root, rather than enumerating every possible route through the graph.

## Observed evidence

The existing production build passed: eight JavaScript bundles contained 146 mapped source modules with source content. Neither affected package appeared in those browser modules or direct application/data-adapter imports.

| Package | Locked instance | Representative tooling path |
| --- | --- | --- |
| `braces` 3.0.3 | `node_modules/braces` | `react-scripts` → `eslint-webpack-plugin` → `micromatch` → `braces` |
| `sprintf-js` 1.0.3 | `node_modules/sprintf-js` | `react-scripts` → `babel-jest` → `babel-plugin-istanbul` → `@istanbuljs/load-nyc-config` → `js-yaml` → `argparse` → `sprintf-js` |

Each package has one locked instance. Its full integrity and discovered routes are emitted in the machine-readable report. A later dependency change must generate fresh evidence; this dated observation is not a permanent exemption.

## Evidence binding

The exported `verifyExposure({ root, buildDir })` API returns `reportVersion: 1`, `generatedAt`, `ok`, `errors`, bundle counts, scanned/excluded file information, locked package identities and limitations. `fingerprint` contains SHA-256 hashes named `lockfileSha256`, `manifestSha256` and `sourceTreeSha256`. `exposureFingerprint(root)` recomputes those hashes for the gate consuming the report.

The source digest covers all JS/JSX/MJS/CJS files in the three scanned directories, including excluded tests/tooling. Changes to dependencies or any of those sources invalidate prior evidence. CI must create the report after its own fresh build and compare the hashes before accepting a temporary advisory exception. Build outputs should come from that same verification job; this checker cannot establish the origin of arbitrary pre-existing files supplied by an attacker.

## Remaining risk and limits

Source maps and literal imports provide repeatable evidence for the inspected build. They are not a general JavaScript parser or a proof against deliberately obfuscated code, falsified source maps or malicious CI modifications. Repository review remains necessary.

CRA build/test tools still process repository-controlled patterns and format strings. Contributors who can modify a pull request can influence those inputs and potentially exhaust CI resources. A browser exposure pass therefore supports a narrowly documented temporary exception; it does not remove build-time denial-of-service risk. Review the exact exception's advisory, affected versions, integrity, expiry and weekly audit result separately. New findings or new runtime exposure must block rather than inherit that exception.

The thirteen regression tests cover missing/incomplete maps, suspicious mapped paths and content, direct runtime imports, computed/concatenated/escaped calls, multiline imports and reexports, hoisted runtime dependency routes, normal React/builtin/local imports, unresolved imports, unclassified instances and inconsistent identities.
