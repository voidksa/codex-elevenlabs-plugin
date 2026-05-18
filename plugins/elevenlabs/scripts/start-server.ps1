$ErrorActionPreference = "Stop"

$pluginRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$sdkPackage = Join-Path $pluginRoot "node_modules\@modelcontextprotocol\sdk\package.json"

if (-not (Test-Path -LiteralPath $sdkPackage)) {
  Push-Location $pluginRoot
  try {
    npm install --omit=dev | Out-Null
  } finally {
    Pop-Location
  }
}

node (Join-Path $pluginRoot "scripts\server.mjs")
