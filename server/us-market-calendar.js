const TIME_ZONE = 'America/New_York';

// Published NYSE holidays. Review this list when NYSE publishes another year or
// announces an exceptional closure: https://www.nyse.com/trade/hours-calendars
const NYSE_HOLIDAYS = {
  2026: ['01-01', '01-19', '02-16', '04-03', '05-25', '06-19', '07-03', '09-07', '11-26', '12-25'],
  2027: ['01-01', '01-18', '02-15', '03-26', '05-31', '06-18', '07-05', '09-06', '11-25', '12-24'],
  2028: ['01-17', '02-21', '04-14', '05-29', '06-19', '07-04', '09-04', '11-23', '12-25'],
};

function easternParts(now = new Date()) {
  const values = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  return Object.fromEntries(values.filter(item => item.type !== 'literal').map(item => [item.type, item.value]));
}

function isNyseTradingDay(part) {
  if (['Sat', 'Sun'].includes(part.weekday)) return false;
  const holidays = NYSE_HOLIDAYS[Number(part.year)];
  // Outside published coverage, let the provider's dated-row validation decide.
  // This avoids suppressing all price updates if the calendar has not been renewed.
  return !holidays || !holidays.includes(`${part.month}-${part.day}`);
}

function latestExpectedPriceSession(now = new Date()) {
  const part = easternParts(now);
  const day = new Date(`${part.year}-${part.month}-${part.day}T17:00:00Z`);
  // Match the scheduler's conservative publication buffer, also on early-close days.
  if (Number(part.hour) < 16 || (Number(part.hour) === 16 && Number(part.minute) < 15)) {
    day.setUTCDate(day.getUTCDate() - 1);
  }
  while (!isNyseTradingDay(easternParts(day))) day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

module.exports = { easternParts, isNyseTradingDay, latestExpectedPriceSession, NYSE_HOLIDAYS };
