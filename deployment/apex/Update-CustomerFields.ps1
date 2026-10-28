[CmdletBinding()]
param([string]$MonitorPath, [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
if (-not $MonitorPath) {
 Add-Type -AssemblyName System.Windows.Forms
 $picker = New-Object System.Windows.Forms.OpenFileDialog
 $picker.Title = 'Select the installed Apex marsad_monitor.ps1'
 $picker.Filter = 'Apex monitor (marsad_monitor.ps1)|marsad_monitor.ps1'
 if ($picker.ShowDialog() -ne 'OK') { exit 0 }
 $MonitorPath = $picker.FileName
}
$target = (Resolve-Path -LiteralPath $MonitorPath).Path
if ([IO.Path]::GetFileName($target) -ne 'marsad_monitor.ps1') { throw 'Select marsad_monitor.ps1 in the installed monitor folder.' }
$original = [IO.File]::ReadAllText($target)
if ($original -notmatch 'function\s+CustomerOf\s*\(' -or $original -notmatch 'customer\s*=\s*\$_\.Customer') {
 throw 'This monitor predates customer support. No change made; provide this script to Codex for an exact update.'
}
$pattern = '(?s)(SELECT\s+OrderNo,\s*BranchNo,\s*PosNo,.*?)(\s+FROM\s+Orders_M_Daily\s+WITH\s*\(NOLOCK\))'
$matches = [regex]::Matches($original,$pattern)
if ($matches.Count -ne 1) { throw 'Expected exactly one active-order SELECT. No change made.' }
$columns = @('CustNo','o_Phone','o_CustName','o_PersonName','o_Address','o_BuildingNo','o_FloorNo','o_FlatNo','o_Sign')
$projection = $matches[0].Groups[1].Value
# An alias expression for a name does not expose the original column; CustomerOf supports its NameTxt alias.
$required = @('CustNo','o_Phone','o_Address','o_BuildingNo','o_FloorNo','o_FlatNo','o_Sign')
$missing = @($required | Where-Object { $projection -notmatch ('\b' + $_ + '\b') })
if (-not $missing.Count) { Write-Output 'Already updated: customer columns are present. No file changed.'; exit 0 }
$replacement = $projection.TrimEnd() + ', ' + ($missing -join ', ') + $matches[0].Groups[2].Value
$updated = $original.Substring(0,$matches[0].Index) + $replacement + $original.Substring($matches[0].Index+$matches[0].Length)
$tokens=$null;$parseErrors=$null
[void][Management.Automation.Language.Parser]::ParseInput($updated,[ref]$tokens,[ref]$parseErrors)
if ($parseErrors.Count) { throw 'Updated script failed parsing. No file changed.' }
if ($CheckOnly) { Write-Output ('CHECK PASSED; would add: ' + ($missing -join ', ')); exit 0 }
$backup = $target + '.before-customer-fix-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N') + '.bak'
$temp = $target + '.update-' + [guid]::NewGuid().ToString('N') + '.tmp'
[IO.File]::WriteAllText($temp,$updated,(New-Object Text.UTF8Encoding($true)))
# Atomic replacement preserves an exact backup; credentials and all other files stay in place.
[IO.File]::Replace($temp,$target,$backup)
Write-Output ('Updated active-order customer fields. Backup: ' + $backup)
Write-Output 'The running monitor reloads its changed script automatically. Keep its window/task running.'
