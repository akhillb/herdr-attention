'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { nextMeeting } = require('../src/model');

test('picks the earliest future meeting and lists the rest', () => {
  const now = Date.now();
  const events = [
    { title: 'B', start: new Date(now + 60 * 60000) },
    { title: 'A', start: new Date(now + 10 * 60000) },
    { title: 'C', start: new Date(now + 120 * 60000) },
  ];
  const v = nextMeeting(events, now);
  assert.equal(v.next.title, 'A');
  assert.deepEqual(v.upcoming.map((e) => e.title), ['B', 'C']);
});

test('empty events -> null, not imminent', () => {
  const v = nextMeeting([], Date.now());
  assert.equal(v.next, null);
  assert.equal(v.isImminent, false);
  assert.equal(v.countdownMs, null);
});

test('all-past events -> null', () => {
  const now = Date.now();
  const v = nextMeeting([{ title: 'x', start: new Date(now - 5 * 60000) }], now);
  assert.equal(v.next, null);
});

test('imminent boundary is inclusive at exactly 10 minutes', () => {
  const now = Date.now();
  const at10 = nextMeeting([{ title: 'x', start: new Date(now + 10 * 60000) }], now);
  assert.equal(at10.isImminent, true);
  const past10 = nextMeeting([{ title: 'x', start: new Date(now + 10 * 60000 + 1) }], now);
  assert.equal(past10.isImminent, false);
});

test('in-progress meeting is skipped in favour of the next', () => {
  const now = Date.now();
  const v = nextMeeting([
    { title: 'ongoing', start: new Date(now - 2 * 60000) },
    { title: 'next', start: new Date(now + 15 * 60000) },
  ], now);
  assert.equal(v.next.title, 'next');
});

test('ignores entries with invalid start dates', () => {
  const now = Date.now();
  const v = nextMeeting([
    { title: 'bad', start: new Date(NaN) },
    { title: 'good', start: new Date(now + 5 * 60000) },
  ], now);
  assert.equal(v.next.title, 'good');
});
