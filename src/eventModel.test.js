import { CURRENT_EVENT_DAYS, infrastructureEvents } from './eventModel';

const record = (publishedAt, url = 'https://insidelines.pjm.com/a/') => ({ source: 'events', type: 'infrastructureEvent', id: url, retrievedAt: '2026-09-20T00:00:00Z', value: { title: 'PJM updates its load forecast', category: 'POWER', region: 'Mid-Atlantic', source: 'PJM', publishedAt, url } });

test('shows primary events for 30 days and then archives them', () => {
  const now = new Date('2026-09-23T00:00:00Z');
  expect(infrastructureEvents({ observations: [record('2026-09-01T00:00:00Z')] }, now)[0].archived).toBe(false);
  expect(infrastructureEvents({ observations: [record('2026-08-24T00:00:00Z')] }, now)[0].archived).toBe(true);
  expect(CURRENT_EVENT_DAYS).toBe(30);
});

test('omits unrelated observations and keeps the latest revision of an event', () => {
  const old = record('2026-09-01T00:00:00Z');
  const updated = { ...old, id: 'revision', retrievedAt: '2026-09-22T00:00:00Z', value: { ...old.value, title: 'Updated PJM load forecast' } };
  const unrelated = { ...old, type: 'filings' };
  expect(infrastructureEvents({ observations: [old, updated, unrelated] }, new Date('2026-09-23T00:00:00Z'))).toHaveLength(1);
  expect(infrastructureEvents({ observations: [old, updated] }, new Date('2026-09-23T00:00:00Z'))[0].title).toBe('Updated PJM load forecast');
});

test('alternative publisher labels survive alongside retained grid-operator history', () => {
  const governor = record('2026-09-21T00:00:00Z', 'https://gov.texas.gov/news/post/data-center-policy');
  governor.value = { ...governor.value, source: 'Texas Governor', region: 'Texas', category: 'PERMIT' };
  const blog = record('2026-08-31T00:00:00Z', 'https://blogs.oracle.com/cloud-infrastructure/region-launch');
  blog.value = { ...blog.value, source: 'Oracle OCI Blog', category: 'CAPEX' };
  const result = infrastructureEvents({ observations: [record('2026-09-01T00:00:00Z'), governor, blog] }, new Date('2026-10-05T00:00:00Z'));
  expect(result.map(item => item.source)).toEqual(['Texas Governor', 'PJM', 'Oracle OCI Blog']);
  expect(result.find(item => item.source === 'Oracle OCI Blog').archived).toBe(true);
});
