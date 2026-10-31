# كاتب Apex للمرصد — Marsad → Apex order writer, runs on the restaurant PC next to the monitor.
# It asks the Marsad server for orders an employee confirmed for automatic transfer, and writes each one into Apex
# the way the Apex call-center client does (numbers, customer, header, lines, log, print snapshot), in one short
# transaction (cash, or prepaid as Ledge with its customer-ledger row). Three modes, chosen on the server by an admin:
#   shadow : read-only, production database, with the monitor's read-only login. Computes everything and reports
#            the order it WOULD write. Nothing is written. The employee still enters the order by hand.
#   test   : writes into Resturant_Test with the writer login (writer_cred.dat). Never production.
#   live   : writes into Resturant. Needs BOTH the server mode «live» AND $AllowLive = $true below.
# Every order carries a marker in OrderLog (MT:<talabat id> / MS:<site id>), checked before writing, so an order is never
# written twice even if the answer to the server is lost. No delete, no reseed, no settings change, ever.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$self = $MyInvocation.MyCommand.Path
$selfStamp = (Get-Item $self).LastWriteTimeUtc
Set-Location $here

# ---- settings (checked against the real database on 2026-10-31) ----
$ServerUrl   = 'https://marsad-v2.karim87nu.chatgpt.site'
$Servers     = @('196.218.94.154', '192.168.1.15')
$PollSeconds = 10
$WriterPos   = 70        # a POS number no Apex machine uses (Counter row 70: no orders since 2023). Orders get 70<serial>.
$RefPos      = 35        # the call-center POS: its Counter row says which business day and shift are open
$RefPosTest  = 29        # in Resturant_Test the open test day is on POS 29 (orders 291..299)
$AllowLive   = $false    # second lock for production writes; set to $true only after test mode is verified
$PrintedFlag = 0         # Orders_D_Daily.Printed on insert (0 = the branch still has to print it); confirmed by print_trace.txt
$AddPrintedOrders = $false # whether to add a PrintedOrders row at save time; confirmed by print_trace.txt
$PriceSource = 'ItemsOnlinePrice'  # proven 2026-10-31: every online line on Apex (1,900+ lines) = Items.OnlinePrice
$WriterUserNo = 755     # Apex user «MARSAD» (Users.UserNo 755, read 2026-10-31): orders are counted on it, not on an employee
$TalabatServiceItem = '0114006'  # «خدمة» line (7.02) that Apex's own Talabat orders start with

$monitorDir = Split-Path -Parent $here
$logFile = Join-Path $here 'writer_log.txt'
function L($m){ try { if ((Test-Path $logFile) -and (Get-Item $logFile).Length -gt 5MB) { Move-Item $logFile ($logFile + '.old') -Force }; Add-Content $logFile ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $m) -Encoding UTF8 } catch {} }

$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\MarsadApexWriter', [ref]$created)
if (-not $created) { exit 0 }

function ReadSecret($file){ if (-not (Test-Path $file)) { return $null }; return ((Get-Content $file -Raw).Trim() | ConvertTo-SecureString) }
function Plain($sec){ return [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)) }
# Its own key if one was set up, otherwise the monitor's orders key (same PC, same Windows user).
$tokenSec = ReadSecret (Join-Path $here 'writer_token.dat')
if (-not $tokenSec) { $tokenSec = ReadSecret (Join-Path (Split-Path -Parent $here) 'orders_key.dat') }
if (-not $tokenSec) { L 'FATAL: no key (writer_token.dat / orders_key.dat)'; exit 1 }
$Token = Plain $tokenSec
# Read-only login of the monitor (shadow mode only).
$readerSec = ReadSecret (Join-Path $monitorDir 'cred.dat')
if ($readerSec) { $readerSec.MakeReadOnly() }
# Writer login (test/live only), created by the admin; its name is in writer_user.txt.
$writerSec = ReadSecret (Join-Path $here 'writer_cred.dat')
if ($writerSec) { $writerSec.MakeReadOnly() }
$writerUser = if (Test-Path (Join-Path $here 'writer_user.txt')) { (Get-Content (Join-Path $here 'writer_user.txt') -Raw).Trim() } else { $null }
# Production writer login (separate from the test one), saved by Setup-ApexWriter with «الإنتاج».
$liveSec = ReadSecret (Join-Path $here 'writer_live_cred.dat')
if ($liveSec) { $liveSec.MakeReadOnly() }
$liveUser = if (Test-Path (Join-Path $here 'writer_live_user.txt')) { (Get-Content (Join-Path $here 'writer_live_user.txt') -Raw).Trim() } else { $null }

function Open-Db([string]$mode){
  $db = if ($mode -eq 'test') { 'Resturant_Test' } else { 'Resturant' }
  if ($mode -eq 'shadow') { if (-not $readerSec) { throw 'cred.dat (read-only) missing' }; $cred = New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec) }
  elseif ($mode -eq 'live') { if (-not $liveSec -or -not $liveUser) { throw 'production writer login not set up (Setup-ApexWriter.cmd)' }; $cred = New-Object System.Data.SqlClient.SqlCredential($liveUser, $liveSec) }
  else { if (-not $writerSec -or -not $writerUser) { throw 'writer login not set up (Setup-ApexWriter.cmd)' }; $cred = New-Object System.Data.SqlClient.SqlCredential($writerUser, $writerSec) }
  foreach($s in $Servers){
    try { $c = New-Object System.Data.SqlClient.SqlConnection("Server=$s;Database=$db;Application Name=MarsadApexWriter-$mode;Connect Timeout=10", $cred); $c.Open(); return $c } catch { L "connect $s/$db failed: $($_.Exception.Message)" }
  }
  throw "cannot connect to $db"
}

