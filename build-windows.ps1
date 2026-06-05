# build-windows.ps1 — Build and package FITS Metadata Viewer on Windows
#
# Usage (from the project root in PowerShell):
#   .\build-windows.ps1
#   .\build-windows.ps1 -SkipBuild      # package only, reuse existing build
#   .\build-windows.ps1 -QtPath "C:\Qt\6.7.0\msvc2019_64"
#
# Requirements:
#   - Qt 6 installed via the Qt Online Installer (https://www.qt.io/download)
#   - Visual Studio 2019 or 2022 with "Desktop development with C++" workload
#     OR MinGW 64-bit (install via Qt Installer)
#   - CMake 3.16+ (bundled with Visual Studio, or install from cmake.org)
#
# The script produces a self-contained folder "dist\FITSMetadataViewer\" with
# the executable and all required Qt DLLs, ready to zip and distribute.

param(
    [switch]$SkipBuild,
    [string]$QtPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$BuildDir   = Join-Path $ScriptDir "build-windows"
$DistDir    = Join-Path $ScriptDir "dist\FITSMetadataViewer"
$BinaryName = "AstroDataViewer.exe"

function Info    { param($msg) Write-Host "==> $msg" -ForegroundColor Cyan }
function Success { param($msg) Write-Host "==> $msg" -ForegroundColor Green }
function Fail    { param($msg) Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

# ── Locate Qt ─────────────────────────────────────────────────────────────────
if ($QtPath -eq "") {
    # Search common Qt installer locations
    $candidates = @(
        "C:\Qt",
        "$env:USERPROFILE\Qt",
        "D:\Qt"
    )
    foreach ($base in $candidates) {
        if (Test-Path $base) {
            # Find the newest Qt 6 MSVC 64-bit installation
            $found = Get-ChildItem "$base\6.*\msvc*_64\bin\qmake6.exe" -ErrorAction SilentlyContinue |
                     Sort-Object FullName -Descending |
                     Select-Object -First 1
            if ($found) {
                $QtPath = Split-Path -Parent (Split-Path -Parent $found.FullName)
                break
            }
            # Also check MinGW installs
            $found = Get-ChildItem "$base\6.*\mingw*_64\bin\qmake6.exe" -ErrorAction SilentlyContinue |
                     Sort-Object FullName -Descending |
                     Select-Object -First 1
            if ($found) {
                $QtPath = Split-Path -Parent (Split-Path -Parent $found.FullName)
                break
            }
        }
    }
}

if ($QtPath -eq "" -or -not (Test-Path "$QtPath\bin\qmake6.exe")) {
    Fail "Cannot find Qt 6. Install Qt via https://www.qt.io/download and re-run with:
  .\build-windows.ps1 -QtPath 'C:\Qt\6.7.0\msvc2019_64'"
}

Info "Using Qt: $QtPath"
$QtVersion = & "$QtPath\bin\qmake6.exe" -query QT_VERSION
Info "Qt version: $QtVersion"

# Add Qt bin to PATH for this session
$env:PATH = "$QtPath\bin;$env:PATH"

# ── Build ─────────────────────────────────────────────────────────────────────
if (-not $SkipBuild) {
    Info "Configuring..."
    if (Test-Path $BuildDir) { Remove-Item $BuildDir -Recurse -Force }
    New-Item -ItemType Directory -Path $BuildDir | Out-Null

    cmake -S "$ScriptDir" -B "$BuildDir" `
        -DCMAKE_BUILD_TYPE=Release `
        -DCMAKE_PREFIX_PATH="$QtPath" `
        -DCMAKE_INSTALL_PREFIX="$DistDir"

    Info "Building..."
    cmake --build "$BuildDir" --config Release --parallel
} else {
    if (-not (Test-Path $BuildDir)) {
        Fail "Build directory $BuildDir does not exist. Run without -SkipBuild first."
    }
    Info "Skipping build."
}

# ── Install ───────────────────────────────────────────────────────────────────
Info "Installing into dist\..."
if (Test-Path $DistDir) { Remove-Item $DistDir -Recurse -Force }
New-Item -ItemType Directory -Path $DistDir | Out-Null

cmake --install "$BuildDir" --config Release --prefix "$DistDir"

# ── Deploy Qt DLLs with windeployqt6 ─────────────────────────────────────────
Info "Deploying Qt dependencies with windeployqt6..."
$WinDeploy = "$QtPath\bin\windeployqt6.exe"
if (-not (Test-Path $WinDeploy)) {
    # Fallback to windeployqt (Qt 6 also ships this name)
    $WinDeploy = "$QtPath\bin\windeployqt.exe"
}
if (-not (Test-Path $WinDeploy)) {
    Fail "windeployqt6.exe not found in $QtPath\bin"
}

& $WinDeploy `
    --qmldir "$ScriptDir\qml" `
    --no-translations `
    --no-system-d3d-compiler `
    --no-opengl-sw `
    --release `
    "$DistDir\bin\$BinaryName"

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Success "Build complete."
Write-Host "Output folder: $DistDir"
Write-Host "Executable:    $DistDir\bin\$BinaryName"
Write-Host ""
Write-Host "To distribute: zip the entire 'dist\FITSMetadataViewer' folder." -ForegroundColor Yellow
Write-Host "Recipients need no Qt installation — all DLLs are included."   -ForegroundColor Yellow
