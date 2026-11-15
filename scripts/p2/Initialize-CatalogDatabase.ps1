[CmdletBinding()]
param()

& (Join-Path $PSScriptRoot 'Initialize-DevelopmentDatabase.ps1') -Database masterdatadb
