[CmdletBinding()]
param([Parameter(Mandatory)][ValidateSet('masterdatadb','financedb','purchasingdb','inventorydb','salesdb')][string]$Database)

$ErrorActionPreference = 'Stop'
$repository = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$appHost = Join-Path $repository 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
& aspire wait $Database --apphost $appHost --timeout 60 --non-interactive
if ($LASTEXITCODE -ne 0) { throw 'The selected database resource did not start.' }
$snapshot = & aspire describe postgres --apphost $appHost --format Json --non-interactive | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL resource discovery failed.' }
$resources = @($snapshot.resources | Where-Object { $_.displayName -eq 'postgres' -and $_.resourceType -eq 'Container' })
if ($resources.Count -ne 1) { throw 'Expected one PostgreSQL container for this AppHost.' }
$container = $resources[0].name
$volumes = & docker inspect --format '{{range .Mounts}}{{println .Name}}{{end}}' $container
if ($LASTEXITCODE -ne 0 -or $volumes -notcontains 'nexora-postgres-data') {
    throw 'Expected the Nexora development volume.'
}
# Recovery is deliberately disabled for this single-database maintenance operation.
& docker exec $container env -u NEXORA_RESTORE_DIRECTORY "NEXORA_PROVISION_DATABASE=$Database" bash /docker-entrypoint-initdb.d/10-application-databases.sh
if ($LASTEXITCODE -ne 0) { throw 'Database provisioning failed.' }
Write-Host "$Database account and ownership are ready."