function Api([string]$path, $body){
  $json = ($body | ConvertTo-Json -Depth 8 -Compress)
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  return Invoke-RestMethod -Method Post -Uri ($ServerUrl + $path) -Headers @{ 'x-apex-writer' = $Token } -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 30
}

# One T-SQL batch per order. @Exec = 0: only the reads (preview). @Exec = 1: the reads, then the writes, in one transaction.
$Batch = @'
SET NOCOUNT ON; SET XACT_ABORT ON; SET LOCK_TIMEOUT 5000;
DECLARE @Date datetime, @Shift numeric(18,0), @Now datetime = GETDATE(), @Time varchar(12), @Tpl numeric(18,0), @Cust numeric(18,0),
        @PosSerial numeric(18,0), @OrderNo numeric(18,0), @BranchOrderNo numeric(18,0), @TypeSerial numeric(18,0), @BranchShift numeric(18,0),
        @ShiftSerial numeric(18,0), @CheckNo numeric(18,0), @Sub money, @Tax money, @TaxRatio numeric(18,2), @Total money, @Existing numeric(18,0), @Err nvarchar(300);
SET @Time = @TimeText;  -- Apex's own time text (hh:mm:ss ص/م)
SELECT @Date = OrderDate, @Shift = ShiftNo FROM dbo.Counter WITH (NOLOCK) WHERE num = @RefPos;
IF @Date IS NULL THROW 51001, 'reference POS has no open day', 1;
IF @IsTest = 0 AND NOT EXISTS (SELECT 1 FROM dbo.Orders_M_Daily WITH (NOLOCK) WHERE OrderDate = @Date) THROW 51002, 'the business day is not open on Apex yet', 1;
IF EXISTS (SELECT 1 FROM dbo.Orders_M_Daily WITH (NOLOCK) WHERE OrderDate > @Date) THROW 51003, 'a later day is open; reference POS is stale', 1;
SELECT TOP 1 @Existing = OrderNo FROM dbo.OrderLog WITH (NOLOCK) WHERE OrderDate = @Date AND Description = @Marker;
IF @Existing IS NOT NULL BEGIN SELECT 'exists' AS r, @Existing AS OrderNo; RETURN; END;
IF (SELECT COUNT(*) FROM dbo.Counter WITH (NOLOCK) WHERE num = @Pos) <> 1 THROW 51004, 'writer POS needs exactly one Counter row', 1;
-- Template: the newest order of the same kind entered by Apex itself today (same OnlineType text, cash), same branch first.
SELECT TOP 1 @Tpl = OrderNo FROM dbo.Orders_M_Daily WITH (NOLOCK) WHERE OrderDate = @Date AND RTRIM(PayWay) = @PayWay AND PosNo <> @Pos
  AND ((@Kind = 'talabat' AND (OnlineType LIKE '%TALABAT%' OR OnlineType LIKE N'%طلبات%')) OR (@Kind = 'site' AND (OnlineType LIKE N'%موقع%' OR OnlineType LIKE '%WEB%' OR OnlineType LIKE '%SITE%')))
  ORDER BY CASE WHEN BranchNo = @Branch THEN 0 ELSE 1 END, CheckNo DESC;
-- The test copy may have its day closed (orders moved to Orders_M): take the template from there.
DECLARE @TplArchive bit = 0;
IF @Tpl IS NULL AND @IsTest = 1 BEGIN
  SELECT TOP 1 @Tpl = OrderNo FROM dbo.Orders_M WITH (NOLOCK) WHERE RTRIM(PayWay) = @PayWay AND PosNo <> @Pos
    AND ((@Kind = 'talabat' AND (OnlineType LIKE '%TALABAT%' OR OnlineType LIKE N'%طلبات%')) OR (@Kind = 'site' AND (OnlineType LIKE N'%موقع%' OR OnlineType LIKE '%WEB%' OR OnlineType LIKE '%SITE%')))
    ORDER BY CASE WHEN BranchNo = @Branch THEN 0 ELSE 1 END, OrderDate DESC, CheckNo DESC;
  SET @TplArchive = 1;
