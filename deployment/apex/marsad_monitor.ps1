$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$self = $MyInvocation.MyCommand.Path
$selfStamp = (Get-Item $self).LastWriteTimeUtc
Set-Location $here

# ===== settings =====
$PollSeconds     = 15
$LateMinutes     = 30
$VeryLateMinutes = 45
$DiscPctPlatform = 35
$DiscPctHotline  = 20
$DupWindowMin    = 3
$DayStartHour    = 9
$ServerUrl       = 'https://marsad-v2.karim87nu.chatgpt.site'
# The order serial the staff see on the screen/receipt (an Orders_M_Daily column name). Empty = not sent yet.
$SerialCol       = 'ShiftSerial'

$logFile = Join-Path $here 'monitor_log.txt'
function L($m){
  try {
    if ((Test-Path $logFile) -and (Get-Item $logFile).Length -gt 5MB) { Move-Item $logFile ($logFile + '.old') -Force }
    Add-Content $logFile ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $m) -Encoding UTF8
  } catch {}
}

# ===== one copy only (the watchdog task starts this every few minutes) =====
$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\MarsadOrdersMonitor', [ref]$created)
if (-not $created) { exit 0 }

# ===== keys saved by setup (encrypted for this Windows user) =====
function ReadSecret($file){
  if (-not (Test-Path $file)) { return $null }
  return ((Get-Content $file -Raw).Trim() | ConvertTo-SecureString)
}
function Plain($sec){ return [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)) }
$sqlSec = ReadSecret (Join-Path $here 'cred.dat')
$keySec = ReadSecret (Join-Path $here 'orders_key.dat')
if (-not $sqlSec) { L 'FATAL: cred.dat missing - run setup'; exit 1 }
$sqlSec.MakeReadOnly()
$sqlCred = New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $sqlSec)
$OrdersKey = $null; if ($keySec) { $OrdersKey = Plain $keySec }
if (-not $OrdersKey) { L 'warning: orders_key.dat missing - nothing will be sent to the server' }

# ===== DB (SELECT only) =====
$servers = @('196.218.94.154','192.168.1.15')
$script:conn = $null
function Connect-Db {
  foreach($s in $servers){
    try {
      $c = New-Object System.Data.SqlClient.SqlConnection("Server=$s;Database=Resturant;Application Name=MarsadOrders-RO;Connect Timeout=10", $sqlCred)
      $c.Open(); $script:conn = $c; L "connected to $s"; return $true
    } catch { L "connect $s failed: $($_.Exception.Message)" }
  }
  return $false
}
$deny = '\b(insert|update|delete|drop|alter|create|truncate|merge|exec|execute|grant|revoke|deny|backup|restore|dbcc|into)\b'
function Q([string]$q, $params){
  if ($q -notmatch '^\s*(select|with)\b' -or $q -match $deny) { throw 'blocked non-select query' }
  if ($script:conn -eq $null -or $script:conn.State -ne 'Open') { if (-not (Connect-Db)) { throw 'no db connection' } }
  $c = $script:conn.CreateCommand(); $c.CommandTimeout = 60
  $c.CommandText = 'SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED; ' + $q
  if ($params) { foreach($k in $params.Keys){ [void]$c.Parameters.AddWithValue($k, $params[$k]) } }
  $da = New-Object System.Data.SqlClient.SqlDataAdapter($c); $dt = New-Object System.Data.DataTable
  [void]$da.Fill($dt); return ,$dt
}

# ===== helpers =====
$inv = [Globalization.CultureInfo]::InvariantCulture
function S($v){ if ($v -is [DBNull] -or $v -eq $null) { return '' } return ("$v").Trim() }
function N($v){ if ($v -is [DBNull] -or $v -eq $null -or "$v".Trim() -eq '') { return 0 } return [double]$v }
function ParseT($t, [datetime]$day){
  $t = S $t
  if (-not $t) { return $null }
  $t = $t.Replace([string][char]0x0635,'AM').Replace([string][char]0x0645,'PM')
  $d = [datetime]::MinValue
  if (-not [datetime]::TryParseExact($t, 'hh:mm:ss tt', $inv, 'AllowWhiteSpaces', [ref]$d)) { return $null }
  $r = $day.Date.Add($d.TimeOfDay)
  if ($d.Hour -lt $DayStartHour) { $r = $r.AddDays(1) }
  return $r
}
function Mins($a, $b){ if ($a -eq $null -or $b -eq $null) { return $null } return [math]::Round(($b - $a).TotalMinutes, 0) }
function IsoT($d){ if ($d -eq $null) { return $null } return ([DateTimeOffset][datetime]$d).ToString('yyyy-MM-ddTHH:mm:sszzz', $inv) }
function R2($v){ if ($v -eq $null) { return 0 } return [math]::Round([double]$v, 2) }
# Order amount as the customer pays it: after discount, with tax, service (delivery) and additions.
function AmtOf($r){ return (N $r.SubTotal) - (N $r.Discount) + (N $r.Tax) + (N $r.Service) + (N $r.Addition) }
function SnOf($v){ $t = S $v; if (-not $t) { return $null } if ($t -match '^\d+(\.0+)?$') { return [int64][double]$t } return $t }
# Read only fields present in the documented schema. CustNo is an Apex account ID, NOT a phone.
function FirstText($r, [string[]]$columns){
  foreach($cn in $columns){ if ($r.Table.Columns.Contains($cn)) { $v = S $r[$cn]; if ($v) { return $v } } }
  return ''
}
function CustomerOf($r){
  $address = @(); foreach($cn in @('o_Address','o_BuildingNo','o_FloorNo','o_FlatNo','o_Sign')){
    $v = FirstText $r @($cn); if ($v) { $address += $v }
  }
  return [ordered]@{
    accountNo = FirstText $r @('CustNo')
    name = FirstText $r @('o_CustName','o_PersonName','PersonName','NameTxt','NameTxt2','NameTxt3')
    phone = FirstText $r @('o_Phone')
    mobile = FirstText $r @('o_Mobile','MobileNo')
    address = (($address -join ' ').Trim())
  }
}
# An order for a set time: the time written next to the customer's name ("9:30", "9.30 م", "9 م", "الساعة 9", "ميعاد 9").
# Customer fields are sent only with online orders for reconciliation; never put in alerts. Returns the appointment as a datetime, or $null.
function ScheduleOf([string]$txt, $entry){
  if (-not $txt -or $entry -eq $null) { return $null }
  $t = $txt; for($i=0; $i -lt 10; $i++){ $t = $t.Replace([string][char](0x0660 + $i), "$i").Replace([string][char](0x06F0 + $i), "$i") }
  $t = [regex]::Replace($t, '#\s*\d+', ' ')
  $ar = '(?![\u0621-\u064A])'
  $m = [regex]::Match($t, '(?<![\d])(\d{1,2})\s*[:.]\s*(\d{2})(?!\d)\s*(ص|م|am|pm)?' + $ar, 'IgnoreCase')
  if (-not $m.Success) { $m = [regex]::Match($t, '(?:الساعة|الساعه|ساعة|ساعه|الميعاد|ميعاد|معاد)\s*(\d{1,2})(?:\s*[:.]\s*(\d{2}))?\s*(ص|م|am|pm)?' + $ar, 'IgnoreCase') }
  if (-not $m.Success) { $m = [regex]::Match($t, '(?<![\d:.])(\d{1,2})()\s*(ص|م|am|pm)' + $ar, 'IgnoreCase') }
  if (-not $m.Success) { return $null }
  $script:SchedHit = $m.Value.Trim()   # only digits and ص/م/«الساعة»/«ميعاد»: never the name
  $h = [int]$m.Groups[1].Value; $mi = $(if ($m.Groups[2].Value) { [int]$m.Groups[2].Value } else { 0 }); $ap = $m.Groups[3].Value.ToLower()
  if ($h -gt 23 -or $mi -gt 59) { return $null }
  $hours = @($h)
  if ($ap -in @('ص','am')) { if ($h -gt 12) { return $null }; $hours = @($h % 12) }
  elseif ($ap -in @('م','pm')) { if ($h -gt 12) { return $null }; $h0 = $h % 12; $hours = @($h0 + 12) }
  elseif ($h -le 12) { $h0 = $h % 12; $hours = @($h0, ($h0 + 12)) }
  $best = $null
  foreach($d in @(0, 1)){ foreach($hh in $hours){
    $c = $entry.Date.AddDays($d).AddHours($hh).AddMinutes($mi)
    if ($c -ge $entry.AddMinutes(-10) -and ($best -eq $null -or $c -lt $best)) { $best = $c } } }
  if ($best -eq $null -or ($best - $entry).TotalHours -gt 18) { return $null }
  return $best
}
# The order's comment for the branch: long digit runs (phone numbers) are removed, kept short.
function CleanNote([string]$t){
  if (-not $t) { return '' }
  $t = [regex]::Replace($t, '\d[\d\s-]{6,}\d', '…').Trim()
  if ($t.Length -gt 150) { $t = $t.Substring(0, 150) + '…' }
  return $t
}
# The Talabat code the employee writes on Apex: «#8403» anywhere, or the bare number next to the customer's name
# («8403», sometimes cut to «843»). Only the digits leave this PC, never the name; phone numbers are skipped.
function TagOf($r){
  foreach($c in $r.Table.Columns){
    if ($c.DataType -ne [string] -or $c.ColumnName -match '(?i)phone|mobile|tel') { continue }
    $m = [regex]::Match((S $r[$c.ColumnName]), '#\s*(\d{3,12})'); if ($m.Success) { return $m.Groups[1].Value }
  }
  foreach($cn in @('o_CustName', 'o_PersonName', 'PersonName')){
    if (-not $r.Table.Columns.Contains($cn)) { continue }
    foreach($m in [regex]::Matches((S $r[$cn]), '(?<!\d)(\d{3,12})(?!\d)')){ if ($m.Value -notmatch '^0?1[0125]\d{8}$') { return $m.Value } }
  }
  return $null
}
# A comment worth sending: not only a #code or numbers.
function NoteWorth([string]$n){ return [bool]($n -and ([regex]::Replace($n, '#\s*\d+|[\d\s\p{P}…]', '')).Length -ge 3) }
# Our naming: anything without an online mark is a Hotline order.
function KindOf([string]$online){
  if ($online -match '(?i)talabat|talbat') { return 'طلبات' }
  if ($online -match 'موقعنا') { return 'الموقع' }
  if ($online -match '(?i)waffarha') { return 'وفرها' }
  if ($online -match '(?i)elmenus') { return 'المنيوز' }
  if ($online) { return $online }
  return 'Hotline'
}
# A clock time the way people read it: 08:30 م
function Tm($d){ if ($d -eq $null) { return '' } return $d.ToString('hh:mm', [Globalization.CultureInfo]::InvariantCulture) + ' ' + $(if ($d.Hour -lt 12) { 'ص' } else { 'م' }) }
function KindAr($k){ if ($k -eq 'Hotline') { return 'هوتلاين' } return $k }
$KINDS = @('Hotline','طلبات','الموقع','وفرها','المنيوز')
function NewCounts(){ $h = [ordered]@{}; foreach($k in $KINDS){ $h[$k] = 0 }; return $h }
function Bump($h, $k){ if (-not $h.Contains($k)) { $h[$k] = 0 }; $h[$k]++ }
function AvgOf($items, $prop){ $a = @($items); if (-not $a.Count) { return $null } return R2 (($a | Measure-Object $prop -Average).Average) }
function SumOf($items, $prop){ $a = @($items); if (-not $a.Count) { return 0 } return R2 (($a | Measure-Object $prop -Sum).Sum) }

