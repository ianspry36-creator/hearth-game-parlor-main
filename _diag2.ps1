$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

$p = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -WorkingDirectory $PSScriptRoot -RedirectStandardOutput '_diag2_out.log' -RedirectStandardError '_diag2_err.log' -PassThru -WindowStyle Hidden
"PID=$($p.Id)" | Out-File _diag2_pid.txt

$ready = $false
$code = ''
for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 1
    $code = curl.exe -s -o _diag2_probe.html -w '%{http_code}' --max-time 5 http://localhost:8080/
    if ($code -eq '200') { $ready = $true; break }
}
"READY=$ready PROBE=$code after $i s" | Out-File -Append _diag2_pid.txt

curl.exe -s -o _diag2_ce.html -w 'CE_HTTP=%{http_code}' --max-time 120 http://localhost:8080/crazy-eights 2>&1 | Out-File -Append _diag2_pid.txt

Start-Sleep -Seconds 3
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
"DONE" | Out-File -Append _diag2_pid.txt