END;
IF @Tpl IS NULL THROW 51005, 'no Apex order of this kind today to take the settings from', 1;
DECLARE @Service money;
SELECT @TaxRatio = TaxRatio FROM dbo.Orders_M_Daily WITH (NOLOCK) WHERE OrderNo = @Tpl;
IF @TaxRatio IS NULL SELECT @TaxRatio = TaxRatio FROM dbo.Orders_M WITH (NOLOCK) WHERE OrderNo = @Tpl;
-- Delivery service: what Apex charged most for this branch and area today (the archive is only searched on the test copy: it is big).
SELECT TOP 1 @Service = Service FROM dbo.Orders_M_Daily WITH (NOLOCK) WHERE BranchNo = @Branch AND o_LocationNo = @LocationNo AND ISNULL(Service, 0) > 0 GROUP BY Service ORDER BY COUNT(*) DESC;
IF @Service IS NULL AND @IsTest = 1 SELECT TOP 1 @Service = Service FROM (SELECT TOP 300 Service FROM dbo.Orders_M WITH (NOLOCK) WHERE BranchNo = @Branch AND o_LocationNo = @LocationNo AND ISNULL(Service, 0) > 0 ORDER BY OrderDate DESC) x GROUP BY Service ORDER BY COUNT(*) DESC;
IF @Service IS NULL AND @Exec = 1 THROW 51008, 'no delivery charge known for this area on Apex', 1;
SET @Service = ISNULL(@Service, 0);
-- Lines and prices (prices given by the caller from the proven price source; checked against Items here).
IF EXISTS (SELECT 1 FROM @Lines l LEFT JOIN dbo.Items i WITH (NOLOCK) ON i.ItemNo = l.ItemNo WHERE i.ItemNo IS NULL) THROW 51006, 'an item number is not in Apex Items', 1;
IF EXISTS (SELECT 1 FROM @Lines l JOIN dbo.Items i WITH (NOLOCK) ON i.ItemNo = l.ItemNo WHERE ISNULL(i.StopItem, 0) <> 0) THROW 51007, 'an item is stopped on Apex', 1;
SELECT @Sub = SUM(Qty * Price) FROM @Lines;
SET @Tax = ROUND((@Sub + @Service) * ISNULL(@TaxRatio, 0) / 100.0, 2);   -- Apex taxes SubTotal + Service, before the discount (checked on real orders)
SET @Total = @Sub - @RestDiscount + @Tax + @Service;   -- Apex: CashPayment = SubTotal - Discount + Tax + Service
IF @Exec = 0 BEGIN
  SELECT 'preview' AS r, @LocationNo AS LocationNo, @Date AS OrderDate, @Shift AS ShiftNo, @Tpl AS Template, @Sub AS SubTotal, @Tax AS Tax, @TaxRatio AS TaxRatio, @Service AS Service, @Total AS Total,
    (SELECT ISNULL(MAX(PosSerial), 0) + 1 FROM dbo.Counter WITH (NOLOCK) WHERE num = @Pos) AS PosSerial,
    (SELECT ISNULL(MAX(BranchOrderNo), 0) + 2 FROM dbo.Orders_M_Daily WITH (NOLOCK) WHERE BranchNo = @Branch) AS BranchOrderNo,
    (SELECT ISNULL(MAX(TypeSerial), 0) + 1 FROM dbo.Orders_M_Daily WITH (NOLOCK) WHERE RTRIM(PayWay) IN ('Cash', 'Ledge', 'Visa')) AS TypeSerial,
    (SELECT TOP 1 CustNo FROM dbo.Customers WITH (NOLOCK) WHERE @Phone <> '' AND (RTRIM(Mobile) = @Phone OR RTRIM(Phone) = @Phone) ORDER BY CustNo DESC) AS CustNo;
  RETURN;
