import React, { useMemo, useState } from 'react';
import registry from '../data/researchCatalysts.json';
import { companies } from '../companyRegistry';
import { RESEARCH_THEMES } from '../researchThemes';
import {
  CALENDAR_CATEGORIES, CALENDAR_REVIEW_DAYS, CALENDAR_TIME_ZONES, DEFAULT_CALENDAR_TIME_ZONE,
  calendarCoverage, calendarDate, calendarPeriod, calendarWeekday, catalystStatus,
  filterCatalysts, projectCatalysts, shiftCalendarPeriod, upcomingCatalysts, validateCatalysts,
} from '../researchCalendarModel';
import './ResearchCalendar.css';

const records = validateCatalysts(registry);
const emptyFilters = { category: 'all', theme: 'all', ticker: 'all' };
const views = [['week', 'Week', '週'], ['month', 'Month', '月'], ['agenda', 'Agenda', '議程']];
const categoryCopy = {
  earnings: ['Company earnings', '公司財報'],
  macro: ['Macroeconomic release or meeting', '總體經濟發布或會議'],
  infrastructure: ['Infrastructure milestone', '基礎設施里程碑'],
  company: ['Official company event', '公司官方活動'],
};
const statusCopy = {
  scheduled: ['Scheduled', '已排定'],
  tentative: ['Tentative', '暫定'],
  rescheduled: ['Rescheduled', '已改期'],
  canceled: ['Canceled', '已取消'],
  'past-unverified': ['Past scheduled date · outcome unverified', '已過排定日期 · 結果未驗證'],
  completed: ['Completed · outcome verified', '已完成 · 結果已驗證'],
};
const localized = (pair, language) => pair[language === 'zh-TW' ? 1 : 0];
const zoneLabel = (zone, language) => localized(zone === 'Asia/Taipei' ? ['Taipei', '台北'] : ['New York', '紐約'], language);
const titleFor = (event, language) => language === 'zh-TW' ? event.titleZh : event.title;
const civilInstant = day => new Date(`${day}T12:00:00Z`);

function dateLabel(day, language, options = { dateStyle: 'medium' }) {
  return new Intl.DateTimeFormat(language, { ...options, timeZone: 'UTC' }).format(civilInstant(day));
}

function scheduleLabel(event, language, timeZone) {
  if (event.precision === 'date') {
    const start = dateLabel(event.startDate, language);
    const end = event.endDate !== event.startDate ? ` – ${dateLabel(event.endDate, language)}` : '';
    return `${start}${end} · ${localized(['Time not specified', '時間未公布'], language)}`;
  }
  const format = new Intl.DateTimeFormat(language, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    hourCycle: 'h23', timeZone, timeZoneName: 'shortOffset',
  });
  return [event.start, event.end].filter(Boolean).map(value => format.format(new Date(value))).join(' – ');
}

function SourceLink({ event, language }) {
  return <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer"
    aria-label={`${event.publisher} · ${titleFor(event, language)} · ${localized(['Official schedule', '官方時程'], language)}`}>
    {event.publisher} ↗
  </a>;
}

function Coverage({ coverage, rejected, language }) {
  const t = (en, zh) => localized([en, zh], language);
  return <p className="calendar-coverage">
    {coverage.latestReview
      ? <>{t('Latest manual source review', '最近人工來源審閱')} <time dateTime={coverage.latestReview}>{coverage.latestReview}</time></>
      : t('Reviewed schedule coverage unavailable.', '目前無可用的已審閱時程。')}
    {coverage.stale && <> · {t(`Source review is older than ${CALENDAR_REVIEW_DAYS} days. Check the publisher for updates.`, `來源審閱已超過 ${CALENDAR_REVIEW_DAYS} 天，請向發布者確認更新。`)}</>}
    {rejected.length > 0 && <> · {t('Some registry records failed validation.', '部分登錄紀錄未通過驗證。')}</>}
  </p>;
}

