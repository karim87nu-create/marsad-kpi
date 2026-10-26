# مرصد الدهان — شاشات طلبات والموقع على فايرفوكس
# Creates one Firefox profile per Talabat branch account (each keeps its own login), plus one for the website,
# with a desktop shortcut for each. The Marsad extension is installed in every profile by the Firefox policy
# (Install-Marsad.cmd), so each screen shows the desk sign-in. Optionally blocks the two sites in Chrome and Edge
# so they are only used where the sign-in is.
# Run once per PC: right-click Setup-Desks.cmd > Run as administrator (only needed for the Chrome/Edge block).
param([string[]]$Branches = @('التجمع الخامس', 'مدينتي', 'سيتي ستار'))
$ErrorActionPreference = 'Stop'
function Line($t) { Write-Host ''; Write-Host $t }

$firefox = @("$env:ProgramFiles\Mozilla Firefox\firefox.exe", "${env:ProgramFiles(x86)}\Mozilla Firefox\firefox.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $firefox) { Line 'Firefox is not installed in Program Files.'; exit 1 }
if (Get-Process firefox -ErrorAction SilentlyContinue) { Line 'Close Firefox first, then run this again.'; exit 1 }

$profilesIni = Join-Path $env:APPDATA 'Mozilla\Firefox\profiles.ini'
$existing = if (Test-Path $profilesIni) { Get-Content $profilesIni -Encoding UTF8 -Raw } else { '' }
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$screens = @($Branches | ForEach-Object { @{ Profile = "طلبات - $_"; Url = 'https://partner-app.talabat.com/live-orders' } }) + @(@{ Profile = 'الموقع'; Url = 'https://eldahan.com.eg/wp-admin/' })

foreach ($s in $screens) {
  if ($existing -notmatch [regex]::Escape("Name=$($s.Profile)")) {
    & $firefox -CreateProfile $s.Profile | Out-Null
    Start-Sleep -Milliseconds 800
    Line "Profile created: $($s.Profile)"
  } else { Line "Profile already there: $($s.Profile)" }
  $lnk = $shell.CreateShortcut((Join-Path $desktop ($s.Profile + '.lnk')))
  $lnk.TargetPath = $firefox
  $lnk.Arguments = '-P "' + $s.Profile + '" -no-remote ' + $s.Url
  $lnk.IconLocation = "$firefox,0"
  $lnk.Save()
}
Line 'Desktop shortcuts are ready. Open each one once and sign in to that branch account.'

$ans = Read-Host 'Block Talabat Partner Hub and the website admin in Chrome and Edge on this PC? (y/n)'
if ($ans -eq 'y') {
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) { Line 'Needs Run as administrator for the block. Skipped.'; exit 0 }
  foreach ($root in @('HKLM:\SOFTWARE\Policies\Google\Chrome\URLBlocklist', 'HKLM:\SOFTWARE\Policies\Microsoft\Edge\URLBlocklist')) {
    if (-not (Test-Path $root)) { New-Item -Path $root -Force | Out-Null }
    $have = @((Get-ItemProperty $root).PSObject.Properties | Where-Object { $_.Name -match '^\d+$' } | ForEach-Object { $_.Value })
    $n = @((Get-ItemProperty $root).PSObject.Properties | Where-Object { $_.Name -match '^\d+$' } | ForEach-Object { [int]$_.Name }) + 0 | Measure-Object -Maximum
    $next = [int]$n.Maximum + 1
    foreach ($u in @('partner-app.talabat.com', 'eldahan.com.eg/wp-admin')) {
      if ($have -notcontains $u) { New-ItemProperty -Path $root -Name ([string]$next) -Value $u -PropertyType String -Force | Out-Null; $next++ }
    }
  }
  Line 'Blocked in Chrome and Edge (restart them). To undo: Undo-DesksBlock.cmd'
}
