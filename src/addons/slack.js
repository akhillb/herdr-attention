'use strict';

// Slack source addon: surfaces unanswered DMs and @-mentions as Attention items.
// Read-only user token (xoxp) — from SLACK_USER_TOKEN, config.json (slackToken),
// or a `slack_token` file in HERDR_PLUGIN_CONFIG_DIR. Never committed.
const fs = require('node:fs');
const path = require('node:path');

function configDir() { return process.env.HERDR_PLUGIN_CONFIG_DIR || ''; }

function fileConfig() {
  const dir = configDir();
  if (!dir) return {};
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')) || {}; }
  catch { return {}; }
}

function resolveToken() {
  if (process.env.SLACK_USER_TOKEN && process.env.SLACK_USER_TOKEN.trim()) {
    return process.env.SLACK_USER_TOKEN.trim();
  }
  const fc = fileConfig();
  if (fc.slackToken) return String(fc.slackToken).trim();
  const dir = configDir();
  if (dir) {
    try { const t = fs.readFileSync(path.join(dir, 'slack_token'), 'utf8').trim(); if (t) return t; } catch {}
  }
  return null;
}

function settings() {
  const fc = fileConfig();
  const num = (env, file, def) => {
    const e = process.env[env];
    if (e != null && e !== '' && !Number.isNaN(Number(e))) return Number(e);
    return typeof file === 'number' ? file : def;
  };
  return {
    slaMs: num('SLACK_SLA_MIN', fc.slackSlaMin, 120) * 60000,
    maxItems: num('SLACK_MAX_ITEMS', fc.slackMaxItems, 20),
    dms: fc.slackDms !== false,
    mentions: fc.slackMentions !== false,
  };
}

async function slackApi(token, method, params = {}) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'slack_error');
  return json;
}

function msFromTs(ts) { return Math.floor(parseFloat(ts) * 1000) || 0; }

// Light cleanup of Slack message text for a one-line snippet.
function snippet(text, n = 90) {
  let s = String(text || '')
    .replace(/<@[A-Z0-9]+(\|([^>]+))?>/g, (_m, _p, name) => (name ? `@${name}` : '@?'))
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1')
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, '$2')
    .replace(/<(https?:[^>]+)>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > n) s = s.slice(0, n - 1) + '…';
  return s;
}

function makeItem({ id, title, text, ts, openUrl, context, slaMs }) {
  return {
    id,
    source: 'slack',
    tag: 'SLACK',
    colorRole: 'slack',
    title,
    sub: snippet(text),
    deadline: msFromTs(ts) + slaMs,
    openUrl: /^https?:\/\//i.test(openUrl || '') ? openUrl : '',
    openLabel: 'open',
    actions: ['open', 'snooze', 'done'],
    context: context || [],
  };
}

// A DM is unanswered when its newest real message is not from you.
function unansweredDm(messages, me) {
  const real = (messages || []).filter((m) => m.type === 'message' && !m.subtype && m.ts);
  if (!real.length) return null;        // history is newest-first
  return real[0].user === me ? null : { last: real[0], recent: real.slice(0, 2) };
}

function dmItem(channelId, who, info, deepLink, slaMs) {
  return makeItem({
    id: `slack:im:${channelId}:${info.last.ts}`,
    title: `${who} · DM`,
    text: info.last.text,
    ts: info.last.ts,
    openUrl: deepLink,
    context: info.recent.map((m) => ({ label: '', text: snippet(m.text) })),
    slaMs,
  });
}

function mentionItem(match, slaMs) {
  const ch = match.channel || {};
  return makeItem({
    id: `slack:mention:${ch.id || '?'}:${match.ts}`,
    title: `${match.username || match.user || 'someone'} · #${ch.name || 'channel'}`,
    text: match.text,
    ts: match.ts,
    openUrl: match.permalink,
    context: [{ label: '', text: snippet(match.text) }],
    slaMs,
  });
}

