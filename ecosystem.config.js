module.exports = {
  apps: [{
    name: "Baba-Cyborg-DC",
    cwd: __dirname,
    script: "server.cjs",
    exec_mode: "fork",
    instances: 1,
    autorestart: true,
    restart_delay: 3000,
    max_restarts: 10,
    stop_exit_codes: [78],
    env: { NODE_ENV: "production" },
  }],
};
