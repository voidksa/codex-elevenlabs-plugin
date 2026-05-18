$ErrorActionPreference = "Stop"

$targetPath = Join-Path $env:APPDATA "Codex\elevenlabs\api-key.dpapi"
if (Test-Path -LiteralPath $targetPath) {
  Remove-Item -LiteralPath $targetPath -Force
  Write-Host "Removed stored ElevenLabs API key: $targetPath"
} else {
  Write-Host "No stored ElevenLabs API key was found."
}