END;
BEGIN TRY
  BEGIN TRANSACTION;
  DECLARE @Lock int; EXEC @Lock = sys.sp_getapplock @Resource = N'Marsad-Apex-Writer', @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = 5000;
  IF @Lock < 0 THROW 51010, 'another writer is busy', 1;
  -- Short exclusive locks: Apex's own saves wait a few milliseconds; its NOLOCK reads see this order as soon as it exists.
  DECLARE @Guard numeric(18,0);   -- assignments, so no empty result set comes back before the answer
  SELECT TOP 1 @Guard = OrderNo FROM dbo.Orders_M_Daily WITH (TABLOCKX, HOLDLOCK);
  SELECT TOP 1 @Guard = CustNo FROM dbo.Customers WITH (TABLOCKX, HOLDLOCK);
  SELECT @PosSerial = ISNULL(PosSerial, 0) + 1 FROM dbo.Counter WITH (UPDLOCK, HOLDLOCK) WHERE num = @Pos;
  SET @OrderNo = CONVERT(numeric(18,0), CONVERT(varchar(10), CONVERT(int, @Pos)) + CONVERT(varchar(12), CONVERT(bigint, @PosSerial)));
  IF EXISTS (SELECT 1 FROM dbo.Orders_M_Daily WHERE OrderNo = @OrderNo) OR EXISTS (SELECT 1 FROM dbo.Orders_M WITH (NOLOCK) WHERE OrderNo = @OrderNo)
     OR EXISTS (SELECT 1 FROM dbo.Orders_Serials WITH (NOLOCK) WHERE OrderNo = @OrderNo) OR EXISTS (SELECT 1 FROM dbo.Orders_Checks WITH (NOLOCK) WHERE OrderNo = @OrderNo)
     OR EXISTS (SELECT 1 FROM dbo.PrintedOrders WITH (NOLOCK) WHERE OrderNo = @OrderNo)
    THROW 51011, 'the next order number is already used', 1;
  SELECT @BranchOrderNo = ISNULL(MAX(BranchOrderNo), 0) + 2 FROM dbo.Orders_M_Daily WHERE BranchNo = @Branch;
  SELECT @TypeSerial = ISNULL(MAX(TypeSerial), 0) + 1 FROM dbo.Orders_M_Daily WHERE RTRIM(PayWay) IN ('Cash', 'Ledge', 'Visa');
  SELECT @BranchShift = ISNULL(MAX(ShiftSerial), 0) + 1 FROM dbo.Orders_Serials WITH (NOLOCK) WHERE OrderDate = @Date AND ShiftNo = @Shift;
  -- Customer: the newest one with this phone, else a new one (CustNo = MAX + 1, under the table lock).
  IF @Phone <> '' SELECT TOP 1 @Cust = CustNo FROM dbo.Customers WHERE RTRIM(Mobile) = @Phone OR RTRIM(Phone) = @Phone ORDER BY CustNo DESC;
  IF @Cust IS NULL BEGIN
    SELECT @Cust = ISNULL(MAX(CustNo), 0) + 1 FROM dbo.Customers;
    INSERT INTO dbo.Customers (CustNo, Name, Mobile, Address, BranchNo, New, FirstOrder, LastOrder, LastOrderNo, ShiftOrderNo, LastOrderCash, Total, OrdersNo)
    VALUES (@Cust, LEFT(@Label, 50), @Phone, LEFT(@Address, 200), @Branch, 1, @Date, @Date, 0, 0, 0, 0, 0);
  END;
  -- The restaurant discount sits on one dish line (the top-priced one, as on Apex's own orders); the header carries the same total.
  DECLARE @DiscLine int; SELECT TOP 1 @DiscLine = SerialNo FROM @Lines WHERE ItemNo <> @ServiceItem ORDER BY Qty * Price DESC, SerialNo;
  DECLARE @S TABLE (n numeric(18,0)); DECLARE @C TABLE (n numeric(18,0));
  INSERT INTO dbo.Orders_Serials (OrderNo, OrderDate, ShiftNo) OUTPUT inserted.ShiftSerial INTO @S VALUES (@OrderNo, @Date, @Shift);
  SELECT @ShiftSerial = n FROM @S;
  INSERT INTO dbo.Orders_Checks (OrderNo) OUTPUT inserted.CheckNo INTO @C VALUES (@OrderNo);
  SELECT @CheckNo = n FROM @C;
  INSERT INTO dbo.Orders_M_Daily (OrderNo, ShiftSerial, BranchShiftSerial, TypeSerial, TakeAwayLoc, CustNo, TableNo, GuestNo, BankNo, EmpNo, OrderDate, OrderTime, UserNo,
    ComboDifference, WaiterNo, ShiftNo, TransType, SubTotal, Service, Addition, Tax, Tips, TimeIn, Discount, MinCharge, MinChargeDifference, PayWay, CashPayment, VisaPayment,
    Remarks, PosNo, DiscountType, HallNo, PrintsNo, HourNo, Closed, SerialNo, CustPayment, Changed, SNO, RecieveNo, PersonName, DepositNo, DepositValue, BranchNo, BranchOrderNo,
    ServiceRatio, TaxRatio, Hosp_Flag, PosSerial, CheckNo, ReceiveTime, Otlob, Otlob_OrderNo, OnlineType, RedeemCode, Gift, AddPoints, DeliveryTrack, o_Phone, o_CustName,
    o_Address, o_Sign, o_PersonName, MobileNo, MyFatoorah, Modified, o_LocationNo)
  SELECT @OrderNo, @ShiftSerial, @BranchShift, @TypeSerial, t.TakeAwayLoc, @Cust, t.TableNo, t.GuestNo, 0, 0, @Date, @Time, @UserNo,
    0, 0, @Shift, t.TransType, @Sub, @Service, 0, @Tax, 0, @Time, @RestDiscount, 0, 0, @PayWay, CASE WHEN @PayWay = 'Ledge' THEN 0 ELSE @Total END, 0,
    LEFT(@Remarks, 100), @Pos, CASE WHEN @RestDiscount > 0 THEN t.DiscountType ELSE NULL END, t.HallNo, 1, DATEPART(hour, @Now), '0', NULL, CASE WHEN @PayWay = 'Ledge' THEN 0 ELSE @Total END, '0', 0, 0, LEFT(@Label, 50), 0, 0, @Branch, @BranchOrderNo,
    0, @TaxRatio, 0, @PosSerial, @CheckNo, @Time, t.Otlob, '', t.OnlineType, '', '', 0, t.DeliveryTrack, @Phone, LEFT(@Label, 100),
    LEFT(@Address, 250), LEFT(@Sign, 100), LEFT(@Label, 50), @Phone, 0, 0, @LocationNo
  FROM (SELECT TakeAwayLoc, TableNo, GuestNo, TransType, DiscountType, HallNo, Otlob, OnlineType, DeliveryTrack FROM dbo.Orders_M_Daily WITH (NOLOCK) WHERE OrderNo = @Tpl
        UNION ALL SELECT TakeAwayLoc, TableNo, GuestNo, TransType, DiscountType, HallNo, Otlob, OnlineType, DeliveryTrack FROM dbo.Orders_M WITH (NOLOCK) WHERE OrderNo = @Tpl AND @TplArchive = 1) t;
  IF @@ROWCOUNT <> 1 THROW 51012, 'template order disappeared', 1;
  INSERT INTO dbo.Orders_D_Daily (OrderNo, ItemNo, SerialNo, Qty, Price, Description, Combo, ItemDetailNo, Rank, ItemsCombo, ItemDiscount, ItemTime, OpenDesc, TimeVal, ItemTax, ItemService, Printed, PrintedSlip, Weight, ItemsNo, SentBy, Finished)
  SELECT @OrderNo, l.ItemNo, l.SerialNo, l.Qty, l.Price, l.Note, '0', l.ItemNo, NULL, NULL, CASE WHEN l.SerialNo = @DiscLine THEN @RestDiscount ELSE 0 END, @Time, '', 0, NULL, NULL, @PrintedFlag, @PrintedFlag, 1, 1, 0, 0 FROM @Lines l;   -- Weight 1, ItemsNo 1 on every Apex online line
  UPDATE dbo.Counter SET OrderNo = @PosSerial, PosSerial = @PosSerial, ShiftOrderNo = @ShiftSerial, OrderDate = @Date, ShiftNo = @Shift WHERE num = @Pos;
  IF @@ROWCOUNT <> 1 THROW 51013, 'counter update failed', 1;
  UPDATE dbo.Customers SET LastOrderNo = @OrderNo, ShiftOrderNo = @ShiftSerial, LastOrderCash = @Total, FirstOrder = ISNULL(FirstOrder, @Date), LastOrder = @Date,
    Total = ISNULL(Total, 0) + @Total, OrdersNo = ISNULL(OrdersNo, 0) + 1 WHERE CustNo = @Cust;
  INSERT INTO dbo.OrderLog (TOrderNo, OrderNo, OrderDate, ItemTime, TableNo, ItemNo, ItemName, Qty, Description, Status, BranchNo, WaiterName, UserName, ShiftNo, PosNo)
  VALUES (0, @OrderNo, @Date, @Time, '', '', '', 0, @Marker, 'MARSAD', @Branch, '', 'MARSAD', @Shift, @Pos);
  INSERT INTO dbo.OrderLog (TOrderNo, OrderNo, OrderDate, ItemTime, TableNo, ItemNo, ItemName, Qty, Description, Status, BranchNo, WaiterName, UserName, ShiftNo, PosNo)
  SELECT 0, @OrderNo, @Date, @Time, '', l.ItemNo, RTRIM(i.ItemName), l.Qty, '', 'Add', @Branch, '', 'MARSAD', @Shift, @Pos FROM @Lines l JOIN dbo.Items i WITH (NOLOCK) ON i.ItemNo = l.ItemNo;
  IF @PayWay = 'Ledge'
    INSERT INTO dbo.CLedges (CustNo, OrderNo, ShiftNo, PayDate, PayTime, TotalCash, Payments, Reminder, PayType, PosNo, UserNo, BranchNo, HourNo)
    VALUES (@Cust, @OrderNo, @Shift, @Date, @Time, @Total, 0, @Total, 'Ledge', @Pos, @UserNo, @Branch, DATEPART(hour, @Now));
  -- The marker is what stops a second write of the same order: it must be stored exactly, or nothing is saved.
  IF NOT EXISTS (SELECT 1 FROM dbo.OrderLog WHERE OrderNo = @OrderNo AND Description = @Marker) THROW 51015, 'marker not stored exactly', 1;
  IF @AddPrinted = 1 INSERT INTO dbo.PrintedOrders (OrderNo, OrderDate, Printed, Modified) VALUES (@OrderNo, @Date, 0, 0);
  IF NOT EXISTS (SELECT 1 FROM dbo.Orders_M_Daily m JOIN dbo.Orders_Serials s ON s.OrderNo = m.OrderNo AND s.ShiftSerial = m.ShiftSerial
                 JOIN dbo.Orders_Checks c ON c.OrderNo = m.OrderNo AND c.CheckNo = m.CheckNo WHERE m.OrderNo = @OrderNo)
    THROW 51014, 'saved order failed its consistency check', 1;
  COMMIT TRANSACTION;
  SELECT 'written' AS r, @OrderNo AS OrderNo, @ShiftSerial AS ShiftSerial, @BranchOrderNo AS BranchOrderNo, @CheckNo AS CheckNo, @Total AS Total, @Cust AS CustNo,
    (SELECT COUNT(*) FROM dbo.Orders_M_Daily WITH (NOLOCK) WHERE BranchNo = @Branch AND BranchOrderNo = @BranchOrderNo) AS SameBranchNo;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;   -- identity gaps after a rollback are normal; never reseed
END CATCH;
'@

function Write-Order($c, $job, [string]$mode){
  $cmd = $c.CreateCommand(); $cmd.CommandTimeout = 30
  # The lines as a table variable filled from parameters (never string-built).
  $decl = "DECLARE @Lines TABLE (SerialNo int, ItemNo varchar(20), Qty numeric(18,3), Price money, Note varchar(60));`r`n"
  $i = 0
  foreach($l in $job.items){
    $i++
    $decl += "INSERT INTO @Lines VALUES ($i, @it$i, @q$i, @p$i, @n$i);`r`n"
    [void]$cmd.Parameters.AddWithValue("@it$i", [string]$l.itemNo)
    [void]$cmd.Parameters.AddWithValue("@q$i", [decimal]$l.qty)
    [void]$cmd.Parameters.AddWithValue("@p$i", [decimal]$l.price)
    [void]$cmd.Parameters.AddWithValue("@n$i", [string]$l.note)
  }
  $cmd.CommandText = $decl + $Batch
  $p = @{ '@Exec' = $(if ($mode -eq 'shadow') { 0 } else { 1 }); '@IsTest' = $(if ($mode -eq 'test') { 1 } else { 0 }); '@PayWay' = $(if ($job.payment -eq 'paid') { 'Ledge' } else { 'Cash' }); '@Pos' = $WriterPos; '@LocationNo' = [int]$job.locationNo; '@ServiceItem' = [string]$TalabatServiceItem; '@RefPos' = $(if ($mode -eq 'test') { $RefPosTest } else { $RefPos }); '@Branch' = [int]$job.branchNo
          '@Marker' = ('M' + $(if ($job.source -eq 'site') { 'S' } else { 'T' }) + ':' + $job.ref); '@Kind' = [string]$job.source; '@Phone' = [string]$job.customer.phone
          '@Label' = [string]$job.label; '@Address' = [string]$job.customer.address; '@Sign' = [string]$job.sign; '@Remarks' = [string]$job.note
          '@RestDiscount' = [decimal]$job.restaurantDiscount; '@AddPrinted' = $(if ($AddPrintedOrders) { 1 } else { 0 }); '@PrintedFlag' = $PrintedFlag; '@UserNo' = $WriterUserNo
          '@TimeText' = (Get-Date).ToString('hh:mm:ss tt', [Globalization.CultureInfo]::GetCultureInfo('ar-EG')) }
  foreach($k in $p.Keys){ [void]$cmd.Parameters.AddWithValue($k, $p[$k]) }
  $t = New-Object System.Data.DataTable; $t.Load($cmd.ExecuteReader()); return $t.Rows[0]
}

# Line prices: in shadow mode the employee's chosen items are priced from each candidate list so the shadow report
# shows which list matches Apex's own entries. test/live use only the proven source.
function Price-Lines($c, $job){
  foreach($l in $job.items){
    $cmd = $c.CreateCommand(); $cmd.CommandText = 'SELECT TOP 1 i.DeliveryPrice AS dp, i.OnlinePrice AS op, ib.Price AS bp, ib.OnPrice AS bo, (SELECT MIN(Price) FROM ItemsOnlineTypes WITH (NOLOCK) WHERE ItemNo = @i AND BranchNo = @b) AS ot FROM Items i WITH (NOLOCK) LEFT JOIN ItemsBranches ib WITH (NOLOCK) ON ib.ItemNo = i.ItemNo AND ib.BranchNo = @b WHERE i.ItemNo = @i'
    [void]$cmd.Parameters.AddWithValue('@i', [string]$l.itemNo); [void]$cmd.Parameters.AddWithValue('@b', [int]$job.branchNo)
    $t = New-Object System.Data.DataTable; $t.Load($cmd.ExecuteReader())
    if (-not $t.Rows.Count) { throw ('item ' + $l.itemNo + ' not in Apex') }
    $r = $t.Rows[0]
    $cand = [ordered]@{ ItemsOnlinePrice = $r.op; ItemsOnlineTypes = $r.ot; ItemsBranchesOnPrice = $r.bo; ItemsBranchesPrice = $r.bp; ItemsDeliveryPrice = $r.dp }
    $l | Add-Member -NotePropertyName candidates -NotePropertyValue ($cand.Keys | Where-Object { $cand[$_] -isnot [DBNull] -and $cand[$_] -ne $null } | ForEach-Object { "$_=$([math]::Round([double]$cand[$_],2))" }) -Force
    $v = $cand[$PriceSource]   # only the proven source; no fallback to another list
    if ($v -is [DBNull] -or $v -eq $null -or [decimal]$v -le 0) { throw ('no price on Apex for item ' + $l.itemNo) }
    $l | Add-Member -NotePropertyName price -NotePropertyValue ([decimal]$v) -Force
  }
}

# Self-test (test database or preview only, never production): a job placed in selftest.json by the Marsad team is
# run once without the server; the answer and the saved rows (read back) go to selftest_result.json.
function Self-Test {
  $f = Join-Path $here 'selftest.json'
  if (-not (Test-Path $f)) { return }
  $out = [ordered]@{ at = (Get-Date).ToString('s') }
  $c = $null
  try {
    $job = Get-Content $f -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($job.mode -eq 'inspect-user') {
      # Read-only, production: the Apex user named MARSAD (the user the writer saves orders under).
      $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[0]);Database=Resturant;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec)))
      try { $c.Open() } catch { $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[1]);Database=Resturant;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec))); $c.Open() }
      $out.mode = 'inspect-user'; $rows = @()
      $cmd = $c.CreateCommand(); $cmd.CommandText = "SELECT t.name AS tb, (SELECT TOP 1 c2.name FROM sys.columns c2 WHERE c2.object_id = t.object_id AND c2.name IN ('UserName','Name','UName','LoginName','User_Name') ORDER BY CASE c2.name WHEN 'UserName' THEN 0 ELSE 1 END) AS nc FROM sys.tables t WHERE EXISTS (SELECT 1 FROM sys.columns c WHERE c.object_id = t.object_id AND c.name = 'UserNo') AND EXISTS (SELECT 1 FROM sys.columns c WHERE c.object_id = t.object_id AND c.name IN ('UserName','Name','UName','LoginName','User_Name')) AND t.name NOT LIKE '%Log%' AND t.name NOT LIKE 'Orders%'"
      $tabs = New-Object System.Data.DataTable; $tabs.Load($cmd.ExecuteReader())
      foreach($t in $tabs.Rows){
        try { $q = $c.CreateCommand(); $q.CommandText = "SELECT TOP 5 UserNo, [$($t.nc)] AS nm FROM [$($t.tb)] WITH (NOLOCK) WHERE [$($t.nc)] LIKE '%MARSAD%'"; $rd = $q.ExecuteReader(); while ($rd.Read()) { $rows += [ordered]@{ table = $t.tb; UserNo = "$($rd.GetValue(0))"; name = "$($rd.GetValue(1))".Trim() } }; $rd.Close() } catch { $rows += @{ table = $t.tb; error = $_.Exception.Message } }
      }
      $out.saved = $rows; $out.ok = $true
      throw 'INSPECT_DONE'
    }
    if ($job.mode -eq 'inspect-print') {
      # Read-only, test copy: the print flags Apex's own client left on the orders it created there (no branch printer runs on the test copy).
      $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[0]);Database=Resturant_Test;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec)))
      try { $c.Open() } catch { $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[1]);Database=Resturant_Test;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec))); $c.Open() }
      $out.mode = 'inspect-print'; $rows = @()
      foreach($q in @("SELECT 'PO' k, OrderNo, OrderDate, Printed, Modified FROM PrintedOrders WITH (NOLOCK) WHERE OrderNo BETWEEN 290 AND 710",
                      "SELECT 'DD' k, OrderNo, ItemNo, Printed, PrintedSlip, SentBy FROM Orders_D_Daily WITH (NOLOCK) WHERE OrderNo BETWEEN 290 AND 710",
                      "SELECT 'DA' k, OrderNo, ItemNo, Printed, PrintedSlip, SentBy FROM Orders_D WITH (NOLOCK) WHERE OrderNo BETWEEN 290 AND 300",
                      "SELECT 'MA' k, OrderNo, PosNo, OrderPrinted, PrintsNo FROM Orders_M WITH (NOLOCK) WHERE OrderNo BETWEEN 290 AND 300",
                      "SELECT 'MD' k, OrderNo, PosNo, OrderPrinted, PrintsNo FROM Orders_M_Daily WITH (NOLOCK) WHERE OrderNo BETWEEN 290 AND 710")){
        try { $cmd = $c.CreateCommand(); $cmd.CommandText = $q; $rd = $cmd.ExecuteReader(); while ($rd.Read()) { $h = [ordered]@{}; for ($i = 0; $i -lt $rd.FieldCount; $i++) { $h[$rd.GetName($i)] = "$($rd.GetValue($i))".Trim() }; $rows += $h }; $rd.Close() } catch { $rows += @{ error = $_.Exception.Message } }
      }
      $out.saved = $rows; $out.ok = $true
      throw 'INSPECT_DONE'
    }
    # One production order may be written from a self-test only when the file says liveOnce (an approved branch trial).
    $mode = if ($job.mode -eq 'test') { 'test' } elseif ($job.mode -eq 'live' -and $job.liveOnce -eq $true) { 'live' } else { 'shadow' }
    if ($mode -eq 'live' -and $WriterUserNo -eq 0 -and -not $job.userNo) { throw 'no Apex user for the writer yet' }
    if ($mode -eq 'live' -and $job.userNo) { $script:WriterUserNo = [int]$job.userNo }
    $out.mode = $mode
    $c = Open-Db $mode
    if ($job.source -eq 'talabat' -and $TalabatServiceItem -and -not ($job.items | Where-Object { $_.itemNo -eq $TalabatServiceItem })) { $job.items = @([pscustomobject]@{ itemNo = $TalabatServiceItem; qty = 1; note = '' }) + @($job.items) }
    Price-Lines $c $job
    $out.lines = @($job.items | ForEach-Object { "$($_.itemNo) x$($_.qty) @ $($_.price) [$($_.candidates -join ',')]" })
    $r = Write-Order $c $job $mode
    $out.answer = @{}; foreach($col in $r.Table.Columns){ $out.answer[$col.ColumnName] = "$($r[$col.ColumnName])" }
    if ($r.OrderNo -and ($mode -eq 'test' -or $mode -eq 'live')) {
      $cmd = $c.CreateCommand(); $cmd.CommandText = "SELECT 'M' k, OrderNo, ShiftSerial, BranchShiftSerial, TypeSerial, BranchNo, BranchOrderNo, PosNo, PosSerial, CheckNo, CustNo, OrderDate, TimeIn, RTRIM(PayWay) PayWay, OnlineType, Otlob, SubTotal, Service, Tax, Discount, CashPayment, UserNo FROM Orders_M_Daily WHERE OrderNo = @o; SELECT 'D' k, ItemNo, SerialNo, Qty, Price, Printed, PrintedSlip, Weight, ItemsNo, ItemDetailNo FROM Orders_D_Daily WHERE OrderNo = @o ORDER BY SerialNo; SELECT 'C' k, num, OrderNo, PosSerial, ShiftOrderNo, OrderDate, ShiftNo FROM Counter WHERE num = @p; SELECT 'L' k, COUNT(*) n FROM OrderLog WHERE OrderNo = @o; SELECT 'P' k, COUNT(*) n FROM PrintedOrders WHERE OrderNo = @o"
      [void]$cmd.Parameters.AddWithValue('@o', $r.OrderNo); [void]$cmd.Parameters.AddWithValue('@p', $WriterPos)
      $rd = $cmd.ExecuteReader(); $rows = @()
      do { while ($rd.Read()) { $h = [ordered]@{}; for ($i = 0; $i -lt $rd.FieldCount; $i++) { $h[$rd.GetName($i)] = "$($rd.GetValue($i))" }; $rows += $h } } while ($rd.NextResult())
      $rd.Close(); $out.saved = $rows
    }
    $out.ok = $true
  } catch { if ($_.Exception.Message -ne 'INSPECT_DONE') { $out.ok = $false; $out.error = $_.Exception.Message } }
  finally { if ($c) { try { $c.Close() } catch {} } }
  ($out | ConvertTo-Json -Depth 6) | Set-Content (Join-Path $here 'selftest_result.json') -Encoding UTF8
  Move-Item $f (Join-Path $here ('selftest.done-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')) -Force
  L ('self-test ' + $out.mode + ': ' + $(if ($out.ok) { 'ok' } else { $out.error }))
}

