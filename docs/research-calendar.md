# Research Catalyst Calendar

Weekly discovery can verify and propose updates from approved official sources. The calendar labels manual source reviews and accepted automated verification separately. The original-language label identifies titles without a reviewed translation. [Calendar automation](calendar-automation.md)

Open **Research Calendar** at `#calendar` to inspect selected official schedules that could provide new evidence about company finances, infrastructure, or economic conditions. Week starts on Monday. Month lets you select a date and inspect that day’s events. Agenda lists the selected week’s events chronologically. Switching views keeps the selected date and filters. Use category, theme, and company together to narrow the results, or clear filters to restore all events in the period.

The Overview preview shows up to three active catalysts within seven calendar days including today in New York. The registry is bundled with the app and remains available independently of the market snapshot. An empty period describes the limits of the curated registry. A company action opens the existing Company Research section with the associated ticker, subject to snapshot availability and the enabled universe. Use the publisher link in each record to confirm its current schedule.

Week uses dated list sections. Month dates use native buttons with a full accessible label, event count, and exposed selection state. On narrow screens, Month lists dates with events and provides a date input to inspect other dates. Agenda and event details use semantic headings, lists, and links. English and Traditional Chinese controls share the same records.

## Initial coverage

Manual source review completed on **2026-11-10**. The registry contains 11 records across the four supported categories.

