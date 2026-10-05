# Official event discovery

The existing daily snapshot job runs discovery and article verification together, including weekends. No additional hourly job or API credentials are required.

| Provider | Discovery | Fallback / limits |
| --- | --- | --- |
| Loudoun | Official County News RSS | County News listing, then curated candidates |
| Oracle | Corporate newsroom | Corporate article verification |
| Texas Governor | Official Governor news RSS | News listing and curated policy article fallback; publisher remains Texas Governor |

Loudoun's [RSS directory](https://www.loudoun.gov/Rss.aspx) publishes the County News feed. Oracle's [corporate newsroom](https://www.oracle.com/news/) is a public source. Public availability does not guarantee access from a particular runner.

PJM, ERCOT and Oracle investor news are paused at the user's request following access failures. The daily job and live diagnostic do not request these endpoints or their curated candidates. Previously verified events from these sources remain visible with their original verification dates; pausing discovery does not delete history. Fresh provider health reports describe Loudoun, Oracle corporate news and Texas Governor independently.

## Alternative publisher admission

The alternative routes are separately labeled by the publisher that produced the article:

| Publisher | Official route | Coverage and limits |
| --- | --- | --- |
| Oracle OCI Blog | [Cloud Infrastructure blog](https://blogs.oracle.com/cloud-infrastructure/) | Diagnostic only: GitHub runner RSS/listing/article checks returned 403. Infrastructure and cloud-region announcements do not restore Oracle investor-news access. |
| Texas Governor | [Governor news](https://gov.texas.gov/news) | Active daily: runner listing and representative article verification passed. Texas policy announcements are not ERCOT operational updates. |
| FERC | [News releases and headlines](https://www.ferc.gov/news-events/news/news-releases-headlines) | Diagnostic only: GitHub runner listing/article checks returned 403. Regulatory decisions are regulator announcements, not PJM statements. |

Alternative connectors must pass listing discovery and representative article verification from the GitHub Actions runner before daily activation. A local HTTP 200, a successful listing alone, or an offline fixture is insufficient. Oracle OCI Blog and FERC receive no daily requests and are checked only with the explicit alternative diagnostic. Original PJM, ERCOT and Oracle investor endpoints remain paused regardless of whether these alternatives pass. The FERC news route is separate from the optional Data.FERC.gov API adapter and requires no API key.

## Admission and request bounds

Discovery selects specific official article links with infrastructure-related headlines. Podcast, personnel, generic product and ordinary earnings headlines do not qualify merely because they mention the company. This is selective discovery over the first configured listing/feed response, not an exhaustive archive crawl or an agenda-document parser.

An article must be accessible, match its candidate headline, and provide publication-date evidence from published metadata, semantic time markup, a labeled publication field or a newsroom dateline. Curated summaries also require their exact supporting text and date. Publication dates cannot be future dates. Article publication evidence takes precedence over a feed/listing date, because RSS dates can reflect revisions. Listing dates, update metadata, URL dates, dates mentioned in body text and navigation dates alone do not verify publication.

Loudoun's legacy CivicAlerts links and mobile detail URLs are normalized to the same article identity. Tracking parameters and fragments are removed. Curated evidence takes precedence over a discovered duplicate, and each unique URL is fetched once per provider check.

Each provider has a 75-second request budget and at most 12 candidate article checks. Requests have a 10-second timeout and a 2 MiB response limit, except the opt-in Oracle OCI Blog diagnostic allows 4 MiB for its larger pages. Transient network failures, HTTP 429 and HTTP 5xx receive at most one retry. Retry-After is honored within the provider budget; HTTP 403/404 are not retried or bypassed. The snapshot exporter does not repeat a completed event check merely because coverage is partial or degraded; other provider retries remain unchanged. Each provider sends requests sequentially; providers run independently. Reaching the candidate limit is reported as partial verification with an omitted count.

## Health and retention

`sourceHealth.events.coverage.sources` records the active Loudoun, Oracle and Texas Governor sources independently, with discovery status, article-verification status, timestamps, candidate/accepted/excluded counts, the endpoint used, discovery errors and truncation. Successful fallback discovery retains the failed primary request as diagnostic evidence. Older snapshots can still carry earlier source reports; those retain their original check dates until replaced by a new snapshot.

The aggregate source is `partial` if any provider is limited, even when other providers succeed. When every provider is unavailable and no curated article passes, it is `degraded`; the coverage evidence remains present. A valid listing/feed with no relevant candidates is a successful empty check. Previously accepted events remain in the archive with their own verification dates. The last fully successful check for each provider is retained across failures, including fresh GitHub runners that merge the preceding committed snapshot.

Events and Data Health display the same bilingual provider report. Neither implies coverage of every announcement or every U.S. infrastructure event.

The main dashboard uses a compact “Partial source coverage” indicator. Unavailable providers have a plain-language notice such as “Oracle news temporarily unavailable” in the detailed provider report, alongside check and last-success dates. Raw request errors remain inside a collapsed “Technical details” section. This changes presentation only; stored coverage, failures and previously verified events remain intact.

## Live verification

Run a read-only probe without changing snapshot or database files:

```sh
node scripts/check-event-sources.js event-source-report.json
```

The default probe checks the same three providers as the daily job. To explicitly include the inactive Oracle OCI Blog and FERC connectors and representative article checks:

```sh
node scripts/check-event-sources.js event-source-report.json --alternatives
```

The manual **Check official event source access** GitHub workflow runs the same probe on `ubuntu-latest` and uploads the JSON report, including on failure. Enable its alternative-source option to test inactive alternatives. Partial access is reported in the artifact; complete degradation fails the probe. Representative diagnostic probes do not modify snapshots. The runner-verified September 21 Texas Governor policy article is separately included in the curated candidate register, so daily checks can retain it even after it leaves the recent news listing. Offline regression tests exercise denial, timeout/rate-limit retry, malformed responses, date checks, fallback, deduplication and caps.

The [October 5, 2026 GitHub runner report](https://github.com/LEO0331/Gridline/actions/runs/37271811936) verified three Loudoun articles, one Oracle corporate article, and the Texas Governor representative article “Governor Abbott Directs TCEQ To Halt Data Center Permits,” published September 21, 2026. Texas Governor listing discovery also passed. Oracle OCI Blog returned 403 for RSS, listing and article checks; FERC returned 403 for listing and article checks. Oracle OCI Blog had been locally accessible, so its local result did not justify daily activation. Only Texas Governor was admitted from the alternative set.

Before these sources were paused, a local probe on October 5, 2026 reached Loudoun and Oracle's corporate newsroom, while ERCOT and Oracle investor news returned 403; PJM DNS lookup failed. These observations describe that machine and time, not GitHub runner access. No complete-access claim is made.