# ===== reference data =====
while (-not (Connect-Db)) { Start-Sleep 30 }
$script:Users = @{}; $script:Branches = @{}
function LoadRefs {
  $u = @{}; foreach($r in (Q 'SELECT UserNo, UserName FROM Users').Rows){ $u[[int](N $r.UserNo)] = S $r.UserName }
  $b = @{}; foreach($r in (Q 'SELECT BranchNo, BranchName FROM Branches').Rows){ $b[[int](N $r.BranchNo)] = S $r.BranchName }
  $script:Users = $u; $script:Branches = $b
  $rs = @{}
  try {
    foreach($t in (Q "SELECT c.TABLE_NAME, MAX(CASE WHEN c.DATA_TYPE IN ('varchar','nvarchar','char','nchar') AND c.COLUMN_NAME LIKE '%Name%' THEN c.COLUMN_NAME END) AS txt FROM INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_NAME IN (SELECT TABLE_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME = 'ReasonNo') AND c.TABLE_NAME NOT LIKE '%Order%' AND c.TABLE_NAME NOT LIKE '%Message%' AND c.TABLE_NAME NOT LIKE '%Compl%' GROUP BY c.TABLE_NAME HAVING COUNT(*) <= 6 ORDER BY CASE WHEN c.TABLE_NAME = 'Reasons' THEN 0 ELSE 1 END").Rows){
      if (-not (S $t.txt)) { continue }
      foreach($x in (Q "SELECT TOP 200 ReasonNo, [$(S $t.txt)] AS nm FROM [$(S $t.TABLE_NAME)]").Rows){ $k = [int](N $x.ReasonNo); if ($k -gt 0 -and -not $rs.ContainsKey($k) -and (S $x.nm)) { $rs[$k] = S $x.nm } }
      L "reasons: $(S $t.TABLE_NAME).$(S $t.txt) = $($rs.Count)"
    }
  } catch { L "reasons: $($_.Exception.Message)" }
  $script:Reasons = $rs
  # Delivery areas (the order's location number → its name), from whichever Apex table holds them.
  $ls = @{}
  try {
    foreach($t in (Q "SELECT c.TABLE_NAME, MAX(CASE WHEN c.DATA_TYPE IN ('varchar','nvarchar','char','nchar') AND c.COLUMN_NAME LIKE '%Name%' THEN c.COLUMN_NAME END) AS txt FROM INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_NAME IN (SELECT TABLE_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME = 'LocationNo') AND c.TABLE_NAME NOT LIKE '%Order%' AND c.TABLE_NAME NOT LIKE '%Cust%' GROUP BY c.TABLE_NAME HAVING COUNT(*) <= 8 ORDER BY CASE WHEN c.TABLE_NAME LIKE 'Location%' THEN 0 ELSE 1 END").Rows){
      if (-not (S $t.txt)) { continue }
      foreach($x in (Q "SELECT TOP 2000 LocationNo, [$(S $t.txt)] AS nm FROM [$(S $t.TABLE_NAME)]").Rows){ $k = [int](N $x.LocationNo); if ($k -gt 0 -and -not $ls.ContainsKey($k) -and (S $x.nm)) { $ls[$k] = S $x.nm } }
      L "locations: $(S $t.TABLE_NAME).$(S $t.txt) = $($ls.Count)"
      if ($ls.Count) { break }
    }
  } catch { L "locations: $($_.Exception.Message)" }
  $script:Locations = $ls
}
LoadRefs
if ($SerialCol -and $SerialCol -notmatch '^\w+$') { L "bad SerialCol '$SerialCol' - ignored"; $SerialCol = '' }
$script:SerialDel = $false
if ($SerialCol) { try { $script:SerialDel = [int](Q "SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'DOrders_M' AND COLUMN_NAME = @c" @{ '@c' = $SerialCol }).Rows[0].n -gt 0 } catch {} ; L "serial column: $SerialCol (cancels: $($script:SerialDel))" }
# ===== where Apex keeps order items (looked up once per start, read-only; only table and column names are written) =====
try {
  $cols = Q "SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME IN (SELECT TABLE_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME IN ('OrderNo','ItemNo','ItemCode')) ORDER BY TABLE_NAME, ORDINAL_POSITION"
  $lines = @($cols.Rows | Group-Object TABLE_NAME | ForEach-Object { $_.Name + ': ' + (($_.Group | ForEach-Object { $_.COLUMN_NAME + '(' + $_.DATA_TYPE + ')' }) -join ', ') })
  Set-Content (Join-Path $here 'schema_log.txt') ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + "`r`n" + ($lines -join "`r`n")) -Encoding UTF8
} catch { L "schema scan: $($_.Exception.Message)" }
# ===== probe (once per start, read-only, no customer columns): are platform order numbers and item names in Apex? =====
try {
  $out = New-Object System.Collections.ArrayList
  $day0 = [datetime](Q 'SELECT MAX(OrderDate) AS d FROM Orders_M_Daily').Rows[0].d
  $pp = @{ '@d' = $day0 }
  $r = (Q "SELECT COUNT(*) AS n, SUM(CASE WHEN ISNULL(Otlob_OrderNo,'') <> '' THEN 1 ELSE 0 END) AS otlob, SUM(CASE WHEN ISNULL(OnlineOrderId,0) <> 0 THEN 1 ELSE 0 END) AS onl, SUM(CASE WHEN ISNULL(PrepareTime,'') <> '' THEN 1 ELSE 0 END) AS prep, SUM(CASE WHEN ISNULL(PickupTime,'') <> '' THEN 1 ELSE 0 END) AS pick, SUM(CASE WHEN ISNULL(ReceiveTime,'') <> '' THEN 1 ELSE 0 END) AS recv FROM Orders_M_Daily WHERE OrderDate = @d" $pp).Rows[0]
  [void]$out.Add("Orders_M_Daily $($day0.ToString('yyyy-MM-dd')): rows=$($r.n) Otlob_OrderNo=$($r.otlob) OnlineOrderId=$($r.onl) PrepareTime=$($r.prep) PickupTime=$($r.pick) ReceiveTime=$($r.recv)")
  foreach($x in (Q "SELECT TOP 8 OrderNo, OnlineType, Otlob_OrderNo, OnlineOrderId, ReceiveTime, PrepareTime, PickupTime, Pickup, Prepared, StateUser, Accepted FROM Orders_M_Daily WHERE OrderDate = @d AND ISNULL(OnlineType,'') <> '' ORDER BY OrderNo DESC" $pp).Rows){
    [void]$out.Add("  online: no=$($x.OrderNo) type=$(S $x.OnlineType) otlob=$(S $x.Otlob_OrderNo) onlineId=$(S $x.OnlineOrderId) recv=$(S $x.ReceiveTime) prep=$(S $x.PrepareTime) pick=$(S $x.PickupTime) pickup=$(S $x.Pickup) prepared=$(S $x.Prepared) stateUser=$(S $x.StateUser) accepted=$(S $x.Accepted)") }
  foreach($t in @('TalabatOrders_M','OnlineOrders_M')){
    $idc = if ($t -eq 'TalabatOrders_M') { 'TalabatOrderId' } else { 'OnlineOrderId' }
    $c = (Q "SELECT COUNT(*) AS n, MAX(OrderDate) AS last FROM $t").Rows[0]
    [void]$out.Add("${t}: rows=$($c.n) last=$(S $c.last)")
    foreach($x in (Q "SELECT TOP 5 OrderNo, OrderDate, $idc AS pid, DisplayId, StoreId, BranchNo, SubTotal FROM $t ORDER BY OrderDate DESC, OrderNo DESC").Rows){ [void]$out.Add("  $t no=$($x.OrderNo) date=$(S $x.OrderDate) id=$(S $x.pid) display=$(S $x.DisplayId) store=$(S $x.StoreId) branch=$($x.BranchNo) sub=$($x.SubTotal)") }
  }
  foreach($x in (Q "SELECT TOP 15 d.ItemNo, d.Qty, d.Price, d.Description, i.ItemName, i.Description AS IDesc, i.DisplayDescription, i.KeyDescription FROM Orders_D_daily d JOIN Orders_M_Daily m ON m.OrderNo = d.OrderNo LEFT JOIN Items i ON i.ItemNo = d.ItemNo WHERE m.OrderDate = @d AND ISNULL(m.OnlineType,'') <> '' ORDER BY d.OrderNo DESC" $pp).Rows){
    [void]$out.Add("  item: no=$(S $x.ItemNo) qty=$($x.Qty) price=$($x.Price) desc=$(S $x.Description) name=$(S $x.ItemName) idesc=$(S $x.IDesc) display=$(S $x.DisplayDescription) key=$(S $x.KeyDescription)") }
  # The menu as sold online yesterday (item names and prices, for the Talabat ↔ Apex item names).
  foreach($x in (Q "SELECT d.ItemNo, MAX(i.ItemName) AS name, COUNT(*) AS n, AVG(d.Price) AS price FROM Orders_D_daily d JOIN Orders_M_Daily m ON m.OrderNo = d.OrderNo LEFT JOIN Items i ON i.ItemNo = d.ItemNo WHERE m.OrderDate = @d AND ISNULL(m.OnlineType,'') <> '' GROUP BY d.ItemNo ORDER BY COUNT(*) DESC" $pp).Rows){
    [void]$out.Add("  menu: no=$(S $x.ItemNo) n=$($x.n) price=$([math]::Round([double]$x.price,2)) name=$(S $x.name)") }
  # The last 25 orders with their number columns and money columns (no customer columns), to find the serial the staff see
  # and to check that the amount = SubTotal - Discount + Tax + Service + Addition equals CashPayment + VisaPayment.
  [void]$out.Add('--- last 25 orders: OrderNo | ShiftSerial | TypeSerial | SNo | RecieveNo | SerialNo | BranchOrderNo | BranchShiftSerial | PosSerial | CallCenterNo | TaxInvoiceNo | Trans_Serial | OrderNo_Int | CheckNo | BranchNo | TimeIn | SubTotal | Tax | Service | Discount | Addition | CashPayment | VisaPayment || amount | cash+visa | diff')
  $nOk = 0; $nBad = 0
  foreach($x in (Q "SELECT TOP 25 OrderNo, ShiftSerial, TypeSerial, SNo, RecieveNo, SerialNo, BranchOrderNo, BranchShiftSerial, PosSerial, CallCenterNo, TaxInvoiceNo, Trans_Serial, OrderNo_Int, CheckNo, BranchNo, TimeIn, SubTotal, Tax, Service, Discount, Addition, CashPayment, VisaPayment FROM Orders_M_Daily WITH (NOLOCK) WHERE OrderDate = @d ORDER BY OrderNo DESC" $pp).Rows){
    $amt = R2 (AmtOf $x); $paid = R2 ((N $x.CashPayment) + (N $x.VisaPayment)); $diff = R2 ($amt - $paid)
    if ([math]::Abs($diff) -lt 0.05) { $nOk++ } else { $nBad++ }
    $vals = foreach($cn in @('OrderNo','ShiftSerial','TypeSerial','SNo','RecieveNo','SerialNo','BranchOrderNo','BranchShiftSerial','PosSerial','CallCenterNo','TaxInvoiceNo','Trans_Serial','OrderNo_Int','CheckNo','BranchNo','TimeIn')) { S $x[$cn] }
    $money = foreach($cn in @('SubTotal','Tax','Service','Discount','Addition','CashPayment','VisaPayment')) { R2 (N $x[$cn]) }
    [void]$out.Add('  ' + (($vals + $money) -join ' | ') + " || $amt | $paid | $diff") }
  [void]$out.Add("--- amount = cash+visa: $nOk ok, $nBad different")
  # Talabat orders: where the Talabat code is written (only the numbers in each text column; names are never written).
  [void]$out.Add('--- talabat orders: no | sn | TimeIn | branch | sub | numbers per text column')
  $tq = Q "SELECT TOP 40 * FROM Orders_M_Daily WITH (NOLOCK) WHERE OrderDate = @d AND (OnlineType LIKE '%talabat%' OR OnlineType LIKE '%talbat%' OR OnlineType LIKE N'%موقع%') ORDER BY CASE WHEN OnlineType LIKE N'%موقع%' THEN 0 ELSE 1 END, OrderNo DESC" $pp
  foreach($x in $tq.Rows){
    $nums = @(); foreach($c in $tq.Columns){ if ($c.DataType -ne [string] -or $c.ColumnName -match '(?i)phone|mobile|tel|address|flat|floor|building|sign') { continue }; $v = S $x[$c.ColumnName]; $ds = @([regex]::Matches($v, '\d{3,12}') | ForEach-Object { $_.Value } | Where-Object { $_ -notmatch '^0?1[0125]\d{8}$' }); if ($ds.Count) { $nums += ($c.ColumnName + '=' + ($ds -join ',')) } }
    [void]$out.Add("  $(S $x.OrderNo) | $(S $x.ShiftSerial) | $(S $x.TimeIn) | $(S $x.BranchNo) | $(S $x.SubTotal) | $(KindOf (S $x.OnlineType)) | " + ($nums -join ' ; ')) }
  Add-Content (Join-Path $here 'schema_log.txt') ("`r`n=== probe ===`r`n" + ($out -join "`r`n")) -Encoding UTF8
} catch { L "probe: $($_.Exception.Message)" }
function UName($n){ $k=[int](N $n); if ($script:Users.ContainsKey($k)) { return $script:Users[$k] } if ($k -eq 0) { return '' } return "#$k" }
function BName($n){ $k=[int](N $n); if ($script:Branches.ContainsKey($k)) { return $script:Branches[$k] } return "فرع $k" }

