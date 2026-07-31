module.exports = {
  apps: [
    {
      name: "serpscale-api",
      cwd: "/var/www/serpscale/apps/api",
      script: "dist/src/main.js",
      interpreter: "/root/.nvm/versions/node/v22.21.1/bin/node",
      env: { NODE_ENV: "production" },
    },
    {
      name: "serpscale-web",
      cwd: "/var/www/serpscale/apps/web",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3007",
      env: { NODE_ENV: "production" },
    },
    {
      name: "serpscale-marketing",
      cwd: "/var/www/serpscale/marketing",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3008",
      env: { NODE_ENV: "production" },
    },
  ],
};