// Channel-type matches that are real channels (not DMs, already covered).
function isChannelMatch(m) {
  const ch = m.channel || {};
  return !!ch.name && !ch.is_im && !ch.is_mpim;
}

async function userName(token, id, cache) {
  if (!id) return 'someone';
  if (cache.has(id)) return cache.get(id);
  let name = id;
  try {
    const u = await slackApi(token, 'users.info', { user: id });
    name = (u.user && (u.user.profile.display_name || u.user.real_name || u.user.name)) || id;
  } catch { /* keep id */ }
  cache.set(id, name);
  return name;
}

async function fetchDMs(token, me, team, slaMs, cache) {
  const conv = await slackApi(token, 'conversations.list', {
    types: 'im,mpim', limit: '100', exclude_archived: 'true',
  });
  const items = [];
  for (const ch of conv.channels || []) {
    let hist;
    try { hist = await slackApi(token, 'conversations.history', { channel: ch.id, limit: '5' }); }
    catch { continue; }
    const info = unansweredDm(hist.messages, me);
    if (!info) continue;
    const who = ch.is_mpim ? (ch.name || 'group') : await userName(token, ch.user || info.last.user, cache);
    const deepLink = `https://slack.com/app_redirect?channel=${ch.id}${team ? `&team=${team}` : ''}`;
    items.push(dmItem(ch.id, who, info, deepLink, slaMs));
  }
  return items;
}

async function fetchMentions(token, me, handle, slaMs) {
  if (!handle) return [];
  const r = await slackApi(token, 'search.messages', {
    query: `@${handle}`, sort: 'timestamp', sort_dir: 'desc', count: '30',
  });
  const matches = (r.messages && r.messages.matches) || [];
  return matches
    .filter(isChannelMatch)
    .filter((m) => m.user !== me)
    .map((m) => mentionItem(m, slaMs));
}

function demoItems(now = Date.now()) {
  const mk = (mins, id, title, text) => ({
    id: `slack:demo:${id}`, source: 'slack', tag: 'SLACK', colorRole: 'slack',
    title, sub: snippet(text), deadline: now + mins * 60000,
    openUrl: 'https://slack.com/app_redirect?channel=Cdemo',
    openLabel: 'open', actions: ['open', 'snooze', 'done'],
    context: [{ label: '', text: snippet(text) }],
  });
  return [
    mk(-20, 'priya', 'priya · DM', 'can you confirm the 4h SLA window for AI replies?'),
    mk(15, 'engplat', 'ravi · #eng-platform', 'need a +1 on the calendar-filter rollout by EOD'),
  ];
}

module.exports = {
  id: 'slack',
  meta: { tag: 'SLACK', colorRole: 'slack', label: 'Slack' },

  async fetch({ demo = false } = {}) {
    if (demo) return { ok: true, items: demoItems() };
    const token = resolveToken();
    if (!token) return { ok: false, items: [], error: 'not connected' };
    const cfg = settings();
    try {
      const auth = await slackApi(token, 'auth.test');
      const me = auth.user_id;
      const cache = new Map();
      const items = [];
      if (cfg.dms) items.push(...await fetchDMs(token, me, auth.team_id, cfg.slaMs, cache));
      if (cfg.mentions) items.push(...await fetchMentions(token, me, auth.user, cfg.slaMs));
      items.sort((a, b) => a.deadline - b.deadline);
      return { ok: true, items: items.slice(0, cfg.maxItems) };
    } catch (e) {
      const msg = /invalid_auth|not_authed|token_expired|account_inactive|token_revoked/.test(e.message)
        ? 'slack token invalid — reconnect'
        : `slack: ${e.message}`;
      return { ok: false, items: [], error: msg };
    }
  },

  // Exposed for tests.
  resolveToken, settings, snippet, msFromTs,
  unansweredDm, dmItem, mentionItem, isChannelMatch, demoItems,
};
