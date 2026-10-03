param(
 [Parameter(Mandatory=$true)][string]$SignedXpiUrl,
 [string]$ExistingPolicyPath
)
$ErrorActionPreference='Stop'
$taskXpiUri=[uri]$SignedXpiUrl
if(-not $taskXpiUri.IsAbsoluteUri -or $taskXpiUri.Scheme -ne 'https' -or -not $taskXpiUri.AbsolutePath.EndsWith('.xpi')){throw 'Provide the HTTPS URL of the Mozilla-signed .xpi file.'}
if($ExistingPolicyPath){
 $taskPolicy=Get-Content -LiteralPath $ExistingPolicyPath -Raw | ConvertFrom-Json
}else{$taskPolicy=[pscustomobject]@{policies=[pscustomobject]@{}}}
if(-not $taskPolicy.policies){$taskPolicy|Add-Member -Force NoteProperty policies ([pscustomobject]@{})}
if(-not $taskPolicy.policies.ExtensionSettings){$taskPolicy.policies|Add-Member -Force NoteProperty ExtensionSettings ([pscustomobject]@{})}
$taskSettings=[pscustomobject]@{installation_mode='force_installed';install_url=$SignedXpiUrl;updates_disabled=$false}
$taskPolicy.policies.ExtensionSettings|Add-Member -Force NoteProperty 'arabicss-kpi@eldahan.local' $taskSettings
$taskPolicy|ConvertTo-Json -Depth 30

