# set-keys.ps1 — enregistre les clés API MCP en variables d'environnement utilisateur.
# Lancer :  powershell -ExecutionPolicy Bypass -File .mcp-tools\set-keys.ps1
# Laisser vide = ignorer. setx ne s'applique qu'aux NOUVEAUX processus :
# ferme puis relance opencode apres.

$keys = @(
  @{ Name = 'GITHUB_PAT';          Label = 'GitHub fine-grained PAT';        Url = 'https://github.com/settings/personal-access-tokens/new' },
  @{ Name = 'FIRECRAWL_API_KEY';   Label = 'Firecrawl API key';              Url = 'https://firecrawl.dev/app/api-keys' },
  @{ Name = 'AHREFS_API_TOKEN';    Label = 'Ahrefs API token';               Url = 'https://app.ahrefs.com/api-keys' },
  @{ Name = 'RENDER_API_KEY';      Label = 'Render API key';                 Url = 'https://dashboard.render.com/u/settings?add-api-key' },
  @{ Name = 'MAGICPATH_API_TOKEN'; Label = 'MagicPath MCP token';            Url = 'https://magicpath.ai' },
  @{ Name = 'MONGODB_URI';         Label = 'MongoDB Atlas URI (mongodb+srv)';Url = 'https://cloud.mongodb.com' },
  @{ Name = 'GOOGLE_MCP_CLIENT_ID';     Label = 'Google OAuth client ID';    Url = 'https://console.cloud.google.com/apis/credentials' },
  @{ Name = 'GOOGLE_MCP_CLIENT_SECRET'; Label = 'Google OAuth client secret';Url = 'https://console.cloud.google.com/apis/credentials' },
  @{ Name = 'ASANA_CLIENT_ID';     Label = 'Asana client ID';                Url = 'https://app.asana.com/0/my-apps' },
  @{ Name = 'ASANA_CLIENT_SECRET'; Label = 'Asana client secret';            Url = 'https://app.asana.com/0/my-apps' },
  @{ Name = 'HUBSPOT_CLIENT_ID';     Label = 'HubSpot client ID';            Url = 'https://developers.hubspot.com/' },
  @{ Name = 'HUBSPOT_CLIENT_SECRET'; Label = 'HubSpot client secret';        Url = 'https://developers.hubspot.com/' }
)

Write-Host ""
Write-Host "  MCP - cles API" -ForegroundColor Cyan
Write-Host "  Entree vide = passer. Rien n'est affiche a l'ecran." -ForegroundColor DarkGray
Write-Host ""

$saved = 0
foreach ($k in $keys) {
    $current = [Environment]::GetEnvironmentVariable($k.Name, 'User')
    $state = if ($current) { 'deja definie' } else { 'absente' }
    Write-Host ("  [{0}] {1}  ({2})" -f $state, $k.Label, $k.Name)
    Write-Host ("        {0}" -f $k.Url) -ForegroundColor DarkGray
    $secure = Read-Host "        valeur"
    if ([string]::IsNullOrWhiteSpace($secure)) {
        Write-Host "        -> ignore" -ForegroundColor DarkGray
        continue
    }
    [Environment]::SetEnvironmentVariable($k.Name, $secure.Trim(), 'User')
    $env:($k.Name) = $secure.Trim()
    $saved++
    Write-Host "        -> enregistre" -ForegroundColor Green
    Write-Host ""
}

Write-Host ""
Write-Host ("  {0} variable(s) ecrite(s) dans le profil utilisateur." -f $saved) -ForegroundColor Cyan
Write-Host "  Ferme et relance opencode pour que les serveurs concernes demarrent." -ForegroundColor Yellow
Write-Host ""
