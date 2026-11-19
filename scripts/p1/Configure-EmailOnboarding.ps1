$ErrorActionPreference = 'Stop'
$base = $env:NEXORA_IDENTITY_ORIGIN.TrimEnd('/')
$auth = Invoke-RestMethod -Uri "$base/realms/master/protocol/openid-connect/token" -Method Post -TimeoutSec 20 -Body @{
    grant_type = 'password'; client_id = 'admin-cli'
    username = $env:NEXORA_IDENTITY_ADMIN; password = $env:NEXORA_IDENTITY_PASSWORD
}
$headers = @{ Authorization = 'Bearer ' + $auth.access_token }
$realm = "$base/admin/realms/nexora"

function Invoke-Realm([string] $Path, [string] $Method = 'Get', $Body) {
    $request = @{ Uri = "$realm$Path"; Method = $Method; Headers = $headers; TimeoutSec = 20 }
    if ($null -ne $Body) {
        $request.ContentType = 'application/json'
        $request.Body = $Body | ConvertTo-Json -Depth 20 -Compress
    }
    return (Invoke-RestMethod @request)
}

$alias = 'nexora-browser'
$flows = '/authentication/flows'
$flow = (Invoke-Realm $flows) | Where-Object alias -eq $alias
if (!$flow) {
    Invoke-Realm "$flows/browser/copy" Post @{ newName = $alias } | Out-Null
    $flow = (Invoke-Realm $flows) | Where-Object alias -eq $alias
}
$executions = "$flows/$alias/executions"
$provider = 'nexora-email-onboarding'
$steps = @(Invoke-Realm $executions)
$emailStep = $steps | Where-Object providerId -eq $provider
if (!$emailStep) {
    Invoke-Realm "$executions/execution" Post @{ provider = $provider } | Out-Null
    $steps = @(Invoke-Realm $executions)
    $emailStep = $steps | Where-Object providerId -eq $provider
}
if (!$emailStep) { throw 'The Keycloak email authenticator was not installed.' }
if ($emailStep.requirement -ne 'ALTERNATIVE') {
    $emailStep.requirement = 'ALTERNATIVE'
    Invoke-Realm $executions Put $emailStep | Out-Null
}
$rootSteps = @($steps | Where-Object level -eq 0)
$index = [array]::IndexOf($rootSteps.id, $emailStep.id)
if ($index -lt 1 -or $rootSteps[0].providerId -ne 'auth-cookie') { throw 'Unexpected browser flow order.' }
while ($index -gt 1) {
    Invoke-Realm "/authentication/executions/$($emailStep.id)/raise-priority" Post | Out-Null
    $index--
}

$smtp = @{
    host = $env:NEXORA_SMTP_HOST; port = $env:NEXORA_SMTP_PORT; from = $env:NEXORA_SMTP_FROM
    starttls = $env:NEXORA_SMTP_STARTTLS; ssl = 'false'; auth = 'false'
}
if ($env:NEXORA_SMTP_USER) {
    $smtp.auth = 'true'; $smtp.user = $env:NEXORA_SMTP_USER; $smtp.password = $env:NEXORA_SMTP_PASSWORD
}
Invoke-Realm '' Put @{ loginTheme = 'nexora'; duplicateEmailsAllowed = $false; smtpServer = $smtp } | Out-Null

$profile = Invoke-Realm '/users/profile'
$requiredNames = @($profile.attributes | Where-Object { $_.name -in 'firstName','lastName' -and $_.PSObject.Properties['required'] })
if ($requiredNames.Count) {
    foreach ($attribute in $requiredNames) { $attribute.PSObject.Properties.Remove('required') }
    Invoke-Realm '/users/profile' Put $profile | Out-Null
}

