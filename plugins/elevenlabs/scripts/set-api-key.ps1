param(
  [string]$ApiKey,
  [switch]$SkipValidation
)

$ErrorActionPreference = "Stop"

if (-not $ApiKey) {
  $secureInput = Read-Host "ElevenLabs API key" -AsSecureString
} else {
  $secureInput = ConvertTo-SecureString -String $ApiKey -AsPlainText -Force
}

$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureInput)
try {
  $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  if ($bstr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

if ([string]::IsNullOrWhiteSpace($plainKey)) {
  throw "No API key was provided."
}

if (-not $SkipValidation) {
  $headers = @{
    "xi-api-key" = $plainKey
    "Content-Type" = "application/json"
  }

  try {
    Invoke-RestMethod -Method Get -Uri "https://api.elevenlabs.io/v1/user" -Headers $headers | Out-Null
  } catch {
    throw "ElevenLabs rejected this API key. Use -SkipValidation if you intentionally want to store it anyway. $($_.Exception.Message)"
  }
}

$configDir = Join-Path $env:APPDATA "Codex\elevenlabs"
New-Item -ItemType Directory -Path $configDir -Force | Out-Null

$encrypted = $secureInput | ConvertFrom-SecureString
$targetPath = Join-Path $configDir "api-key.dpapi"
Set-Content -LiteralPath $targetPath -Value $encrypted -Encoding ASCII

try {
  $acl = Get-Acl -LiteralPath $targetPath
  $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $acl.SetAccessRuleProtection($true, $false)
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($currentUser, "FullControl", "Allow")
  $acl.SetAccessRule($rule)
  Set-Acl -LiteralPath $targetPath -AclObject $acl
} catch {
  Write-Warning "Stored the key, but could not tighten file permissions: $($_.Exception.Message)"
}

Write-Host "Stored ElevenLabs API key for this Windows user at: $targetPath"
