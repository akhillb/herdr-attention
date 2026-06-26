'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { parseTsv, fetchEvents, demoEvents, safeLink, parseCalendarList } = require('../src/calendar');

// Columns: start_date start_time end_date end_time html_link hangout_link
//          conf_type conf_uri title location
const SAMPLE = [
  '2026-06-25\t14:00\t2026-06-25\t14:30\thttps://h/1\t\t\t\tStandup\tZoom',
  '2026-06-25\t09:00\t2026-06-25\t09:15\t\t\t\thttps://meet/abc\t1:1\tMeet',
].join('\n');

test('parses TSV and sorts by start time', () => {
  const events = parseTsv(SAMPLE);
  assert.equal(events.length, 2);
  assert.equal(events[0].title, '1:1'); // 09:00 sorts first
  assert.equal(events[1].title, 'Standup');
  assert.equal(events[0].location, 'Meet');
});

test('empty / whitespace input -> []', () => {
  assert.deepEqual(parseTsv(''), []);
  assert.deepEqual(parseTsv('\n   \n'), []);
});

test('malformed and all-day (no time) lines are skipped', () => {
  const text = 'garbage line without tabs\n'
    + '2026-06-25\t\t2026-06-25\t\t\t\t\t\tAll day\t\n' // empty start_time
    + '2026-06-25\t10:00\t2026-06-25\t10:30\t\t\t\t\tValid\t';
  const events = parseTsv(text);
  assert.equal(events.length, 1);
  assert.equal(events[0].title, 'Valid');
});

test('link prefers conference URI over hangout/html', () => {
  const e = parseTsv('2026-06-25\t14:00\t2026-06-25\t14:30\thttps://html\t\t\thttps://conf\tT\t')[0];
  assert.equal(e.link, 'https://conf');
});

test('safeLink rejects non-http(s) and flag-like values', () => {
  assert.equal(safeLink('https://meet.google.com/x'), 'https://meet.google.com/x');
  assert.equal(safeLink('http://example.com'), 'http://example.com');
  assert.equal(safeLink('-e'), '');
  assert.equal(safeLink('--args'), '');
  assert.equal(safeLink('file:///etc/passwd'), '');
  assert.equal(safeLink('javascript:alert(1)'), '');
  assert.equal(safeLink(''), '');
});

test('parseTsv strips an unsafe link from an event', () => {
  const e = parseTsv('2026-06-25\t14:00\t2026-06-25\t14:30\tfile:///etc/passwd\t\t\t\tT\t')[0];
  assert.equal(e.link, '');
});

test('parseCalendarList returns only owner calendars', () => {
  const text = [
    ' Access  Title',
    ' ------  -----',
    '  owner  akhil.l@browserstack.com',
    ' reader  Holidays in India',
    ' reader  Oberoi Commerz II-26th Floor-26-Quasar (10)',
    ' writer  Shared team cal',
  ].join('\n');
  assert.deepEqual(parseCalendarList(text), ['akhil.l@browserstack.com']);
});

test('parseCalendarList handles empty / no-owner input', () => {
  assert.deepEqual(parseCalendarList(''), []);
  assert.deepEqual(parseCalendarList(' reader  Holidays in India'), []);
});

test('demoEvents are all in the future', () => {
  const now = Date.now();
  assert.ok(demoEvents(now).every((e) => e.start.getTime() > now));
});

test('fetchEvents demo mode returns events without spawning gcalcli', async () => {
  const res = await fetchEvents({ demo: true });
  assert.equal(res.ok, true);
  assert.ok(res.events.length >= 1);
  assert.ok(res.events.every((e) => e.start.getTime() > Date.now()));
});

test('fetchEvents reports missing gcalcli gracefully', async () => {
  const res = await fetchEvents({ gcalcli: 'gcalcli-definitely-not-installed-xyz' });
  assert.equal(res.ok, false);
  assert.match(res.error, /not installed/i);
  assert.deepEqual(res.events, []);
});
