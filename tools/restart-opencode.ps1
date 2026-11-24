<#
    Redémarrage propre d'OpenCode (openhop) + test d'envoi réel.

    À lancer app FERMÉE de préférence. Le script :
      1. tue tous les process opencode / openhop / madium-mcp
      2. remet à zéro les sessions bloquées en "busy" (unstick-opencode.py)
      3. vide la liste de reprise auto de l'app (guard/state.json -> resumed)
      4. relance openhop.exe
      5. attend que le serveur écoute
      6. envoie un message de test via le CLI de l'app
      7. affiche le dernier message assistant généré

    Journal : tools\restart-opencode.log
#>

$ErrorActionPreference = 'SilentlyContinue'
$log = Join-Path $PSScriptRoot 'restart-opencode.log'
$py  = 'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe'
if (-not (Test-Path $py)) { $py = 'python' }

function L([string]$m) {
    $line = '[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $m
    $line | Tee-Object -FilePath $log -Append
}

'--- démarrage du script ---' | Set-Content $log -Encoding UTF8

L 'arrêt des process OpenCode / openhop / madium'
Get-Process opencode-cli, opencode-pty, openhop, OpenCode, madium-mcp -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 4
$left = @(Get-Process opencode-cli, openhop, OpenCode -ErrorAction SilentlyContinue).Count
L "process restants : $left"

L 'nettoyage des sessions bloquées'
& $py (Join-Path $PSScriptRoot 'unstick-opencode.py') 2>&1 | Tee-Object -FilePath $log -Append

L 'vidage de la reprise automatique'
$gs = Join-Path $env:LOCALAPPDATA 'openhop\guard\state.json'
if (Test-Path $gs) {
    try {
        $j = Get-Content $gs -Raw | ConvertFrom-Json
        $j.resumed = @{}
        $j | ConvertTo-Json -Depth 10 -Compress | Set-Content $gs -Encoding UTF8 -NoNewline
        L '  guard.state.resumed = {}'
    } catch { L "  échec lecture guard state : $($_.Exception.Message)" }
} else { L '  guard state introuvable' }

L 'relance de openhop.exe'
$exe = 'C:\Users\User\Downloads\openhop.exe'
if (-not (Test-Path $exe)) { L "  introuvable : $exe"; exit 1 }
Start-Process -FilePath $exe

L 'attente du serveur opencode'
$ready = $false
for ($i = 1; $i -le 45; $i++) {
    Start-Sleep -Seconds 1
    $srv = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {
        $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
        $p -and $p.ProcessName -eq 'opencode-cli'
    }
    if ($srv) { L "  serveur prêt après $i s"; $ready = $true; break }
}
if (-not $ready) { L '  serveur toujours absent après 45 s' }

Start-Sleep -Seconds 4

L 'envoi du message de test : "salut, tu fonctionnes ?"'
& (Join-Path $env:LOCALAPPDATA 'openhop\bin\opencode.cmd') run "salut, tu fonctionnes ?" 2>&1 |
    Out-File -FilePath $log -Append -Encoding UTF8
Start-Sleep -Seconds 10

L 'dernier message généré'
& $py (Join-Path $PSScriptRoot 'check-last.py') 2>&1 | Tee-Object -FilePath $log -Append

L 'fin'