# ===== alert state (survives restarts) =====
$stateFile = Join-Path $here 'alerted.txt'
$alerted = New-Object 'System.Collections.Generic.HashSet[string]'
$stateDay = ''
$script:firstCycle = -not (Test-Path $stateFile)
if (Test-Path $stateFile) {
  $lines = @(Get-Content $stateFile -Encoding UTF8)
  if ($lines.Count -gt 0) { $stateDay = $lines[0]; foreach($x in ($lines | Select-Object -Skip 1)){ [void]$alerted.Add($x) } }
}
$pending = New-Object System.Collections.ArrayList
$outboxFile = Join-Path $here 'alerts-outbox.json'
function ReadOutbox {
  if (-not (Test-Path $outboxFile)) { return @() }
  $wire = Get-Content $outboxFile -Raw -Encoding UTF8
  if ($wire.Trim() -eq '[]') { return @() }
  return @(ConvertFrom-Json $wire)
}
if (Test-Path $outboxFile) {
  # A corrupt or unreadable queue must stop startup, never silently discard unacknowledged alerts.
  foreach ($entry in (ReadOutbox)) { if ($entry) { [void]$pending.Add($entry) } }
}
function SaveOutbox {
  $tmp = $outboxFile + '.tmp'
  [IO.File]::WriteAllText($tmp, (ConvertTo-Json -InputObject @($pending) -Depth 8 -Compress), [Text.UTF8Encoding]::new($false))
  if (Test-Path $outboxFile) { [IO.File]::Replace($tmp, $outboxFile, [System.Management.Automation.Language.NullString]::Value) } else { [IO.File]::Move($tmp, $outboxFile) }
}
function Raise($key, $kind, $text, [bool]$silent, $branch, $sn, $status){
  if ($alerted.Contains($key)) { return }
  if (-not $silent -and -not @($pending | Where-Object { $_.key -eq $key -and $_.day -eq $script:stateDay }).Count) {
    [void]$pending.Add([ordered]@{ day = $script:stateDay; key = $key; kind = $kind; text = $text; branch = $branch; sn = $sn; status = $(if ($status) { $status } else { 'active' }) })
    # Persist before the legacy seen marker. A crash between writes reuses the same queue key.
  }
  if (-not $silent) { SaveOutbox }
  [void]$alerted.Add($key)
  Add-Content $stateFile $key -Encoding UTF8
}