$client = @(Invoke-Realm '/clients?clientId=nexora-bff')[0]
if (!$client -or $client.clientId -ne 'nexora-bff') { throw 'The Nexora BFF client is missing.' }
if ($client.authenticationFlowBindingOverrides.browser -ne $flow.id) {
    $overrides = @{ browser = $flow.id }
    if ($client.authenticationFlowBindingOverrides) {
        foreach ($property in $client.authenticationFlowBindingOverrides.PSObject.Properties) {
            if ($property.Name -ne 'browser') { $overrides[$property.Name] = $property.Value }
        }
    }
    $client | Add-Member -NotePropertyName authenticationFlowBindingOverrides -NotePropertyValue $overrides -Force
    Invoke-Realm "/clients/$($client.id)" Put $client | Out-Null
}
# AMR: stamp the completed authenticator executions with OIDC reference values so the
# nexora-bff client can emit a truthful amr claim for the BFF step-up gate (F03). The reference
# max age must outlive the authorization code exchange; with the Keycloak default of 0 the amr
# claim is dropped whenever the token is minted in a later second than the authentication.
$amrSteps = @($steps | Where-Object { $_.providerId -in @('auth-username-password-form', 'auth-otp-form', $provider) })
$amrMaxAge = '3600'
foreach ($step in $amrSteps) {
    $reference = switch ($step.providerId) {
        'auth-username-password-form' { 'pwd' }
        'auth-otp-form' { 'otp' }
        default { 'email' }
    }
    $detail = Invoke-Realm "/authentication/executions/$($step.id)"
    $configId = $detail.authenticatorConfig
    if ($configId) {
        $existing = Invoke-Realm "/authentication/config/$configId"
        if ($existing.config.'default.reference.value' -ne $reference -or $existing.config.'default.reference.maxAge' -ne $amrMaxAge) {
            $config = @{ 'default.reference.value' = $reference; 'default.reference.maxAge' = $amrMaxAge }
            if ($existing.config) {
                foreach ($property in $existing.config.PSObject.Properties) {
                    if ($property.Name -notin @('reference-value', 'default.reference.value', 'default.reference.maxAge')) { $config[$property.Name] = $property.Value }
                }
            }
            $existing | Add-Member -NotePropertyName config -NotePropertyValue $config -Force
            Invoke-Realm "/authentication/config/$configId" Put $existing | Out-Null
        }
    }
    else {
        Invoke-Realm "/authentication/executions/$($step.id)/config" Post @{ alias = "amr-$($step.providerId)"; config = @{ 'default.reference.value' = $reference; 'default.reference.maxAge' = $amrMaxAge } } | Out-Null
    }
}
$mappers = @(Invoke-Realm "/clients/$($client.id)/protocol-mappers/models")
if (!($mappers | Where-Object protocolMapper -eq 'oidc-amr-mapper')) {
    Invoke-Realm "/clients/$($client.id)/protocol-mappers/models" Post @{
        name = 'authentication-method-reference'; protocol = 'openid-connect';
        protocolMapper = 'oidc-amr-mapper'; consentRequired = $false;
        config = @{ 'access.token.claim' = 'true'; 'id.token.claim' = 'true' }
    } | Out-Null
}
# CLI: provision the public device-authorization client and its read-only scope (F39).
$cliScopeName = 'nexora.cli'
$cliScopeText = '读取当前用户可访问的工作区（只读）'
$cliScope = @(Invoke-Realm "/client-scopes?name=$cliScopeName") | Where-Object name -eq $cliScopeName | Select-Object -First 1
if (!$cliScope) {
    Invoke-Realm '/client-scopes' Post @{
        name = $cliScopeName; protocol = 'openid-connect'; description = 'Nexora CLI read-only workspace access';
        attributes = @{ 'include.in.token.scope' = 'true'; 'display.on.consent.screen' = 'true'; 'consent.screen.text' = $cliScopeText };
        protocolMappers = @(@{
            name = 'nexora-cli-purpose'; protocol = 'openid-connect'; protocolMapper = 'oidc-hardcoded-claim-mapper';
            consentRequired = $false;
            config = @{ 'claim.name' = 'nexora.purpose'; 'claim.value' = 'cli'; 'jsonType.label' = 'String'; 'access.token.claim' = 'true'; 'id.token.claim' = 'false' }
        })
    } | Out-Null
    $cliScope = @(Invoke-Realm "/client-scopes?name=$cliScopeName") | Where-Object name -eq $cliScopeName | Select-Object -First 1
}
if (!$cliScope) { throw 'The Nexora CLI client scope is missing.' }
$scopeMappers = @(Invoke-Realm "/client-scopes/$($cliScope.id)/protocol-mappers/models")
if (!($scopeMappers | Where-Object { $_.protocolMapper -eq 'oidc-hardcoded-claim-mapper' -and $_.name -eq 'nexora-cli-purpose' })) {
    Invoke-Realm "/client-scopes/$($cliScope.id)/protocol-mappers/models" Post @{
        name = 'nexora-cli-purpose'; protocol = 'openid-connect'; protocolMapper = 'oidc-hardcoded-claim-mapper';
        consentRequired = $false;
        config = @{ 'claim.name' = 'nexora.purpose'; 'claim.value' = 'cli'; 'jsonType.label' = 'String'; 'access.token.claim' = 'true'; 'id.token.claim' = 'false' }
    } | Out-Null
}
$cli = @(Invoke-Realm '/clients?clientId=nexora-cli') | Where-Object clientId -eq 'nexora-cli' | Select-Object -First 1
if (!$cli) {
    Invoke-Realm '/clients' Post @{
        clientId = 'nexora-cli'; enabled = $true; protocol = 'openid-connect'; publicClient = $true;
        standardFlowEnabled = $false; implicitFlowEnabled = $false;
        directAccessGrantsEnabled = $false; serviceAccountsEnabled = $false;
        consentRequired = $true; fullScopeAllowed = $false;
        attributes = @{ 'oauth2.device.authorization.grant.enabled' = 'true'; 'pkce.code.challenge.method' = 'S256' };
        protocolMappers = @(@{
            name = 'business-api-audience'; protocol = 'openid-connect'; protocolMapper = 'oidc-audience-mapper';
            consentRequired = $false;
            config = @{ 'included.custom.audience' = 'nexora-api'; 'access.token.claim' = 'true'; 'id.token.claim' = 'false' }
        });
        optionalClientScopes = @($cliScopeName)
    } | Out-Null
    $cli = @(Invoke-Realm '/clients?clientId=nexora-cli') | Where-Object clientId -eq 'nexora-cli' | Select-Object -First 1
}
if (!$cli) { throw 'The Nexora CLI client is missing.' }
$cliMappers = @(Invoke-Realm "/clients/$($cli.id)/protocol-mappers/models")
if (!($cliMappers | Where-Object { $_.protocolMapper -eq 'oidc-audience-mapper' -and $_.name -eq 'business-api-audience' })) {
    Invoke-Realm "/clients/$($cli.id)/protocol-mappers/models" Post @{
        name = 'business-api-audience'; protocol = 'openid-connect'; protocolMapper = 'oidc-audience-mapper';
        consentRequired = $false;
        config = @{ 'included.custom.audience' = 'nexora-api'; 'access.token.claim' = 'true'; 'id.token.claim' = 'false' }
    } | Out-Null
}
$cliScopes = @($cli.optionalClientScopes)
if ($cliScopes -notcontains $cliScopeName) {
    $cliScopes += $cliScopeName
    $cli | Add-Member -NotePropertyName optionalClientScopes -NotePropertyValue $cliScopes -Force
    Invoke-Realm "/clients/$($cli.id)" Put $cli | Out-Null
}
# The CLI client needs the basic scopes so access tokens carry sub, profile and email claims.
$cliDefaultScopes = @('basic', 'profile', 'email')
$allClientScopes = @(Invoke-Realm '/client-scopes')
foreach ($scopeName in $cliDefaultScopes) {
    $scope = $allClientScopes | Where-Object name -eq $scopeName | Select-Object -First 1
    if (!$scope) { continue }
    Invoke-Realm "/clients/$($cli.id)/default-client-scopes/$($scope.id)" Put | Out-Null
}

