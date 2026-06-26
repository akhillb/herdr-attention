#!/usr/bin/env node
'use strict';

// Printed by the `attention.setup` action (and handy to run directly).
process.stdout.write(`Attention — setup
=================

A unified attention feed for herdr. Sources (addons) merge into NOW / SOON /
WATCHING tiers. The calendar source reads your calendar via gcalcli.

Calendar source:
1. Install gcalcli:        pipx install gcalcli   (or: brew install gcalcli)
2. Create a Google OAuth client (one-time):
     - console.cloud.google.com → new project → enable "Google Calendar API"
     - APIs & Services → Credentials → Create OAuth client ID → Desktop app
     - download the client secret JSON
3. Authenticate:           gcalcli init           (paste client id/secret, sign in)
4. Verify:                 gcalcli agenda

Open the pane:             herdr plugin pane open --plugin attention --entrypoint feed

Preview the UI without any setup:
                           ATTENTION_DEMO=1 node src/board.js

Slack source (read-only):
1. api.slack.com/apps → Create New App → From scratch
2. OAuth & Permissions → add User Token Scopes:
     search:read  im:history  mpim:history  users:read  channels:history  groups:history
3. Install to Workspace (a workspace admin may need to approve)
4. Copy the User OAuth Token (xoxp-…) and store it as either:
     - SLACK_USER_TOKEN env var, or
     - "slackToken" in the plugin config.json, or
     - a file named slack_token in the plugin config dir
   (config dir: herdr plugin config-dir attention)

Add a source: drop a module in src/addons/ and register it in src/addons/index.js.
`);
