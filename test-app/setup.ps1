# VecFleet QA — Setup del entorno de testing
# Ejecutar desde: C:\Users\<tu_usuario>\OneDrive\Escritorio\Claude\vecfleet-automation-test\test-app\
# Uso: .\setup.ps1

$ErrorActionPreference = "Stop"
$ClaudeDir = "$env:USERPROFILE\OneDrive\Escritorio\Claude"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "    OK: $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "    WARN: $msg" -ForegroundColor Yellow }

# ── 1. Git ────────────────────────────────────────────────────────────────────
Write-Step "Verificando Git..."
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "Git no encontrado. Descargando instalador..." -ForegroundColor Yellow
    $gitUrl = (Invoke-RestMethod "https://api.github.com/repos/git-for-windows/git/releases/latest").assets |
              Where-Object { $_.name -like "*64-bit.exe" } | Select-Object -First 1 -ExpandProperty browser_download_url
    $wc = New-Object System.Net.WebClient
    $wc.DownloadFile($gitUrl, "$env:TEMP\git_setup.exe")
    Start-Process "$env:TEMP\git_setup.exe" -ArgumentList "/SILENT /NORESTART" -Wait
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
}
Write-OK "Git $(git --version)"

# ── 2. gh CLI ─────────────────────────────────────────────────────────────────
Write-Step "Verificando gh CLI..."
$ghBin = "$env:LOCALAPPDATA\Programs\gh-cli\bin"
if (-not (Get-Command gh -ErrorAction SilentlyContinue) -and -not (Test-Path "$ghBin\gh.exe")) {
    Write-Host "    Instalando gh CLI..." -ForegroundColor Yellow
    $release = Invoke-RestMethod "https://api.github.com/repos/cli/cli/releases/latest"
    $asset   = $release.assets | Where-Object { $_.name -like "*windows_amd64.zip" }
    $wc = New-Object System.Net.WebClient
    $wc.DownloadFile($asset.browser_download_url, "$env:TEMP\gh_cli.zip")

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead("$env:TEMP\gh_cli.zip")
    New-Item -ItemType Directory -Path "$ghBin" -Force | Out-Null
    foreach ($entry in $zip.Entries) {
        $dest = Join-Path "$env:LOCALAPPDATA\Programs\gh-cli" $entry.FullName
        $dir  = Split-Path $dest -Parent
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        $s = $entry.Open(); $f = [System.IO.File]::Create($dest); $s.CopyTo($f); $f.Close(); $s.Close()
    }
    $zip.Dispose()

    $currentPath = [System.Environment]::GetEnvironmentVariable("PATH","User")
    if ($currentPath -notlike "*gh-cli*") {
        [System.Environment]::SetEnvironmentVariable("PATH","$currentPath;$ghBin","User")
    }
    $env:PATH = "$env:PATH;$ghBin"
    Write-OK "gh CLI instalado"
} else {
    if ($env:PATH -notlike "*gh-cli*") { $env:PATH = "$env:PATH;$ghBin" }
    Write-OK "gh CLI ya instalado"
}

# ── 3. Autenticación GitHub ───────────────────────────────────────────────────
Write-Step "Verificando autenticación GitHub..."
$authStatus = gh auth status 2>&1
if ($authStatus -notlike "*Logged in*") {
    Write-Host "    Iniciando autenticación. Seguí las instrucciones en el browser..." -ForegroundColor Yellow
    gh auth login --hostname github.com --git-protocol https --web
} else {
    Write-OK "Ya autenticado en GitHub"
}

# ── 4. Clonar repositorios ───────────────────────────────────────────────────
Write-Step "Verificando repositorios..."
$repos = @(
    @{ name = "vecfleet-automation-test"; url = "https://github.com/VECFleet-Arg/vecfleet-automation-test" },
    @{ name = "qa-automation";            url = "https://github.com/VECFleet-Arg/qa-automation" },
    @{ name = "vecfleet-claude-config";   url = "https://github.com/VECFleet-Arg/vecfleet-claude-config" },
    @{ name = "vec-fleet (no-subir-cambios)"; url = "https://github.com/VECFleet-Arg/vec-fleet" },
    @{ name = "vecfleet-quasar";          url = "https://github.com/VECFleet-Arg/vecfleet-quasar" }
)

foreach ($repo in $repos) {
    $path = Join-Path $ClaudeDir $repo.name
    if (Test-Path $path) {
        Write-OK "$($repo.name) ya existe — haciendo pull..."
        git -C $path pull --quiet
    } else {
        Write-Host "    Clonando $($repo.name)..." -ForegroundColor Yellow
        git clone $repo.url $path
    }
}

# ── 5. Configurar credenciales vec-dev ───────────────────────────────────────
Write-Step "Verificando credenciales vec-dev..."
$envFile      = "$ClaudeDir\vecfleet-automation-test\test-app\environments\vec-dev.env"
$templateFile = "$ClaudeDir\vecfleet-automation-test\test-app\environments\vec-dev.env.template"

if (-not (Test-Path $envFile)) {
    Copy-Item $templateFile $envFile
    Write-Warn "Se creó vec-dev.env desde el template. Abriendo para que completes tus credenciales..."
    notepad $envFile
    Read-Host "  Presioná Enter cuando hayas guardado el archivo"
} else {
    Write-OK "vec-dev.env ya existe"
}

# ── 6. Aplicar patch de quasar ───────────────────────────────────────────────
Write-Step "Aplicando configuración de testing a vecfleet-quasar..."
$quasarDir = "$ClaudeDir\vecfleet-quasar"
$patchFile  = "$ClaudeDir\vecfleet-automation-test\test-app\quasar.patch"

$status = git -C $quasarDir status --porcelain
if ($status) {
    Write-Warn "vecfleet-quasar tiene cambios locales — el patch ya puede estar aplicado o hay conflictos."
    Write-Warn "Si necesitás reaplicar: git -C '$quasarDir' checkout . && git -C '$quasarDir' apply '$patchFile'"
} else {
    git -C $quasarDir apply $patchFile
    Write-OK "Patch aplicado correctamente"
}

Write-Host "`n Entorno listo." -ForegroundColor Green
Write-Host " Repos en: $ClaudeDir"
Write-Host " Credenciales: $envFile"
