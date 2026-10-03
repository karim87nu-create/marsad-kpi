param([string]$FirefoxDirectory,[switch]$DryRun)
$ErrorActionPreference='Stop'
$taskAddonId='arabicss-kpi@eldahan.local'
$taskBase='https://karim87nu-create.github.io/marsad-kpi/'
$taskRelease=Invoke-RestMethod -Uri ($taskBase+'firefox-release.json') -TimeoutSec 30
if($taskRelease.status -ne 'ready' -or $taskRelease.addon_id -ne $taskAddonId){throw 'Not ready: Mozilla signing is still pending. No device settings were changed.'}
if($taskRelease.sha256 -notmatch '^[a-f0-9]{64}$'){throw 'Invalid release checksum.'}
$taskXpiUri=[uri]$taskRelease.install_url
if($taskXpiUri.Scheme -ne 'https' -or -not $taskXpiUri.AbsoluteUri.StartsWith($taskBase) -or -not $taskXpiUri.AbsolutePath.EndsWith('.xpi')){throw 'Invalid signed-extension URL.'}
if(-not $FirefoxDirectory){
 $taskCandidates=@([IO.Path]::Combine([Environment]::GetFolderPath('ProgramFiles'),'Mozilla Firefox'),[IO.Path]::Combine([Environment]::GetFolderPath('ProgramFilesX86'),'Mozilla Firefox'),[IO.Path]::Combine([Environment]::GetFolderPath('LocalApplicationData'),'Mozilla Firefox'))
 $FirefoxDirectory=$taskCandidates | Where-Object {Test-Path -LiteralPath (Join-Path $_ 'firefox.exe')} | Select-Object -First 1
}
if(-not $FirefoxDirectory){throw 'Firefox was not found. Pass -FirefoxDirectory with its installation folder.'}
$taskFirefoxPath=(Resolve-Path -LiteralPath $FirefoxDirectory).Path
$taskExe=Join-Path $taskFirefoxPath 'firefox.exe'
if(-not (Test-Path -LiteralPath $taskExe)){throw 'This is not a Firefox installation folder.'}
$taskFirefoxMajor=[int]((Get-Item -LiteralPath $taskExe).VersionInfo.ProductVersion.Split('.')[0])
if($taskFirefoxMajor -lt 140){throw 'Firefox 140 or newer is required. Update Firefox before installing.'}
$taskPolicyPath=Join-Path $taskFirefoxPath 'distribution/policies.json'
$taskGeneratorArgs=@{SignedXpiUrl=$taskRelease.install_url}
if(Test-Path -LiteralPath $taskPolicyPath){$taskGeneratorArgs.ExistingPolicyPath=$taskPolicyPath}
$taskPolicyJson=& (Join-Path $PSScriptRoot 'Generate-FirefoxPolicy.ps1') @taskGeneratorArgs
if($DryRun){$taskPolicyJson;Write-Host 'Dry run: nothing changed.';exit 0}
$taskIdentity=[Security.Principal.WindowsIdentity]::GetCurrent()
$taskPrincipal=New-Object Security.Principal.WindowsPrincipal($taskIdentity)
if(-not $taskPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Run the installer as administrator once.'}
if(Get-Process -Name firefox -ErrorAction SilentlyContinue){throw 'Close Firefox after finishing calls, then run this installer again. It will not close Firefox for you.'}
# Verify the downloaded artifact against the trusted release manifest. Firefox checks its actual Mozilla signature.
$taskDownload=Join-Path ([IO.Path]::GetTempPath()) ('marsad-'+[guid]::NewGuid().ToString()+'.xpi')
Invoke-WebRequest -Uri $taskRelease.install_url -OutFile $taskDownload -UseBasicParsing -TimeoutSec 60
if((Get-FileHash -LiteralPath $taskDownload -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskRelease.sha256){throw 'Downloaded extension does not match the release checksum; no policy was changed.'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskArchive=[IO.Compression.ZipFile]::OpenRead($taskDownload)
try{
 if(-not $taskArchive.GetEntry('META-INF/mozilla.rsa') -or -not $taskArchive.GetEntry('META-INF/mozilla.sf')){throw 'Missing Mozilla signature files; no policy was changed.'}
 $taskReader=New-Object IO.StreamReader($taskArchive.GetEntry('manifest.json').Open())
 try{$taskManifest=$taskReader.ReadToEnd() | ConvertFrom-Json}finally{$taskReader.Dispose()}
 if($taskManifest.browser_specific_settings.gecko.id -ne $taskAddonId -or $taskManifest.version -ne $taskRelease.version){throw 'The extension identity/version does not match the release.'}
}finally{$taskArchive.Dispose()}
$taskDistribution=Join-Path $taskFirefoxPath 'distribution'
New-Item -ItemType Directory -Path $taskDistribution -Force | Out-Null
if(Test-Path -LiteralPath $taskPolicyPath){Copy-Item -LiteralPath $taskPolicyPath -Destination ($taskPolicyPath+'.marsad-backup-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString())}
$taskPending=Join-Path $taskDistribution ('policies.marsad-'+[guid]::NewGuid().ToString()+'.tmp')
[IO.File]::WriteAllText($taskPending,($taskPolicyJson -join [Environment]::NewLine),(New-Object Text.UTF8Encoding($false)))
Move-Item -LiteralPath $taskPending -Destination $taskPolicyPath -Force
Write-Host 'Setup saved. Open Firefox, then check about:policies and Add-ons. Future signed updates use the same update channel.'

