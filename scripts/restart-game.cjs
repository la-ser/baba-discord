const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { planRestart } = require('./pm2-plan.cjs');
const root = path.resolve(__dirname, '..');
try {
  const entries = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', cwd: root }));
  const args = planRestart(entries, root);
  console.log(args[0] === 'restart' ? 'Restarting existing PM2 entry ' + args[1] + '; preserving its ID and log paths.' : 'No game entry exists; creating the first entry.');
  execFileSync('pm2', args, { cwd: root, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } });
} catch (error) { console.error(error.message); process.exitCode = 1; }
