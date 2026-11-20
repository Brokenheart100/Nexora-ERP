[CmdletBinding()]
param(
    [string]$AppHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj',
    [string]$OutputDirectory = 'artifacts/dashboard-d0/contracts'
)

$ErrorActionPreference = 'Stop'
$services = @('organization', 'masterdata', 'purchasing', 'sales', 'inventory', 'finance', 'reporting')
$methods = @('get', 'post', 'put', 'patch', 'delete', 'head', 'options')
$documents = [Collections.Generic.List[object]]::new()
$operations = [Collections.Generic.List[object]]::new()
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

foreach ($service in $services) {
    & aspire wait $service --apphost $AppHost --timeout 90 --non-interactive | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Resource is not ready: $service" }
    $snapshot = & aspire describe $service --apphost $AppHost --format Json --non-interactive | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw "Resource discovery failed: $service" }
    $resource = @($snapshot.resources | Where-Object displayName -eq $service)
    if ($resource.Count -ne 1) { throw "Expected one resource: $service" }
    $endpoint = $resource[0].urls | Where-Object name -eq 'https' | Select-Object -First 1 -ExpandProperty url
    if (!$endpoint) { throw "HTTPS endpoint missing: $service" }
    $uri = $endpoint.TrimEnd('/') + '/openapi/v1.json'
    $response = Invoke-WebRequest $uri -TimeoutSec 30
    $spec = $response.Content | ConvertFrom-Json -AsHashtable
    $file = Join-Path $OutputDirectory ($service + '.openapi.json')
    [IO.File]::WriteAllText([IO.Path]::GetFullPath($file), $response.Content, [Text.UTF8Encoding]::new($false))
    $count = 0
    foreach ($path in $spec.paths.Keys | Sort-Object) {
        $route = $spec.paths[$path]
        foreach ($method in $methods) {
            if (!$route.Contains($method)) { continue }
            $operation = $route[$method]
            $parameters = @($route.parameters) + @($operation.parameters) | Where-Object { $_ }
            $responses = foreach ($status in $operation.responses.Keys | Sort-Object) {
                $item = $operation.responses[$status]
                [ordered]@{
                    status = $status
                    headers = @($item.headers.Keys | Where-Object { $_ })
                    content = @($item.content.Keys | Where-Object { $_ })
                    schemas = @($item.content.Values | ForEach-Object { $_.schema } | Where-Object { $_ })
                }
            }
            $operations.Add([ordered]@{
                service = $service
                method = $method.ToUpperInvariant()
                path = $path
                operationId = $operation.operationId
                tags = @($operation.tags)
                parameters = @($parameters)
                requestBody = $operation.requestBody
                responses = @($responses)
            })
            $count++
        }
    }
    $documents.Add([ordered]@{
        service = $service
        source = $uri
        document = [IO.Path]::GetFileName($file)
        sha256 = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
        operationCount = $count
        schemaCount = $spec.components.schemas.Count
    })
    Write-Output "$service : $count operations"
}

[ordered]@{
    capturedAtUtc = [DateTimeOffset]::UtcNow.ToString('O')
    appHost = $AppHost
    documents = @($documents)
    operationCount = $operations.Count
} | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'index.json') -Encoding utf8NoBOM
$operations | ConvertTo-Json -Depth 60 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'operations.json') -Encoding utf8NoBOM
Write-Output "Captured $($operations.Count) operations. Permission policies and runtime DTOs must also be checked against owning endpoints and authenticated responses."
