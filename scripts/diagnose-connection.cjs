const { PORT } = require("../server-port.cjs");
const WebSocket = require("ws");
const targets = { local: `http://127.0.0.1:${PORT}`, public: "https://baba.klarapp.com" };
async function probe(label, base) {
  const result = { target: label, url: base, health: [], polling: null, websocket: null };
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(base + "/health?diagnostic=" + Date.now(), { signal: AbortSignal.timeout(5000), cache: "no-store" });
      result.health.push({ status: r.status, ...(r.ok ? await r.json() : {}) });
    } catch (e) { result.health.push({ error: e.cause?.code || e.message }); }
  }
  try {
    const endpoint = base + "/socket.io/?EIO=4&transport=polling";
    const r = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
    const packet = await r.text();
    if (r.status !== 200 || !packet.startsWith("0")) throw new Error("handshake HTTP " + r.status);
    const { sid } = JSON.parse(packet.slice(1));
    const session = endpoint + "&sid=" + encodeURIComponent(sid);
    const auth = await fetch(session, { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: '40{"accessToken":"dev-token","instanceId":"transport-diagnostic"}', signal: AbortSignal.timeout(5000) });
    if (!auth.ok) throw new Error("session POST HTTP " + auth.status);
    const response = await fetch(session, { signal: AbortSignal.timeout(5000) });
    const packets = await response.text();
    result.polling = response.ok && packets.split("\x1e").some(p => p.startsWith("40")) ? "PASS: authenticated session" : "FAIL: session HTTP " + response.status + " " + packets.slice(0, 100);
    await fetch(session, { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: "41\x1e1", signal: AbortSignal.timeout(2000) }).catch(() => {});
  } catch (e) { result.polling = "FAIL: " + e.message; }
  result.websocket = await new Promise(resolve => {
    let finished = false, authenticated = false;
    const started = Date.now();
    const frames = [];
    const ws = new WebSocket(base.replace(/^http/, "ws") + "/socket.io/?EIO=4&transport=websocket", { handshakeTimeout: 5000 });
    const finish = message => { if (finished) return; finished = true; clearTimeout(timer); ws.close(); resolve({ result: message, authenticated, elapsedMs: Date.now() - started, frames }); };
    const timer = setTimeout(() => finish(authenticated && ws.readyState === WebSocket.OPEN ? "PASS: authenticated and stable for 5 seconds" : "FAIL: did not authenticate"), 5000);
    ws.on("message", data => {
      const p = String(data);
      if (frames.length < 8) frames.push(p.slice(0, 2));
      if (p.startsWith("0")) ws.send('40{"accessToken":"dev-token","instanceId":"transport-diagnostic"}');
      if (p.startsWith("40")) authenticated = true;
      if (p === "2") ws.send("3");
    });
    ws.on("error", error => finish("FAIL: " + error.message));
    ws.on("close", (code) => finish("FAIL: closed early, code " + code));
  });
  return result;
}
console.log("Runtime:", JSON.stringify({ node: process.version, arch: process.arch, ws: require("ws/package.json").version, socketIo: require("socket.io/package.json").version }));
Promise.all(Object.entries(targets).map(([label, base]) => probe(label, base))).then(results => {
  console.log(JSON.stringify(results, null, 2));
  console.log("If local passes and public fails, inspect cloudflared logs: journalctl -u cloudflared --since '5 minutes ago' --no-pager");
  console.log("If local also fails, inspect PM2 logs and the listener on port " + PORT + ".");
}).catch(e => { console.error(e.message); process.exitCode = 1; });
