'use strict';

const TEN_MINUTES = 10 * 60 * 1000;

// Pure: pick the next not-yet-started meeting and classify imminence.
// `events` is the normalized list from calendar.js; `now` is epoch ms.
function nextMeeting(events, now, { imminentMs = TEN_MINUTES } = {}) {
  const future = (events || [])
    .filter((e) => e && e.start instanceof Date && !Number.isNaN(e.start.getTime()))
    .filter((e) => e.start.getTime() > now)
    .sort((a, b) => a.start - b.start);

  const next = future[0] || null;
  if (!next) {
    return { next: null, upcoming: [], countdownMs: null, isImminent: false };
  }

  const countdownMs = next.start.getTime() - now;
  return {
    next,
    upcoming: future.slice(1, 4),
    countdownMs,
    isImminent: countdownMs <= imminentMs,
  };
}

module.exports = { nextMeeting, TEN_MINUTES };