$script:pushFails = 0
$script:OfficerValues = @()
$script:ServerFollow = $false   # the server answers follow-ups (status changes, reminders) only once updated
function Push($payload){
  if (-not $OrdersKey) { return }
  $json = $payload | ConvertTo-Json -Depth 8 -Compress
  try {
    try {
      $resp = Invoke-RestMethod -Method Post -Uri "$ServerUrl/api/orders/push" -Headers @{ 'x-orders-token' = $OrdersKey } -Body ([Text.Encoding]::UTF8.GetBytes($json)) -ContentType 'application/json; charset=utf-8' -TimeoutSec 20
    } catch {
      # Server error: try once more at once with a lighter day (online orders without their item lines), and say so in the log.
      if ("$($_.Exception.Message)" -notmatch '\(500\)' -or -not $payload.online) { throw }
      $light = [ordered]@{}; foreach($k in $payload.Keys){ $light[$k] = $payload[$k] }
      $light.online = @($payload.online | ForEach-Object { $x = [ordered]@{}; foreach($k in $_.Keys){ if ($k -ne 'items') { $x[$k] = $_[$k] } }; $x })
      $json2 = $light | ConvertTo-Json -Depth 8 -Compress
      $resp = Invoke-RestMethod -Method Post -Uri "$ServerUrl/api/orders/push" -Headers @{ 'x-orders-token' = $OrdersKey } -Body ([Text.Encoding]::UTF8.GetBytes($json2)) -ContentType 'application/json; charset=utf-8' -TimeoutSec 20
      if (-not $script:lightLogged) { L "push ok only without online item lines (full $([Text.Encoding]::UTF8.GetByteCount($json)) bytes, light $([Text.Encoding]::UTF8.GetByteCount($json2)) bytes)"; $script:lightLogged = $true }
    }
    # Values the admin marked as officer (not sales) come back with every push.
    $script:ServerFollow = [bool]($resp -and $resp.follow)
    if ($resp -and $resp.officer) { $script:OfficerValues = @($resp.officer | ForEach-Object { "$_".Trim() }) }
    if (-not $resp.ok -or $resp.ignored) { throw 'Snapshot was not accepted; pending alerts retained' }
    # New server explicitly acknowledges persisted alerts. Older servers cannot retire this queue.
    foreach ($key in @($resp.acknowledgedAlerts)) {
      for ($i = $pending.Count - 1; $i -ge 0; $i--) { if ($pending[$i].day -eq $payload.day -and $pending[$i].key -eq $key) { $pending.RemoveAt($i) } }
    }
    SaveOutbox
    if ($script:pushFails -gt 0) { L "push ok again after $($script:pushFails) failures" }
    $script:pushFails = 0
  } catch {
    $script:pushFails++
    $body = ''; try { if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $body = $_.ErrorDetails.Message } } catch {}
    if (-not $body) { try { $rs = $_.Exception.Response.GetResponseStream(); $body = (New-Object IO.StreamReader($rs, [Text.Encoding]::UTF8)).ReadToEnd(); } catch {} }
    if ($body.Length -gt 300) { $body = $body.Substring(0, 300) }
    # Do not persist the customer payload in failed-push diagnostics.
    if ($script:pushFails -le 3 -or $script:pushFails % 40 -eq 0) { L "push failed ($($script:pushFails)): $($_.Exception.Message) $body" }
    # No size-based eviction: failed deliveries remain durable until acknowledged.
  }
}

