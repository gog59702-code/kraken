#Requires -Version 5.1
<#
.SYNOPSIS
    Repare la connexion Apple ID d'iLoader sur Windows.

.DESCRIPTION
    Trois causes couvrent 95% des "le sign in ne marche pas" sur iLoader :

    1. Un proxy local (HTTP_PROXY / HTTPS_PROXY dans l'environnement, VPN,
       antivirus TLS) intercepte gsa.apple.com. Apple coupe alors la requete
       SRP en plein vol : GoAway NO_ERROR, aucune reponse, spinner infini.
    2. L'etat anisette stocke dans le Windows Credential Manager est perime.
       Apple rejette la requete d'authentification sans message exploitable.
    3. Trop de tentatives en peu de temps : throttling cote compte.

    Ce script nettoie les trois, relance iLoader dans un environnement sans
    proxy, et lit le log en direct pour dire a quelle etape exacte ca casse.

.PARAMETER Account
    Adresse Apple ID a traiter. Sert a -ResetAccount et a l'affichage.

.PARAMETER ResetAccount
    Retire le compte de data.json (avec sauvegarde) et supprime le mot de
    passe en cache. A utiliser quand le compte est coince dans un etat
    intermediaire et qu'un re-ajout propre est necessaire.

.PARAMETER PurgeAnisette
    Supprime l'etat anisette. A utiliser quand le login bloque APRES la
    validation du 2FA ("need to login again" puis plus rien). Ne pas utiliser
    si un autre compte fonctionne deja : la regeneration change l'identite
    machine et peut invalider la session en cours.

.PARAMETER NoRestart
    Ne touche pas au processus iLoader en cours.

.PARAMETER Watch
    Surveille le log et affiche l'etape courante jusqu'au verdict.

.PARAMETER TimeoutSec
    Duree de la surveillance. 180 s par defaut.

.EXAMPLE
    .\Fix-ILoader.ps1 -Account carole.dumonceau@hotmail.com -Watch

.EXAMPLE
    .\Fix-ILoader.ps1 -Account carole.dumonceau@hotmail.com -ResetAccount -Watch

.EXAMPLE
    .\Fix-ILoader.ps1 -PurgeAnisette -Watch
#>
[CmdletBinding()]
param(
    [string]$Account,
    [switch]$ResetAccount,
    [switch]$PurgeAnisette,
    [switch]$NoRestart,
    [switch]$Watch,
    [int]$TimeoutSec = 180
)

$ErrorActionPreference = 'Stop'

$Exe       = Join-Path $env:LOCALAPPDATA 'iloader\iloader.exe'
$DataDir   = Join-Path $env:APPDATA 'me.nabdev.iloader'
$DataPath  = Join-Path $DataDir 'data.json'
$PrefsPath = Join-Path $DataDir 'preferences.json'
$LogDir    = Join-Path $DataDir 'logs'

# Deux serveurs anisette connus vivants. ani.sidestore.io est en 502, ne pas l'ajouter.
$AniCandidates = @(
    'https://mac-ani.jkcoxson.com/',
    'https://new.ani.sidestore.io/'
)

$ProxyVars = @('HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','NO_PROXY','no_proxy')

function Write-Step([string]$Text) {
    Write-Host "[*] $Text" -ForegroundColor Cyan
}
function Write-Ok([string]$Text) {
    Write-Host "[+] $Text" -ForegroundColor Green
}
function Write-Warn2([string]$Text) {
    Write-Host "[!] $Text" -ForegroundColor Yellow
}
function Write-Fail2([string]$Text) {
    Write-Host "[-] $Text" -ForegroundColor Red
}

function Get-LogPath {
    # iLoader nomme ses logs en UTC. Passer par UtcNow evite de rater le
    # fichier entre 23h et minuit heure locale.
    Join-Path $LogDir ('iloader.{0}.log' -f [DateTime]::UtcNow.ToString('yyyy-MM-dd'))
}

function Get-CredentialTargets {
    $out = & cmdkey /list 2>$null
    foreach ($line in $out) {
        $i = $line.IndexOf('target=')
        if ($i -ge 0) { $line.Substring($i + 7).Trim() }
    }
}

function Remove-Credential([string]$Target) {
    $targets = @(Get-CredentialTargets)
    if ($targets -contains $Target) {
        & cmdkey /delete:$Target | Out-Null
        return $true
    }
    return $false
}

