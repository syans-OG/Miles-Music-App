[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$downloader = Join-Path $PSScriptRoot 'download-sidecars.mjs'
& node $downloader
if ($LASTEXITCODE -ne 0) {
    throw "Sidecar downloader failed with exit code $LASTEXITCODE."
}
