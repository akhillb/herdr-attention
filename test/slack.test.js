'use strict';

const test = require('node:test');
const assert = require('node:assert');
const slack = require('../src/addons/slack');

test('snippet cleans mentions, links, entities and truncates', () => {
  assert.equal(slack.snippet('hey <@U123|priya> see <#C1|eng> &amp; <https://x|here>'), 'hey @priya see #eng & here');
  assert.equal(slack.snippet('a'.repeat(200)).length, 90);
});

test('msFromTs converts a Slack ts to epoch ms', () => {
  assert.equal(slack.msFromTs('1719400000.000200'), 1719400000000);
  assert.equal(slack.msFromTs(''), 0);
});

test('unansweredDm: flagged only when newest real msg is not mine', () => {
  const me = 'UME';
  assert.ok(slack.unansweredDm([{ type: 'message', ts: '2', user: 'UX' }], me));
  assert.equal(slack.unansweredDm([{ type: 'message', ts: '2', user: 'UME' }], me), null);
  // subtype/join messages are ignored; newest real one is theirs
  const info = slack.unansweredDm([
    { type: 'message', subtype: 'channel_join', ts: '3', user: 'UX' },
    { type: 'message', ts: '2', user: 'UX' },
  ], me);
  assert.ok(info);
  assert.equal(info.last.ts, '2');
});

test('dmItem maps to the Attention item shape with SLA deadline', () => {
  const info = { last: { ts: '1000.0', text: 'ping', user: 'UX' }, recent: [{ text: 'ping' }] };
  const it = slack.dmItem('D1', 'priya', info, 'https://slack.com/app_redirect?channel=D1', 120 * 60000);
  assert.equal(it.source, 'slack');
  assert.equal(it.tag, 'SLACK');
  assert.equal(it.title, 'priya · DM');
  assert.equal(it.deadline, 1000 * 1000 + 120 * 60000);
  assert.ok(it.openUrl.startsWith('https://'));
});

test('mentionItem uses the permalink and channel name', () => {
  const it = slack.mentionItem({
    channel: { id: 'C1', name: 'eng-platform' }, user: 'UX', username: 'ravi',
    text: 'need a +1', ts: '2000.0', permalink: 'https://slack.com/archives/C1/p2000',
  }, 60 * 60000);
  assert.equal(it.title, 'ravi · #eng-platform');
  assert.equal(it.openUrl, 'https://slack.com/archives/C1/p2000');
  assert.equal(it.deadline, 2000 * 1000 + 60 * 60000);
});

test('isChannelMatch excludes DM matches', () => {
  assert.equal(slack.isChannelMatch({ channel: { id: 'C1', name: 'eng' } }), true);
  assert.equal(slack.isChannelMatch({ channel: { id: 'D1', is_im: true } }), false);
  assert.equal(slack.isChannelMatch({ channel: { id: 'G1', name: 'grp', is_mpim: true } }), false);
});

test('fetch without a token reports not connected (no throw)', async () => {
  const saved = process.env.SLACK_USER_TOKEN;
  delete process.env.SLACK_USER_TOKEN;
  delete process.env.HERDR_PLUGIN_CONFIG_DIR;
  const res = await slack.fetch({});
  assert.equal(res.ok, false);
  assert.match(res.error, /not connected/);
  if (saved !== undefined) process.env.SLACK_USER_TOKEN = saved;
});

test('demo mode returns SLACK items', async () => {
  const res = await slack.fetch({ demo: true });
  assert.equal(res.ok, true);
  assert.ok(res.items.length >= 1);
  assert.ok(res.items.every((i) => i.tag === 'SLACK'));
});