# ===== one reading of Apex -> one summary =====
function Cycle {
  $now = [datetime](Q 'SELECT GETDATE() AS n').Rows[0].n
  $dayRow = (Q 'SELECT MAX(OrderDate) AS d FROM Orders_M_Daily').Rows[0].d
  if ($dayRow -is [DBNull]) { return $null }
  $day = [datetime]$dayRow
  $dayKey = $day.ToString('yyyy-MM-dd')
  if ($script:stateDay -ne $dayKey) {
    $alerted.Clear(); $script:stateDay = $dayKey
    Set-Content $stateFile $dayKey -Encoding UTF8
  }
  $p = @{ '@d' = $day }
  $selSn = $(if ($SerialCol) { ", [$SerialCol] AS SnX" } else { '' })
  $delSn = $(if ($SerialCol -and $script:SerialDel) { ", [$SerialCol] AS SnX" } else { '' })
  $orders = Q @"
SELECT OrderNo, BranchNo, PosNo, UserNo, TransType, PayWay, OnlineType, TimeIn, SendDate, OrderTime, ReturnTime,
       WaiterNo, SubTotal, Discount, Tax, Service, Addition$selSn,
       o_LocationNo, Remarks,
       ISNULL(o_CustName,'') AS NameTxt, ISNULL(o_PersonName,'') AS NameTxt2, ISNULL(PersonName,'') AS NameTxt3
FROM Orders_M_Daily WITH (NOLOCK) WHERE OrderDate = @d
"@ $p
  $dels = Q @"
SELECT OrderNo, BranchNo, UserNo, DelUserNo, WaiterNo, TransType, OnlineType, TimeIn, OrderTime, DeleteTime, SubTotal, Discount, Tax, Service, Addition, Remarks, ReasonNo, o_LocationNo, CustNo, o_Phone, o_CustName, o_PersonName, o_Address, o_BuildingNo, o_FloorNo, o_FlatNo, o_Sign$delSn
FROM DOrders_M WITH (NOLOCK) WHERE OrderDate = @d
"@ $p

  $list = New-Object System.Collections.ArrayList
  $schedCheck = New-Object System.Collections.ArrayList
  foreach($r in $orders.Rows){
    $entry = $null
    if (-not ($r.SendDate -is [DBNull])) { $entry = [datetime]$r.SendDate } else { $entry = ParseT $r.TimeIn $day }
    $waiter = [int](N $r.WaiterNo)
    $outT = $null; if ($waiter -gt 0) { $outT = ParseT $r.OrderTime $day }
    $online = S $r.OnlineType
    $o = [pscustomobject]@{
      No = [int64](N $r.OrderNo); Branch = [int](N $r.BranchNo); User = [int](N $r.UserNo); Trans = S $r.TransType; Pay = S $r.PayWay
      Online = $online; Kind = KindOf $online; Entry = $entry; Out = $outT; Waiter = $waiter; Sub = N $r.SubTotal; Disc = N $r.Discount; Amt = AmtOf $r
      Sn = $(if ($selSn) { SnOf $r.SnX } else { $null })
      WaitMin = $null; Open = $false; Sched = $null; Over = $null
      Loc = $(if ($script:Locations) { $script:Locations[[int](N $r.o_LocationNo)] } else { $null })
      Customer = CustomerOf $r
      Note = (CleanNote (S $r.Remarks))
    }
    $o | Add-Member -NotePropertyName Disp -NotePropertyValue $(if ($o.Sn -ne $null) { $o.Sn } else { $o.No })
    $o.WaitMin = $(if ($o.Out) { Mins $o.Entry $o.Out } else { Mins $o.Entry $now })
    $o.Open = ($o.Trans -eq 'Delivery' -and -not $o.Out)
    # The set time, from the name fields one by one (which field and the matched bit are kept for the check file).
    foreach($f in @(@('o_CustName', $r.NameTxt), @('o_PersonName', $r.NameTxt2), @('PersonName', $r.NameTxt3))){
      $script:SchedHit = ''; $sv = ScheduleOf (S $f[1]) $entry
      if ($sv) { $o.Sched = $sv; [void]$schedCheck.Add("$($o.No) | رقم $($o.Sn) | اتضرب $($entry.ToString('HH:mm')) | الميعاد $($sv.ToString('yyyy-MM-dd HH:mm')) | الخانة $($f[0]) | اللي اتقرا: «$($script:SchedHit)»"); break }
    }
    # Lateness: 30 minutes from entry; an order for a set time is late when it has not left 30 minutes before its time.
    # Over = minutes on that clock (late at 30, very late at 45), so both kinds follow the same limits.
    if ($o.Entry) {
      $due = $o.Entry.AddMinutes($LateMinutes)
      if ($o.Sched -and $o.Sched.AddMinutes(-30) -gt $due) { $due = $o.Sched.AddMinutes(-30) }
      $o.Over = Mins ($due.AddMinutes(-$LateMinutes)) $(if ($o.Out) { $o.Out } else { $now })
    }
    [void]$list.Add($o)
  }
  # Orders read as having a set time: written for checking on this PC only (no names), when the list changes.
  try { $sc = ($schedCheck -join "`r`n"); if ($sc -ne $script:lastSchedCheck) { Set-Content (Join-Path $here 'sched_check.txt') ("الأوردرات اللي اتقرالها ميعاد — " + $now.ToString('yyyy-MM-dd HH:mm') + "`r`n" + $sc) -Encoding UTF8; $script:lastSchedCheck = $sc } } catch {}
  # Officer orders (staff / officer meals) are not sales: kept aside, out of every total.
  foreach($o in $list){ $o | Add-Member -NotePropertyName Officer -NotePropertyValue (((' ' + $o.Pay + ' ' + $o.Trans + ' ' + $o.Online + ' ') -match '(?i)officer|اوفيسر|أوفيسر|افيسر|ضباط') -or ($script:OfficerValues -contains $o.Pay) -or ($script:OfficerValues -contains $o.Trans) -or ($script:OfficerValues -contains $o.Online)) }
  $officer = @($list | Where-Object { $_.Officer })
  $list = [System.Collections.ArrayList]@($list | Where-Object { -not $_.Officer })
  # Cancellations count only after the order was given to a pilot.
  $cancels = New-Object System.Collections.ArrayList
  foreach($r in $dels.Rows){
    if ((N $r.WaiterNo) -le 0) { continue }
    [void]$cancels.Add([pscustomobject]@{
      No = [int64](N $r.OrderNo); Branch = [int](N $r.BranchNo); User = [int](N $r.UserNo); Del = [int](N $r.DelUserNo); Pilot = [int](N $r.WaiterNo)
      Kind = KindOf (S $r.OnlineType); Entry = ParseT $r.TimeIn $day; Out = ParseT $r.OrderTime $day; DelT = ParseT $r.DeleteTime $day
      Sub = N $r.SubTotal; Amt = AmtOf $r; Sn = $(if ($delSn) { SnOf $r.SnX } else { $null }); Loc = $(if ($script:Locations) { $script:Locations[[int](N $r.o_LocationNo)] } else { $null }); Customer = CustomerOf $r; Why = S $r.Remarks; ReasonNo = [int](N $r.ReasonNo) })
    $cancels[$cancels.Count - 1] | Add-Member -NotePropertyName Disp -NotePropertyValue $(if ($cancels[$cancels.Count - 1].Sn -ne $null) { $cancels[$cancels.Count - 1].Sn } else { $cancels[$cancels.Count - 1].No })
  }

  # ---- comments on the items (e.g. «بدون بصل»), per order ----
  $itemNotes = @{}
  try {
    foreach($x in (Q "SELECT d.OrderNo, d.Qty, i.ItemName, d.Description, d.OpenDesc FROM Orders_D_daily d WITH (NOLOCK) JOIN Orders_M_Daily m WITH (NOLOCK) ON m.OrderNo = d.OrderNo LEFT JOIN Items i ON i.ItemNo = d.ItemNo WHERE m.OrderDate = @d AND (ISNULL(d.OpenDesc,'') <> '' OR ISNULL(d.Description,'') <> '')" $p).Rows){
      $nm = S $x.ItemName; $parts = @()
      foreach($v in @((S $x.OpenDesc), (S $x.Description))){ $c = CleanNote $v; if ($c -and $c -ne $nm -and $parts -notcontains $c) { $parts += $c } }
      if (-not $parts.Count) { continue }
      $k = [int64](N $x.OrderNo); if (-not $itemNotes.ContainsKey($k)) { $itemNotes[$k] = New-Object System.Collections.ArrayList }
      [void]$itemNotes[$k].Add(("• $([math]::Round((N $x.Qty),0))× " + $nm + ": " + ($parts -join ' — ')))
    }
  } catch { if (-not $script:itemNoteErr) { L "item comments: $($_.Exception.Message)"; $script:itemNoteErr = $true } }
  # Comments sent on the order after it was entered (Apex «Messages»): text, who and when.
  try {
    foreach($m in (Q "SELECT RowID, MessageTime, Message, OrderNo, UserNo FROM Messages WITH (NOLOCK) WHERE MessageDate >= @d AND MessageDate < DATEADD(day, 2, @d) AND ISNULL(OrderNo, 0) <> 0 ORDER BY RowID" $p).Rows){
      $txt = CleanNote (S $m.Message); if (-not $txt) { continue }
      $k = [int64](N $m.OrderNo); $mt = ParseT $m.MessageTime $day
      if (-not $itemNotes.ContainsKey("m$k")) { $itemNotes["m$k"] = New-Object System.Collections.ArrayList }
      [void]$itemNotes["m$k"].Add("• " + $txt + " (" + (UName $m.UserNo) + $(if ($mt) { ' ' + (Tm $mt) }) + ")")
    }
  } catch { if (-not $script:msgErr) { L "messages: $($_.Exception.Message)"; $script:msgErr = $true } }
  foreach($o in $list){ $o | Add-Member -NotePropertyName Msgs -NotePropertyValue ([string[]]@($itemNotes["m$($o.No)"] | Where-Object { $_ })) -Force }
  foreach($o in $list){ $o | Add-Member -NotePropertyName ItemNotes -NotePropertyValue ([string[]]@($itemNotes[$o.No] | Where-Object { $_ })) -Force }

  # ---- alerts ----
  $script:follow = New-Object System.Collections.ArrayList
  # The branch as it is now, written under every branch message.
  $bstat = @{}; $script:branchStatus = @{}
  foreach($g in ($list | Group-Object Branch)){
    $bo = @($g.Group); $op = @($bo | Where-Object { $_.Open -and $_.Over -ne $null })
    $vl = @($op | Where-Object { $_.Over -ge $VeryLateMinutes }).Count
    $lt = @($op | Where-Object { $_.Over -ge $LateMinutes -and $_.Over -lt $VeryLateMinutes }).Count
    $sc = @($op | Where-Object { $_.Sched -and $_.Over -lt $LateMinutes }).Count
    $ok = @($op | Where-Object { -not $_.Sched -and $_.Over -lt $LateMinutes }).Count
    $out = @($bo | Where-Object { $_.Out }); $outN = @($out | Where-Object { -not $_.Sched -and $_.WaitMin -ne $null })
    $outL = @($out | Where-Object { $_.Over -ge $LateMinutes }).Count
    $avg = $(if ($outN.Count) { [math]::Round((($outN | Measure-Object WaitMin -Average).Average), 0) } else { $null })
    $bstat[[int]$g.Name] = $bline = "`n`n📊 حالة الفرع دلوقتي: $($op.Count) أوردر لسه ماخرجوش" +
      "`n🔴 $vl عدّى 45 د · 🟠 $lt عدّى 30 د · 🟢 $ok لسه في وقت التحضير · 🕒 $sc بمواعيد لسه في وقتها" +
      "`nالنهارده: خرج $($out.Count) أوردر$(if ($outL) { " (منهم $outL متأخر)" })$(if ($avg -ne $null) { " · متوسط الخروج $avg د" })"
    $bline = $bstat[[int]$g.Name]; $script:branchStatus[(BName $g.Name)] = $bline.TrimStart("`n")
  }
  function Extra($o){ $x = ''; if ($o.Loc) { $x += "`n📍 المنطقة: $($o.Loc)" }; if (NoteWorth $o.Note) { $x += "`n💬 ملاحظة الأوردر: $($o.Note)" }; if (@($o.ItemNotes).Count) { $x += "`n🍽️ تعليقات على الأصناف:`n" + (@($o.ItemNotes) -join "`n") }; if (@($o.Msgs).Count) { $x += "`n📨 كومنتات اتبعتت بعد الضرب:`n" + (@($o.Msgs) -join "`n") }; return $x }
  $issues = New-Object System.Collections.ArrayList
  foreach($o in $list){
    $b = BName $o.Branch; $who = UName $o.User
    if ($o.Open -and $o.Entry) {
      $w = Mins $o.Entry $now; $v = $o.Over
      $sch = ''
      if ($o.Sched) { $left = Mins $now $o.Sched; $sch = "`nالميعاد المطلوب: $((Tm $o.Sched)) — " + $(if ($left -gt 0) { "فاضل $left دقيقة" } else { "الميعاد عدّى بـ $(-$left) دقيقة" }) }
      $head = $(if ($o.Sched) { 'أوردر بميعاد لسه ماخرجش من الفرع' } elseif ($v -ge $VeryLateMinutes) { 'أوردر عدّى 45 دقيقة ولسه ماخرجش من الفرع' } else { 'أوردر عدّى 30 دقيقة ولسه ماخرجش من الفرع' })
      $body = "`nالفرع: $b`nرقم الأوردر: $($o.Disp) ($(KindAr $o.Kind))`nاتضرب الساعة $((Tm $o.Entry))، وبقاله $w دقيقة$sch`nقيمة الأوردر: $([math]::Round($o.Amt,0)) ج$(Extra $o)$($bstat[$o.Branch])"
      if ($v -ge $VeryLateMinutes) { Raise "vlate:$($o.No)" 'ordersLate' ("🖥️ Apex | 🔴 $head$body") $false $b $o.Sn }
      elseif ($v -ge $LateMinutes) { Raise "late:$($o.No)" 'ordersLate' ("🖥️ Apex | 🟠 $head$body") $false $b $o.Sn }
      # Still not out: a reminder under the warning every 15 minutes after «very late».
      if ($v -ge $VeryLateMinutes + 15) {
        $n = [math]::Floor(($v - $VeryLateMinutes) / 15)
        $wk = $(if ($alerted.Contains("late:$($o.No)")) { "late:$($o.No)" } else { "vlate:$($o.No)" })
        if ($alerted.Contains($wk) -and -not @($pending | Where-Object { $_.key -eq $wk }).Count) { [void]$script:follow.Add([ordered]@{ key = $wk; kind = 'ordersLate'; follow = $true; status = "r$n"; sn = $o.Sn; branch = $b
          text = "🖥️ Apex | ⏰ تذكير: أوردر $($o.Disp) لسه ماخرجش من الفرع`nالفرع: $b`nبقاله $w دقيقة من وقت الضرب$sch$(Extra $o)$($bstat[$o.Branch])" }) }
      }
    }
    $thr = if ($o.Kind -eq 'Hotline' -or $o.Kind -eq 'الموقع') { $DiscPctHotline } else { $DiscPctPlatform }
    if ($o.Sub -gt 0 -and $o.Disc -gt 0 -and (100 * $o.Disc / $o.Sub) -ge $thr) {
      $pct = [math]::Round(100 * $o.Disc / $o.Sub, 0)
      Raise "disc:$($o.No)" 'ordersDiscount' ("🖥️ Apex | 💸 خصم كبير على أوردر`nالفرع: $b`nرقم الأوردر: $($o.Disp) ($(KindAr $o.Kind))`nالحساب قبل الخصم: $([math]::Round($o.Sub,0)) ج`nالخصم: $([math]::Round($o.Disc,0)) ج ($pct%)`nالمطلوب من العميل: $([math]::Round($o.Amt,0)) ج`nاللي ضرب الأوردر: $who") $script:firstCycle $b $o.Sn ('d' + [math]::Round($o.Disc,0))
    }
    $bad = $null
    if ($o.Online -match '(?i)talabat\s*visa' -and $o.Pay -ne 'Ledge') { $bad = "الأوردر نوعه TALABAT VISA بس طريقة الدفع على Apex مكتوبة $($o.Pay) (المفروض Ledge)" }
    if ($o.Online -match '(?i)talabat\s*cash' -and $o.Pay -ne 'Cash') { $bad = "الأوردر نوعه TALABAT CASH بس طريقة الدفع على Apex مكتوبة $($o.Pay) (المفروض Cash)" }
    if ($bad) {
      [void]$issues.Add([ordered]@{ type = 'دفع'; no = $o.No; sn = $o.Sn; branch = $b; kind = $o.Kind; user = $who; at = IsoT $o.Entry; detail = $bad })
      Raise "pay:$($o.No)" 'ordersEntry' ("🖥️ Apex | ⚠️ طريقة الدفع مش مظبوطة في أوردر`nالفرع: $b`nرقم الأوردر: $($o.Disp)`nالمشكلة: $bad`nاللي ضرب الأوردر: $who") $script:firstCycle $b $o.Sn
    }
  }
  $groups = @($list | Where-Object { $_.Entry -and $_.Sub -gt 0 } | Group-Object { "$($_.Branch)|$([math]::Round($_.Amt,2))|$($_.Kind)" } | Where-Object { $_.Count -gt 1 })
  foreach($g in $groups){
    $sorted = @($g.Group | Sort-Object Entry)
    for($i=1; $i -lt $sorted.Count; $i++){
      $a = $sorted[$i-1]; $c = $sorted[$i]; $gap = Mins $a.Entry $c.Entry
      if ($gap -le $DupWindowMin) {
        [void]$issues.Add([ordered]@{ type = 'تكرار'; no = $c.No; sn = $c.Sn; branch = BName $c.Branch; kind = $c.Kind; user = UName $c.User; at = IsoT $c.Entry; detail = "نفس مبلغ أوردر $($a.Disp) ($([math]::Round($c.Amt,0)) ج) بعد $gap دقيقة" })
        Raise "dup:$($c.No)" 'ordersEntry' ("🖥️ Apex | 🔁 أوردر ممكن يكون متضرب مرتين`nالفرع: $(BName $c.Branch)`nالأوردرين: $($a.Disp) و $($c.Disp) ($(KindAr $c.Kind)) بنفس المبلغ $([math]::Round($c.Amt,0)) ج`nالفرق بينهم: $gap دقيقة`nاللي ضربهم: $(UName $a.User) / $(UName $c.User)") $script:firstCycle (BName $c.Branch) $c.Sn
      }
    }
  }
  foreach($c in $cancels){
    $after = ''; if ($c.Out -and $c.DelT) { $after = " بعد $(Mins $c.Out $c.DelT) دقيقة من تحميله" }
    Raise "del:$($c.No)" 'ordersCancel' ("🖥️ Apex | ❌ أوردر اتلغى بعد ما اتحمّل على الطيار — $(BName $c.Branch)`nأوردر $($c.Disp) ($($c.Kind)) · $([math]::Round($c.Amt,0)) ج · الطيار: $(UName $c.Pilot)`nلغاه: $(UName $c.Del)$after`nالسبب: $($c.Why)$(if ($c.Loc) { "`n📍 المنطقة: $($c.Loc)" })$($bstat[$c.Branch])") $true (BName $c.Branch) $c.Sn   # Apex cancellations: listed on the page, not sent to Telegram (only Talabat cancellations are sent)
  }
  # Comments are not sent on their own: they ride with the order's alerts (see Extra).
  $script:firstCycle = $false

  # ---- follow-ups: the current state of every order already warned about (the server answers the warning when it changes) ----
  $byNo = @{}; foreach($o in @($list) + @($officer)){ $byNo[$o.No] = $o }
  $delAll = @{}; foreach($r in $dels.Rows){ $delAll[[int64](N $r.OrderNo)] = $r }
  foreach($k in @($alerted)){
    $m = [regex]::Match($k, '^(late|vlate|disc|pay|dup):(\d+)$'); if (-not $m.Success) { continue }
    $t = $m.Groups[1].Value; $no = [int64]$m.Groups[2].Value
    if ($t -eq 'vlate' -and $alerted.Contains("late:$no")) { continue }   # answered under the late warning
    $kind = @{ late = 'ordersLate'; vlate = 'ordersLate'; disc = 'ordersDiscount'; pay = 'ordersEntry'; dup = 'ordersEntry' }[$t]
    if (-not $byNo.ContainsKey($no) -and $delAll.ContainsKey($no)) {
      $d = $delAll[$no]; $sn = $(if ($delSn) { SnOf $d.SnX } else { $null }); $shown = $(if ($sn -ne $null) { $sn } else { $no })
      $dt = ParseT $d.DeleteTime $day; $why = S $d.Remarks
      [void]$script:follow.Add([ordered]@{ key = $k; kind = $kind; follow = $true; status = 'deleted'; sn = $sn; branch = BName $d.BranchNo
        text = "🖥️ Apex | 🔄 أوردر $shown اتلغى بعد التنبيه — لغاه: $(UName $d.DelUserNo)$(if ($dt) { ' الساعة ' + (Tm $dt) })$(if ($why) { "`nالسبب: $why" })" })
      continue
    }
    if ($t -eq 'disc' -and $byNo.ContainsKey($no)) {
      $o = $byNo[$no]; $pct = $(if ($o.Sub -gt 0) { [math]::Round(100 * $o.Disc / $o.Sub, 0) } else { 0 })
      $txt = $(if ($o.Disc -le 0) { "🖥️ Apex | ✅ الخصم اتشال من أوردر $($o.Disp) — المطلوب من العميل دلوقتي $([math]::Round($o.Amt,0)) ج" } else { "🖥️ Apex | ✏️ الخصم اتغيّر على أوردر $($o.Disp) — بقى $([math]::Round($o.Disc,0)) ج ($pct%) من $([math]::Round($o.Sub,0)) ج · المطلوب من العميل $([math]::Round($o.Amt,0)) ج" })
      [void]$script:follow.Add([ordered]@{ key = $k; kind = $kind; follow = $true; status = ('d' + [math]::Round($o.Disc,0)); sn = $o.Sn; branch = BName $o.Branch; text = $txt })
    }
  }

  # ---- the same details for the server's messages (website and Talabat orders): area and comments per Apex order ----
  $details = @{}
  foreach($o in $list){
    if ($o.Kind -eq 'Hotline') { continue }   # only website / platform orders: the server writes those messages
    $hasN = NoteWorth $o.Note
    if (-not ($o.Loc -or $hasN -or @($o.ItemNotes).Count -or @($o.Msgs).Count)) { continue }
    $details["$($o.No)"] = [ordered]@{ loc = $o.Loc; note = $(if ($hasN) { $o.Note } else { $null }); items = @($o.ItemNotes); msgs = @($o.Msgs) }
  }

  # ---- summary ----
  $openAll = @($list | Where-Object { $_.Open })
  $outd = @($list | Where-Object { $_.Out -and $_.WaitMin -ne $null })
  $outN = @($outd | Where-Object { -not $_.Sched })   # averages: set-time orders would only inflate them
  $totKinds = NewCounts; foreach($o in $list){ Bump $totKinds $o.Kind }
  $branchesOut = @()
  foreach($bn in (@($list | ForEach-Object { $_.Branch }) + @($cancels | ForEach-Object { $_.Branch }) | Sort-Object -Unique)){
    $bo = @($list | Where-Object { $_.Branch -eq $bn })
    $open = @($bo | Where-Object { $_.Open })
    $bout = @($bo | Where-Object { $_.Out -and $_.WaitMin -ne $null })
    $boutN = @($bout | Where-Object { -not $_.Sched })
    $bk = NewCounts; foreach($o in $bo){ Bump $bk $o.Kind }
    $bc = @($cancels | Where-Object { $_.Branch -eq $bn })
    $branchesOut += [ordered]@{
      no = $bn; name = BName $bn; orders = $bo.Count; sales = SumOf $bo 'Amt'; kinds = $bk
      open = $open.Count; late = @($open | Where-Object { $_.Over -ge $LateMinutes }).Count; veryLate = @($open | Where-Object { $_.Over -ge $VeryLateMinutes }).Count
      avgOut = AvgOf $boutN 'WaitMin'; outLate = @($bout | Where-Object { $_.Over -ge $LateMinutes }).Count; outCount = $bout.Count
      cancels = $bc.Count; cancelSales = SumOf $bc 'Amt'
    }
  }
  $openList = @($openAll | Sort-Object Entry | ForEach-Object {
    [ordered]@{ no = $_.No; sn = $_.Sn; branch = BName $_.Branch; kind = $_.Kind; at = IsoT $_.Entry; wait = $_.WaitMin; sched = IsoT $_.Sched; late = ($_.Over -ge $LateMinutes); user = UName $_.User; amount = R2 $_.Amt } })
  $staff = @()
  foreach($g in ($list | Group-Object User | Sort-Object Count -Descending)){
    $uo = @($g.Group); $uk = NewCounts; foreach($o in $uo){ Bump $uk $o.Kind }
    $uname = UName $g.Name
    $staff += [ordered]@{
      name = $uname; orders = $uo.Count; kinds = $uk; sales = SumOf $uo 'Amt'; discounts = SumOf $uo 'Disc'
      issues = @($issues | Where-Object { $_.user -eq $uname }).Count; cancels = @($cancels | Where-Object { $_.User -eq [int]$g.Name }).Count
      first = IsoT (($uo | Measure-Object Entry -Minimum).Minimum); last = IsoT (($uo | Measure-Object Entry -Maximum).Maximum)
    }
  }
  $hours = @()
  foreach($hgrp in ($list | Where-Object { $_.Entry } | Group-Object { $_.Entry.Hour })){
    $ho = @($hgrp.Group); $hk = NewCounts; foreach($o in $ho){ Bump $hk $o.Kind }
    $hours += [ordered]@{ h = [int]$hgrp.Name; orders = $ho.Count; kinds = $hk; avgOut = AvgOf @($ho | Where-Object { $_.Out -and $_.WaitMin -ne $null -and -not $_.Sched }) 'WaitMin' }
  }
  $hours = @($hours | Sort-Object { ($_.h - $DayStartHour + 24) % 24 })
  # Orders that left with the pilot after the late limit (the branch report lists them).
  $lateOut = @($list | Where-Object { $_.Out -and $_.Over -ne $null -and $_.Over -ge $LateMinutes } | Sort-Object Over -Descending | Select-Object -First 300 | ForEach-Object {
    [ordered]@{ no = $_.No; sn = $_.Sn; branch = BName $_.Branch; kind = $_.Kind; at = IsoT $_.Entry; out = IsoT $_.Out; wait = $_.WaitMin; sched = IsoT $_.Sched; over = $_.Over - $LateMinutes; pilot = UName $_.Waiter; user = UName $_.User; amount = R2 $_.Amt } })
  # The #code the employee writes next to the customer (Talabat's short code or full number): searched in every text
  # column of the online orders, so it is found wherever it is written. Only the digits are sent, never the name.
  $tags = @{}; $script:tagCols = @{}
  try {
    $raw = Q "SELECT * FROM Orders_M_Daily WITH (NOLOCK) WHERE OrderDate = @d AND ISNULL(OnlineType,'') <> ''" $p
    foreach($r in $raw.Rows){ $tg = TagOf $r; if ($tg) { $tags[[int64](N $r.OrderNo)] = $tg } }
  } catch { L "tag scan: $($_.Exception.Message)" }
  # The items of each online order (to compare with what the platform received). Service lines are left out.
  $lines = @{}
  try {
    foreach($x in (Q "SELECT d.OrderNo, d.ItemNo, d.Qty, d.Price, i.ItemName FROM Orders_D_daily d WITH (NOLOCK) JOIN Orders_M_Daily m WITH (NOLOCK) ON m.OrderNo = d.OrderNo LEFT JOIN Items i ON i.ItemNo = d.ItemNo WHERE m.OrderDate = @d AND ISNULL(m.OnlineType,'') <> ''" $p).Rows){
      $nm = S $x.ItemName; if ($nm -match '^(خدمة|خدمه|توصيل|delivery|service)$') { continue }
      $k = [int64](N $x.OrderNo); if (-not $lines.ContainsKey($k)) { $lines[$k] = New-Object System.Collections.ArrayList }
      [void]$lines[$k].Add([ordered]@{ no = (S $x.ItemNo); name = $nm; qty = R2 $x.Qty; price = R2 $x.Price })
    }
  } catch { L "item lines: $($_.Exception.Message)" }
  # Online orders (anything but Hotline), so the server can tie each website order to the Apex order and who entered it.
  $onlineList = @($list | Where-Object { $_.Kind -ne 'Hotline' -and $_.Entry } | Sort-Object Entry | ForEach-Object {
    [ordered]@{ no = $_.No; sn = $_.Sn; branch = BName $_.Branch; kind = $_.Kind; at = IsoT $_.Entry; user = UName $_.User; amount = R2 $_.Amt; customer = $_.Customer; tag = $tags[$_.No]; items = @($lines[$_.No]) } })
  # Sales: per branch, platform, payment and service type (officer orders not included).
  $salesList = @($list | Group-Object { "$($_.Branch)|$($_.Kind)|$($_.Pay)|$($_.Trans)" } | ForEach-Object {
    $f = $_.Group[0]; [ordered]@{ branch = BName $f.Branch; kind = $f.Kind; pay = $f.Pay; trans = $f.Trans; orders = $_.Count; sales = SumOf $_.Group 'Amt'; discounts = SumOf $_.Group 'Disc' } })
  $officerOut = [ordered]@{ orders = $officer.Count; sales = SumOf $officer 'Amt'
    byBranch = @($officer | Group-Object Branch | ForEach-Object { [ordered]@{ branch = BName $_.Name; orders = $_.Count; sales = SumOf $_.Group 'Amt' } }) }
  $dlines = @{}; $dtags = @{}
  if (@($cancels | Where-Object { $_.Kind -ne 'Hotline' }).Count) {
    try {
      foreach($x in (Q "SELECT d.OrderNo, d.ItemNo, d.Qty, d.Price, i.ItemName FROM DOrders_D d WITH (NOLOCK) JOIN DOrders_M m WITH (NOLOCK) ON m.OrderNo = d.OrderNo LEFT JOIN Items i ON i.ItemNo = d.ItemNo WHERE m.OrderDate = @d AND ISNULL(m.OnlineType,'') <> ''" $p).Rows){
        $nm = S $x.ItemName; if ($nm -match '^(خدمة|خدمه|توصيل|delivery|service)$') { continue }
        $k = [int64](N $x.OrderNo); if (-not $dlines.ContainsKey($k)) { $dlines[$k] = New-Object System.Collections.ArrayList }
        [void]$dlines[$k].Add([ordered]@{ no = (S $x.ItemNo); name = $nm; qty = R2 $x.Qty; price = R2 $x.Price })
      }
      $raw = Q "SELECT * FROM DOrders_M WITH (NOLOCK) WHERE OrderDate = @d AND ISNULL(OnlineType,'') <> ''" $p
      foreach($r in $raw.Rows){ $tg = TagOf $r; if ($tg) { $dtags[[int64](N $r.OrderNo)] = $tg } }
    } catch { L "cancel lines: $($_.Exception.Message)" }
  }
  $cancelList = @($cancels | Sort-Object DelT -Descending | ForEach-Object {
    [ordered]@{ no = $_.No; sn = $_.Sn; branch = BName $_.Branch; kind = $_.Kind; amount = R2 $_.Amt; user = UName $_.User; by = UName $_.Del; pilot = UName $_.Pilot
      at = IsoT $_.DelT; afterOut = $(if ($_.Out -and $_.DelT) { Mins $_.Out $_.DelT } else { $null }); reason = $_.Why
      reasonNo = $(if ($_.ReasonNo -gt 0) { $_.ReasonNo } else { $null }); reasonName = $(if ($_.ReasonNo -gt 0) { $script:Reasons[$_.ReasonNo] } else { $null }); entry = IsoT $_.Entry; out = IsoT $_.Out; customer = $_.Customer; tag = $dtags[$_.No]; items = @($dlines[$_.No]) } })
  return [ordered]@{
    v = 1; day = $dayKey; generatedAt = IsoT $now; source = 'Apex'
    settings = [ordered]@{ late = $LateMinutes; veryLate = $VeryLateMinutes }
    totals = [ordered]@{
      orders = $list.Count; sales = SumOf $list 'Amt'; kinds = $totKinds
      open = $openAll.Count; late = @($openAll | Where-Object { $_.Over -ge $LateMinutes }).Count; scheduled = @($list | Where-Object { $_.Sched }).Count
      avgOut = AvgOf $outN 'WaitMin'; outCount = $outd.Count; outLate = @($outd | Where-Object { $_.Over -ge $LateMinutes }).Count
      cancels = $cancels.Count; cancelSales = SumOf $cancels 'Amt'
      discounts = SumOf $list 'Disc'; issues = $issues.Count
    }
    branches = @($branchesOut); open = @($openList); staff = @($staff); hours = $hours
    cancels = @($cancelList); issues = @($issues); lateOut = @($lateOut); online = @($onlineList); sales = @($salesList); officer = $officerOut; tagColumns = $script:tagCols; details = $details; branchStatus = $script:branchStatus; users = @($script:Users.Values | Where-Object { $_ } | Sort-Object -Unique); alerts = @(@($pending) + $(if ($script:ServerFollow) { @($script:follow) } else { @() }))
  }
}

