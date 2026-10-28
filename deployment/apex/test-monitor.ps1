$ErrorActionPreference = 'Stop'
$file = Join-Path $PSScriptRoot 'marsad_monitor.ps1'
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'PowerShell parse failed' }
# Load only these pure functions. Never execute setup, credential loading, SQL, network, or the main loop.
foreach($name in @('S','FirstText','CustomerOf')) {
  $fn = $ast.Find({ param($a) $a -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $a.Name -eq $name }, $true)
  if (-not $fn) { throw "Missing $name" }
  Invoke-Expression $fn.Extent.Text
}
$dt = New-Object System.Data.DataTable
foreach($c in @('CustNo','o_CustName','o_PersonName','NameTxt','o_Phone','o_Mobile','MobileNo','o_Address','o_BuildingNo','o_FloorNo','o_FlatNo','o_Sign')){ [void]$dt.Columns.Add($c,[string]) }
$r=$dt.NewRow();$r.CustNo='12345';$r.NameTxt='Test Customer';$r.o_Phone='01012345678';$r.MobileNo='01112345678';$r.o_Address='Test Street';$r.o_BuildingNo='20';$r.o_FlatNo='3';$dt.Rows.Add($r)
$c=CustomerOf $r
if ($c.name -ne 'Test Customer' -or $c.phone -ne '01012345678' -or $c.mobile -ne '01112345678' -or $c.accountNo -ne '12345' -or $c.address -ne 'Test Street 20 3') { throw 'Customer mapping failed' }
$r.o_CustName='Primary Name';if ((CustomerOf $r).name -ne 'Primary Name') { throw 'Name precedence failed' }
$r.o_Phone=[DBNull]::Value;if ((CustomerOf $r).phone -ne '') { throw 'Account ID must never become a phone' }
$source = [IO.File]::ReadAllText($file)
if ($source -notmatch 'customer = \$_\.Customer; tag = \$tags' -or $source -notmatch 'customer = \$_\.Customer; tag = \$dtags') { throw 'Customer missing from online or cancelled payload' }
Write-Output 'PASS: parser, name/phone/address mapping, account separation, online and cancelled payloads; no Apex connection or writes.'

# Isolated durable queue fault tests: only named functions are loaded; HTTP is mocked.
foreach ($name in @('ReadOutbox','SaveOutbox','Raise','Push')) {
  $fn = $ast.Find({ param($a) $a -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $a.Name -eq $name }, $true)
  Invoke-Expression $fn.Extent.Text
}
$fixtureDir = Join-Path ([IO.Path]::GetTempPath()) ('marsad-outbox-test-' + [guid]::NewGuid())
[void][IO.Directory]::CreateDirectory($fixtureDir)
$outboxFile = Join-Path $fixtureDir 'alerts-outbox.json'
$stateFile = Join-Path $fixtureDir 'alerted.txt'
$script:stateDay = '2026-10-22'
$pending = New-Object System.Collections.ArrayList
$alerted = New-Object 'System.Collections.Generic.HashSet[string]'
$OrdersKey = 'synthetic-test-token'; $ServerUrl = 'http://mock.invalid'; $script:pushFails = 0
function L($text) {}
$script:mockMode = 'failure'
function Invoke-RestMethod {
  param($Method,$Uri,$Headers,$Body,$ContentType,$TimeoutSec)
  if ($script:mockMode -eq 'failure') { throw 'simulated lost response' }
  if ($script:mockMode -eq 'ignored') { return @{ok=$true;ignored='older_snapshot'} }
  return @{ok=$true;follow=1;acknowledgedAlerts=@('pay:1')}
}
Raise 'pay:1' 'ordersEntry' 'synthetic alert' $false 'fixture' '' 'active'
$saved = @(ReadOutbox)
if ($saved.Count -ne 1 -or $saved[0].day -ne $script:stateDay) { throw 'Queue not durable before seen marker' }
# Restart reads the disk queue even if the legacy marker already exists.
$pending.Clear(); foreach ($entry in (ReadOutbox)) { [void]$pending.Add($entry) }
$payload = [ordered]@{day=$script:stateDay;alerts=@($pending)}
Push $payload
if ($pending.Count -ne 1) { throw 'Network failure discarded pending alert' }
$script:mockMode = 'ignored'; Push $payload
if ($pending.Count -ne 1) { throw 'Ignored snapshot discarded pending alert' }
$script:mockMode = 'ack'; Push $payload
if ($pending.Count -ne 0 -or @(ReadOutbox).Count -ne 0) { throw 'Acknowledgement did not retire persisted queue' }
Write-Output 'PASS: durable queue, restart, failed/lost response, ignored snapshot, explicit acknowledgement; HTTP mocked.'

# Check the actual active-order SELECT, not just a synthetic CustomerOf row.
$onlineSql = [regex]::Match($source, '(?s)SELECT OrderNo, BranchNo, PosNo,.*?FROM Orders_M_Daily WITH').Value
foreach($column in @('CustNo','o_Phone','o_CustName','o_Address','o_BuildingNo','o_FloorNo','o_FlatNo','o_Sign')) {
 if ($onlineSql -notmatch ('\b' + $column + '\b')) { throw "Active-order query omits customer field $column" }
}
Write-Output 'PASS: active-order SQL projection includes customer fields.'
