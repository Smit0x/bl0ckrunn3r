module.exports = {
  apps: [
    {
      name: 'squeek-keeper',
      script: 'index.mjs',
      autorestart: true,
      max_restarts: 100,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'squeek-history-api',
      script: 'api.mjs',
      autorestart: true,
      max_restarts: 100,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
        API_PORT: 3001,
      },
    },
  ],
};
