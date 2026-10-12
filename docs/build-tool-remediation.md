# Build-tool remediation evaluation

Reviewed on **2026-10-12**. This report records a private migration experiment; the production application still uses Create React App. The security exception policy accepts a temporary, bounded risk and does not patch either dependency.

## Published patch availability

The npm registry returned `braces@3.0.3` and `sprintf-js@1.1.3` as the latest releases. GitHub's reviewed advisories list **no patched versions** for [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and [sprintf-js](https://github.com/advisories/GHSA-hp3w-g68c-fv3c).

The [braces maintainer discussion](https://github.com/micromatch/braces/issues/70) disputes the advisory's assumed exposure and points to the existing length limit. That discussion is not a published remediation release. No vetted maintainer patch was identified during this review; overriding the package to its current release cannot remove the finding. A renamed fork or a changed version label would not establish that the vulnerability was fixed.

## Isolated replacement experiment

The experiment is in the ignored `.omx/remediation-evaluation` directory, initialized as a separate Git repository on local branch `codex/advisory-remediation-evaluation`. No main application dependencies, lockfile or installed modules were changed by this experiment. No branch or package was published.

Exact candidate versions:

| Package | Version |
| --- | --- |
| Vite | 8.3.4 |
| Vitest | 5.0.3 |
| `@vitejs/plugin-react` | 6.1.2 |
| jsdom | 29.1.1 |
| React / React DOM | 17.0.2 |
| `@supabase/supabase-js` | 2.116.0 |
| `@testing-library/jest-dom` | 5.17.0 |
| `@testing-library/react` | 11.2.7 |
| `@testing-library/user-event` | 12.8.3 |
| `web-vitals` | 1.1.2 |

The latest jsdom 30.1.2 was also resolved, but its engine requirement excludes the available Node 24.14.0 runtime. The exercised candidate therefore uses jsdom 29.1.1. The candidate requires a supported Node version satisfying all packages, including Vitest's Node 22.12+ requirement and jsdom 29's Node 22.13+ requirement. Local verification used **Node 24.14.0 / npm 11.15.0**.

Measured results:

- The final lockfile has **198 package entries including the root**. Neither `braces` nor `sprintf-js` occurs at any dependency nesting, including the test dependencies and optional platform packages.
- `npm audit --json` returned **zero vulnerabilities at every severity**. This is a dated audit result, not a guarantee about future advisories.
- A production build succeeded with **119 transformed modules** and separate lazy feature bundles.
- **All 31 existing frontend suites and 165 tests passed** after the candidate adaptations below. This does not claim that the whole application verification suite or browser deployment was migrated.

Commands, run from the isolated directory:

```powershell
npm install --ignore-scripts
npm audit --json
npm run build
npm test
```

Graph inspection checked every `package-lock.json` package path ending in `node_modules/braces` or `node_modules/sprintf-js`; the resulting array was empty. Local evidence is preserved as `graph-evaluation.json`, `audit-evaluation.json`, `build-evaluation.log` and `test-after-default-export.log` in the experiment directory.

## Compatibility work and migration boundary

The candidate copied the application source and public assets, renamed source `.js` files to `.jsx`, replaced test `jest` references with `vi`, and converted two test JSON `require` calls into imports. One App test's default-export mock needed an explicit `{ default: ... }` factory; before that repair, 30 suites and 151 tests passed and the App suite failed.

The Vite configuration sets the `/Gridline/` base, emits `build/`, loads only the two public `REACT_APP_SUPABASE_*` values explicitly, and retains CommonJS for the backend by using a `.mjs` configuration. HTML `%PUBLIC_URL%` placeholders were replaced and a module entry added. Vitest uses jsdom, global test APIs and explicit Testing Library cleanup.

These changes demonstrate a viable dependency-level replacement, **not a drop-in production migration**. Before adopting it, complete and verify:

1. Development server proxy, startup scripts and the existing CRA middleware tests.
2. Real configured signup/login redirects and public environment injection.
3. Production browser targets and explicit lint checks currently provided by CRA.
4. Pages asset paths, CSP behavior, lazy loading, snapshot fetching and workflow artifact expectations such as CRA's asset manifest.
5. The complete backend, workflow, health and frontend verification suite plus desktop/mobile browser checks.

The recommended permanent remediation is a separately reviewed Vite/Vitest migration with these acceptance checks. Until that migration is complete or a supported patch is published, retain the narrow, expiring security exception and continue auditing the complete current dependency graph. Official migration references: [Vite guide](https://vite.dev/guide/) and [Vitest migration guide](https://vitest.dev/guide/migration/).