function Write-JsonNoBom([string]$Path, $Object) {
    # PS 5.1 ecrit un BOM en UTF8, serde_json le refuse. Ecriture brute.
    $text = ConvertTo-Json -InputObject $Object -Depth 6
    [System.IO.File]::WriteAllText($Path, $text, (New-Object System.Text.UTF8Encoding($false)))
}

function Get-LiveAnisette {
    foreach ($url in $AniCandidates) {
        try {
            $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10
            if ($r.StatusCode -eq 200) { return $url }
        } catch { }
    }
    return $null
}

function Ensure-AppleService {
    $svc = Get-Service -Name 'Apple Mobile Device Service' -ErrorAction SilentlyContinue
    if (-not $svc) { return 'absent' }
    if ($svc.Status -eq 'Running') { return 'running' }
    try {
        Start-Service -Name $svc.Name
        return 'started'
    } catch {
        return 'stopped'
    }
}

function Test-GsaTls {
    # Handshake TLS brut, sans proxy ni pile HTTP : dit si la machine peut
    # reellement parler a gsa.apple.com, ou si quelque chose intercepte.
    $client = $null
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $iar = $client.BeginConnect('gsa.apple.com', 443, $null, $null)
        if (-not $iar.AsyncWaitHandle.WaitOne(8000)) { return 'timeout (8s)' }
        $client.EndConnect($iar)

        $callback = [System.Net.Security.RemoteCertificateValidationCallback] { param($s, $cert, $chain, $err) return $true }
        $ssl = New-Object System.Net.Security.SslStream($client.GetStream(), $false, $callback)
        $ssl.AuthenticateAsClient('gsa.apple.com')
        $subject = $ssl.RemoteCertificate.Subject
        $ssl.Dispose()
        return $subject
    } catch {
        return ('erreur: ' + $_.Exception.Message)
    } finally {
        if ($client) { $client.Close() }
    }
}

function Test-DevicePresent {
    try {
        $d = @(Get-PnpDevice -PresentOnly -ErrorAction Stop | Where-Object { $_.InstanceId -like 'USB\VID_05AC*' })
        return ($d.Count -gt 0)
    } catch {
        try {
            $d = @(Get-WmiObject -Class Win32_PnPEntity | Where-Object { $_.DeviceID -like 'USB\VID_05AC*' })
            return ($d.Count -gt 0)
        } catch {
            return $false
        }
    }
}

function Reset-Account([string]$Email) {
    if ([string]::IsNullOrWhiteSpace($Email)) {
        Write-Warn2 'ResetAccount demande sans -Account : rien a retirer.'
        return
    }

    if (Test-Path $DataPath) {
        $backup = '{0}.bak-{1}' -f $DataPath, (Get-Date -Format 'yyyyMMdd-HHmmss')
        Copy-Item -Path $DataPath -Destination $backup -Force

        $json = Get-Content -Path $DataPath -Raw | ConvertFrom-Json
        $ids = @($json.ids | Where-Object { $_ -ne $Email })
        Write-JsonNoBom -Path $DataPath -Object ([ordered]@{ ids = [string[]]$ids })

        Write-Ok ('{0} retire de data.json (sauvegarde : {1})' -f $Email, (Split-Path $backup -Leaf))
    } else {
        Write-Warn2 'data.json introuvable, rien a retirer.'
    }

    if (Remove-Credential ('{0}.iloader' -f $Email)) {
        Write-Ok ('mot de passe en cache supprime : {0}.iloader' -f $Email)
    } else {
        Write-Step 'aucun mot de passe en cache pour ce compte.'
    }
}

function Start-ILoaderClean {
    $saved = @{}
    foreach ($n in $ProxyVars) { $saved[$n] = [Environment]::GetEnvironmentVariable($n) }

    try {
        foreach ($n in $ProxyVars) { [Environment]::SetEnvironmentVariable($n, $null) }
        $workDir = Split-Path -Path $Exe -Parent
        Start-Process -FilePath $Exe -WorkingDirectory $workDir | Out-Null
    } finally {
        foreach ($n in $ProxyVars) { [Environment]::SetEnvironmentVariable($n, $saved[$n]) }
    }
}

