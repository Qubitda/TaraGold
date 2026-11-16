# TaraGold yerel duman başlatıcı (Windows)
# Kullanım (repo kökü): powershell -File scripts/dev.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend\config"
$Frontend = Join-Path $Root "frontend"

Write-Host "== Postgres =="
try {
  $env:PGPASSWORD = (python -c "from pathlib import Path; import environ; e=environ.Env(); e.read_env(Path(r'$Backend')/'.env'); print(e('DB_PASSWORD'))")
  $db = (python -c "from pathlib import Path; import environ; e=environ.Env(); e.read_env(Path(r'$Backend')/'.env'); print(e('DB_NAME'))")
  $user = (python -c "from pathlib import Path; import environ; e=environ.Env(); e.read_env(Path(r'$Backend')/'.env'); print(e('DB_USER'))")
  $host = (python -c "from pathlib import Path; import environ; e=environ.Env(); e.read_env(Path(r'$Backend')/'.env'); print(e('DB_HOST') or 'localhost')")
  psql -h $host -U $user -d $db -c "SELECT 1;" | Out-Null
  Write-Host "Postgres OK ($db@$host)"
} catch {
  Write-Error "Postgres hazır değil: $_"
  exit 1
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Host "== migrate + createcachetable =="
Push-Location $Backend
python manage.py migrate --noinput
python manage.py createcachetable
Pop-Location

Write-Host "== süreçler (Ctrl+C ile bu pencere kapanır; child'lar kalabilir) =="
$ingest = Start-Process -PassThru -NoNewWindow -WorkingDirectory $Backend -FilePath "python" -ArgumentList "manage.py","ingest_binance_piyasa","--loop","--interval","2"
$web = Start-Process -PassThru -NoNewWindow -WorkingDirectory $Backend -FilePath "python" -ArgumentList "manage.py","runserver","127.0.0.1:8000"
$fe = Start-Process -PassThru -NoNewWindow -WorkingDirectory $Frontend -FilePath "npm" -ArgumentList "run","dev"

Write-Host "ingest pid=$($ingest.Id) web pid=$($web.Id) vite pid=$($fe.Id)"
Write-Host "FE http://127.0.0.1:3000  API http://127.0.0.1:8000/api/v1/health/"
try {
  Wait-Process -Id $web.Id
} finally {
  foreach ($p in @($ingest, $web, $fe)) {
    if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
  }
}
