'use strict';

const { execFile } = require('node:child_process');

// Column order produced by:
//   gcalcli --nocolor agenda <start> <end> --tsv \
//     --details url --details conference --details location
// (gcalcli details.py HANDLERS order, with those details enabled)
const COLUMNS = [
  'start_date', 'start_time', 'end_date', 'end_time',
  'html_link', 'hangout_link', 'conf_type', 'conf_uri',
  'title', 'location',
];

function toDate(date, time) {
  if (!date || !time) return new Date(NaN);
  return new Date(`${date}T${time}`);
}

// Only accept http(s) links. Rejecting everything else stops a calendar-supplied
// value (e.g. one starting with "-", or a "file://" scheme) from being smuggled
// as a flag/argument when the link is later handed to `open`/`xdg-open`.
function safeLink(url) {
  return /^https?:\/\//i.test(url) ? url : '';
}

// Parse gcalcli TSV into normalized, start-sorted events. Tolerant of short or
// garbage lines: anything without a valid start time is skipped rather than throwing.
function parseTsv(text) {
  const events = [];
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    const row = {};
    COLUMNS.forEach((c, i) => { row[c] = (cols[i] || '').trim(); });

    const start = toDate(row.start_date, row.start_time);
    if (Number.isNaN(start.getTime())) continue; // all-day or unparseable

    events.push({
      title: row.title || '(no title)',
      start,
      end: toDate(row.end_date, row.end_time),
      link: safeLink(row.conf_uri || row.hangout_link || row.html_link || ''),
      location: row.location || '',
    });
  }
  return events.sort((a, b) => a.start - b.start);
}

// Synthetic events relative to now so the UI (incl. the ≤10 min state) is
// visible without any Google setup.
function demoEvents(now = Date.now()) {
  const mk = (mins, title, location, link) => ({
    title,
    location,
    link,
    start: new Date(now + mins * 60000),
    end: new Date(now + (mins + 30) * 60000),
  });
  return [
    mk(8, 'Standup with Automate pod', 'Zoom', 'https://zoom.us/j/123456789'),
    mk(47, '1:1 with Manager', 'Google Meet', 'https://meet.google.com/abc-defg-hij'),
    mk(133, 'T2 Copilot design review', 'Conf Room 4', ''),
  ];
}

// Parse `gcalcli list` (rendered with --nocolor) into the titles of calendars
// the account owns — i.e. "your own" calendars, excluding subscribed/reader ones
// like holidays and meeting-room resources.
function parseCalendarList(text) {
  const owned = [];
  for (const line of String(text).split('\n')) {
    const m = line.match(/^\s*(owner|reader|writer|freebusy)\s+(.+?)\s*$/);
    if (m && m[1] === 'owner') owned.push(m[2]);
  }
  return owned;
}

// Resolve owned calendar titles via gcalcli. Returns [] on any failure.
function detectOwnedCalendars({ gcalcli = 'gcalcli' } = {}) {
  return new Promise((resolve) => {
    execFile(gcalcli, ['--nocolor', 'list'], { timeout: 30000 }, (err, stdout) => {
      resolve(err ? [] : parseCalendarList(stdout));
    });
  });
}

// Returns { ok, events, error }. Never rejects.
// `calendars`: restrict to these calendar titles ([] = every visible calendar).
function fetchEvents({ demo = false, window = 'in 12 hours', gcalcli = 'gcalcli', calendars = [] } = {}) {
  if (demo) {
    return Promise.resolve({ ok: true, events: demoEvents() });
  }
  return new Promise((resolve) => {
    const args = [
      '--nocolor', 'agenda', 'now', window, '--tsv',
      '--details', 'url', '--details', 'conference', '--details', 'location',
    ];
    for (const c of calendars) args.push('--calendar', c);
    execFile(gcalcli, args, { timeout: 45000 }, (err, stdout, stderr) => {
      if (err) {
        const raw = String(stderr || err.message || err);
        let error;
        if (err.killed || err.signal) error = 'gcalcli timed out';
        else if (/ENOENT|not found/i.test(raw)) error = 'gcalcli not installed';
        else error = raw.trim();
        resolve({ ok: false, events: [], error });
        return;
      }
      resolve({ ok: true, events: parseTsv(stdout) });
    });
  });
}

module.exports = {
  parseTsv, demoEvents, fetchEvents, safeLink,
  parseCalendarList, detectOwnedCalendars, COLUMNS,
};
