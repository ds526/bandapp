// PM2 process manager config. On the server: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'bandlist',
      script: 'server/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      autorestart: true,
      max_restarts: 10,
      watch: false,
    },
  ],
};
