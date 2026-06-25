#!/usr/bin/env node
'use strict';

// Printed by the `cal.setup` action (and handy to run directly).
process.stdout.write(`Next Meeting — setup
=====================

This plugin reads your calendar via gcalcli.

1. Install gcalcli:        pipx install gcalcli   (or: brew install gcalcli)
2. Create a Google OAuth client (one-time):
     - console.cloud.google.com → new project → enable "Google Calendar API"
     - APIs & Services → Credentials → Create OAuth client ID → Desktop app
     - download the client secret JSON
3. Authenticate:           gcalcli init           (paste client id/secret, sign in)
4. Verify:                 gcalcli agenda

Then open the pane:        herdr plugin pane open cal next

Preview the UI without any Google setup:
                           CAL_DEMO=1 node src/board.js
`);
