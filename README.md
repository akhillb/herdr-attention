# herdr-cal — Next Meeting

A [herdr](https://herdr.dev) plugin that shows your **next upcoming meeting** in a
pane with a live countdown, and **highlights it when it's 10 minutes away** — the
pane lights its border (via herdr agent-status) instead of popping a toast.

```
 Next Meeting
──────────────────────────────────────────────────────────
 ⏰ STARTS IN 8M
Standup with Automate pod
14:00–14:30  ·  Zoom
https://zoom.us/j/123456789

Later:
14:47  1:1 with Manager
16:13  T2 Copilot design review

[o] open  [j/k] select  [r] refresh  [q] quit
```

## Preview without any Google setup

```bash
npm run demo          # or: CAL_DEMO=1 node src/board.js
```

Demo mode shows synthetic events (the first ~8 minutes out, so you see the
imminent state immediately). Press `q` to quit.

## Real setup (gcalcli)

The plugin reads your calendar through [gcalcli](https://github.com/insanum/gcalcli).
Modern gcalcli needs a one-time Google OAuth client of your own.

1. **Install gcalcli**

   ```bash
   pipx install gcalcli        # or: brew install gcalcli
   ```

2. **Create a Google OAuth client (one-time, ~10 min)**
   - [console.cloud.google.com](https://console.cloud.google.com) → new project
   - Enable **Google Calendar API**
   - **APIs & Services → Credentials → Create OAuth client ID → Desktop app**
   - Download the client secret JSON

3. **Authenticate**

   ```bash
   gcalcli init                # paste client id/secret, complete sign-in
   gcalcli agenda              # verify you see your events
   ```

## Install into herdr

Local development:

```bash
herdr plugin link /path/to/herdr-cal
herdr plugin pane open cal next
```

From GitHub (after publishing):

```bash
herdr plugin install <owner>/herdr-cal
```

## Keys

| Key | Action |
|-----|--------|
| `o` | Open the selected meeting's link in your browser |
| `j` / `k` (or arrows) | Move selection |
| `r` | Refresh now |
| `q` | Quit the pane |

## Configuration (environment variables)

| Var | Default | Meaning |
|-----|---------|---------|
| `CAL_DEMO` | unset | `1` → demo data, no gcalcli |
| `CAL_IMMINENT_MIN` | `10` | Minutes-before threshold for the highlight |
| `CAL_WINDOW` | `in 12 hours` | gcalcli look-ahead window |
| `CAL_CALENDARS` | *(your owned calendars)* | Comma-separated calendar titles to include. Unset → auto-detects the calendars you own (excludes holidays, room/resource, and other subscribed calendars). |
| `CAL_POLL_SEC` | `60` | Calendar re-poll interval (countdown still ticks every second) |

## Tests

```bash
npm test            # node --test
```

## Security

This plugin stores **no credentials** — gcalcli holds its own OAuth tokens under
`~/.config/gcalcli`. Nothing sensitive is read or written by the plugin.

## License

MIT
