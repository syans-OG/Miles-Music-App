[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$tauriRoot = Join-Path $projectRoot 'src-tauri'
$manifestPath = Join-Path $tauriRoot 'sidecars.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ("miles-sidecars-{0}" -f [guid]::NewGuid())

function Get-Sha256([string]$Path) {
    (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-Sha256([string]$Path, [string]$ExpectedHash, [string]$Label) {
    $actualHash = Get-Sha256 $Path
    if ($actualHash -ne $ExpectedHash.ToLowerInvariant()) {
        throw "$Label checksum mismatch. Expected $ExpectedHash, received $actualHash."
    }
}

New-Item -ItemType Directory -Path $temporaryRoot | Out-Null

try {
    foreach ($binary in $manifest.binaries) {
        $downloadUri = [Uri]$binary.downloadUrl
        if ($downloadUri.Scheme -ne 'https' -or $downloadUri.Host -ne 'github.com') {
            throw "Unsupported download source for $($binary.id)."
        }

        $destination = Join-Path $tauriRoot $binary.fileName
        if ((Test-Path -LiteralPath $destination) -and
            (Get-Sha256 $destination) -eq $binary.sha256.ToLowerInvariant()) {
            Write-Host "$($binary.id) $($binary.version) is already verified."
            continue
        }

        $assetName = [IO.Path]::GetFileName($downloadUri.AbsolutePath)
        $assetPath = Join-Path $temporaryRoot $assetName
        Invoke-WebRequest -UseBasicParsing -Uri $downloadUri -OutFile $assetPath
        Assert-Sha256 $assetPath $binary.publisherAssetSha256 "$($binary.id) publisher asset"

        if ([IO.Path]::GetExtension($assetPath) -eq '.zip') {
            $extractPath = Join-Path $temporaryRoot "$($binary.id)-extracted"
            Expand-Archive -LiteralPath $assetPath -DestinationPath $extractPath
            $executable = Get-ChildItem -LiteralPath $extractPath -Recurse -File |
                Where-Object Name -eq $binary.runtimeFileName |
                Select-Object -First 1
            if (-not $executable) {
                throw "$($binary.runtimeFileName) was not found in the verified archive."
            }
            $verifiedExecutable = $executable.FullName
        } else {
            $verifiedExecutable = $assetPath
        }

        Assert-Sha256 $verifiedExecutable $binary.sha256 "$($binary.id) executable"
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        Copy-Item -LiteralPath $verifiedExecutable -Destination $destination -Force
        Write-Host "Installed and verified $($binary.id) $($binary.version)."
    }
} finally {
    if (Test-Path -LiteralPath $temporaryRoot) {
        Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
    }
}
