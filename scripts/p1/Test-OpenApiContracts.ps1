param([string]$AppHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj')

$ErrorActionPreference = 'Stop'
$contracts = @(
    @{ Service = 'finance'; Path = '/api/finance/workspaces/{workspaceId}/report-exports'; Method = 'post'; Status = '201'; Header = 'Location'; Input = 'Idempotency-Key' },
    @{ Service = 'inventory'; Path = '/api/inventory/workspaces/{workspaceId}/warehouses'; Method = 'post'; Status = '201'; Header = 'Location'; Input = 'Idempotency-Key' },
    @{ Service = 'masterdata'; Path = '/api/masterdata/workspaces/{workspaceId}/items/{itemId}'; Method = 'get'; Status = '200'; Header = 'ETag' },
    @{ Service = 'masterdata'; Path = '/api/masterdata/workspaces/{workspaceId}/items/{itemId}'; Method = 'put'; Status = '412'; MediaType = 'application/problem+json'; Input = 'If-Match' },
    @{ Service = 'organization'; Path = '/api/workspaces/{id}/invitations'; Method = 'post'; Status = '201'; Header = 'Location'; Input = 'Idempotency-Key'; HeaderAlternatives = @('operationId', 'expectedVersion') },
    @{ Service = 'purchasing'; Path = '/api/purchasing/workspaces/{workspaceId}/orders/{id}/receipts'; Method = 'post'; Status = '202'; Header = 'Location'; Input = 'If-Match' },
    @{ Service = 'reporting'; Path = '/api/reports/workspaces/{id}'; Method = 'get'; Status = '202'; Header = 'Location' },
    @{ Service = 'reporting'; Path = '/api/reports/workspaces/{id}'; Method = 'get'; Status = '503'; MediaType = 'application/problem+json' },
    @{ Service = 'sales'; Path = '/api/sales/workspaces/{workspaceId}/orders/{id}/fulfillments'; Method = 'post'; Status = '202'; Header = 'Location'; Input = 'If-Match' },
    @{ Service = 'finance'; Path = '/public/invoice-pdf'; Method = 'post'; Status = '200'; MediaType = 'application/pdf' }
)

foreach ($group in ($contracts | Group-Object Service)) {
    $json = aspire describe $group.Name --apphost $AppHost --format Json --non-interactive | Out-String
    if ($LASTEXITCODE -ne 0) { throw "Aspire describe failed for $($group.Name)" }
    $resource = ($json | ConvertFrom-Json).resources | Select-Object -First 1
    $base = $resource.urls | Where-Object Name -eq 'https' | Select-Object -First 1 -ExpandProperty url
    if (!$base) { throw "HTTPS endpoint missing for $($group.Name)" }
    $result = Invoke-WebRequest -Uri ($base.TrimEnd('/') + '/openapi/v1.json') -TimeoutSec 30
    $spec = $result.Content | ConvertFrom-Json -AsHashtable
    foreach ($entry in $group.Group) {
        $route = $spec.paths[$entry.Path]
        $operation = if ($route) { $route[$entry.Method] }
        if (!$operation) { throw "Missing $($entry.Service) $($entry.Method) $($entry.Path)" }
        $response = $operation.responses[$entry.Status]
        $label = "$($entry.Service) $($entry.Method) $($entry.Path) status $($entry.Status)"
        if (!$response) { throw "Missing $label" }
        if ($entry.Header -and !$response.headers[$entry.Header]) { throw "$label is missing response header $($entry.Header)" }
        if ($entry.MediaType -and !$response.content[$entry.MediaType]) { throw "$label is missing $($entry.MediaType)" }
        if ($entry.Input -and !($operation.parameters | Where-Object { $_.in -eq 'header' -and $_.name -eq $entry.Input })) {
            throw "$label is missing request header $($entry.Input)"
        }
        if ($entry.HeaderAlternatives) {
            $schema = $operation.requestBody.content['application/json'].schema
            if ($schema.'$ref') { $schema = $spec.components.schemas[($schema.'$ref'.Split('/')[-1])] }
            foreach ($field in $entry.HeaderAlternatives) {
                if (!$schema.properties[$field] -or $field -in $schema.required) {
                    throw "$label must allow the header as an alternative to $field"
                }
            }
        }
        Write-Output $label
    }
    if ($group.Name -eq 'finance' -and 'string' -notin @($spec.components.schemas.BankView.properties.balance.type)) {
        throw 'Bank balance schema must match the decimal string on the wire.'
    }
}

$gateway = aspire describe gateway --apphost $AppHost --format Json --non-interactive | Out-String | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Aspire describe failed for gateway' }
$base = $gateway.resources[0].urls | Where-Object Name -eq 'https' | Select-Object -First 1 -ExpandProperty url
$anonymous = Invoke-WebRequest -Uri ($base.TrimEnd('/') + '/api/workspaces') -SkipHttpErrorCheck -TimeoutSec 30
$problem = if ($anonymous.Content -is [byte[]]) {
    [System.Text.Encoding]::UTF8.GetString($anonymous.Content) | ConvertFrom-Json
} else {
    $anonymous.Content | ConvertFrom-Json
}
if ($anonymous.StatusCode -ne 401 -or $problem.code -ne 'auth.required' -or !$problem.traceId -or !$anonymous.Headers['WWW-Authenticate']) {
    throw 'Gateway should return 401 ProblemDetails with a traceId and WWW-Authenticate.'
}
Write-Output 'gateway anonymous status 401 ProblemDetails and WWW-Authenticate'
