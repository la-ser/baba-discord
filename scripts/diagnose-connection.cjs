const { PORT } = require('../server-port.cjs');
const { probeTarget } = require('./transport-probe.cjs');
const args = process.argv.slice(2);
const durationMs = Math.max(1000, Math.min(40000, Number(args.find(a => a.startsWith('--duration='))?.split('=')[1]) || 30000));
const publicUrl = process.env.PUBLIC_GAME_URL || 'https://baba.klarapp.com';
const targets = args.includes('--local-only') ? [`http://127.0.0.1:${PORT}`] : args.includes('--public-only') ? [publicUrl] : [`http://127.0.0.1:${PORT}`, publicUrl];
console.log('Checking HTTP health, process stability and both transports for ' + durationMs / 1000 + ' seconds. No player inventory is created.');
Promise.all(targets.map(base => probeTarget(base, durationMs))).then(results => {
 console.log(JSON.stringify(results, null, 2));
 if (results.some(r => !r.ok)) {
   console.error('Transport verification failed. If local passes but public fails, check the tunnel target and cloudflared logs. If the processId changes, inspect the PM2 crash log.');
   process.exitCode = 1;
 }
}).catch(error => { console.error(error); process.exitCode = 1; });
