// Calendar-only admission. A fetched link never expands these scopes.
const endpoints = {
  'bls-ics': ['https://www.bls.gov/schedule/news_release/bls.ics'],
  'bea-schedule': ['https://bea.gov/news/schedule'],
  'bea-next-year': ['https://www.bea.gov/news/schedule/next-year'],
  'fed-fomc': ['https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'],
  'nebius-ir': ['https://nebius.com/investor-events'],
  'broadcom-ir': ['https://investors.broadcom.com/company-information/events-presentations'],
  'coreweave-ir': ['https://investors.coreweave.com/events-and-presentations/default.aspx'],
  'loudoun-planning': ['https://www.loudoun.gov/6222/Phase-2-Data-Center-Standards-Locations'],
  'loudoun-calendar': ['https://www.loudoun.gov/mastercalendar'],
};

const macroMethods = ['bls-ics', 'bea-schedule', 'bea-next-year', 'fed-fomc'];
const issuerMethods = { 'nebius-ir': 'NBIS', 'broadcom-ir': 'AVGO', 'coreweave-ir': 'CRWV' };

function sourceEndpointAllowed(method, url) {
  return (Object.hasOwn(endpoints, method) && endpoints[method].includes(url))
    || (method === 'loudoun-calendar' && /^https:\/\/www\.loudoun\.gov\/Calendar\.aspx\?EID=[1-9]\d{0,8}$/.test(url));
}

function automatedSourceAllowed(event) {
  const { verificationMethod: method, verificationSourceUrl, sourceUrl, category, tickers } = event;
  if (!sourceEndpointAllowed(method, verificationSourceUrl) || !sourceEndpointAllowed(method, sourceUrl)) return false;
  if (macroMethods.includes(method)) return category === 'macro' && !tickers?.length;
  if (Object.hasOwn(issuerMethods, method)) {
    return ['earnings', 'company'].includes(category) && tickers?.length === 1 && tickers[0] === issuerMethods[method];
  }
  if (method === 'loudoun-calendar') {
    return category === 'infrastructure' && !tickers?.length && sourceUrl === verificationSourceUrl
      && sourceUrl === `https://www.loudoun.gov/Calendar.aspx?EID=${event.id.replace(/^loudoun-calendar-/, '')}`;
  }
  return false;
}

module.exports = { sourceEndpointAllowed, automatedSourceAllowed };
