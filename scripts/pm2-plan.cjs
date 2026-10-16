const fs = require('node:fs');
const path = require('node:path');
const APP_NAME = 'Baba-Cyborg-DC';
function planRestart(entries, root, realpath = fs.realpathSync) {
  const target = realpath(path.join(root, 'server.cjs'));
  const matches = entries.filter(p => { try { return realpath(p.pm2_env.pm_exec_path) === target; } catch { return false; } });
  const collisions = entries.filter(p => p.name === APP_NAME && !matches.includes(p));
  if (collisions.length) throw new Error('Another checkout uses the same PM2 name. No processes were changed.');
  if (!matches.length) return ['start', 'ecosystem.config.js', '--only', APP_NAME];
  if (matches.length !== 1) throw new Error('Multiple game entries exist for this checkout. Inspect pm2 jlist and resolve duplicates explicitly; no entries were deleted.');
  const app = matches[0];
  if (app.pm2_env.exec_mode !== 'fork_mode' || app.name !== APP_NAME) throw new Error('The existing game entry needs a one-time fork/name migration. No entries were deleted. Inspect pm2 show ' + app.pm_id + ' before changing it.');
  if (!Number.isSafeInteger(app.pm_id) || app.pm_id < 0) throw new Error('Invalid PM2 process ID');
  return ['restart', String(app.pm_id), '--update-env'];
}
module.exports = { planRestart };
