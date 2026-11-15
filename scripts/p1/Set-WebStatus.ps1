[CmdletBinding()]
param(
    [ValidateSet('running', 'starting', 'updating', 'maintenance')]
    [string] $State = 'running',

    [string] $Message = '',

    [string] $StatusFile,

    [switch] $Clear
)

$ErrorActionPreference = 'Stop'
$repository = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not $StatusFile) {
    $StatusFile = Join-Path $repository 'artifacts/p1/runtime/web-status.json'
}

if ($Clear) {
    if (Test-Path -LiteralPath $StatusFile) {
        Remove-Item -LiteralPath $StatusFile -Force
    }
    Write-Host "Web status file removed: $StatusFile"
    return
}

$directory = Split-Path $StatusFile -Parent
if (-not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
}

$payload = [ordered]@{
    state   = $State
    message = $Message
    since   = (Get-Date).ToUniversalTime().ToString('o')
}
$json = $payload | ConvertTo-Json -Depth 3
[System.IO.File]::WriteAllText($StatusFile, $json, [System.Text.UTF8Encoding]::new($false))

Write-Host "Web status set to '$State' ($StatusFile)"
if ($Message) {
    Write-Host "Message: $Message"
}
Write-Host 'Open pages pick the change up within the status poll interval (10s by default).'
