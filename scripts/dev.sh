#!/usr/bin/env bash
# TaraGold yerel duman başlatıcı (Linux/mac)
# Kullanım (repo kökü): bash scripts/dev.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend/config"
FRONTEND="$ROOT/frontend"

echo "== Postgres =="
eval "$(
  BACKEND_DIR="$BACKEND" python - <<'PY'
from pathlib import Path
import os, environ
e = environ.Env()
e.read_env(Path(os.environ["BACKEND_DIR"]) / ".env")
for k in ("DB_NAME", "DB_USER", "DB_HOST", "DB_PORT"):
    print(f"export {k}={e(k)!r}")
print(f"export PGPASSWORD={e('DB_PASSWORD')!r}")
PY
)"
psql -h "${DB_HOST:-localhost}" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null
echo "Postgres OK ($DB_NAME@${DB_HOST:-localhost})"
unset PGPASSWORD

echo "== migrate + createcachetable =="
(
  cd "$BACKEND"
  python manage.py migrate --noinput
  python manage.py createcachetable
)

cleanup() {
  jobs -p | xargs -r kill 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "== süreçler =="
(
  cd "$BACKEND"
  python manage.py ingest_binance_piyasa --loop --interval 2
) &
(
  cd "$BACKEND"
  python manage.py runserver 127.0.0.1:8000
) &
(
  cd "$FRONTEND"
  npm run dev
) &

echo "FE http://127.0.0.1:3000  API http://127.0.0.1:8000/api/v1/health/"
wait
