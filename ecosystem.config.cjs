module.exports = {
  apps: [
    {
      name: "Baba-Cyborg-DC",
      script: "server.cjs",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
