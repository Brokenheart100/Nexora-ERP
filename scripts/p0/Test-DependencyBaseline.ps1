param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $taskRoot 'artifacts/p0/dependency-probe' }
$taskOutput = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
$taskBaselinePath = Join-Path $taskRoot 'docs/domain/p0-dependency-baseline.json'
$taskBaseline = Get-Content -LiteralPath $taskBaselinePath -Raw | ConvertFrom-Json
$taskScratch = Join-Path ([IO.Path]::GetTempPath()) ('nexora-p0-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskScratch | Out-Null
$taskReferences = foreach ($taskPackage in $taskBaseline.packages.PSObject.Properties) {
    '    <PackageReference Include="{0}" Version="{1}" />' -f $taskPackage.Name, $taskPackage.Value
}
$taskProject = @"
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>$($taskBaseline.targetFramework)</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>
  </PropertyGroup>
  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
$($taskReferences -join "`n")
  </ItemGroup>
</Project>
"@
Set-Content -LiteralPath (Join-Path $taskScratch 'DependencyProbe.csproj') -Value $taskProject -Encoding utf8
Set-Content -LiteralPath (Join-Path $taskScratch 'NuGet.Config') -Encoding utf8 -Value '<configuration><packageSources><clear/><add key="nuget.org" value="https://api.nuget.org/v3/index.json" /></packageSources></configuration>'
$taskProgram = @'
using System.Runtime.InteropServices;
using System.Text.Json;
var types = new[] {
    typeof(Wolverine.IMessageBus), typeof(Wolverine.Saga),
    typeof(Wolverine.Http.WolverinePostAttribute),
    typeof(Microsoft.EntityFrameworkCore.DbContext),
    typeof(Microsoft.AspNetCore.Authorization.IAuthorizationService)
};
Console.WriteLine(JsonSerializer.Serialize(new {
    runtime = RuntimeInformation.FrameworkDescription,
    assemblies = types.Select(t => new { type = t.FullName, assembly = t.Assembly.GetName().Name, version = t.Assembly.GetName().Version?.ToString() }),
    scope = "assembly loading only; no database, broker, login, or business workflow exercised"
}));
'@
Set-Content -LiteralPath (Join-Path $taskScratch 'Program.cs') -Value $taskProgram -Encoding utf8
$taskResult = [ordered]@{ checkedAtUtc = [DateTime]::UtcNow.ToString('O'); scratchDirectory = $taskScratch; baseline = 'docs/domain/p0-dependency-baseline.json'; status = 'running'; steps = @(); limitations = @('No EF transaction or Outbox integration runtime tested', 'No PostgreSQL/RabbitMQ/Keycloak connections', 'No external provider delivery or production acceptance') }
try {
    Push-Location -LiteralPath $taskScratch
    try {
        foreach ($taskStep in @(
            @{ Name = 'restore'; Args = @('restore','DependencyProbe.csproj','--configfile','NuGet.Config','--use-lock-file','--nologo') },
            @{ Name = 'restore-locked'; Args = @('restore','DependencyProbe.csproj','--configfile','NuGet.Config','--locked-mode','--nologo') },
            @{ Name = 'build'; Args = @('build','DependencyProbe.csproj','--no-restore','--nologo') },
            @{ Name = 'load'; Args = @('run','--project','DependencyProbe.csproj','--no-build','--no-restore') }
        )) {
            $taskArguments = $taskStep.Args
            $taskLog = & dotnet @taskArguments 2>&1
            $taskCode = $LASTEXITCODE
            $taskLog | Set-Content -LiteralPath (Join-Path $taskOutput ($taskStep.Name + '.log')) -Encoding utf8
            $taskResult.steps += @{ name = $taskStep.Name; exitCode = $taskCode }
            if ($taskCode -ne 0) { throw "Dependency probe failed at $($taskStep.Name); see artifacts/p0/dependency-probe logs." }
        }
        Copy-Item -LiteralPath (Join-Path $taskScratch 'packages.lock.json') -Destination (Join-Path $taskOutput 'packages.lock.json')
        $taskResult.status = 'passed'
    } finally { Pop-Location }
} catch {
    $taskResult.status = 'failed'
    $taskResult.error = $_.Exception.Message
    throw
} finally {
    $taskResult | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $taskOutput 'result.json') -Encoding utf8
}
$taskResult | ConvertTo-Json -Depth 8
