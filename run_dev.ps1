$ErrorActionPreference = 'Continue'
$log = Join-Path $PSScriptRoot 'dev_server.log'
"START $(Get-Date)" | Out-File $log
Set-Location $PSScriptRoot
# Uses the globally-installed Node/npm (C:\Program Files\nodejs).
# npm.cmd is used directly to avoid the PowerShell execution-policy block on npm.ps1.
& npm.cmd run dev 2>&1 | Out-File -Append $log
"EXIT=$LASTEXITCODE $(Get-Date)" | Out-File -Append $log

