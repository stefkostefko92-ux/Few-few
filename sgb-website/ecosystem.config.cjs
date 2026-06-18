// PM2 конфигурация за продукционен процес.
// Стартиране:  pm2 start ecosystem.config.cjs
// Презареждане: pm2 reload sgb-website
module.exports = {
  apps: [
    {
      name: 'sgb-website',
      script: 'src/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
      },
      out_file: 'data/pm2-out.log',
      error_file: 'data/pm2-error.log',
      time: true,
    },
  ],
};
