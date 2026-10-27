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
