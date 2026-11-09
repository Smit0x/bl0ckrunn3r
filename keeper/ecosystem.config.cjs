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
  ],
};
