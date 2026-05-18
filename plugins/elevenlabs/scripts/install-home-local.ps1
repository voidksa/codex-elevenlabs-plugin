$ErrorActionPreference = "Stop"

$pluginRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$homePlugins = Join-Path $HOME "plugins"
$target = Join-Path $homePlugins "elevenlabs"
$marketplacePath = Join-Path $HOME ".agents\plugins\marketplace.json"

New-Item -ItemType Directory -Path $target -Force | Out-Null

Get-ChildItem -LiteralPath $pluginRoot -Force |
  Where-Object { $_.Name -ne "node_modules" } |
  ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $target -Recurse -Force
  }

Push-Location $target
try {
  npm install --omit=dev
} finally {
  Pop-Location
}

if (Test-Path -LiteralPath $marketplacePath) {
  $marketplace = Get-Content -Raw -LiteralPath $marketplacePath | ConvertFrom-Json
} else {
  New-Item -ItemType Directory -Path (Split-Path -Parent $marketplacePath) -Force | Out-Null
  $marketplace = [pscustomobject]@{
    name = "local"
    interface = [pscustomobject]@{
      displayName = "Local Plugins"
    }
    plugins = @()
  }
}

if (-not $marketplace.PSObject.Properties["interface"]) {
  $marketplace | Add-Member -NotePropertyName "interface" -NotePropertyValue ([pscustomobject]@{ displayName = "Local Plugins" })
}

if (-not $marketplace.PSObject.Properties["plugins"]) {
  $marketplace | Add-Member -NotePropertyName "plugins" -NotePropertyValue @()
}

$entry = [pscustomobject]@{
  name = "elevenlabs"
  source = [pscustomobject]@{
    source = "local"
    path = "./plugins/elevenlabs"
  }
  policy = [pscustomobject]@{
    installation = "AVAILABLE"
    authentication = "ON_INSTALL"
  }
  category = "Productivity"
}

$marketplace.plugins = @($marketplace.plugins | Where-Object { $_.name -ne "elevenlabs" }) + $entry
$marketplace | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $marketplacePath -Encoding UTF8

Write-Host "Installed ElevenLabs plugin to: $target"
Write-Host "Updated marketplace: $marketplacePath"
Write-Host "Restart Codex so the plugin can be discovered."