# ===== the Talabat codes of the past 7 days (from Apex's archive), sent once per start so old days link right too =====
$script:tagsBackfilled = $false
function BackfillTags {
  if (-not $OrdersKey) { return }
  try {
    $today = [datetime](Q 'SELECT MAX(OrderDate) AS d FROM Orders_M_Daily').Rows[0].d
    for($i = 1; $i -le 7; $i++){
      $dd = $today.AddDays(-$i); $tags = @{}
      $rows = Q "SELECT * FROM Orders_M WITH (NOLOCK) WHERE OrderDate = @d AND ISNULL(OnlineType,'') <> ''" @{ '@d' = $dd }
      foreach($r in $rows.Rows){ $tg = TagOf $r; if ($tg) { $tags["$([int64](N $r.OrderNo))"] = $tg } }
      $json = [ordered]@{ day = $dd.ToString('yyyy-MM-dd'); tags = $tags } | ConvertTo-Json -Depth 4 -Compress
      $resp = Invoke-RestMethod -Method Post -Uri "$ServerUrl/api/orders/tags" -Headers @{ 'x-orders-token' = $OrdersKey } -Body ([Text.Encoding]::UTF8.GetBytes($json)) -ContentType 'application/json; charset=utf-8' -TimeoutSec 30
      L "tags $($dd.ToString('yyyy-MM-dd')): $($tags.Count) sent, $($resp.updated) placed"
    }
    $script:tagsBackfilled = $true
  } catch { L "tags backfill (retry in 30 min): $($_.Exception.Message)"; $script:tagsRetryAt = (Get-Date).AddMinutes(30) }
}