# MCP: provision the finance read-only scope and the public device-authorization client (F41).
$mcpScopeName = 'nexora.mcp'
$mcpScope = @(Invoke-Realm "/client-scopes?name=$mcpScopeName") | Where-Object name -eq $mcpScopeName | Select-Object -First 1
if (!$mcpScope) {
    Invoke-Realm '/client-scopes' Post @{
        name = $mcpScopeName; protocol = 'openid-connect'; description = 'Nexora finance MCP read-only access';
        attributes = @{ 'include.in.token.scope' = 'true'; 'display.on.consent.screen' = 'true'; 'consent.screen.text' = '读取工作区财务科目、总账与报表（只读）' };
        protocolMappers = @(@{
            name = 'nexora-mcp-purpose'; protocol = 'openid-connect'; protocolMapper = 'oidc-hardcoded-claim-mapper';
            consentRequired = $false;
            config = @{ 'claim.name' = 'nexora.purpose'; 'claim.value' = 'mcp'; 'jsonType.label' = 'String'; 'access.token.claim' = 'true'; 'id.token.claim' = 'false' }
        })
    } | Out-Null
    $mcpScope = @(Invoke-Realm "/client-scopes?name=$mcpScopeName") | Where-Object name -eq $mcpScopeName | Select-Object -First 1
}
if (!$mcpScope) { throw 'The Nexora MCP client scope is missing.' }
$mcpScopeMappers = @(Invoke-Realm "/client-scopes/$($mcpScope.id)/protocol-mappers/models")
if (!($mcpScopeMappers | Where-Object { $_.protocolMapper -eq 'oidc-hardcoded-claim-mapper' -and $_.name -eq 'nexora-mcp-purpose' })) {
    Invoke-Realm "/client-scopes/$($mcpScope.id)/protocol-mappers/models" Post @{
        name = 'nexora-mcp-purpose'; protocol = 'openid-connect'; protocolMapper = 'oidc-hardcoded-claim-mapper';
        consentRequired = $false;
        config = @{ 'claim.name' = 'nexora.purpose'; 'claim.value' = 'mcp'; 'jsonType.label' = 'String'; 'access.token.claim' = 'true'; 'id.token.claim' = 'false' }
    } | Out-Null
}
$mcp = @(Invoke-Realm '/clients?clientId=nexora-mcp') | Where-Object clientId -eq 'nexora-mcp' | Select-Object -First 1
if (!$mcp) {
    Invoke-Realm '/clients' Post @{
        clientId = 'nexora-mcp'; enabled = $true; protocol = 'openid-connect'; publicClient = $true;
        standardFlowEnabled = $false; implicitFlowEnabled = $false;
        directAccessGrantsEnabled = $false; serviceAccountsEnabled = $false;
        consentRequired = $true; fullScopeAllowed = $false;
        attributes = @{ 'oauth2.device.authorization.grant.enabled' = 'true'; 'pkce.code.challenge.method' = 'S256' };
        protocolMappers = @(@{
            name = 'business-api-audience'; protocol = 'openid-connect'; protocolMapper = 'oidc-audience-mapper';
            consentRequired = $false;
            config = @{ 'included.custom.audience' = 'nexora-api'; 'access.token.claim' = 'true'; 'id.token.claim' = 'false' }
        });
        optionalClientScopes = @($mcpScopeName)
    } | Out-Null
    $mcp = @(Invoke-Realm '/clients?clientId=nexora-mcp') | Where-Object clientId -eq 'nexora-mcp' | Select-Object -First 1
}
if (!$mcp) { throw 'The Nexora MCP client is missing.' }
$mcpMappers = @(Invoke-Realm "/clients/$($mcp.id)/protocol-mappers/models")
if (!($mcpMappers | Where-Object { $_.protocolMapper -eq 'oidc-audience-mapper' -and $_.name -eq 'business-api-audience' })) {
    Invoke-Realm "/clients/$($mcp.id)/protocol-mappers/models" Post @{
        name = 'business-api-audience'; protocol = 'openid-connect'; protocolMapper = 'oidc-audience-mapper';
        consentRequired = $false;
        config = @{ 'included.custom.audience' = 'nexora-api'; 'access.token.claim' = 'true'; 'id.token.claim' = 'false' }
    } | Out-Null
}
$mcpScopes = @($mcp.optionalClientScopes)
if ($mcpScopes -notcontains $mcpScopeName) {
    $mcpScopes += $mcpScopeName
    $mcp | Add-Member -NotePropertyName optionalClientScopes -NotePropertyValue $mcpScopes -Force
    Invoke-Realm "/clients/$($mcp.id)" Put $mcp | Out-Null
}
foreach ($scopeName in @('basic', 'profile', 'email')) {
    $scope = $allClientScopes | Where-Object name -eq $scopeName | Select-Object -First 1
    if (!$scope) { continue }
    Invoke-Realm "/clients/$($mcp.id)/default-client-scopes/$($scope.id)" Put | Out-Null
}

Write-Output 'Keycloak email onboarding is configured.'
