# Dependency security policy

Implemented with repository-owner authorization on 2026-10-12; verification resumed on 2026-10-13. The security gate remains blocking. It now distinguishes a specific accepted tooling risk from new or changed high/critical findings instead of suppressing the raw audit.

## Exact temporary exception

`config/security-exceptions.json` permits only **GHSA-vfj7-8cjw-p6xm**, `braces@3.0.3`, at `node_modules/braces` with its reviewed lockfile integrity. Advisory URL, severity, affected range, CWE and npm CVSS vector must match. Additional nested instances, changed versions, changed integrity, runtime dependency routes or altered attack metadata cannot inherit acceptance.

The exception expires at **2026-11-11 00:00 Asia/Taipei** (2026-11-10 16:00 UTC). Approval cannot be future-dated, exceptions cannot exceed 30 days, and expiration fails the gate. There is no automatic renewal. Remove the exception once remediation ships; any renewal requires a new owner review and explicit policy change. `CODEOWNERS` requests owner review of enforcement changes; required owner approval depends on repository branch-protection settings and is not assumed to be enabled.

This accepts build/test denial-of-service risk; it does not patch `braces` or produce a clean raw audit. The moderate `sprintf-js` finding remains reported without a high-severity exception. `continue-on-error`, audit-level reduction and blanket development-dependency exclusion are not used.

## Fresh exposure proof

Every PR/manual quality run builds production JavaScript with source maps and runs `scripts/dependency-exposure.js`. The weekly Monday 11:11 Taipei run performs installation, build and exposure checks, but skips the full regression suite and time-sensitive public snapshot acceptance. Its dependency job downloads proof from the same workflow run, then uses `scripts/security-audit.js` to query the current npm registry report without another installation.

The proof must be successful, no older than six hours, and match SHA-256 fingerprints of the current lockfile, package manifest and source tree. Missing maps, vulnerable mapped sources, direct/ambiguous runtime imports or application dependency paths reaching the affected packages fail verification. Production Pages builds run the same exposure verification and security policy directly before uploading the deployable artifact, including snapshot-only deployments.

The originating-advisory graph is checked independently of propagated package counts. Unknown high advisories and all critical findings block. Malformed metadata, understated origin severity, cycles, registry errors, timeouts and invalid JSON fail closed. Current accepted entries and lower-severity findings remain in the job summary; the result says **passed with temporary accepted risk**, not **zero vulnerabilities**.

Source maps and static analysis support review of trusted repository changes; they do not prove safety against deliberately obfuscated code or forged build metadata. Keep untrusted CI runs isolated, avoid privileged credentials in PR checks, and review changes to policy and enforcement. See [exposure evidence](dependency-exposure.md) and [replacement evaluation](build-tool-remediation.md).

## Local check

```powershell
npm run verify
node scripts/dependency-exposure.js > .omx/research/dependency-exposure.json
npm run security:audit -- .omx/research/dependency-exposure.json
```

Create the report directory first if it does not exist. Regenerate the report after source, manifest or lockfile changes. The security-gate regressions are included in `npm run verify` and the shared CI action; `npm run test:security-gate` runs them independently.

Permanent remediation is evaluated in an isolated branch. The Vite/Vitest candidate removes both packages and passes its production build and all 165 frontend tests, but requires the documented integration acceptance checks before replacing the stable production toolchain. Its clean candidate audit is not a claim about the current CRA graph.