| Category | Initial records | Official schedule evidence |
| --- | --- | --- |
| Company earnings | CoreWeave on November 10, Nebius on November 12, and Broadcom on December 9 | [CoreWeave announcement](https://investors.coreweave.com/news/news-details/2026/CoreWeave-Announces-Date-of-Third-Quarter-2026-Financial-Results-and-Conference-Call/default.aspx), [Nebius announcement](https://nebius.com/newsroom/nebius-group-announces-date-of-third-quarter-2026-results-and-conference-call), [Broadcom announcement](https://investors.broadcom.com/news-releases/news-release-details/broadcom-inc-announce-fourth-quarter-and-fiscal-year-2026) |
| Macroeconomic releases and meetings | October CPI, November Employment Situation, Q3 GDP second estimate, October personal income and outlays, December 2026 and tentative January 2027 FOMC meetings | [BLS November calendar](https://www.bls.gov/schedule/2026/11_sched.htm), [BLS December calendar](https://www.bls.gov/schedule/2026/12_sched.htm), [BEA GDP next-release notice](https://www.bea.gov/news/2026/gdp-advance-estimate-3rd-quarter-2026), [BEA personal income and outlays next-release notice](https://www.bea.gov/news/2026/personal-income-and-outlays-september-2026), [BEA release schedule](https://www.bea.gov/news/schedule), [Federal Reserve calendar](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm), [Federal Reserve tentative 2027 dates](https://www.federalreserve.gov/newsevents/pressreleases/monetary20250905a.htm) |
| Infrastructure and project milestones | PJM’s November 12 workshop on co-located load rules, with draft tariff revisions on the agenda | [PJM workshop agenda](https://www.pjm.com/-/media/DotCom/committees-groups/workshops/cllsco/2026/20261112/20261112-agenda.pdf) |
| Official company events | Broadcom’s December 8 public-sector private-cloud technology event in Washington, D.C. | [Broadcom announcement](https://investors.broadcom.com/news-releases/news-release-details/vmware-explore-empowers-it-practitioners-drive-modern-private), [VMware event schedule](https://www.vmware.com/explore) |

Coverage is selective. The three earnings rows are calls at published times. A before-open or after-close release window appears only as a note when the issuer states it. The infrastructure row is a workshop, with no reported regulatory decision, facility launch, or verified company connection. The initial registry has one tentative date range and zero canceled, rescheduled, or completed records.

## Dates and evidence

- **Timed events.** Store an ISO timestamp with an explicit offset and an IANA source timezone. The full calendar defaults to `America/New_York`, with `Asia/Taipei` available for display. A timed event can move to a different local date. For example, 17:00 Eastern on December 9 in the reviewed Broadcom schedule is 06:00 Taipei on December 10.
- **Date-only events.** Use `YYYY-MM-DD` and optionally an inclusive end date. Changing the display timezone keeps those published dates. The UI shows “Time not specified.” Neither a market holiday nor a weekend excludes a verified schedule.
- **Past dates and results.** Scheduled, tentative, rescheduled, and canceled describe publisher information. After an active schedule passes, the calendar indicates that the outcome remains unverified. A completed record requires independent verified outcome evidence with a separate `outcomeUrl` and `outcomeReviewedAt`. The existing published event and company observation feeds remain the place to inspect dated developments.
- **Source review.** The recorded review day is when someone checked the official schedule. It has a different meaning from snapshot generation, automated source retrieval, or an event’s publication or observation date. The UI flags calendar coverage when the latest review is more than 30 calendar days old. Even recent review dates cover only the listed sources and records.

## Registry maintenance

1. Find a dated, accessible primary source from the issuer, agency, regulator, or grid operator. Verify the title, event identity, date, timezone, and status. Use an exact time only when the source states it. A target quarter, an estimated earnings date, or a publication date in an observation is insufficient for admission.
2. Add or edit the record in [the registry](../src/data/researchCatalysts.json). Required fields are `id`, `category` (`earnings`, `macro`, `infrastructure`, or `company`), `title`, `titleZh`, `precision` (`date` or `timestamp`), `start`, `timeZone`, `sourceUrl`, `publisher`, `reviewedAt`, and `status`. Add `end` for a supported range. Use `note` and `noteZh` for factual context.
3. Use a stable `id` based on the occurrence, such as an issuer and reporting period. When the publisher changes the date, update `start` and `end` under that ID, use `rescheduled`, and record `previousStart` when the publisher supports it. Use `canceled` when the publisher announces cancellation. Canceled events stay visible in the full calendar and leave the active preview. If a previously verified source becomes unavailable, set `sourceUnavailable` while retaining the last successful review date.
4. Add `tickers` only for an explicit issuer association. Add `themeIds` using the [Phase 1 definitions](../src/researchThemes.js) only when the association is supported. Macroeconomic releases stay unassociated. A utility or grid event can have a subject theme without having any company association.
5. Run `npm run test:unit -- researchCalendarModel` after a registry edit. The model checks supported source hosts, provenance, identity, dates, timezone, status, tickers, and themes. An automated test or build validates the record structure. Renew `reviewedAt` only after reviewing the source again.

The calendar uses manual review and accepted weekly automation. Recheck the linked publisher for the latest schedule. The bundled registry supports empty categories and periods. [Calendar automation](calendar-automation.md)

## 繁體中文

從導覽列開啟「研究日曆」。週檢視以星期一為起點，月檢視可選取日期，議程檢視依時間排列所選週的事件。類別、研究主題及公司可合併篩選；切換檢視時會保留所選日期與篩選條件。手機可逐日瀏覽，也可使用議程檢視。日期控制與原始來源連結皆可用鍵盤操作。

總覽顯示含當日在內、未來七個日曆日內的部分近期事件。總覽預覽以紐約時間為準。完整日曆可切換至台北時間，具明確時間的事件可能跨日。來源只提供日期時，切換時區不會變更日期，畫面會顯示「時間未公布」。多日會議保留原始起訖日期。

初始資料於 **2026-11-10** 人工查閱，共 11 筆。上表列出公司財報電話會議、美國總體經濟資料與聯準會會議、PJM 共址用電規則研討會，以及 Broadcom 的公部門私有雲技術活動。2027 年 1 月聯準會會議日期為暫定。公司研究連結會帶入來源明確相關的公司；總體經濟資料不會自動歸入個別公司。

預定日已過時，仍需另外查證結果。已排程、暫定、改期、取消及有證據的完成狀態各自標示。人工審閱、自動驗證與市場快照各有獨立日期。最新驗證紀錄超過 30 天時會顯示提醒。空白日期只表示目前日曆涵蓋範圍內沒有符合條件的事件。

## Phase 2 verification on 2026-11-10

- `npm run verify` passed 485 tests, including 238 frontend tests, and compiled the production build.
- `npm run demo:check` accepted the snapshot with zero blockers and two existing warnings for partial event and company-research coverage.
- Local Chrome checks exercised Week, Month and Agenda in both languages at 320, 390, 768, 1024 and 1440 pixels. Checks also covered keyboard operation, focus transfer to Company Research, official source links, timezone changes, existing routes and calendar availability when snapshot requests fail. Calendar records were available without live calendar-provider requests.