L "writer started (pos $WriterPos)"
$failures = 0
for (;;) {
  try { if ((Get-Item $self).LastWriteTimeUtc -ne $selfStamp) { L 'script updated - restarting'; $mutex.ReleaseMutex(); $mutex.Dispose(); Start-Process powershell.exe -WindowStyle Hidden -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $self + '"'); exit 0 } } catch {}
  try { Self-Test } catch { L "self-test: $($_.Exception.Message)" }
  $c = $null
  try {
    $n = Api '/api/apex-writer/next' @{}
    $failures = 0
    if ($n.job) {
      $job = $n.job; $mode = [string]$n.mode
      if ($mode -eq 'live' -and -not $AllowLive) { throw 'live mode is locked on this PC ($AllowLive)' }
      if ($mode -eq 'live' -and $WriterUserNo -eq 0) { throw 'no Apex user for the writer yet ($WriterUserNo)' }
      $c = Open-Db $mode
      # Apex's own Talabat orders start with the «خدمة» service line; the employee's lines follow.
      if ($job.source -eq 'talabat' -and $TalabatServiceItem -and -not ($job.items | Where-Object { $_.itemNo -eq $TalabatServiceItem })) {
        $job.items = @([pscustomobject]@{ itemNo = $TalabatServiceItem; qty = 1; note = '' }) + @($job.items)
      }
      Price-Lines $c $job
      $r = Write-Order $c $job $mode
      $res = @{ source = $job.source; ref = $job.ref; db = $mode; ok = $true }
      if ($r.r -eq 'preview') {
        $res.preview = $true; $res.total = [double]$r.Total; $res.branchOrderNo = $r.BranchOrderNo
        $res.detail = "sub=$($r.SubTotal) tax=$($r.Tax) ratio=$($r.TaxRatio) service=$($r.Service) template=$($r.Template) posSerial=$($r.PosSerial) typeSerial=$($r.TypeSerial) cust=$($r.CustNo) | " + (($job.items | ForEach-Object { "$($_.itemNo)x$($_.qty): $($_.candidates -join ',')" }) -join ' ; ')
        if ($job.expectedTotal -and [math]::Abs([double]$r.Total - [double]$job.expectedTotal) -gt [math]::Max(1, 0.01 * [double]$job.expectedTotal)) { $res.ok = $false; $res.error = "القيمة $([math]::Round([double]$r.Total,2)) مش زي الأوردر $($job.expectedTotal)" }
      } else {
        $res.orderNo = $r.OrderNo; $res.shiftSerial = $r.ShiftSerial; $res.branchOrderNo = $r.BranchOrderNo; $res.total = [double]$r.Total
        if ($r.r -eq 'written' -and [int]$r.SameBranchNo -gt 1) { $res.error = 'رقم الفرع اتكرر مع أوردر تاني؛ راجعه' }
      }
      [void](Api '/api/apex-writer/result' $res)
      L ("job " + $job.source + ':' + $job.ref + ' -> ' + ($res | ConvertTo-Json -Compress))
      continue
    }
  } catch {
    $failures++
    L "error: $($_.Exception.Message)"
    if ($job -and $_.Exception.Message -notmatch 'Unable to connect|timed out|remote name') { try { [void](Api '/api/apex-writer/result' @{ source = $job.source; ref = $job.ref; ok = $false; error = $_.Exception.Message }) } catch {} }
  } finally { if ($c) { try { $c.Close() } catch {} }; $job = $null }
  Start-Sleep -Seconds ([math]::Min(120, $PollSeconds * [math]::Max(1, $failures)))
}
