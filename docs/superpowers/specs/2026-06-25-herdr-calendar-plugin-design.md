# herdr-cal — Next Meeting plugin

**Date:** 2026-06-25
**Status:** Approved for implementation

## Goal

A herdr plugin that shows the user's **next upcoming meeting** in a pane with a
live countdown, and **highlights it when it is ≤10 minutes away** (no toast — the
pane highlights and the pane border lights up via herdr agent-status). This is the
first of two planned plugins; a separate Slack plugin follows later.

## Non-goals

- No Slack (separate plugin).
- No toasts (user chose pane-only).
- No RSVP detection/actioning, no "answered vs unanswered" state.
- No multi-event dashboard. Focus is the single next meeting (+ a small "Later" list).

## Behaviour

- Pane titled **"Next Meeting"** always shows the next event whose start is in the
  future: title, start–end time, live countdown (`in 23m`), location, link.
- A short **"Later"** list shows the following few events of the day.
- When the next meeting is **≤10 min** away: a bold inverted banner
  (`⏰ STARTS IN 8M`) and the pane reports herdr agent-status `blocked` so the
  border/agent-panel flags it. Above 10 min → status `idle`.
- Countdown ticks every second (local recompute); calendar is re-polled every 60s.
- Keys: `o` open selected meeting link, `j/k` (or arrows) move selection,
  `r` refresh now, `q` quit.

## Data source

`gcalcli` (the user installs + authes it; modern gcalcli needs a one-time GCP
OAuth client). The plugin shells out to:

```
gcalcli --nocolor agenda now "in 12 hours" --tsv \
  --details url --details conference --details location
```

TSV columns (from gcalcli `details.py` HANDLERS order, with those details enabled):
`start_date, start_time, end_date, end_time, html_link, hangout_link,
conf_type, conf_uri, title, location`. Link preference: `conf_uri || hangout_link
|| html_link`. All-day events (empty start_time) are skipped.

**Demo mode** (`CAL_DEMO=1` or `--demo`): synthetic events relative to now (one at
+8 min so the imminent state is visible immediately) — lets the user see the UI
before any Google setup. Missing/un-authed gcalcli → the pane shows setup hints
instead of crashing (graceful degradation).

## Stack

Node.js, **zero runtime dependencies** (stdlib only: `child_process`, `net`,
`readline`). No build step, no supply-chain surface — relevant because herdr
plugins run unsandboxed as the user. Tests use the built-in `node:test` runner.

## Components

| File | Responsibility | Pure? |
|------|----------------|-------|
| `src/board.js` | Orchestrator: poll loop, 1s draw tick, stdin keys, agent-status | no |
| `src/calendar.js` | `fetchEvents()` (gcalcli/demo), `parseTsv()`, `demoEvents()` | parse is pure |
| `src/model.js` | `nextMeeting(events, now)` → `{next, upcoming, countdownMs, isImminent}` | yes |
| `src/render.js` | view model → ANSI string | yes |
| `src/herdr.js` | `reportAgent(status)` over `HERDR_SOCKET_PATH` (best-effort) | no |
| `src/setup.js` | prints setup instructions (the `setup` action) | n/a |

## Manifest

`herdr-plugin.toml`: one `[[panes]]` (`next` → `node src/board.js`, placement
`split`); actions `open` (opens the pane via `$HERDR_BIN_PATH plugin pane open`)
and `setup`.

## Testing (happy / empty-null / error per project mandate)

- `model`: earliest-future selection; empty → null; all-past → null; imminent
  boundary at exactly 10 min; in-progress meeting skipped.
- `calendar`: parse + sort; empty input → `[]`; malformed line skipped; link
  prefers conference URI; demo events are in the future.
- `render`: no-meeting message; imminent banner present; setup hint on
  "gcalcli not installed"; long title truncated.

## Security

The plugin stores **no credentials** — gcalcli holds its own OAuth tokens under
`~/.config/gcalcli`. `.gitignore` still excludes tokens/.env/logs defensively.
Public GitHub repo under the user's personal account.

## Known risk

gcalcli's exact TSV columns vary by version; the parser is positional and will be
verified against the real installed gcalcli at integration. The parser tolerates
short/garbage lines so a column mismatch degrades rather than crashes.
