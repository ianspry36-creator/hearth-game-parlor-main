$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

# Start the dev server in the background, logging to _diag_server.log
$p = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -WorkingDirectory $PSScriptRoot -RedirectStandardOutput '_diag_server_out.log' -RedirectStandardError '_diag_server_err.log' -PassThru -WindowStyle Hidden
"PID=$($p.Id)" | Out-File _diag_pid.txt

# Wait for the server to come up (poll the port via a lightweight HTTP probe)
$ready = $false
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 750
    try {
        $r = curl.exe -s -o _diag_probe.html -w '%{http_code}' --max-time 5 http://localhost:8080/
        if ($r -match '^\d{3}') { $ready = $true; break }
    } catch {}
}
"READY=$ready after $($i * 0.75)s" | Out-File -Append _diag_pid.txt

# Hit the crazy-eights route
curl.exe -s -o _diag_ce.html -w 'CE_HTTP=%{http_code}' --max-time 60 http://localhost:8080/crazy-eights 2>&1 | Out-File -Append _diag_pid.txt

# Give the server a moment to flush any error logs, then stop it
Start-Sleep -Seconds 2
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
# Kill any lingering node children
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
"DONE" | Out-File -Append _diag_pid.txt
