<#
  extract-apk.ps1 — pull the live Kraken APK from LDPlayer 9 and unpack its real UI assets.
  Usage:  .\extract-apk.ps1 -LdPlayerDir "C:\LDPlayer\LDPlayer9"
#>
param(
  [string]$LdPlayerDir = "C:\LDPlayer\LDPlayer9",
  [string]$Package    = "",
  [string]$OutDir     = "$PSScriptRoot\..\extracted",
  [int[]]$Ports       = @(5555, 5554, 5556, 5585)
)

$ErrorActionPreference = "Stop"
function Say($m, $c = "Cyan") { Write-Host $m -ForegroundColor $c }

# ── 1. locate adb ──────────────────────────────────────────────────────────
$adb = Join-Path $LdPlayerDir "adb.exe"
if (-not (Test-Path $adb)) {
  $adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
}
if (-not $adb) { throw "adb introuvable. Passe -LdPlayerDir vers le dossier LDPlayer 9." }
Say "[+] adb : $adb"

# ── 2. connect ─────────────────────────────────────────────────────────────
$connected = $null
foreach ($p in $Ports) {
  Say "[*] tentative 127.0.0.1:$p"
  & $adb connect "127.0.0.1:$p" | Out-Null
  $state = (& $adb devices) -match "127.0.0.1:$p\s+device"
  if ($state) { $connected = "127.0.0.1:$p"; break }
}
if (-not $connected) {
  $any = (& $adb devices) | Select-String "device$"
  if ($any) { $connected = ($any -split "\s+")[0] }
}
if (-not $connected) { throw "Aucun émulateur connecté. LDPlayer lancé et adb activé ?" }
Say "[+] device : $connected" Green
$adbArgs = @("-s", $connected)

# ── 3. find the package ────────────────────────────────────────────────────
if (-not $Package) {
  Say "[*] recherche des paquets kraken…"
  $pkgs = & $adb @adbArgs shell pm list packages 2>$null | Select-String "kraken"
  if (-not $pkgs) { throw "Aucun paquet kraken installé dans cet émulateur." }
  $pkgs | ForEach-Object { Say "    $_" }
  $Package = (($pkgs | Select-Object -First 1) -replace "package:", "").Trim()
}
Say "[+] paquet : $Package" Green

# ── 4. pull all apk parts ──────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$apkDir = Join-Path $OutDir "apk"
New-Item -ItemType Directory -Force -Path $apkDir | Out-Null

$paths = & $adb @adbArgs shell pm path $Package
foreach ($line in $paths) {
  $remote = ($line -replace "package:", "").Trim()
  if (-not $remote) { continue }
  $name = Split-Path $remote -Leaf
  Say "[*] pull $remote"
  & $adb @adbArgs pull $remote (Join-Path $apkDir $name) | Out-Null
}
Get-ChildItem $apkDir | ForEach-Object { Say ("    {0}  {1:N1} MB" -f $_.Name, ($_.Length/1MB)) }

$baseApk = Get-ChildItem $apkDir -Filter "base.apk" | Select-Object -First 1
if (-not $baseApk) { $baseApk = Get-ChildItem $apkDir -Filter "*.apk" | Sort-Object Length -Descending | Select-Object -First 1 }
Say "[+] APK principal : $($baseApk.Name)" Green

# ── 5. decompile ───────────────────────────────────────────────────────────
$apktool = $null
$cmd = Get-Command apktool -ErrorAction SilentlyContinue
if ($cmd) { $apktool = $cmd.Source }
if (-not $apktool) {
  $jar = Join-Path $OutDir "apktool.jar"
  if (-not (Test-Path $jar)) {
    Say "[*] téléchargement apktool.jar"
    Invoke-WebRequest "https://github.com/iBotPeaches/Apktool/releases/download/v2.9.3/apktool_2.9.3.jar" -OutFile $jar
  }
  $apktool = $jar
}

