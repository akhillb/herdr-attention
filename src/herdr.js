'use strict';

const net = require('node:net');

// Send one newline-delimited JSON request over the herdr socket. Best-effort:
// resolves {ok:false} on any problem rather than throwing, so the pane keeps
// working even when run outside herdr (e.g. demo in a plain terminal).
function send(method, params) {
  return new Promise((resolve) => {
    const sockPath = process.env.HERDR_SOCKET_PATH;
    if (!sockPath) { resolve({ ok: false, error: 'no socket' }); return; }

    let done = false;
    const finish = (r) => { if (!done) { done = true; try { sock.destroy(); } catch {} resolve(r); } };
    const sock = net.createConnection(sockPath);
    const timer = setTimeout(() => finish({ ok: false, error: 'timeout' }), 2000);
    timer.unref();

    sock.on('connect', () => {
      sock.write(`${JSON.stringify({ id: 'cal', method, params })}\n`);
    });
    let buf = '';
    sock.on('data', (d) => {
      buf += d.toString();
      const nl = buf.indexOf('\n');
      if (nl >= 0) {
        clearTimeout(timer);
        try { finish({ ok: true, response: JSON.parse(buf.slice(0, nl)) }); }
        catch { finish({ ok: true }); }
      }
    });
    sock.on('error', (e) => { clearTimeout(timer); finish({ ok: false, error: e.message }); });
  });
}

// Report this pane's agent status so herdr lights the border / agent panel.
// status is one of "working" | "idle" | "done" | "blocked".
function reportAgent(status) {
  const pane_id = process.env.HERDR_PANE_ID;
  if (!pane_id) return Promise.resolve({ ok: false, error: 'no pane' });
  return send('pane.report_agent', { pane_id, status });
}

module.exports = { send, reportAgent };