function Watch-Auth([int]$LimitSec) {
    $deadline = (Get-Date).AddSeconds($LimitSec)
    $path     = Get-LogPath
    $offset   = 0L
    if (Test-Path $path) { $offset = (Get-Item $path).Length }

    $stage      = 'idle'
    $stageAt    = Get-Date
    $sawLogin   = $false
    $proxyWarn  = $false
    $attempts   = 0

    Write-Step ('surveillance du log pendant {0}s - clique Sign in maintenant.' -f $LimitSec)

    while ((Get-Date) -lt $deadline) {
        $cur = Get-LogPath
        if ($cur -ne $path) { $path = $cur; $offset = 0L }

        if (Test-Path $path) {
            $len = (Get-Item $path).Length
            if ($len -lt $offset) { $offset = 0L }

            if ($len -gt $offset) {
                $chunk = ''
                try {
                    $fs = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
                    try {
                        [void]$fs.Seek($offset, [System.IO.SeekOrigin]::Begin)
                        $reader = New-Object System.IO.StreamReader($fs, [System.Text.Encoding]::UTF8)
                        $chunk  = $reader.ReadToEnd()
                        $offset = $fs.Position
                    } finally {
                        $fs.Dispose()
                    }
                } catch {
                    $chunk = ''
                }

                foreach ($line in ($chunk -split "`n")) {
                    if ([string]::IsNullOrWhiteSpace($line)) { continue }

                    if (-not $proxyWarn -and $line -match 'proxy\(http://127\.0\.0\.1') {
                        $proxyWarn = $true
                        Write-Warn2 'trafic Apple intercepte par un proxy local - c est la cause n1 des login muets.'
                    }

                    if ($line -match 'Logging in to Apple ID: (\S+)') {
                        $attempts++
                        Write-Host ('[1/6] login SRP demarre pour {0} (tentative {1})' -f $matches[1], $attempts) -ForegroundColor Cyan
                        if ($attempts -ge 3) {
                            Write-Warn2 '3 tentatives ou plus : Apple throttling possible, laisse passer 10 a 15 minutes.'
                        }
                        $sawLogin = $true; $stage = 'login'; $stageAt = Get-Date
                    }
                    elseif ($line -match 'Login step 1 completed') {
                        Write-Host '[2/6] etape 1 OK (sel + iterations)' -ForegroundColor Cyan
                        $stage = 'step1'; $stageAt = Get-Date
                    }
                    elseif ($line -match 'Sending proof login request') {
                        Write-Host '[3/6] preuve SRP envoyee - attente de la reponse Apple' -ForegroundColor Cyan
                        $stage = 'proof'; $stageAt = Get-Date
                    }
                    elseif ($line -match 'Login step 2 completed') {
                        Write-Host '[4/6] etape 2 OK (preuve serveur verifiee)' -ForegroundColor Cyan
                        $stage = 'step2'; $stageAt = Get-Date
                    }
                    elseif ($line -match 'Initial login successful') {
                        Write-Host '[5/6] mot de passe accepte' -ForegroundColor Cyan
                        $stage = 'password-ok'; $stageAt = Get-Date
                    }
                    elseif ($line -match 'Trusted device 2FA required') {
                        Write-Host '[5/6] 2FA demande - valide sur l iPhone et tape le code a 6 chiffres' -ForegroundColor Yellow
                        $stage = '2fa'; $stageAt = Get-Date
                    }
                    elseif ($line -match 'Trusted device 2FA completed, need to login again') {
                        Write-Host '[5/6] 2FA valide - reconnexion avec le jeton de confiance' -ForegroundColor Yellow
                        $stage = 'relogin'; $stageAt = Get-Date
                    }
                    elseif ($line -match 'Created developer session|Successfully retrieved app token|Built sideloader') {
                        Write-Ok '[6/6] SESSION DEV CREEE - le compte est connecte.'
                        return 0
                    }
                }
            }
        }

        $elapsed = ((Get-Date) - $stageAt).TotalSeconds

        switch ($stage) {
            'login' {
                if ($elapsed -gt 20) {
                    Write-Fail2 'etape 1 bloquee : Apple ne rend pas la main. Anisette invalide ou reseau bloque.'
                    return 4
                }
            }
            'step1' {
                if ($elapsed -gt 10) {
                    Write-Fail2 'la preuve SRP n est jamais partie : blocage local entre etape 1 et 2.'
                    return 4
                }
            }
            'proof' {
                if ($elapsed -gt 25) {
                    Write-Fail2 'Apple n a pas repondu a la preuve SRP. Mot de passe refuse, compte verrouille, ou compte throttle. Teste la connexion sur appleid.apple.com dans un navigateur.'
                    return 3
                }
            }
            'relogin' {
                if ($elapsed -gt 25) {
                    Write-Fail2 'reconnexion post-2FA muette. Relance avec -PurgeAnisette.'
                    return 3
                }
            }
        }

        Start-Sleep -Milliseconds 400
    }

    if (-not $sawLogin) {
        Write-Warn2 ('aucun login detecte en {0}s - le bouton Sign in n a pas ete clique.' -f $LimitSec)
        return 2
    }

    Write-Warn2 ('delai depasse a l etape {0}.' -f $stage)
    return 2
}

