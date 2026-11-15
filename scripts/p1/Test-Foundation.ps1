[CmdletBinding()]
param([switch]$Browser)

$ErrorActionPreference = 'Stop'
$repository = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$appHost = Join-Path $repository 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command exited with code $LASTEXITCODE" }
}
Push-Location $repository
try {
    Invoke-Checked dotnet @('tool', 'restore')
    Invoke-Checked dotnet @('restore', 'Nexora.slnx', '--locked-mode')
    Invoke-Checked dotnet @('build', 'Nexora.slnx', '-c', 'Release', '--no-restore', '--verbosity', 'minimal')
    Invoke-Checked dotnet @('test', 'tests/Nexora.Tests', '-c', 'Release', '--no-build', '--logger',
        'trx;LogFileName=p1-release.trx', '--results-directory', 'artifacts/p1/test-results')
    if ($Browser) {
        Invoke-Checked aspire @('wait', 'gateway', '--apphost', $appHost, '--timeout', '60', '--non-interactive')
    }
    Push-Location 'src/Web/nexora-web'
    try {
        Invoke-Checked pnpm @('install', '--frozen-lockfile')
        Invoke-Checked pnpm @('typecheck')
        Invoke-Checked pnpm @('build')
        if ($Browser) { Invoke-Checked pnpm @('test:e2e') }
    } finally { Pop-Location }
} finally { Pop-Location }
