$ErrorActionPreference = 'Stop'
$path = Join-Path $PSScriptRoot 'marsad_monitor.ps1'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
if ($errors.Count) {
  $errors | ForEach-Object { Write-Error $_.Message }
  throw "PowerShell monitor has syntax errors"
}
$readyFunction = $ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'EndOfDayReady'},$true)
if (-not $readyFunction) { throw 'Missing end-of-day readiness function' }
Invoke-Expression $readyFunction.Extent.Text
$day = [datetime]'2026-11-05'
$at = {param($hh,$mm) $day.AddDays(1).AddHours($hh).AddMinutes($mm)}
function Assert($cond,$why) { if (-not $cond) { throw $why } }
Assert (-not (EndOfDayReady $day (& $at 2 14) 0 $day.AddHours(22))) 'Report issued before 02:15'
Assert (-not (EndOfDayReady $day (& $at 2 20) 1 $day.AddHours(22))) 'Report issued with an open delivery'
Assert (-not (EndOfDayReady $day (& $at 2 20) 0 (& $at 2 11))) 'Report issued before 15-minute quiet period'
Assert (EndOfDayReady $day (& $at 2 26) 0 (& $at 2 11)) 'Report not ready after closure and quiet period'
Assert (EndOfDayReady $day (& $at 2 15) 0 $null) 'Empty branch did not finalize'
$code = Get-Content -LiteralPath $path -Raw
foreach($required in @(
  'foreach($del in $dels.Rows)',
  'if ([int](N $del.BranchNo) -ne $bn) { continue }',
  'if (-not (EndOfDayReady $day $now ([int]$summary.open) $lastAction)) { continue }',
  '$key = "dayend:$bn"',
  "Raise `$key 'ordersLate' `$report `$false `$summary.name `$null",
  '$allOrders = [int]$summary.orders + $allCancelled',
  '$late = [int]$summary.delayRateLate',
  '$count = [int]$summary.delayRateCount'
)) {
  if (-not $code.Contains($required)) { throw "End-of-day safeguard missing: $required" }
}
Write-Host 'PASS: parser, 02:15 gate, branch open check, 15-minute quiet period, all cancellations, unique alert key and delay rate'
