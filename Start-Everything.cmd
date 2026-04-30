@echo off
setlocal
cd /d "%~dp0"

set "DASHBOARD_URL=http://127.0.0.1:3011"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$healthUri='%DASHBOARD_URL%/api/health';" ^
  "try { Invoke-RestMethod -Uri $healthUri -Method Get -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo Dashboard wordt gestart...
  start "AI Trading Bot Dashboard" cmd /k "cd /d ""%~dp0"" && node src/cli.js dashboard"
) else (
  echo Dashboard draait al. Nieuwe serverstart wordt overgeslagen.
)

echo Wachten tot dashboard klaar is...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$healthUri='%DASHBOARD_URL%/api/health';" ^
  "$deadline=(Get-Date).AddSeconds(45);" ^
  "$ready=$false;" ^
  "while((Get-Date) -lt $deadline) { try { Invoke-RestMethod -Uri $healthUri -Method Get -TimeoutSec 5 | Out-Null; $ready=$true; break } catch { Start-Sleep -Seconds 1 } }" ^
  "if (-not $ready) { throw 'Dashboard startte niet op tijd.' }"
if errorlevel 1 (
  echo Dashboard kon niet worden bereikt. Controleer het dashboardvenster voor fouten.
  exit /b 1
)

for /f "usebackq delims=" %%M in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$envPath=Join-Path '%~dp0' '.env'; if (Test-Path $envPath) { $line = Get-Content $envPath | Where-Object { $_ -match '^BOT_MODE=' } | Select-Object -First 1; if ($line) { ($line -split '=',2)[1].Trim().ToLower() } else { 'paper' } } else { 'paper' }"`) do set "TARGET_MODE=%%M"
if not defined TARGET_MODE set "TARGET_MODE=paper"
echo Dashboard mode wordt gesynchroniseerd naar %TARGET_MODE%...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$modeUri='%DASHBOARD_URL%/api/mode';" ^
  "$headers=@{ 'X-Dashboard-Request'='1'; 'Content-Type'='application/json' };" ^
  "$body=@{ mode='%TARGET_MODE%' } | ConvertTo-Json -Compress;" ^
  "Invoke-RestMethod -Uri $modeUri -Method Post -Headers $headers -Body $body -TimeoutSec 20 | Out-Null"
if errorlevel 1 (
  echo Dashboard draaide, maar mode-sync naar %TARGET_MODE% mislukte.
  exit /b 1
)

echo Bot wordt gestart met de actuele code...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$startUri='%DASHBOARD_URL%/api/start';" ^
  "$statusUri='%DASHBOARD_URL%/api/status';" ^
  "$headers=@{ 'X-Dashboard-Request'='1'; 'Content-Type'='application/json' };" ^
  "$lastStart=$null;" ^
  "for($attempt=1; $attempt -le 3; $attempt++) {" ^
  "  try { $lastStart=Invoke-RestMethod -Uri $startUri -Method Post -Headers $headers -Body '{}' -TimeoutSec 30 } catch { if($attempt -eq 3) { throw }; Start-Sleep -Seconds 2; continue }" ^
  "  $deadline=(Get-Date).AddSeconds(45);" ^
  "  while((Get-Date) -lt $deadline) {" ^
  "    try { $status=Invoke-RestMethod -Uri $statusUri -Method Get -TimeoutSec 10; if($status.manager.runState -eq 'running') { exit 0 } } catch {}" ^
  "    Start-Sleep -Seconds 2" ^
  "  }" ^
  "}" ^
  "$summary=if($lastStart){ $lastStart | ConvertTo-Json -Depth 5 -Compress } else { 'geen startantwoord' };" ^
  "throw ('Bot start is niet bevestigd door /api/status. Laatste antwoord: ' + $summary)"
if errorlevel 1 (
  echo Dashboard draait, maar de bot kon niet automatisch worden gestart.
  echo Open %DASHBOARD_URL% en controleer de foutmelding bij Readiness/Status.
  exit /b 1
)

start "" "%DASHBOARD_URL%"
echo Dashboard en bot draaien nu met de huidige code uit deze map.
endlocal