# ---------------------------------------------------------------- main

Write-Host ''
Write-Host 'iLoader - reparation de la connexion Apple ID' -ForegroundColor White
Write-Host '--------------------------------------------' -ForegroundColor DarkGray

if (-not (Test-Path $Exe)) {
    Write-Fail2 ('iLoader introuvable : {0}' -f $Exe)
    [Environment]::Exit(1)
}
Write-Ok ('iLoader trouve : version {0}' -f (Get-Item $Exe).VersionInfo.FileVersion)

$svc = Ensure-AppleService
switch ($svc) {
    'running' { Write-Ok 'Apple Mobile Device Service : running' }
    'started' { Write-Ok 'Apple Mobile Device Service : demarre' }
    'absent'  { Write-Warn2 'Apple Mobile Device Service absent - installe Apple Devices depuis le Microsoft Store.' }
    default   { Write-Warn2 'Apple Mobile Device Service arrete - lance le script en administrateur.' }
}

if (Test-DevicePresent) {
    Write-Ok 'iPhone detecte en USB'
} else {
    Write-Warn2 'aucun appareil Apple en USB - branche le telephone et deverrouille-le.'
}

$ani = Get-LiveAnisette
if ($ani) {
    Write-Ok ('serveur anisette joignable : {0}' -f $ani)
    if (Test-Path $PrefsPath) {
        try {
            $prefs = Get-Content -Path $PrefsPath -Raw | ConvertFrom-Json
            if ($prefs.newAnisetteServer -ne ($ani -replace '^https://','' -replace '/$','')) {
                $prefs | Add-Member -NotePropertyName newAnisetteServer -NotePropertyValue ($ani -replace '^https://','' -replace '/$','') -Force
                Write-JsonNoBom -Path $PrefsPath -Object $prefs
                Write-Ok 'preferences.json aligne sur le serveur vivant'
            }
        } catch {
            Write-Warn2 'preferences.json illisible, laisse tel quel'
        }
    }
} else {
    Write-Warn2 'aucun serveur anisette ne repond - verifie ta connexion.'
}

$tls = Test-GsaTls
if ($tls -like '*gsa.apple.com*') {
    Write-Ok 'TLS direct vers gsa.apple.com : OK (aucune interception)'
} else {
    Write-Warn2 ('TLS vers gsa.apple.com : {0}' -f $tls)
}

if ($ResetAccount) {
    Write-Step ('reset du compte {0}' -f $Account)
    Reset-Account -Email $Account
}

if ($PurgeAnisette) {
    if (Remove-Credential 'anisette_state.iloader') {
        Write-Ok 'etat anisette purge - il sera regenere au prochain login'
    } else {
        Write-Step 'aucun etat anisette en cache'
    }
}

if (-not $NoRestart) {
    $running = @(Get-Process -Name 'iloader' -ErrorAction SilentlyContinue)
    if ($running.Count -gt 0) {
        Write-Step ('arret de {0} instance(s) iLoader' -f $running.Count)
        $running | Stop-Process -Force
        Start-Sleep -Seconds 2
    }
    Write-Step 'relance sans variables de proxy'
    Start-ILoaderClean
    Start-Sleep -Seconds 5

    $proc = @(Get-Process -Name 'iloader' -ErrorAction SilentlyContinue)
    if ($proc.Count -gt 0) {
        Write-Ok ('iLoader relance (PID {0})' -f $proc[0].Id)
    } else {
        Write-Fail2 'iLoader n a pas demarre - lance-le a la main.'
    [Environment]::Exit(1)
    }
}

Write-Host ''
Write-Host 'Prochaine etape dans l interface : selectionne le compte, clique Sign in,' -ForegroundColor White
Write-Host 'valide la notification sur l iPhone et tape le code a 6 chiffres.' -ForegroundColor White
Write-Host ''

if ($Watch) {
    $code = Watch-Auth -LimitSec $TimeoutSec
    [Environment]::Exit($code)
}

[Environment]::Exit(0)