function EventDetails({ event, language, timeZone, now, onCompanyResearch, showSource = true }) {
  const t = (en, zh) => localized([en, zh], language);
  const status = catalystStatus(event, { now });
  const note = language === 'zh-TW' ? event.noteZh : event.note;
  return <details className="calendar-event" data-category={event.category}>
    <summary>
      <strong>{titleFor(event, language)}</strong>
      <span>{localized(categoryCopy[event.category], language)} · {localized(statusCopy[status] || statusCopy[event.status], language)}</span>
      <span>{scheduleLabel(event, language, timeZone)}{event.tickers?.length > 0 && ` · ${event.tickers.join(', ')}`}</span>
    </summary>
    <div className="calendar-event-details">
      <p>{t('Source timezone', '來源時區')} · {event.timeZone} · {t('Reviewed', '已審閱')} <time dateTime={event.reviewedAt}>{event.reviewedAt}</time></p>
      {status === 'past-unverified' && event.status !== 'scheduled' && <p>{t('Published schedule status', '原發布時程狀態')} · {localized(statusCopy[event.status], language)}</p>}
      {event.previousStart && <p>{t('Previous scheduled start', '原排定開始時間')} · <time dateTime={event.previousStart}>{event.previousStart}</time></p>}
      {event.sourceUnavailable && <p>{t('Source currently unavailable. The previous reviewed schedule is retained.', '來源目前無法取得，保留前次已審閱時程。')}</p>}
      {note && <p>{note}</p>}
      {event.themeIds?.length > 0 && <p>{t('Research themes', '研究主題')} · {event.themeIds.map(id => {
        const theme = RESEARCH_THEMES.find(item => item.id === id);
        return language === 'zh-TW' ? theme.labelZh : theme.label;
      }).join(' / ')}</p>}
      {showSource && <SourceLink event={event} language={language} />}
      {status === 'completed' && <a href={event.outcomeUrl} target="_blank" rel="noopener noreferrer">{t('Verified outcome ↗', '已驗證結果 ↗')}</a>}
      {event.tickers?.map(ticker => <button key={ticker} type="button" className="text" onClick={() => onCompanyResearch?.(ticker)}>
        {t(`View ${ticker} company research`, `查看 ${ticker} 公司研究`)}
      </button>)}
    </div>
  </details>;
}

export function UpcomingCatalysts({ language = 'en', now = new Date() }) {
  const t = (en, zh) => localized([en, zh], language);
  const timeZone = DEFAULT_CALENDAR_TIME_ZONE;
  const projected = projectCatalysts(records.events, timeZone);
  const upcoming = upcomingCatalysts(projected, { now, timeZone });
  const coverage = calendarCoverage(records.events, { now, timeZone });
  return <section className="upcoming-catalysts" aria-labelledby="upcoming-catalysts-title">
    <div className="calendar-heading">
      <h2 id="upcoming-catalysts-title">{t('Upcoming Research Catalysts', '近期研究催化事件')}</h2>
      <a href="#calendar">{t('Open Research Calendar →', '開啟研究日曆 →')}</a>
    </div>
    <p>{t('Seven calendar days including today · New York', '含今天的七個日曆日 · 紐約時間')}</p>
    {upcoming.length > 0 ? <ul>{upcoming.slice(0, 3).map(event => <li key={event.id}>
      <strong>{titleFor(event, language)}</strong>
      <span>{localized(categoryCopy[event.category], language)} · {scheduleLabel(event, language, timeZone)}
        {event.tickers?.length > 0 && ` · ${event.tickers.join(', ')}`} · {localized(statusCopy[event.status], language)} · <SourceLink event={event} language={language} /></span>
    </li>)}</ul> : <p>{t('No verified upcoming events in the current calendar coverage.', '目前日曆涵蓋範圍內沒有已驗證的近期事件。')}</p>}
    <Coverage coverage={coverage} rejected={records.rejected} language={language} />
  </section>;
}

