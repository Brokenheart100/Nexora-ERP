[CmdletBinding()]
param([switch]$Faults)

$ErrorActionPreference = 'Stop'
$repository = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$appHost = Join-Path $repository 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
$checks = [Collections.Generic.List[object]]::new()
$images = [Collections.Generic.List[object]]::new()
$connectionReferences = [Collections.Generic.List[object]]::new()
function Invoke-Aspire {
    param([string[]]$Arguments)
    & aspire @Arguments --apphost $appHost --non-interactive
    if ($LASTEXITCODE -ne 0) { throw 'Aspire command failed.' }
}
Push-Location $repository
try {
    Invoke-Aspire @('wait', 'gateway', '--timeout', '60')
    $snapshot = & aspire describe --apphost $appHost --format Json --non-interactive | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Resource discovery failed.' }
    foreach ($service in 'organization','reporting','masterdata','finance','inventory','sales','purchasing') {
        $resource = $snapshot.resources | Where-Object { $_.displayName -eq $service }
        $database = $service + 'db'
        $names = @($resource.environment.PSObject.Properties.Name)
        $connections = @($names | Where-Object { $_ -like 'ConnectionStrings__*' })
        $expected = @("ConnectionStrings__$database", 'ConnectionStrings__rabbitmq')
        $rawProperties = @($names | Where-Object { $_ -match "^(${database}|rabbitmq)_" })
        if ($connections.Count -ne $expected.Count -or ($expected | Where-Object { $_ -notin $connections }) -or $rawProperties.Count) {
            throw "Unexpected database or broker environment keys for $service."
        }
        $connectionReferences.Add([ordered]@{ service=$service; keys=$expected; rawPropertiesPresent=$false })
        Write-Host "$service uses scoped database and broker references."
    }
    $endpoints = @{}
    $pins = @{}
    $pinSource = Get-Content src/Hosting/Nexora.AppHost/ContainerImageDigests.cs -Raw
    foreach ($match in [regex]::Matches($pinSource, 'const string (\w+) = "([a-f0-9]{64})"')) {
        $pins[$match.Groups[1].Value] = $match.Groups[2].Value
    }
    foreach ($entry in @(@('postgres','Postgres'), @('rabbitmq','Rabbit'), @('cache','Redis'), @('identity','Keycloak'))) {
        $resources = @($snapshot.resources | Where-Object { $_.displayName -eq $entry[0] -and $_.resourceType -eq 'Container' })
        if ($resources.Count -ne 1 -or !$pins.ContainsKey($entry[1])) { throw 'Image pin discovery failed.' }
        $image = & docker inspect --format '{{.Config.Image}}' $resources[0].name
        if ($LASTEXITCODE -ne 0) { throw "Unable to inspect image: $($entry[0])" }
        $matchesPin = $image.EndsWith('@sha256:' + $pins[$entry[1]], [StringComparison]::Ordinal)
        if ($entry[0] -eq 'identity') {
            $baseDigest = & docker inspect --format '{{index .Config.Labels "org.opencontainers.image.base.digest"}}' $resources[0].name
            $matchesPin = $LASTEXITCODE -eq 0 -and $baseDigest -eq ('sha256:' + $pins[$entry[1]])
        }
        if (!$matchesPin) {
            throw "Running image differs from pin: $($entry[0])"
        }
        $images.Add([ordered]@{ resource=$entry[0]; image=$image; matches=$true })
    }
    foreach ($name in @('gateway','web','organization','reporting','rabbitmq')) {
        $resources = @($snapshot.resources | Where-Object { $_.displayName -eq $name -and $_.urls })
        if ($resources.Count -ne 1) { throw "Expected one $name resource." }
        $urls = @($resources[0].urls | Where-Object { $_.name -eq 'http' })
        if ($urls.Count -eq 0) { $urls = @($resources[0].urls) }
        $endpoints[$name] = $urls[0].url.TrimEnd('/')
    }
    function Assert-Probe {
        param([string]$Case, [string]$Service, [string]$Path, [int]$Expected)
        $response = Invoke-WebRequest ($endpoints[$Service] + $Path) -SkipHttpErrorCheck -TimeoutSec 15
        $actual = [int]$response.StatusCode
        $checks.Add([ordered]@{ case=$Case; service=$Service; path=$Path; expected=$Expected; actual=$actual })
        if ($actual -ne $Expected) { throw "$Case $Service$Path expected $Expected, received $actual." }
        Write-Host "$Case $Service$Path = $actual"
    }
    foreach ($name in @('organization','reporting','web','gateway')) {
        Assert-Probe 'baseline' $name '/health' 200
        Assert-Probe 'baseline' $name '/alive' 200
    }
    Assert-Probe 'anonymous' 'gateway' '/api/workspaces' 401
    Assert-Probe 'anonymous' 'gateway' '/bff/api/workspaces' 401
    & dotnet run --file scripts/p1/Probe-BrokerPermissions.cs -- $endpoints['rabbitmq'] (Join-Path $repository 'artifacts/p1/broker-permissions.json')
    if ($LASTEXITCODE -ne 0) { throw 'AMQP permission probes failed.' }
    if ($Faults) {
        foreach ($dependency in @('rabbitmq','postgres','cache','identity')) {
            $services = switch ($dependency) {
                'cache' { @('web','gateway') }
                'identity' { @('organization','reporting','web','gateway') }
                default { @('organization','reporting','gateway') }
            }
            try {
                Invoke-Aspire @('resource', $dependency, 'stop')
                foreach ($name in $services) {
                    Assert-Probe "$dependency-down" $name '/health' 503
                    Assert-Probe "$dependency-down" $name '/alive' 200
                }
            } finally {
                # Always restore the exact stopped resource, even when an assertion fails.
                Invoke-Aspire @('resource', $dependency, 'start')
                Invoke-Aspire @('wait', $dependency, '--timeout', '90')
                Invoke-Aspire @('wait', 'gateway', '--timeout', '90')
            }
            foreach ($name in $services) { Assert-Probe "$dependency-recovered" $name '/health' 200 }
        }
    }
    [ordered]@{ date=(Get-Date -Format 'yyyy-MM-dd'); faults=[bool]$Faults; images=$images.ToArray();
        connectionReferences=$connectionReferences.ToArray(); checks=$checks.ToArray() } |
        ConvertTo-Json -Depth 5 | Set-Content artifacts/p1/readiness-validation.json -Encoding utf8
} finally { Pop-Location }
