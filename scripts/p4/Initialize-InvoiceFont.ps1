$ErrorActionPreference = 'Stop'
$folder = Join-Path $PSScriptRoot '../../artifacts/p4/runtime'
New-Item -ItemType Directory -Path $folder -Force | Out-Null
$source = 'https://raw.githubusercontent.com/google/fonts/a85815a42757630ce188fdad368c2dfc444d4773/ofl/notosanssc'
foreach ($asset in @(
    @{ Name = 'NotoSansSC-source.ttf'; Source = 'NotoSansSC%5Bwght%5D.ttf'; Hash = 'A3041811A78C361B1DE50F953C805E0244951C21C5BD412F7232EF0D899AF0DA' },
    @{ Name = 'OFL.txt'; Source = 'OFL.txt'; Hash = '1C05C68C34F9708415AADA51F17E1B0092D2CEA709BF4A94CD38114F9E73D7D9' }
)) {
    $path = Join-Path $folder $asset.Name
    if (!(Test-Path -LiteralPath $path) -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $asset.Hash) {
        $download = "$path.download"
        Invoke-WebRequest -Uri "$source/$($asset.Source)" -OutFile $download -TimeoutSec 120
        if ((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash -ne $asset.Hash) {
            throw "Pinned font asset hash mismatch for $($asset.Name)"
        }
        Move-Item -LiteralPath $download -Destination $path -Force
    }
}
$output = Join-Path $folder 'NotoSansSC.ttf'
$expected = '641F6AF1A066A146CF09A8A7DA27EB4B1037B8B98016A052EB7E4E0A57FB425B'
if (!(Test-Path -LiteralPath $output) -or (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash -ne $expected) {
    $temporary = "$output.building"
    python (Join-Path $PSScriptRoot 'prepare_invoice_font.py') (Join-Path $folder 'NotoSansSC-source.ttf') $temporary
    if ($LASTEXITCODE -ne 0 -or (Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash -ne $expected) {
        throw 'Unable to build the pinned static invoice font. Use Python fonttools==4.62.1.'
    }
    Move-Item -LiteralPath $temporary -Destination $output -Force
}
Get-Item -LiteralPath $output | Select-Object -ExpandProperty FullName
