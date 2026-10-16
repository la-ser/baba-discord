const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { PORT } = require("../server-port.cjs");
const root = path.resolve(__dirname, "..");
const expectedBuild = fs.readFileSync(path.join(root, "dist/index.html"), "utf8").match(/src="([^" ]+\.js)"/)?.[1];
async function verify() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const entries = JSON.parse(execFileSync("pm2", ["jlist"], { encoding: "utf8" }));
    const apps = entries.filter(p => {
      try { return fs.realpathSync(p.pm2_env.pm_exec_path) === fs.realpathSync(path.join(root, "server.cjs")); }
      catch { return false; }
    });
    if (apps.length === 1 && apps[0].pm2_env.status === "online" && apps[0].pm2_env.exec_mode === "fork_mode") {
      try {
        const response = await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(2000) });
        const health = await response.json();
        if (response.ok && health.ok && health.build === expectedBuild && health.processId === apps[0].pid) {
          const { probeTarget } = require('./transport-probe.cjs');
          const transportCheck = await probeTarget('http://127.0.0.1:' + PORT, 15000);
          if (!transportCheck.ok || transportCheck.health.some(h => h.processId !== apps[0].pid)) throw new Error('Local transport stability check failed: ' + JSON.stringify(transportCheck));
          console.log(`Verified one game process, both transports stable, port ${PORT}, build ${health.build}`);
          return;
        }
      } catch {}
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Deployment failed verification on port ${PORT}. Check pm2 logs Baba-Cyborg-DC and the existing port listener.`);
}
verify().catch(error => { console.error(error.message); process.exitCode = 1; });
