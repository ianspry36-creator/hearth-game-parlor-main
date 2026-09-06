$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

$p = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -WorkingDirectory $PSScriptRoot -RedirectStandardOutput '_diag3_out.log' -RedirectStandardError '_diag3_err.log' -PassThru -WindowStyle Hidden

# Fixed wait for Vite + SSR to warm up
Start-Sleep -Seconds 15

"PID=$($p.Id)" | Out-File '_diag3_result.txt' -Encoding utf8

# Probe the home route
$root = curl.exe -s -o '_diag3_root.html' -w '%{http_code}' --max-time 40 http://127.0.0.1:8080/ 2>$null
"ROOT_CODE=$root" | Out-File '_diag3_result.txt' -Append -Encoding utf8

# Probe crazy-eights
$ce = curl.exe -s -o '_diag3_ce.html' -w '%{http_code}' --max-time 60 http://127.0.0.1:8080/crazy-eights 2>$null
"CE_CODE=$ce" | Out-File '_diag3_result.txt' -Append -Encoding utf8

Start-Sleep -Seconds 2

Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
"DONE" | Out-File '_diag3_result.txt' -Append -Encoding utf8

