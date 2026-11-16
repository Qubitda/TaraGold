/**
 * PM2 örnek: gunicorn + ingest_binance_piyasa --loop
 * Kullanım (repo kökünden, yolları ortama göre düzeltin):
 *   pm2 start deploy/ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: "taragold-web",
      cwd: "./backend/config",
      script: "../.venv/bin/gunicorn",
      args: "config.wsgi:application --bind 127.0.0.1:8000 --workers 3 --timeout 60",
      interpreter: "none",
      env: { DJANGO_SETTINGS_MODULE: "config.settings" },
    },
    {
      name: "taragold-ingest",
      cwd: "./backend/config",
      script: "../.venv/bin/python",
      args: "manage.py ingest_binance_piyasa --loop --interval 2",
      interpreter: "none",
      env: { DJANGO_SETTINGS_MODULE: "config.settings" },
    },
  ],
};
