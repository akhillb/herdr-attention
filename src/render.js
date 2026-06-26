'use strict';

const { paint, RESET, tierRole } = require('./palette');

const ACTION_KEY = { open: 'o', reply: 'r', snooze: 's', done: 'x' };
const SNOOZE_OPTS = [['1', '15m'], ['2', '1h'], ['3', '3h'], ['4', 'tomorrow']];

function truncate(str, n) {
  const s = String(str);
  return s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s;
}

function fmtCount(ms) {
  if (ms == null) return '';
  if (ms <= 0) return 'now';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (s >= 600) return `${m}m`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// Builder that tracks the current 1-based terminal row so we can attach click
// hotspots ({row, col0, col1, target}) to the lines we emit.
function makeSink() {
  const lines = [];
  const hits = [];
  return {
    lines, hits,
    push(line) { lines.push(line); return lines.length; }, // returns 1-based row
    // record a full-row hotspot for the line just pushed
    rowHit(target, width) { hits.push({ row: lines.length, col0: 1, col1: width, target }); },
    hit(row, col0, col1, target) { hits.push({ row, col0, col1, target }); },
  };
}

function header(width, clock) {
  const left = `${paint('●', 'urgent')} ${paint('ATTENTION', 'accent', { bold: true })}`;
  const pad = Math.max(1, width - 'ATTENTION'.length - 2 - clock.length);
  return `${left}${' '.repeat(pad)}${paint(clock, 'later')}`;
}

function summary(counts) {
  return [
    paint(String(counts.now), 'urgent', { bold: true }) + paint(' now', 'later'),
    paint(String(counts.soon), 'soon', { bold: true }) + paint(' soon', 'later'),
    paint(String(counts.later), 'later') + paint(' watching', 'later'),
  ].join(paint('  ·  ', 'later'));
}

function renderItem(S, item, opts, width) {
  const focused = opts.focusId === item.id;
  const expanded = opts.expandedId === item.id;
  const role = tierRole(item.tier);
  const marker = focused ? paint('❯ ', 'accent', { bold: true }) : '  ';
  const dot = paint('●', role);
  const tag = paint(item.tag.padEnd(5).slice(0, 5), item.colorRole, { bold: true });
  const count = item.countMs == null ? '' : paint(fmtCount(item.countMs), role, { bold: true });
  const budget = Math.max(8, width - 14);
  const title = paint(truncate(item.title, budget), 'text', { bold: focused });

  S.push(`${marker}${dot} ${tag} ${title}  ${count}`);
  S.rowHit({ kind: 'card', id: item.id }, width);
  if (item.sub) { S.push(`     ${paint(truncate(item.sub, width - 6), 'later')}`); S.rowHit({ kind: 'card', id: item.id }, width); }

  if (expanded && item.context && item.context.length) {
    for (const c of item.context) {
      const lbl = c.label ? paint(`${c.label} `, item.colorRole) : '';
      S.push(`     ${lbl}${paint(truncate(c.text, width - 8), 'later')}`);
      S.rowHit({ kind: 'card', id: item.id }, width);
    }
  }

  if (opts.snoozeId === item.id) {
    let col = 6 + 'snooze → '.length + 1;
    const parts = [];
    const row = S.lines.length + 1;
    for (const [key, label] of SNOOZE_OPTS) {
      const plain = ` ${label} `;
      parts.push(paint(plain, 'text', { invert: true }));
      S.hit(row, col, col + plain.length - 1, { kind: 'snooze', id: item.id, key });
      col += plain.length + 1;
    }
    S.push(`     ${paint('snooze →', 'later')} ${parts.join(' ')}`);
  } else if (focused || expanded) {
    const labels = { open: item.openLabel || 'open', reply: 'reply', snooze: 'snooze', done: 'done' };
    const row = S.lines.length + 1;
    let col = 6; // after 5-space indent (1-based)
    const parts = [];
    for (const a of item.actions || []) {
      const k = ACTION_KEY[a] || a[0];
      const plain = `[${k}]${labels[a]}`;
      parts.push(`${paint('[', 'later')}${paint(k, 'accent')}${paint(']', 'later')}${paint(labels[a], 'later')}`);
      S.hit(row, col, col + plain.length - 1, { kind: 'action', id: item.id, action: a });
      col += plain.length + 2;
    }
    S.push(`     ${parts.join('  ')}`);
  }
}

function footer(S, view, width) {
  const a = (k) => paint(k, 'accent');
  const keys = width < 44
    ? `${a('j/k')} ${a('↵')} ${a('o')} ${a('s')} ${a('x')}`
    : `${a('j/k')} move · ${a('↵')} expand · ${a('o')} open · ${a('s')} snooze · ${a('x')} done`;
  S.push(paint(keys, 'later'));

  const legend = (view.sources || [])
    .map((s) => `${paint('●', s.colorRole)} ${paint(s.tag.toLowerCase(), 'later')}`).join('  ');
  const legendPlain = (view.sources || []).map((s) => `● ${s.tag.toLowerCase()}`).join('  ');
  const addPlain = '[+] add';
  const row = S.lines.length + 1;
  const col0 = legendPlain.length + 3 + 1;
  S.push(`${legend}   ${paint(addPlain, 'later')}`);
  S.hit(row, col0, col0 + addPlain.length - 1, { kind: 'add' });
}

// Pure: view model -> { text, hits }. hits drive mouse interaction.
function render(view, opts = {}) {
  const width = opts.width || view.width || 46;
  const S = makeSink();
  S.push(header(width, view.clock || ''));
  S.push(paint('─'.repeat(width), 'later'));

  if (view.sourceErr) {
    S.push(''); S.push(paint(`⚠ ${view.sourceErr}`, 'soon')); S.push('');
    if (/not installed|not configured|not found/i.test(view.sourceErr)) {
      S.push(paint('Setup:', 'later'));
      S.push('  1. pipx install gcalcli');
      S.push('  2. create a Google OAuth client (see README)');
      S.push('  3. gcalcli init');
    }
    S.push('');
    footer(S, view, width);
    return { text: S.lines.join('\n'), hits: S.hits };
  }

  S.push(summary(view.counts));

  if (view.showAdd) {
    S.push(''); S.push(paint('ADD A SOURCE', 'accent', { bold: true }) + paint('   [esc]', 'later'));
    S.push(paint('plugins on the roadmap — each becomes a source', 'later'));
    for (const f of view.addList || []) {
      S.push(`${paint('▪', f.colorRole || 'later')} ${paint(f.name, 'text')}`);
      if (f.note) S.push(`  ${paint(truncate(f.note, width - 2), 'later')}`);
    }
    S.push('');
    footer(S, view, width);
    return { text: S.lines.join('\n'), hits: S.hits };
  }

  const empty = view.counts.now + view.counts.soon + view.counts.later === 0;
  if (empty) {
    S.push('');
    S.push(paint(view.loading ? 'Loading…' : 'Nothing needs you right now 🎉', view.loading ? 'later' : 'github'));
  }

  for (const g of view.groups) {
    S.push(''); S.push(paint(g.label, tierRole(g.tier), { bold: true }));
    for (const item of g.items) renderItem(S, item, opts, width);
  }

  if (view.watching && view.watching.length) {
    S.push(''); S.push(paint('WATCHING', 'later', { bold: true }));
    for (const item of view.watching) {
      const tag = paint(item.tag.padEnd(5).slice(0, 5), item.colorRole);
      const cnt = item.countMs == null ? '' : paint(fmtCount(item.countMs), 'later');
      S.push(`  ${tag} ${paint(truncate(item.title, width - 14), 'later')}  ${cnt}`);
      S.rowHit({ kind: 'watching', id: item.id }, width);
    }
  }

  if (view.notes && view.notes.length) {
    S.push('');
    for (const n of view.notes) S.push(paint(`⚠ ${n}`, 'later'));
  }
  if (view.staleMs) { S.push(''); S.push(paint(`⟳ stale · last ok ${Math.floor(view.staleMs / 1000)}s ago`, 'later')); }
  if (view.toast) { S.push(''); S.push(paint(view.toast.text, 'text', { invert: true })); }
  S.push('');
  footer(S, view, width);
  return { text: S.lines.join('\n'), hits: S.hits };
}

module.exports = { render, fmtCount, truncate };