export default function ResearchCalendar({ language = 'en', now = new Date(), onCompanyResearch, data = records }) {
  const t = (en, zh) => localized([en, zh], language);
  const [timeZone, setTimeZone] = useState(DEFAULT_CALENDAR_TIME_ZONE);
  const today = calendarDate(now, timeZone);
  const [date, setDate] = useState(() => today);
  const [view, setView] = useState('week');
  const [filters, setFilters] = useState(emptyFilters);
  const period = calendarPeriod(date, view);
  const projected = useMemo(() => projectCatalysts(data.events, timeZone), [data.events, timeZone]);
  const events = filterCatalysts(projected, { ...period, ...filters });
  const onDay = day => events.filter(event => event.startDate <= day && event.endDate >= day);
  const coverage = calendarCoverage(data.events, { now, timeZone });
  const periodLabel = view === 'month' ? dateLabel(date, language, { month: 'long', year: 'numeric' })
    : `${dateLabel(period.start, language)} – ${dateLabel(period.end, language)}`;
  const eventCount = count => t(`${count} ${count === 1 ? 'event' : 'events'}`, `${count} 項事件`);
  const showEvents = items => items.map(event => <EventDetails key={event.id} {...{ event, language, timeZone, now, onCompanyResearch }} />);
  const changeFilter = (key, value) => setFilters(previous => ({ ...previous, [key]: value }));

  return <section className="research-calendar" aria-labelledby="calendar-title">
    <div className="calendar-heading">
      <div><p className="eyebrow">{t('CURATED OFFICIAL SCHEDULES', '人工審閱的官方時程')}</p>
        <h1 id="calendar-title" tabIndex="-1">{t('Research Catalyst Calendar', '研究催化事件日曆')}</h1>
        <p>{t('Explore scheduled releases, hearings, and company events that could provide new research evidence.', '查看可能提供新研究證據的發布、聽證及公司活動時程。')}</p>
      </div>
      <label>{t('Display timezone', '顯示時區')}
        <select value={timeZone} onChange={event => setTimeZone(event.target.value)}>
          {CALENDAR_TIME_ZONES.map(zone => <option key={zone} value={zone}>{zoneLabel(zone, language)} · {zone}</option>)}
        </select>
      </label>
    </div>
    <Coverage coverage={coverage} rejected={data.rejected} language={language} />
    <p>{t(`${data.events.length} curated schedule records · Partial coverage`, `${data.events.length} 筆人工審閱時程 · 部分涵蓋`)}</p>

    <div className="calendar-toolbar">
      <div role="group" aria-label={t('Calendar view', '日曆檢視')}>
        {views.map(([id, en, zh]) => <button type="button" key={id} aria-pressed={view === id} onClick={() => setView(id)}>{t(en, zh)}</button>)}
      </div>
      <div role="group" aria-label={t('Calendar period', '日曆期間')}>
        <button type="button" onClick={() => setDate(shiftCalendarPeriod(date, view, -1))}>{t('← Previous', '← 上一期')}</button>
        <button type="button" onClick={() => setDate(today)}>{t('Today', '今天')}</button>
        <button type="button" onClick={() => setDate(shiftCalendarPeriod(date, view, 1))}>{t('Next →', '下一期 →')}</button>
      </div>
    </div>
    <div className="calendar-filters">
      <label>{t('Category', '事件類別')}
        <select value={filters.category} onChange={event => changeFilter('category', event.target.value)}>
          <option value="all">{t('All events', '所有事件')}</option>
          {CALENDAR_CATEGORIES.map(id => <option key={id} value={id}>{localized(categoryCopy[id], language)}</option>)}
        </select>
      </label>
      <label>{t('Research theme', '研究主題')}
        <select value={filters.theme} onChange={event => changeFilter('theme', event.target.value)}>
          <option value="all">{t('All themes', '所有主題')}</option>
          {RESEARCH_THEMES.map(theme => <option key={theme.id} value={theme.id}>{language === 'zh-TW' ? theme.labelZh : theme.label}</option>)}
        </select>
      </label>
      <label>{t('Tracked company', '追蹤公司')}
        <select value={filters.ticker} onChange={event => changeFilter('ticker', event.target.value)}>
          <option value="all">{t('All companies', '所有公司')}</option>
          {companies.map(company => <option key={company.ticker} value={company.ticker}>{company.ticker} · {company.name}</option>)}
        </select>
      </label>
      <button type="button" onClick={() => setFilters(emptyFilters)}>{t('Reset filters', '重設篩選')}</button>
    </div>

    <h2>{periodLabel}</h2>
    <p role="status">{periodLabel} · {eventCount(events.length)}</p>
    {!events.length && <p>{t('No reviewed schedules match this period and filters.', '此期間與篩選條件下沒有已審閱的時程。')}</p>}

    {view === 'week' && <ol className="calendar-week">
      {period.days.map(day => {
        const starts = onDay(day).filter(event => event.startDate === day || day === period.start);
        return <li key={day}><h3><time dateTime={day}>{dateLabel(day, language, { weekday: 'short', month: 'short', day: 'numeric' })}</time></h3>
          {starts.length ? showEvents(starts) : <p>{onDay(day).length ? t('Ongoing · see range above', '持續進行 · 請查看上方日期範圍') : t('No scheduled events', '沒有排定的事件')}</p>}
        </li>;
      })}
    </ol>}
    {view === 'month' && <>
      <div className="calendar-weekdays" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => <span key={i}>{dateLabel(new Date(Date.UTC(2026, 0, 5 + i)).toISOString().slice(0, 10), language, { weekday: 'short' })}</span>)}
      </div>
      <ol className="calendar-month">
        {Array.from({ length: (calendarWeekday(period.start) + 6) % 7 }, (_, i) => <li key={`pad-${i}`} className="calendar-pad" aria-hidden="true" />)}
        {period.days.map(day => {
          const count = onDay(day).length;
          return <li key={day} className={count || day === date ? '' : 'calendar-no-events'}>
            <button type="button" aria-pressed={date === day} aria-current={day === today ? 'date' : undefined}
              aria-label={`${dateLabel(day, language, { dateStyle: 'full' })} · ${eventCount(count)}`} onClick={() => setDate(day)}>
              <time dateTime={day}><span>{day.slice(-2)}</span><span className="calendar-mobile-date">{dateLabel(day, language, { weekday: 'short', month: 'short', day: 'numeric' })}</span></time>
              {count > 0 && <small>{eventCount(count)}</small>}
            </button>
          </li>;
        })}
      </ol>
      <label className="calendar-mobile-date">{t('Inspect a date', '查看日期')}
        <input type="date" value={date} min={period.start} max={period.end}
          onChange={event => { if (period.days.includes(event.target.value)) setDate(event.target.value); }} />
      </label>
      <section className="calendar-day-detail" aria-labelledby="calendar-day-title">
        <h3 id="calendar-day-title">{dateLabel(date, language, { dateStyle: 'full' })} · {eventCount(onDay(date).length)}</h3>
        {onDay(date).length ? showEvents(onDay(date)) : <p>{t('No reviewed events for this date.', '此日期沒有已審閱的事件。')}</p>}
      </section>
    </>}
    {view === 'agenda' && events.length > 0 && <ol className="calendar-agenda">
      {events.map(event => <li key={event.id}>
        <EventDetails {...{ event, language, timeZone, now, onCompanyResearch }} showSource={false} />
        <SourceLink event={event} language={language} />
      </li>)}
    </ol>}
    <p className="calendar-note">{t(
      'This manually curated calendar covers selected official schedules. A date passing does not verify that an event took place or establish its outcome. Published developments remain in the existing evidence views.',
      '此日曆僅涵蓋人工審閱的部分官方時程。排定日期已過不代表活動已舉行，也無法證明結果。已發布的進展可在既有證據頁面查閱。',
    )}</p>
  </section>;
}
