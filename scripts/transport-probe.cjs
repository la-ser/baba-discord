const WebSocket = require('ws');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function probeTransport(base, transport, durationMs = 30000) {
  const started = Date.now();
  if (transport === 'websocket') return new Promise(resolve => {
    const ws = new WebSocket(base.replace(/^http/, 'ws') + '/socket.io/?EIO=4&transport=websocket', { handshakeTimeout: 7000 });
    let opened = false, settled = false, heartbeats = 0;
    const finish = error => { if (settled) return; settled = true; clearTimeout(timer); ws.terminate(); resolve({ transport, ok: opened && !error, elapsedMs: Date.now() - started, heartbeats, ...(error ? { error } : {}) }); };
    const timer = setTimeout(() => finish(opened ? null : 'No Engine.IO handshake'), durationMs);
    ws.on('message', data => { const message = String(data); if (message.startsWith('0')) opened = true; if (message === '2') { heartbeats++; ws.send('3'); } });
    ws.on('error', error => finish(error.message));
    ws.on('close', code => finish('Closed before test completed: ' + code));
  });
  let session;
  try {
    const endpoint = base + '/socket.io/?EIO=4&transport=polling';
    const handshake = await fetch(endpoint, { signal: AbortSignal.timeout(7000) });
    const packet = await handshake.text();
    if (!handshake.ok || !packet.startsWith('0')) throw new Error('Handshake HTTP ' + handshake.status);
    const hello = JSON.parse(packet.slice(1)); session = endpoint + '&sid=' + encodeURIComponent(hello.sid);
    let heartbeats = 0;
    while (Date.now() - started < durationMs) {
      const remaining = durationMs - (Date.now() - started);
      let response;
      try { response = await fetch(session, { signal: AbortSignal.timeout(Math.min(hello.pingInterval + hello.pingTimeout + 1000, remaining)) }); }
      catch (error) { if (Date.now() - started >= durationMs - 50) break; throw error; }
      const packets = await response.text();
      if (!response.ok) throw new Error('Session GET HTTP ' + response.status);
      if (packets.split('\x1e').includes('2')) {
        heartbeats++;
        const pong = await fetch(session, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: '3', signal: AbortSignal.timeout(7000) });
        if (!pong.ok) throw new Error('Session POST HTTP ' + pong.status);
      }
    }
    return { transport, ok: true, elapsedMs: Date.now() - started, heartbeats };
  } catch (error) { return { transport, ok: false, elapsedMs: Date.now() - started, error: error.cause?.code || error.message }; }
  finally { if (session) await fetch(session, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: '1', signal: AbortSignal.timeout(2000) }).catch(() => {}); }
}
async function probeTarget(base, durationMs = 30000) {
  const health = [];
  const healthChecks = (async () => {
    for (let i = 0; i < 3; i++) {
      try { const r = await fetch(base + '/health', { signal: AbortSignal.timeout(7000), cache: 'no-store' }); health.push({ status: r.status, ...(r.ok ? await r.json() : {}) }); }
      catch (error) { health.push({ error: error.cause?.code || error.message }); }
      if (i < 2) await delay(durationMs / 3);
    }
  })();
  const transports = await Promise.all(['websocket', 'polling'].map(t => probeTransport(base, t, durationMs)));
  await healthChecks;
  const ids = new Set(health.filter(h => h.processId).map(h => h.processId));
  return { url: base, ok: health.every(h => h.status === 200 && h.ok) && ids.size === 1 && transports.every(t => t.ok), restarted: ids.size > 1, health, transports };
}
module.exports = { probeTarget, probeTransport };