$decoded = Join-Path $OutDir "decoded"
Say "[*] apktool d (ressources)"
if ($apktool -like "*.jar") {
  & java -jar $apktool d -f --no-src -o $decoded $baseApk.FullName
} else {
  & $apktool d -f --no-src -o $decoded $baseApk.FullName
}

# ── 6. inventory of real assets ────────────────────────────────────────────
$report = Join-Path $OutDir "REPORT.txt"
"# $Package`n# tiré de $connected le $(Get-Date -Format u)`n" | Set-Content $report

function Add-Section($title, $path) {
  Add-Content $report "`n===== $title ====="
  if (Test-Path $path) {
    Get-ChildItem $path -Recurse -File | ForEach-Object {
      Add-Content $report ("{0}  ({1:N0} o)" -f $_.FullName.Replace($decoded, "."), $_.Length)
    }
  } else { Add-Content $report "(absent)" }
}

Add-Section "layouts"    (Join-Path $decoded "res\layout")
Add-Section "drawables"  (Join-Path $decoded "res\drawable-xxhdpi")
Add-Section "fonts"      (Join-Path $decoded "res\font")
Add-Section "assets"     (Join-Path $decoded "assets")

$colors = Join-Path $decoded "res\values\colors.xml"
if (Test-Path $colors) {
  Add-Content $report "`n===== colors.xml (extrait) ====="
  Get-Content $colors | Select-String "<color" | Select-Object -First 120 | ForEach-Object { Add-Content $report $_.Line.Trim() }
}

$strings = Join-Path $decoded "res\values\strings.xml"
if (Test-Path $strings) {
  Add-Content $report "`n===== strings.xml (extrait) ====="
  Get-Content $strings | Select-String "<string" | Select-Object -First 200 | ForEach-Object { Add-Content $report $_.Line.Trim() }
}

# ── 7. React Native / Hermes detection ─────────────────────────────────────
$bundle = Join-Path $decoded "assets\index.android.bundle"
if (Test-Path $bundle) {
  $size = (Get-Item $bundle).Length
  $head = [System.IO.File]::ReadAllBytes($bundle)[0..15]
  $magic = [System.Text.Encoding]::ASCII.GetString($head)
  Add-Content $report "`n===== JS bundle ====="
  Add-Content $report "taille : $size octets"
  Add-Content $report "entête : $magic"
  if ($magic -match "hermes") {
    Add-Content $report "type   : HERMES bytecode -> 'hbctool disasm index.android.bundle out' puis grep des couleurs"
    Say "[!] bundle Hermes détecté — bytecode" Yellow
  } else {
    Add-Content $report "type   : JS lisible"
    Copy-Item $bundle (Join-Path $OutDir "index.android.bundle.js")
    Say "[+] bundle JS copié : index.android.bundle.js" Green
    # couleurs utilisées dans le style
    $hex = Select-String -Path (Join-Path $OutDir "index.android.bundle.js") -Pattern "#[0-9a-fA-F]{6,8}" -AllMatches |
           ForEach-Object { $_.Matches.Value } | Group-Object | Sort-Object Count -Descending | Select-Object -First 60
    Add-Content $report "`n===== couleurs les plus fréquentes du bundle ====="
    $hex | ForEach-Object { Add-Content $report ("{0}  x{1}" -f $_.Name, $_.Count) }
  }
}

Say ""
Say "===== terminé =====" Green
Say "assets réels : $decoded\res\"
Say "rapport      : $report"
Say ""
Say "Étapes suivantes :" Cyan
Say "  - copier res\drawable-xxhdpi\* -> assets/icons/ de ton site"
Say "  - copier res\font\*             -> assets/fonts/"
Say "  - XML->HTML : res\layout\*.xml (LinearLayout/FrameLayout -> flexbox)"
Say "  - RN : les styles exacts sont dans le bundle (couleurs ci-dessus)"