# ===== main loop =====
L 'monitor started (read-only)'
$cycleNo = 0
while ($true) {
  # A newer copy of this script was put in the folder: start it and stop this one (updates need nobody at the PC).
  try { if ((Get-Item $self).LastWriteTimeUtc -ne $selfStamp) { L 'script updated - restarting'; $mutex.ReleaseMutex(); $mutex.Dispose(); Start-Process wscript.exe -ArgumentList '//B', ('"' + (Join-Path $here 'run_hidden.vbs') + '"'); exit 0 } } catch {}
  try {
    $cycleNo++
    if ($cycleNo % 240 -eq 0) { LoadRefs }
    $payload = Cycle
    if ($payload) {
      $currentAlerts = @($pending | Where-Object { $_.day -eq $payload.day } | Select-Object -First 400)
      $payload.alerts = @($currentAlerts + $(if ($script:ServerFollow -and $currentAlerts.Count -lt 400) { @($script:follow | Select-Object -First (400 - $currentAlerts.Count)) } else { @() }))
      Push $payload
      foreach ($oldDay in @($pending | Where-Object { $_.day -ne $payload.day } | ForEach-Object { $_.day } | Sort-Object -Unique)) {
        Push ([ordered]@{ day = $oldDay; replayAlerts = $true; alerts = @($pending | Where-Object { $_.day -eq $oldDay } | Select-Object -First 400) })
      }
    }
    if (-not $script:tagsBackfilled -and $script:pushFails -eq 0 -and $script:ServerFollow -and (-not $script:tagsRetryAt -or (Get-Date) -gt $script:tagsRetryAt)) { BackfillTags }
  } catch {
    L "cycle error: $($_.Exception.Message)"
    try { if ($script:conn) { $script:conn.Close() } } catch {}
    $script:conn = $null
  }
  Start-Sleep -Seconds $PollSeconds
}
