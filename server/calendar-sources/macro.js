const { plain } = require('../event-discovery');

const BLS = 'https://www.bls.gov/schedule/news_release/bls.ics';
const BEA = 'https://bea.gov/news/schedule';
const BEA_NEXT = 'https://www.bea.gov/news/schedule/next-year';
const FED = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';
const ET = 'America/New_York';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const monthNames = MONTHS.join('|');
const pad = value => String(value).padStart(2, '0');
const monthNumber = name => MONTHS.findIndex(item => item.toLowerCase() === String(name).toLowerCase()) + 1;
const blsAliases = {
  'c26d524f-228b-46e9-b00e-fdbec26d68af': 'bls-cpi-2026-10',
  '06c28939-7346-46f0-872e-afa00ccadc5d': 'bls-employment-2026-11',
};

function dayKey(year, month, day) {
  const key = `${year}-${pad(month)}-${pad(day)}`;
  const stamp = new Date(`${key}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isFinite(stamp.getTime()) &&
    stamp.toISOString().slice(0, 10) === key ? key : null;
}

const easternTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
  minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function easternTimestamp(day, hour, minute, second = 0) {
  if (!day || hour > 23 || minute > 59 || second > 59) return null;
  const clock = `${pad(hour)}:${pad(minute)}:${pad(second)}`;
  const matching = ['-05:00', '-04:00'].map(offset => `${day}T${clock}${offset}`).filter(iso =>
    easternTime.format(new Date(iso)) === `${day} ${clock}`);
  // The overlap and skipped hour at a daylight-saving transition cannot be
  // disambiguated by a wall clock alone.
  return matching.length === 1 ? matching[0] : null;
}

function macroEvent(id, title, titleZh, sourceUrl, publisher, schedule, status = 'scheduled') {
  return { id, category: 'macro', title, titleZh, sourceUrl, publisher, ...schedule, status };
}

function candidate(event, proof = 'schedule', reason, evidence) {
  return { event, identity: event.id, proof, ...(reason ? { reason } : {}), ...(evidence ? { evidence } : {}) };
}

function review(sourceUrl, publisher, title, reason, extra = {}) {
  return { event: { category: 'macro', sourceUrl, publisher, title, ...extra }, proof: 'review', reason };
}

function parseIcsStart(field) {
  const day = /^(\d{4})(\d{2})(\d{2})$/.exec(field?.value || '');
  if (day && (!field.parameters || field.parameters === ';VALUE=DATE')) {
    const start = dayKey(day[1], day[2], day[3]);
    return start && { precision: 'date', start, timeZone: ET };
  }
  const time = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(field?.value || '');
  if (!time) return null;
  const [, year, month, date, h, m, s, utc] = time;
  const key = dayKey(year, month, date);
  if (!key || +h > 23 || +m > 59 || +s > 59) return null;
  if (utc && !field.parameters) {
    return { precision: 'timestamp', start: `${key}T${h}:${m}:${s}Z`, timeZone: 'UTC' };
  }
  if (!utc && /^;TZID=(?:"(?:America\/New_York|US-Eastern)"|America\/New_York|US-Eastern)$/i.test(field.parameters)) {
    const start = easternTimestamp(key, +h, +m, +s);
    return start && { precision: 'timestamp', start, timeZone: ET };
  }
  return null;
}

function parseBlsIcs(text) {
  const publisher = 'U.S. Bureau of Labor Statistics';
  const body = text.replace(/^\uFEFF/, '').replace(/\r?\n[ \t]/g, '').trim();
  if (!/^BEGIN:VCALENDAR\r?\n/i.test(body) || !/\r?\nEND:VCALENDAR$/i.test(body)) {
    throw new Error('Unrecognized BLS iCalendar envelope');
  }
  const events = [...body.matchAll(/^BEGIN:VEVENT\r?\n([\s\S]*?)^END:VEVENT\s*$/gmi)];
  if (events.length > 1000 || (body.match(/^BEGIN:VEVENT\s*$/gmi) || []).length !== events.length) {
    throw new Error('BLS iCalendar entries exceed bounds or are incomplete');
  }
  const cancelMethod = /^METHOD:CANCEL\s*$/mi.test(body);
  const release = new RegExp(`^(?:(Rescheduled):\\s*)?(Consumer Price Index(?: \\(CPI\\))?|Employment Situation) (?:for )?(${monthNames}) (\\d{4})$`, 'i');
  return events.flatMap(([, block]) => {
    const fields = new Map();
    const duplicate = new Set();
    for (const line of block.split(/\r?\n/)) {
      const property = /^([\w-]+)((?:;[^:]*)?):(.*)$/.exec(line);
      if (!property) continue;
      const key = property[1].toUpperCase();
      if (fields.has(key)) duplicate.add(key);
      else fields.set(key, { parameters: property[2], value: property[3].trim() });
    }
    const title = fields.get('SUMMARY')?.value.replace(/\\([,;\\])/g, '$1');
    if (!title || !/(?:Consumer Price Index|Employment Situation)/i.test(title)) return [];
    const occurrence = release.exec(title);
    const unnamed = /^(?:(Rescheduled):\s*)?(Consumer Price Index(?: \(CPI\))?|Employment Situation)$/i.exec(title);
    const start = parseIcsStart(fields.get('DTSTART'));
    const statusValue = fields.get('STATUS')?.value.toUpperCase() || 'CONFIRMED';
    const uid = fields.get('UID')?.value.toLowerCase();
    const metric = occurrence?.[2] || unnamed?.[2];
    const family = metric?.toLowerCase().startsWith('consumer') ? 'cpi' : 'employment';
    const uidBound = unnamed && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(uid || '') &&
      fields.get('CATEGORIES')?.value.split(',').some(value => value.trim() === 'BLS');
    const id = occurrence ? `bls-${family}-${occurrence[4]}-${pad(monthNumber(occurrence[3]))}`
      : uidBound && (blsAliases[uid] || `bls-${family}-uid-${uid}`);
    if (!id || !uid || !start || ['SUMMARY', 'UID', 'DTSTART', 'STATUS'].some(key => duplicate.has(key)) ||
      ['RRULE', 'RDATE', 'RECURRENCE-ID', 'EXDATE'].some(key => fields.has(key)) ||
      !['CONFIRMED', 'TENTATIVE', 'CANCELLED'].includes(statusValue) || (cancelMethod && statusValue !== 'CANCELLED')) {
      return [review(BLS, publisher, title, 'BLS entry lacks an unambiguous release occurrence, start, or status', { ...start, ...(id ? { id } : {}) })];
    }
    const rescheduled = occurrence?.[1] || unnamed?.[1];
    const period = occurrence ? ` for ${occurrence[3]} ${occurrence[4]}` : '';
    const periodZh = occurrence ? `${occurrence[4]} 年 ${monthNumber(occurrence[3])} 月` : '';
    const cpi = family === 'cpi';
    const status = { CONFIRMED: 'scheduled', TENTATIVE: 'tentative', CANCELLED: 'canceled' }[statusValue];
    const event = macroEvent(id, `U.S. ${metric}${period}`,
      `美國 ${periodZh}${cpi ? '消費者物價指數' : '就業情勢報告'}`, BLS, publisher, start, status);
    const proof = status === 'canceled' ? 'cancellation' : rescheduled && status === 'scheduled' ? 'reschedule' : 'schedule';
    return [candidate(event, proof, undefined, { uid, startField: fields.get('DTSTART').value, status: statusValue })];
  });
}

function cell(row, element, className) {
  return row.match(new RegExp(`<${element}\\b[^>]*\\bclass=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/${element}>`, 'i'))?.[1];
}

function parseBeaSchedule(html, sourceUrl = BEA) {
  const publisher = 'U.S. Bureau of Economic Analysis';
  const table = /<table\b[^>]*\bid=["']release-schedule-table["'][^>]*>([\s\S]*?)<\/table>/i.exec(html)?.[1];
  const year = /\bYear\s+(\d{4})\b/i.exec(plain(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i.exec(table || '')?.[1]))?.[1];
  const body = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i.exec(table || '')?.[1];
  if (!year || body === undefined) throw new Error('Unrecognized BEA release schedule table');
  const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (rows.length > 400 || (body.match(/<tr\b/gi) || []).length !== rows.length) {
    throw new Error('BEA schedule rows exceed bounds or are incomplete');
  }
  const personal = new RegExp(`^Personal Income and Outlays, (${monthNames}) (\\d{4})$`, 'i');
  const dayPattern = new RegExp(`^(${monthNames}) (\\d{1,2})$`, 'i');
  return rows.flatMap(([, row]) => {
    const title = plain(cell(row, 'td', 'release-title'));
    if (!/^(?:Personal Income and Outlays\b|GDP \()/i.test(title)) return [];
    const pio = personal.exec(title);
    const gdp = /^GDP \((Advance|Second|Third) Estimate\)[^,]*(?:,[^,]+)*?,\s*([1-4])(?:st|nd|rd|th) Quarter(?: and Year)? (\d{4})(?:;[^;]+)?$/i.exec(title);
    const field = cell(row, 'td', 'scheduled-date') || '';
    const day = dayPattern.exec(plain(cell(field, 'div', 'release-date')));
    const time = /^(1[0-2]|[1-9]):([0-5]\d) (AM|PM)$/i.exec(plain(cell(field, 'small', 'text-muted')));
    const start = day && time && easternTimestamp(dayKey(year, monthNumber(day[1]), day[2]),
      +time[1] % 12 + (time[3].toUpperCase() === 'PM' ? 12 : 0), +time[2]);
    const id = pio ? `bea-personal-income-outlays-${pio[2]}-${pad(monthNumber(pio[1]))}`
      : gdp && `bea-gdp-${gdp[3]}-q${gdp[2]}-${gdp[1].toLowerCase()}-estimate`;
    if (!id || !start || /\b(?:cancell?ed|rescheduled|tentative|postponed|revised date)\b/i.test(plain(row))) {
      return [review(sourceUrl, publisher, title, 'BEA row needs a verified reporting period, release time, or schedule status', {
        ...(id ? { id } : {}), ...(start ? { start, precision: 'timestamp', timeZone: ET } : {}),
      })];
    }
    const estimate = { advance: '初估', second: '第二次估計', third: '第三次估計' };
    const zh = pio ? `美國 ${pio[2]} 年 ${monthNumber(pio[1])} 月個人所得與支出`
      : `美國 ${gdp[3]} 年第 ${gdp[2]} 季 GDP ${estimate[gdp[1].toLowerCase()]}`;
    return [candidate(macroEvent(id, `U.S. ${title}`, zh, sourceUrl, publisher,
      { start, timeZone: ET, precision: 'timestamp' }), 'schedule', undefined, 'BEA release table year, scheduled date/time, and reporting-period title')];
  });
}

// Existing hand-reviewed aliases are bound to the corresponding ordinal in
// their eight regular meetings. New IDs use the ordinal even if a date moves.
const meetingAliases = { '2026-8': 'fomc-2026-12', '2027-1': 'fomc-2027-01' };

function parseFedSchedule(html, { now = new Date() } = {}) {
  const publisher = 'Federal Reserve';
  const headings = [...html.matchAll(/<h4\b[^>]*>\s*<a\b[^>]*>\s*(\d{4}) FOMC Meetings\s*<\/a>\s*<\/h4>/gi)];
  if (!headings.length || headings.length > 15) throw new Error('Unrecognized Federal Reserve meeting calendar');
  const currentYear = Number(easternTime.format(new Date(now)).slice(0, 4));
  return headings.flatMap((heading, index) => {
    const year = +heading[1];
    if (year < new Date(new Date(now).getTime() - 60 * 86_400_000).getUTCFullYear() || year > currentYear + 1) return [];
    const panel = html.slice(heading.index + heading[0].length, headings[index + 1]?.index || html.length);
    const matches = [...panel.matchAll(/<div\b[^>]*class=["'][^"']*\bfomc-meeting__month\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*class=["'][^"']*\bfomc-meeting__date\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)];
    const dates = matches.map(([, monthCell, dateCell]) => {
      const [firstMonth, secondMonth] = plain(monthCell).split('/').map(monthNumber);
      const raw = /^(\d{1,2})\s*[-–]\s*(\d{1,2})\*?$/.exec(plain(dateCell));
      const start = raw && firstMonth && dayKey(year, firstMonth, raw[1]);
      const end = raw && firstMonth && dayKey(secondMonth < firstMonth ? year + 1 : year, secondMonth || firstMonth, raw[2]);
      return start && end && Date.parse(end) - Date.parse(start) === 86_400_000 ? { start, end, firstMonth } : null;
    });
    const expected = (panel.match(/\bfomc-meeting__month\b/g) || []).length;
    if (dates.length !== 8 || expected !== 8 || dates.some((item, i) => !item || (i && item.start <= dates[i - 1]?.end))) {
      return [review(FED, publisher, `${year} FOMC meetings`, 'Cannot establish the regular eight-meeting annual sequence')];
    }
    const tentative = year > currentYear;
    if (tentative && !/each meeting date is tentative until confirmed/i.test(plain(panel))) {
      return [review(FED, publisher, `${year} FOMC meetings`, 'Future-year confirmation status is not supported by the official panel')];
    }
    return dates.map(({ start, end, firstMonth }, i) => {
      const ordinal = `${year}-${i + 1}`;
      const id = meetingAliases[ordinal] || `fomc-${year}-meeting-${i + 1}`;
      return candidate(macroEvent(id, `${MONTHS[firstMonth - 1]} ${year} FOMC meeting`,
        `${year} 年 ${firstMonth} 月聯邦公開市場委員會會議`, FED, publisher,
        { start, end, timeZone: ET, precision: 'date' }, tentative ? 'tentative' : 'scheduled'),
      'schedule', undefined, 'Federal Reserve annual meeting panel with eight chronological two-day occurrences');
    });
  });
}

const macroSources = [
  { id: 'bls-ics', url: BLS, parse: parseBlsIcs },
  { id: 'bea-schedule', url: BEA, parse: text => parseBeaSchedule(text, BEA) },
  { id: 'bea-next-year', url: BEA_NEXT, parse: text => parseBeaSchedule(text, BEA_NEXT) },
  { id: 'fed-fomc', url: FED, parse: parseFedSchedule },
];

module.exports = { macroSources, parseBlsIcs, parseBeaSchedule, parseFedSchedule, dayKey, easternTimestamp };
