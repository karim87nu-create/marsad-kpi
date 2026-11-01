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
$AllowLive   = $false    # second lock for production writes. Karim turns it on himself by creating allow_live.txt next to
                         # this file (kept across updates of this script); deleting that file locks production again.
$PrintedFlag = 0         # Orders_D_Daily.Printed on insert (0 = the branch still has to print it); confirmed by print_trace.txt
$AddPrintedOrders = $false # whether to add a PrintedOrders row at save time; confirmed by print_trace.txt
$PriceSource = 'ItemsOnlinePrice'  # proven 2026-10-31: every online line on Apex (1,900+ lines) = Items.OnlinePrice
$WriterUserNo = 755     # Apex user «MARSAD» (Users.UserNo 755, read 2026-10-31): orders are counted on it, not on an employee
$TalabatServiceItem = '0114006'  # «خدمة» line (7.02) that Apex's own Talabat orders start with

$monitorDir = Split-Path -Parent $here
if (Test-Path (Join-Path $here 'allow_live.txt')) { $AllowLive = $true }
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
  -- The kind that matches the payment first (one «TALABAT VISA» order was saved as cash today; never copy that one for cash).
  ORDER BY CASE WHEN (@PayWay = 'Ledge' AND (OnlineType LIKE '%VISA%' OR OnlineType LIKE N'%مدفوع%')) OR (@PayWay = 'Cash' AND (OnlineType LIKE '%CASH%' OR OnlineType LIKE N'%كاش%')) THEN 0 ELSE 1 END, CASE WHEN BranchNo = @Branch THEN 0 ELSE 1 END, CheckNo DESC;
-- The test copy may have its day closed (orders moved to Orders_M): take the template from there.
IF @NoTpl = 1 AND @IsTest = 1 SET @Tpl = NULL;   -- test copy only: try the «first order of the day» path
DECLARE @TplArchive bit = 0;
IF @Tpl IS NULL AND @IsTest = 1 AND @NoTpl = 0 BEGIN
  SELECT TOP 1 @Tpl = OrderNo FROM dbo.Orders_M WITH (NOLOCK) WHERE RTRIM(PayWay) = @PayWay AND PosNo <> @Pos
    AND ((@Kind = 'talabat' AND (OnlineType LIKE '%TALABAT%' OR OnlineType LIKE N'%طلبات%')) OR (@Kind = 'site' AND (OnlineType LIKE N'%موقع%' OR OnlineType LIKE '%WEB%' OR OnlineType LIKE '%SITE%')))
    ORDER BY CASE WHEN (@PayWay = 'Ledge' AND (OnlineType LIKE '%VISA%' OR OnlineType LIKE N'%مدفوع%')) OR (@PayWay = 'Cash' AND (OnlineType LIKE '%CASH%' OR OnlineType LIKE N'%كاش%')) THEN 0 ELSE 1 END, CASE WHEN BranchNo = @Branch THEN 0 ELSE 1 END, OrderDate DESC, CheckNo DESC;
  SET @TplArchive = 1;
END;
-- No such order yet today (the first of the day): the settings every online order on Apex has (read 01-11 from all 353
-- online orders of the day: Delivery, guest 1, hall 0, Otlob 1, track 0, «voucher» discount, tax 14%) — Karim: «احنا عارفين».
-- The kind's name always follows the payment: TALABAT VISA / TALABAT CASH / موقعنا مدفوع / موقعنا كاش.
DECLARE @OnlineType nvarchar(50) = CASE WHEN @Kind = 'talabat' THEN CASE WHEN @PayWay = 'Ledge' THEN 'TALABAT VISA' ELSE 'TALABAT CASH' END
                                       ELSE CASE WHEN @PayWay = 'Ledge' THEN N'موقعنا مدفوع' ELSE N'موقعنا كاش' END END;
DECLARE @Service money;
SELECT @TaxRatio = TaxRatio FROM dbo.Orders_M_Daily WITH (NOLOCK) WHERE OrderNo = @Tpl;
IF @TaxRatio IS NULL SELECT @TaxRatio = TaxRatio FROM dbo.Orders_M WITH (NOLOCK) WHERE OrderNo = @Tpl;
IF @TaxRatio IS NULL SET @TaxRatio = 14;
-- Delivery service: what Apex charged most for this branch and area today (the archive is only searched on the test copy: it is big).
SELECT TOP 1 @Service = Service FROM dbo.Orders_M_Daily WITH (NOLOCK) WHERE BranchNo = @Branch AND o_LocationNo = @LocationNo AND ISNULL(Service, 0) > 0 GROUP BY Service ORDER BY COUNT(*) DESC;
IF @Service IS NULL AND @IsTest = 1 SELECT TOP 1 @Service = Service FROM (SELECT TOP 300 Service FROM dbo.Orders_M WITH (NOLOCK) WHERE BranchNo = @Branch AND o_LocationNo = @LocationNo AND ISNULL(Service, 0) > 0 ORDER BY OrderDate DESC) x GROUP BY Service ORDER BY COUNT(*) DESC;
-- No order to this area from this branch today: Apex's own charge for the area, as the read-only monitor read it from
-- LocationServices and the transfer page sent it (0 is a real charge, e.g. pickup). Karim 01-11: Madinaty orders failed.
IF @Service IS NULL AND @AreaService >= 0 SET @Service = @AreaService;
IF @Service IS NULL AND @Exec = 1 THROW 51008, 'no delivery charge known for this area on Apex', 1;
SET @Service = ISNULL(@Service, 0);
-- Lines and prices (prices given by the caller from the proven price source; checked against Items here).
IF EXISTS (SELECT 1 FROM @Lines l LEFT JOIN dbo.Items i WITH (NOLOCK) ON i.ItemNo = l.ItemNo WHERE i.ItemNo IS NULL) THROW 51006, 'an item number is not in Apex Items', 1;
IF EXISTS (SELECT 1 FROM @Lines l JOIN dbo.Items i WITH (NOLOCK) ON i.ItemNo = l.ItemNo WHERE ISNULL(i.StopItem, 0) <> 0) THROW 51007, 'an item is stopped on Apex', 1;
SELECT @Sub = SUM(Qty * Price) FROM @Lines;
SET @Tax = ROUND((@Sub + @Service) * ISNULL(@TaxRatio, 0) / 100.0, 2);   -- Apex taxes SubTotal + Service, before the discount (checked on real orders)
SET @Total = @Sub - @RestDiscount + @Tax + @Service;   -- Apex: CashPayment = SubTotal - Discount + Tax + Service
-- Karim 31-10: the order's total on Apex must equal ours on Talabat/the site (@Target). When Apex comes out higher, the
-- difference is added to the restaurant discount. Karim 01-11: a price difference never stops the order — it is saved and
-- the difference is shown in admin («فروق الأسعار») to fix the price or the item: @Gap (taken off) or @Short (Apex lower).
DECLARE @Gap money = 0, @Short money = 0, @Before money = @Total;
IF @Target > 0 BEGIN
  IF @Total > @Target + 0.009 BEGIN
    SET @Gap = @Total - @Target;
    SET @RestDiscount = @RestDiscount + @Gap; SET @Total = @Target;
  END
  ELSE IF @Total < @Target - 0.009 BEGIN
    -- Karim 01-11: what is recorded must equal what the customer paid (the Ledge amount). Apex lower: the discount taken
    -- off is given back first, up to all of it; only what is left is a real price difference (shown in admin).
    DECLARE @Back money = CASE WHEN @RestDiscount < @Target - @Total THEN @RestDiscount ELSE @Target - @Total END;
    SET @RestDiscount = @RestDiscount - @Back; SET @Total = @Total + @Back;
    IF @Total < @Target - 0.009 SET @Short = @Target - @Total;
  END
END
IF @Exec = 0 BEGIN
  SELECT 'preview' AS r, @Short AS Short, @Before AS Before, @Gap AS Gap, @RestDiscount AS RestDiscountAll, @LocationNo AS LocationNo, @Date AS OrderDate, @Shift AS ShiftNo, @Tpl AS Template, @Sub AS SubTotal, @Tax AS Tax, @TaxRatio AS TaxRatio, @Service AS Service, @Total AS Total,
    (SELECT ISNULL(MAX(PosSerial), 0) + 1 FROM dbo.Counter WITH (NOLOCK) WHERE num = @Pos) AS PosSerial,
    (SELECT ISNULL(MAX(BranchOrderNo), 0) + 2 FROM dbo.Orders_M_Daily WITH (NOLOCK) WHERE BranchNo = @Branch) AS BranchOrderNo,
    (SELECT ISNULL(MAX(TypeSerial), 0) + 1 FROM dbo.Orders_M_Daily WITH (NOLOCK) WHERE RTRIM(PayWay) IN ('Cash', 'Ledge', 'Visa')) AS TypeSerial,
    (SELECT TOP 1 CustNo FROM dbo.Customers WITH (NOLOCK) WHERE @Phone <> '' AND (Mobile = @Phone OR Phone = @Phone) ORDER BY CustNo DESC) AS CustNo;
  RETURN;
END;
-- The customer by phone, looked up before any lock (424,000 customers: a slow search must never hold the tables).
-- Trailing spaces do not count in SQL Server's = on char columns, so no RTRIM (which would stop it using an index).
DECLARE @CustFound numeric(18,0);
IF @Phone <> '' SELECT TOP 1 @CustFound = CustNo FROM dbo.Customers WITH (NOLOCK) WHERE Mobile = @Phone OR Phone = @Phone ORDER BY CustNo DESC;
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
  IF @CustFound IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.Customers WHERE CustNo = @CustFound) SET @Cust = @CustFound;
  IF @Cust IS NULL BEGIN
    SELECT @Cust = ISNULL(MAX(CustNo), 0) + 1 FROM dbo.Customers;
    -- The same fields Apex's own customer screen fills (Karim 01-11: our customers opened empty in Apex — it reads Phone,
    -- the area (LocationNo), CType and UBranchNo, not Mobile/BranchNo); and one Customers_Log row like every save there.
    INSERT INTO dbo.Customers (CustNo, Name, CType, Phone, Address, FlatNo, FloorNo, Sign, CLedge, LocationNo, Note, UBranchNo, StreetNo, ZoneNo, FirstOrder, LastOrder, LastOrderNo, ShiftOrderNo, LastOrderCash)
    VALUES (@Cust, LEFT(@Label, 50), N'أفراد', @Phone, LEFT(@Address, 100), LEFT(@Flat, 20), LEFT(@Floor, 20), LEFT(@Sign, 50), '0', @LocationNo, '.', @Branch, 0, 0, @Date, @Date, 0, 0, 0);
    IF HAS_PERMS_BY_NAME('dbo.Customers_Log', 'OBJECT', 'INSERT') = 1
      INSERT INTO dbo.Customers_Log (CustNo, SNo, Name, CType, Phone, Address, FlatNo, FloorNo, Sign, CLedge, LocationNo, Note, UBranchNo, StreetNo, TransDate, ModifyUser)
      VALUES (@Cust, 1, LEFT(@Label, 50), N'أفراد', @Phone, LEFT(@Address, 100), LEFT(@Flat, 20), LEFT(@Floor, 20), LEFT(@Sign, 50), '0', @LocationNo, '.', @Branch, 0, @Now, 'MARSAD');
  END
  ELSE BEGIN
    -- A customer found by phone: this order's name, address, area, floor and flat replace the saved ones, as staff do on
    -- Apex's customer screen before saving (Karim 01-11: the branch receipt printed last time's address and floor/flat;
    -- Apex prints the customer card, not the order). One Customers_Log row, like every change there.
    UPDATE dbo.Customers SET Phone = CASE WHEN ISNULL(RTRIM(Phone), '') = '' THEN @Phone ELSE Phone END, CType = ISNULL(CType, N'أفراد'), Note = ISNULL(Note, '.'),
      Name = CASE WHEN @Label <> '' THEN LEFT(@Label, 50) ELSE Name END,
      Address = CASE WHEN @Address <> '' THEN LEFT(@Address, 100) ELSE Address END,
      LocationNo = ISNULL(@LocationNo, LocationNo), UBranchNo = @Branch,
      FloorNo = CASE WHEN @Floor <> '' THEN LEFT(@Floor, 20) ELSE FloorNo END, FlatNo = CASE WHEN @Flat <> '' THEN LEFT(@Flat, 20) ELSE FlatNo END,   -- none in the order: the saved ones stay
      Sign = CASE WHEN @Sign <> '' THEN LEFT(@Sign, 50) ELSE Sign END
    WHERE CustNo = @Cust;
    IF HAS_PERMS_BY_NAME('dbo.Customers_Log', 'OBJECT', 'INSERT') = 1
      INSERT INTO dbo.Customers_Log (CustNo, SNo, Name, CType, Phone, Address, FlatNo, FloorNo, Sign, CLedge, LocationNo, Note, UBranchNo, StreetNo, TransDate, ModifyUser)
      SELECT CustNo, (SELECT ISNULL(MAX(SNo), 0) + 1 FROM dbo.Customers_Log WHERE CustNo = @Cust), Name, CType, Phone, Address, FlatNo, FloorNo, Sign, CLedge, LocationNo, Note, UBranchNo, StreetNo, @Now, 'MARSAD'
      FROM dbo.Customers WHERE CustNo = @Cust;
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
    o_Address, o_Sign, o_PersonName, MobileNo, MyFatoorah, Modified, o_LocationNo, o_FloorNo, o_FlatNo, o_StreetNo, operation_id)
  SELECT @OrderNo, @ShiftSerial, @BranchShift, @TypeSerial, t.TakeAwayLoc, @Cust, t.TableNo, t.GuestNo, 0, 0, @Date, @Time, @UserNo,
    0, 0, @Shift, t.TransType, @Sub, @Service, 0, @Tax, 0, @Time, @RestDiscount, 0, 0, @PayWay, CASE WHEN @PayWay = 'Ledge' THEN 0 ELSE @Total END, 0,
    LEFT(@Remarks, 100), @Pos, CASE WHEN @RestDiscount > 0 THEN t.DiscountType ELSE NULL END, t.HallNo, 1, DATEPART(hour, @Now), '0', NULL, CASE WHEN @PayWay = 'Ledge' THEN 0 ELSE @Total END, '0', 0, 0, '', 0, 0, @Branch, @BranchOrderNo,
    0, @TaxRatio, 0, @PosSerial, @CheckNo, @Time, t.Otlob, '', @OnlineType, '', '', 0, t.DeliveryTrack, @Phone, LEFT(@Label, 50),
    LEFT(@Address, 100), LEFT(@Sign, 100), '', @Phone, 0, 1, @LocationNo, LEFT(@Floor, 20), LEFT(@Flat, 20), 0, NEWID()
  FROM (SELECT TOP 1 * FROM (
          SELECT 0 AS o, TakeAwayLoc, TableNo, GuestNo, TransType, DiscountType, HallNo, Otlob, DeliveryTrack FROM dbo.Orders_M_Daily WITH (NOLOCK) WHERE OrderNo = @Tpl
          UNION ALL SELECT 0, TakeAwayLoc, TableNo, GuestNo, TransType, DiscountType, HallNo, Otlob, DeliveryTrack FROM dbo.Orders_M WITH (NOLOCK) WHERE OrderNo = @Tpl AND @TplArchive = 1
          UNION ALL SELECT 1, '', '', 1, 'Delivery', 'voucher', 0, 1, 0) x ORDER BY o) t;
  IF @@ROWCOUNT <> 1 THROW 51012, 'template order disappeared', 1;
  INSERT INTO dbo.Orders_D_Daily (OrderNo, ItemNo, SerialNo, Qty, Price, Description, Combo, ItemDetailNo, Rank, ItemsCombo, ItemDiscount, ItemTime, OpenDesc, TimeVal, ItemTax, ItemService, Printed, PrintedSlip, Weight, ItemsNo, SentBy, Finished)
  SELECT @OrderNo, l.ItemNo, l.SerialNo, l.Qty, l.Price, l.Note, '0', l.ItemNo, NULL, NULL, CASE WHEN l.SerialNo = @DiscLine THEN @RestDiscount ELSE 0 END, @Time, '', 0, NULL, NULL, @PrintedFlag, @PrintedFlag, 1, 1, 0, 0 FROM @Lines l;   -- Weight 1, ItemsNo 1 on every Apex online line
  UPDATE dbo.Counter SET OrderNo = @PosSerial, PosSerial = @PosSerial, ShiftOrderNo = @ShiftSerial, OrderDate = @Date, ShiftNo = @Shift WHERE num = @Pos;
  IF @@ROWCOUNT <> 1 THROW 51013, 'counter update failed', 1;
  UPDATE dbo.Customers SET LastOrderNo = @OrderNo, ShiftOrderNo = @ShiftSerial, LastOrderCash = @Total, FirstOrder = ISNULL(FirstOrder, @Date), LastOrder = @Date,
    Total = ISNULL(Total, 0) + @Total, OrdersNo = ISNULL(OrdersNo, 0) + 1 WHERE CustNo = @Cust;
  INSERT INTO dbo.OrderLog (TOrderNo, OrderNo, OrderDate, ItemTime, TableNo, ItemNo, ItemName, Qty, Description, Status, BranchNo, WaiterName, UserName, ShiftNo, PosNo)
  VALUES (0, @OrderNo, @Date, @Time, '', '', '', 0, @Marker, 'New Order', @Branch, 'MARSAD', 'MARSAD', @Shift, @Pos);
  INSERT INTO dbo.OrderLog (TOrderNo, OrderNo, OrderDate, ItemTime, TableNo, ItemNo, ItemName, Qty, Description, Status, BranchNo, WaiterName, UserName, ShiftNo, PosNo)
  VALUES (0, @OrderNo, @Date, @Time, '', '', '', 0, '', 'Check Out', @Branch, 'MARSAD', 'MARSAD', @Shift, @Pos);
  IF @PayWay = 'Ledge'
    INSERT INTO dbo.CLedges (CustNo, OrderNo, ShiftNo, PayDate, PayTime, TotalCash, Payments, Reminder, PayType, PosNo, UserNo, BranchNo, HourNo)
    VALUES (@Cust, @OrderNo, @Shift, @Date, @Time, @Total, 0, @Total, 'Ledge', @Pos, @UserNo, @Branch, DATEPART(hour, @Now));
  -- The marker is what stops a second write of the same order: it must be stored exactly, or nothing is saved.
  IF NOT EXISTS (SELECT 1 FROM dbo.OrderLog WHERE OrderNo = @OrderNo AND Description = @Marker) THROW 51015, 'marker not stored exactly', 1;
  IF @AddPrinted = 1 INSERT INTO dbo.PrintedOrders (OrderNo, OrderDate, Printed, Modified) VALUES (@OrderNo, @Date, 0, 0);
  DECLARE @Prints bit = 0;
  IF HAS_PERMS_BY_NAME('dbo.Orders_M_Prints', 'OBJECT', 'INSERT') = 1 AND HAS_PERMS_BY_NAME('dbo.Orders_D_Prints', 'OBJECT', 'INSERT') = 1 BEGIN
    INSERT INTO dbo.Orders_M_Prints (OrderNo, PrintsNo, ShiftSerial, TypeSerial, TableNo, HallNo, GuestNo, CustNo, BankNo, EmpNo, TakeAwayLoc, Remarks, OrderDate, TimeIn, OrderTime, ReturnTime,
      UserNo, PosNo, WaiterNo, ShiftNo, TransType, PayWay, DiscountType, MinCharge, SubTotal, Tips, Service, Tax, Discount, ComboDifference, Addition, MinChargeDifference, CashPayment,
      VisaPayment, HourNo, Closed, State, Payed, SerialNo, CustPayment, Changed, SNo, RecieveNo, DelegationNo, PersonName, DepositNo, BranchNo, PosSerial, BranchOrderNo, BranchShiftSerial,
      OrderPrinted, CallCenterNo, ReceiveTime, Exclusive, TaxInvoiceNo, ManagerNo, CheckDiscount, TaxDiscount, Trans_Serial, PremiumPayment, DepositValue, CheckNo, OrderNo_Int)
    SELECT OrderNo, 1, ShiftSerial, TypeSerial, TableNo, HallNo, GuestNo, CustNo, BankNo, EmpNo, TakeAwayLoc, Remarks, OrderDate, TimeIn, OrderTime, ReturnTime,
      UserNo, PosNo, WaiterNo, ShiftNo, TransType, PayWay, DiscountType, MinCharge, SubTotal, Tips, Service, Tax, Discount, ComboDifference, Addition, MinChargeDifference, CashPayment,
      VisaPayment, HourNo, Closed, State, Payed, SerialNo, CustPayment, Changed, SNo, RecieveNo, DelegationNo, PersonName, DepositNo, BranchNo, PosSerial, BranchOrderNo, BranchShiftSerial,
      OrderPrinted, CallCenterNo, ReceiveTime, Exclusive, TaxInvoiceNo, ManagerNo, CheckDiscount, TaxDiscount, Trans_Serial, PremiumPayment, DepositValue, CheckNo, OrderNo_Int
    FROM dbo.Orders_M_Daily WHERE OrderNo = @OrderNo;
    INSERT INTO dbo.Orders_D_Prints (OrderNo, PrintsNo, ItemNo, SerialNo, Qty, Price, Description, Combo, ItemDetailNo, Rank, ItemsCombo, ItemDiscount, ItemTime, OpenDesc, TimeVal, ItemTax, ItemService, Printed, SentBy, Weight, ItemsNo)
    SELECT OrderNo, 1, ItemNo, SerialNo, Qty, Price, Description, Combo, ItemDetailNo, Rank, ItemsCombo, ItemDiscount, ItemTime, OpenDesc, TimeVal, ItemTax, ItemService, Printed, SentBy, Weight, ItemsNo
    FROM dbo.Orders_D_Daily WHERE OrderNo = @OrderNo;
    SET @Prints = 1;
  END;
  IF NOT EXISTS (SELECT 1 FROM dbo.Orders_M_Daily m JOIN dbo.Orders_Serials s ON s.OrderNo = m.OrderNo AND s.ShiftSerial = m.ShiftSerial
                 JOIN dbo.Orders_Checks c ON c.OrderNo = m.OrderNo AND c.CheckNo = m.CheckNo WHERE m.OrderNo = @OrderNo)
    THROW 51014, 'saved order failed its consistency check', 1;
  COMMIT TRANSACTION;
  SELECT 'written' AS r, @Prints AS Prints, @Gap AS Gap, @Short AS Short, @Before AS Before, @Service AS Service, @OrderNo AS OrderNo, @ShiftSerial AS ShiftSerial, @BranchOrderNo AS BranchOrderNo, @CheckNo AS CheckNo, @Total AS Total, @Cust AS CustNo,
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
    [void]$cmd.Parameters.AddWithValue("@p$i", [decimal]$l.price); $cmd.Parameters["@p$i"].SqlDbType = [System.Data.SqlDbType]::Money
    [void]$cmd.Parameters.AddWithValue("@n$i", [string]$l.note)
  }
  $cmd.CommandText = $decl + $Batch
  # The address loses the floor/flat parts and «، القاهرة»: Apex keeps 100 characters of it (Karim 01-11: «String or binary data would be truncated»).
  $p = @{ '@Exec' = $(if ($mode -eq 'shadow') { 0 } else { 1 }); '@IsTest' = $(if ($mode -eq 'test') { 1 } else { 0 }); '@PayWay' = $(if ($job.payment -eq 'paid') { 'Ledge' } else { 'Cash' }); '@Floor' = $(if ([string]$job.customer.address -match '(?:الدور|الطابق)\s*[:：]\s*([^،,—\-]+)') { $Matches[1].Trim() } else { '' }); '@Flat' = $(if ([string]$job.customer.address -match 'الشقة\s*[:：]\s*([^،,—\-]+)') { $Matches[1].Trim() } else { '' }); '@Pos' = $WriterPos; '@LocationNo' = [int]$job.locationNo; '@ServiceItem' = [string]$TalabatServiceItem; '@RefPos' = $(if ($mode -eq 'test') { $RefPosTest } else { $RefPos }); '@Branch' = [int]$job.branchNo
          '@Marker' = ('M' + $(if ($job.source -eq 'site') { 'S' } else { 'T' }) + ':' + $job.ref); '@Kind' = [string]$job.source; '@Phone' = [string]$job.customer.phone
          '@Label' = [string]$job.label; '@Address' = ((([string]$job.customer.address) -replace '\s*—\s*(?:الدور|الطابق|الشقة)\s*[:：]\s*[^—]*', '') -replace '\s*[،,]\s*(?:القاهرة|Cairo|Egypt|مصر)\s*(?=—|$)', '').Trim(); '@Sign' = [string]$job.sign; '@Remarks' = [string]$job.note
          '@NoTpl' = $(if ($mode -eq 'test' -and $job.noTemplate) { 1 } else { 0 }); '@AreaService' = $(if ($job.areaService -ne $null -and "$($job.areaService)" -ne '') { [decimal]$job.areaService } else { [decimal]-1 }); '@RestDiscount' = [decimal]$job.restaurantDiscount; '@Target' = $(if ($job.targetTotal) { [decimal]$job.targetTotal } else { [decimal]0 }); '@AddPrinted' = $(if ($AddPrintedOrders) { 1 } else { 0 }); '@PrintedFlag' = $PrintedFlag; '@UserNo' = $WriterUserNo
          '@TimeText' = (Get-Date).ToString('hh:mm:ss tt', [Globalization.CultureInfo]::GetCultureInfo('ar-EG')) }
  foreach($k in $p.Keys){ [void]$cmd.Parameters.AddWithValue($k, $p[$k]) }
  # Amounts as money (Karim 01-11, «Arithmetic overflow»): a parameter takes its size from its value, so a restaurant
  # discount of 0 became numeric(1,0) and adding the price difference to it overflowed. Money holds any amount.
  foreach($k in @('@RestDiscount', '@Target', '@AreaService')){ $cmd.Parameters[$k].SqlDbType = [System.Data.SqlDbType]::Money }
  $cmd.Parameters['@Phone'].SqlDbType = [System.Data.SqlDbType]::VarChar   # digits only; varchar so the customer search can use Apex's index
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
    if ($job.mode -eq 'fix-customer-live') {
      # Karim 01-11 (approved): put back a customer's floor/flat that the repair emptied (only these two fields, one customer).
      if (-not $AllowLive) { throw 'live mode is locked on this PC ($AllowLive)' }
      $out.mode = 'fix-customer-live'; $c = Open-Db 'live'
      $cmd = $c.CreateCommand(); $cmd.CommandText = "UPDATE dbo.Customers SET FloorNo = @f, FlatNo = @t WHERE CustNo = @n AND ISNULL(RTRIM(FloorNo), '') = '' AND ISNULL(RTRIM(FlatNo), '') = ''; SELECT 'F' k, @@ROWCOUNT n, (SELECT RTRIM(FloorNo) + '/' + RTRIM(FlatNo) FROM dbo.Customers WHERE CustNo = @n) now"
      [void]$cmd.Parameters.AddWithValue('@n', [decimal]$job.custNo); [void]$cmd.Parameters.AddWithValue('@f', [string]$job.floor); [void]$cmd.Parameters.AddWithValue('@t', [string]$job.flat)
      $rd = $cmd.ExecuteReader(); $rows = @(); while ($rd.Read()) { $h = [ordered]@{}; for ($i = 0; $i -lt $rd.FieldCount; $i++) { $h[$rd.GetName($i)] = "$($rd.GetValue($i))".Trim() }; $rows += $h }; $rd.Close()
      $out.saved = $rows; $out.ok = $true
      throw 'INSPECT_DONE'
    }
    if ($job.mode -eq 'repair-live') {
      # Karim 01-11 (approved): the writer's own orders of today saved before the fix get Apex's printed copy, and their
      # customers the fields Apex's screens read (the order's own address, area, floor, flat). Nothing else is touched.
      if (-not $AllowLive) { throw 'live mode is locked on this PC ($AllowLive)' }
      $out.mode = 'repair-live'; $c = Open-Db 'live'
      $cmd = $c.CreateCommand(); $cmd.CommandTimeout = 60
      $cmd.CommandText = @'
SET XACT_ABORT ON;
DECLARE @Pos int = @PosIn, @U int = @UIn;
DECLARE @Todo TABLE (OrderNo numeric(18,0) PRIMARY KEY, CustNo numeric(18,0));
INSERT INTO @Todo SELECT m.OrderNo, m.CustNo FROM dbo.Orders_M_Daily m WITH (NOLOCK)
  WHERE m.PosNo = @Pos AND m.UserNo = @U AND NOT EXISTS (SELECT 1 FROM dbo.Orders_M_Prints p WITH (NOLOCK) WHERE p.OrderNo = m.OrderNo);
BEGIN TRANSACTION;
INSERT INTO dbo.Orders_M_Prints (OrderNo, PrintsNo, ShiftSerial, TypeSerial, TableNo, HallNo, GuestNo, CustNo, BankNo, EmpNo, TakeAwayLoc, Remarks, OrderDate, TimeIn, OrderTime, ReturnTime,
  UserNo, PosNo, WaiterNo, ShiftNo, TransType, PayWay, DiscountType, MinCharge, SubTotal, Tips, Service, Tax, Discount, ComboDifference, Addition, MinChargeDifference, CashPayment,
  VisaPayment, HourNo, Closed, State, Payed, SerialNo, CustPayment, Changed, SNo, RecieveNo, DelegationNo, PersonName, DepositNo, BranchNo, PosSerial, BranchOrderNo, BranchShiftSerial,
  OrderPrinted, CallCenterNo, ReceiveTime, Exclusive, TaxInvoiceNo, ManagerNo, CheckDiscount, TaxDiscount, Trans_Serial, PremiumPayment, DepositValue, CheckNo, OrderNo_Int)
SELECT m.OrderNo, 1, ShiftSerial, TypeSerial, TableNo, HallNo, GuestNo, m.CustNo, BankNo, EmpNo, TakeAwayLoc, Remarks, OrderDate, TimeIn, OrderTime, NULL,
  UserNo, PosNo, 0, ShiftNo, TransType, PayWay, DiscountType, MinCharge, SubTotal, Tips, Service, Tax, Discount, ComboDifference, Addition, MinChargeDifference, CashPayment,
  VisaPayment, HourNo, Closed, State, Payed, SerialNo, CustPayment, Changed, SNo, RecieveNo, DelegationNo, '', DepositNo, BranchNo, PosSerial, BranchOrderNo, BranchShiftSerial,
  OrderPrinted, CallCenterNo, ReceiveTime, Exclusive, TaxInvoiceNo, ManagerNo, CheckDiscount, TaxDiscount, Trans_Serial, PremiumPayment, DepositValue, CheckNo, OrderNo_Int
FROM dbo.Orders_M_Daily m JOIN @Todo t ON t.OrderNo = m.OrderNo;
INSERT INTO dbo.Orders_D_Prints (OrderNo, PrintsNo, ItemNo, SerialNo, Qty, Price, Description, Combo, ItemDetailNo, Rank, ItemsCombo, ItemDiscount, ItemTime, OpenDesc, TimeVal, ItemTax, ItemService, Printed, SentBy, Weight, ItemsNo)
SELECT d.OrderNo, 1, ItemNo, SerialNo, Qty, Price, Description, Combo, ItemDetailNo, Rank, ItemsCombo, ItemDiscount, ItemTime, OpenDesc, TimeVal, ItemTax, ItemService, Printed, SentBy, Weight, ItemsNo
FROM dbo.Orders_D_Daily d JOIN @Todo t ON t.OrderNo = d.OrderNo;
-- Each customer once, from the newest of these orders: the order's address (without the floor/flat parts), area, floor, flat, branch.
DECLARE @Cu TABLE (CustNo numeric(18,0) PRIMARY KEY, OrderNo numeric(18,0));
INSERT INTO @Cu SELECT CustNo, MAX(OrderNo) FROM @Todo WHERE CustNo IS NOT NULL GROUP BY CustNo;
UPDATE c SET Phone = CASE WHEN ISNULL(RTRIM(c.Phone), '') = '' THEN RTRIM(ISNULL(NULLIF(RTRIM(c.Mobile), ''), m.o_Phone)) ELSE c.Phone END,
  CType = ISNULL(c.CType, N'أفراد'), Note = ISNULL(c.Note, '.'), CLedge = ISNULL(c.CLedge, '0'), StreetNo = ISNULL(c.StreetNo, 0), ZoneNo = ISNULL(c.ZoneNo, 0),
  Name = LEFT(RTRIM(m.o_CustName), 50),
  Address = LEFT(RTRIM(CASE WHEN CHARINDEX(N' — الدور', m.o_Address) > 0 THEN LEFT(m.o_Address, CHARINDEX(N' — الدور', m.o_Address) - 1)
                            WHEN CHARINDEX(N' — الشقة', m.o_Address) > 0 THEN LEFT(m.o_Address, CHARINDEX(N' — الشقة', m.o_Address) - 1) ELSE m.o_Address END), 200),
  LocationNo = ISNULL(m.o_LocationNo, c.LocationNo), UBranchNo = m.BranchNo, FloorNo = LEFT(RTRIM(m.o_FloorNo), 20), FlatNo = LEFT(RTRIM(m.o_FlatNo), 20)
FROM dbo.Customers c JOIN @Cu u ON u.CustNo = c.CustNo JOIN dbo.Orders_M_Daily m ON m.OrderNo = u.OrderNo;
INSERT INTO dbo.Customers_Log (CustNo, SNo, Name, CType, Phone, Address, FlatNo, FloorNo, Sign, CLedge, LocationNo, Note, UBranchNo, StreetNo, TransDate, ModifyUser)
SELECT c.CustNo, (SELECT ISNULL(MAX(SNo), 0) + 1 FROM dbo.Customers_Log l WHERE l.CustNo = c.CustNo), c.Name, c.CType, c.Phone, c.Address, c.FlatNo, c.FloorNo, c.Sign, c.CLedge, c.LocationNo, c.Note, c.UBranchNo, c.StreetNo, GETDATE(), 'MARSAD'
FROM dbo.Customers c JOIN @Cu u ON u.CustNo = c.CustNo;
COMMIT;
SELECT 'R' k, t.OrderNo, t.CustNo, (SELECT COUNT(*) FROM dbo.Orders_M_Prints p WHERE p.OrderNo = t.OrderNo) mp, (SELECT COUNT(*) FROM dbo.Orders_D_Prints p WHERE p.OrderNo = t.OrderNo) dp,
  RTRIM(c.Phone) ph, RTRIM(c.CType) ct, c.LocationNo, c.UBranchNo, RTRIM(c.FloorNo) fl, RTRIM(c.FlatNo) ft, RTRIM(c.Address) adr FROM @Todo t LEFT JOIN dbo.Customers c ON c.CustNo = t.CustNo;
'@
      [void]$cmd.Parameters.AddWithValue('@PosIn', [int]$WriterPos); [void]$cmd.Parameters.AddWithValue('@UIn', [int]$WriterUserNo)
      $rd = $cmd.ExecuteReader(); $rows = @(); while ($rd.Read()) { $h = [ordered]@{}; for ($i = 0; $i -lt $rd.FieldCount; $i++) { $h[$rd.GetName($i)] = "$($rd.GetValue($i))".Trim() }; $rows += $h }; $rd.Close()
      $out.saved = $rows; $out.ok = $true
      throw 'INSPECT_DONE'
    }
    if ($job.mode -eq 'inspect-menu') {
      # Read-only, production: the Apex items sold online (number, name, online price, group), for the menu mapping.
      $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[0]);Database=Resturant;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec)))
      try { $c.Open() } catch { $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[1]);Database=Resturant;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec))); $c.Open() }
      $out.mode = 'inspect-menu'; $rows = @()
      $cmd = $c.CreateCommand(); $cmd.CommandTimeout = 30
      $cmd.CommandText = "SELECT RTRIM(i.ItemNo) AS no, RTRIM(i.ItemName) AS nm, i.OnlinePrice AS op, i.GroupNo AS g, ISNULL(i.StopItem,0) AS st, ISNULL(i.StopOnline,0) AS so, (SELECT COUNT(*) FROM Orders_D_Daily d WITH (NOLOCK) JOIN Orders_M_Daily m WITH (NOLOCK) ON m.OrderNo = d.OrderNo WHERE d.ItemNo = i.ItemNo AND ISNULL(m.OnlineType,'') <> '') AS sold FROM Items i WITH (NOLOCK) WHERE ISNULL(i.OnlinePrice,0) > 0 ORDER BY i.ItemNo"
      $rd = $cmd.ExecuteReader(); while ($rd.Read()) { $rows += ,@("$($rd['no'])", "$($rd['nm'])", [double]$rd['op'], "$($rd['g'])", [int]$rd['st'], [int]$rd['so'], [int]$rd['sold']) }; $rd.Close()
      $out.saved = $rows; $out.ok = $true
      throw 'INSPECT_DONE'
    }
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
    if ($job.mode -eq 'inspect-serial') {
      # Read-only, production: today's order numbering columns (numbers and times only, no customer columns) — to see
      # where a serial jumped and which order did it.
      $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[0]);Database=Resturant;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec)))
      try { $c.Open() } catch { $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[1]);Database=Resturant;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec))); $c.Open() }
      $out.mode = 'inspect-serial'; $rows = @()
      foreach($q in @("SELECT 'M' k, OrderNo, BranchNo, PosNo, UserNo, ShiftNo, OrderDate, TimeIn, OrderTime, ShiftSerial, BranchShiftSerial, TypeSerial, SNo, SerialNo, BranchOrderNo, RecieveNo, PosSerial, CheckNo, RTRIM(PayWay) PayWay, OnlineType, TransType FROM Orders_M_Daily WITH (NOLOCK) ORDER BY TimeIn",
                      "SELECT 'S' k, * FROM Orders_Serials WITH (NOLOCK) WHERE OrderNo IN (SELECT OrderNo FROM Orders_M_Daily WITH (NOLOCK))",
                      "SELECT 'T' k, create_date AS sql_started FROM sys.databases WHERE name = 'tempdb'",
                      "SELECT 'I' k, IDENT_CURRENT('Orders_Serials') AS ident_now, IDENT_INCR('Orders_Serials') AS incr")){
        try { $cmd = $c.CreateCommand(); $cmd.CommandTimeout = 30; $cmd.CommandText = $q; $rd = $cmd.ExecuteReader(); while ($rd.Read()) { $h = [ordered]@{}; for ($i = 0; $i -lt $rd.FieldCount; $i++) { $h[$rd.GetName($i)] = "$($rd.GetValue($i))".Trim() }; $rows += $h }; $rd.Close() } catch { $rows += @{ error = $_.Exception.Message } }
      }
      $out.saved = $rows; $out.ok = $true
      throw 'INSPECT_DONE'
    }
    if ($job.mode -eq 'inspect-server') {
      # Read-only: why SQL Server restarted (its own error log around the restart) and its version. Fails quietly without the right.
      $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[0]);Database=Resturant;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec)))
      try { $c.Open() } catch { $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[1]);Database=Resturant;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec))); $c.Open() }
      $out.mode = 'inspect-server'; $rows = @()
      foreach($q in @("SELECT 'V' k, CAST(SERVERPROPERTY('ProductVersion') AS varchar(30)) ver, CAST(SERVERPROPERTY('Edition') AS varchar(60)) ed, (SELECT create_date FROM sys.databases WHERE name = 'tempdb') started",
                      "EXEC sys.sp_readerrorlog 0, 1",
                      "EXEC sys.sp_readerrorlog 1, 1",
                      "SELECT 'J' k, j.name, h.run_date, h.run_time, h.run_status, h.message FROM msdb.dbo.sysjobhistory h JOIN msdb.dbo.sysjobs j ON j.job_id = h.job_id WHERE h.run_date >= 20261031")){
        try { $cmd = $c.CreateCommand(); $cmd.CommandTimeout = 30; $cmd.CommandText = $q; $rd = $cmd.ExecuteReader(); while ($rd.Read()) { $h = [ordered]@{ q = $q.Substring(0, [math]::Min(30, $q.Length)) }; for ($i = 0; $i -lt $rd.FieldCount; $i++) { $h[$rd.GetName($i)] = "$($rd.GetValue($i))".Trim() }; $rows += $h }; $rd.Close() } catch { $rows += @{ q = $q.Substring(0, [math]::Min(30, $q.Length)); error = $_.Exception.Message } }
      }
      $out.saved = $rows; $out.ok = $true
      throw 'INSPECT_DONE'
    }
    if ($job.mode -eq 'inspect-stop') {
      # Read-only, production: how Apex stops an item (globally and per branch) — columns and counts only.
      $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[0]);Database=Resturant;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec)))
      try { $c.Open() } catch { $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[1]);Database=Resturant;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec))); $c.Open() }
      $out.mode = 'inspect-stop'; $rows = @()
      foreach($q in @("SELECT 'C' k, t.name tb, c.name col, ty.name tp FROM sys.columns c JOIN sys.tables t ON t.object_id = c.object_id JOIN sys.types ty ON ty.user_type_id = c.user_type_id WHERE t.name IN ('ItemsBranches','ItemsOnlineTypes') OR (t.name = 'Items' AND (c.name LIKE '%Stop%' OR c.name LIKE '%Active%' OR c.name LIKE '%Avail%' OR c.name LIKE '%Hide%'))",
                      "SELECT 'S' k, SUM(CASE WHEN ISNULL(StopItem,0)<>0 THEN 1 ELSE 0 END) stopItem, SUM(CASE WHEN ISNULL(StopOnline,0)<>0 THEN 1 ELSE 0 END) stopOnline, COUNT(*) n FROM Items WITH (NOLOCK)",
                      "SELECT TOP 20 'B' k, * FROM ItemsBranches WITH (NOLOCK) WHERE ItemNo IN ('0108040','0107013','0201003','0101006')",
                      "SELECT 'T' k, t.name tb FROM sys.tables t WHERE t.name LIKE '%Stop%' OR t.name LIKE '%Avail%' OR t.name LIKE 'ItemsBranch%'",
                      "SELECT 'SC' k, t.name tb, c.name col, ty.name tp, c.is_identity idn FROM sys.columns c JOIN sys.tables t ON t.object_id = c.object_id JOIN sys.types ty ON ty.user_type_id = c.user_type_id WHERE t.name IN ('StoppedItems','StoppedItems_Trans','StoppedItemsDetails','StopReasons','StoppedBranches') ORDER BY t.name, c.column_id",
                      "SELECT 'R1' k, COUNT(*) n FROM StoppedItems WITH (NOLOCK)",
                      "SELECT TOP 8 'R2' k, * FROM StoppedItems WITH (NOLOCK)",
                      "SELECT TOP 8 'R3' k, * FROM StoppedItems_Trans WITH (NOLOCK) ORDER BY 2 DESC",
                      "SELECT TOP 8 'R4' k, * FROM StoppedItemsDetails WITH (NOLOCK)",
                      "SELECT TOP 10 'R5' k, * FROM StopReasons WITH (NOLOCK)",
                      "SELECT 'TR' k, OBJECT_NAME(parent_id) t, name FROM sys.triggers WHERE OBJECT_NAME(parent_id) LIKE 'Stopped%'")){
        try { $cmd = $c.CreateCommand(); $cmd.CommandTimeout = 30; $cmd.CommandText = $q; $rd = $cmd.ExecuteReader(); while ($rd.Read()) { $h = [ordered]@{}; for ($i = 0; $i -lt $rd.FieldCount; $i++) { $h[$rd.GetName($i)] = "$($rd.GetValue($i))".Trim() }; $rows += $h }; $rd.Close() } catch { $rows += @{ q = $q.Substring(0, 40); error = $_.Exception.Message } }
      }
      $out.saved = $rows; $out.ok = $true
      throw 'INSPECT_DONE'
    }
    if ($job.mode -eq 'inspect-loc') {
      # Read-only, production: where the delivery area of an order is (Karim 01-11: area and comment missing in alerts of Talabat orders).
      $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[0]);Database=Resturant;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec)))
      try { $c.Open() } catch { $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[1]);Database=Resturant;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec))); $c.Open() }
      $out.mode = 'inspect-loc'; $rows = @()
      foreach($q in @("SELECT 'LT' k, t.name tb, (SELECT SUM(p.rows) FROM sys.partitions p WHERE p.object_id = t.object_id AND p.index_id IN (0,1)) n FROM sys.tables t WHERE EXISTS (SELECT 1 FROM sys.columns c WHERE c.object_id = t.object_id AND c.name = 'LocationNo')",
                      "SELECT 'LC' k, t.name tb, c.name col, ty.name tp FROM sys.columns c JOIN sys.tables t ON t.object_id = c.object_id JOIN sys.types ty ON ty.user_type_id = c.user_type_id WHERE t.name IN ('LocationBranches','LocationServices','Location')",
                      "SELECT TOP 12 'L2' k, * FROM LocationBranches WITH (NOLOCK) WHERE LocationNo IN (218, 331, 354, 370, 371, 372)",
                      "SELECT TOP 12 'L3' k, * FROM LocationServices WITH (NOLOCK) WHERE LocationNo IN (218, 331, 354, 370, 371, 372)",
                      "SELECT TOP 6 'L4' k, * FROM Location WITH (NOLOCK) ORDER BY LocationNo DESC",
                      "SELECT 'LB' k, BranchNo, COUNT(*) n, MIN(LocationNo) mn, MAX(LocationNo) mx FROM Location WITH (NOLOCK) GROUP BY BranchNo",
                      "SELECT 'OC' k, c.name col FROM sys.columns c WHERE c.object_id = OBJECT_ID('Orders_M_Daily') AND (c.name LIKE '%Loc%' OR c.name LIKE '%Area%' OR c.name LIKE '%Zone%' OR c.name LIKE '%Region%' OR c.name LIKE '%Addr%' OR c.name LIKE '%Rem%' OR c.name LIKE '%Note%' OR c.name LIKE '%Comment%')",
                      "SELECT TOP 40 'O' k, m.OrderNo, m.ShiftSerial, m.BranchNo, m.OnlineType, m.TimeIn, m.o_LocationNo, (SELECT TOP 1 RTRIM(l.LocationName) FROM Location l WITH (NOLOCK) WHERE l.LocationNo = m.o_LocationNo) AS anyBranchLoc, (SELECT TOP 1 RTRIM(l.LocationName) FROM Location l WITH (NOLOCK) WHERE l.LocationNo = m.o_LocationNo AND l.BranchNo = m.BranchNo) AS sameBranchLoc, LEN(RTRIM(ISNULL(m.Remarks,''))) AS remLen, LEFT(RTRIM(ISNULL(m.Remarks,'')), 60) AS rem FROM Orders_M_Daily m WITH (NOLOCK) ORDER BY m.OrderNo DESC")){
        try { $cmd = $c.CreateCommand(); $cmd.CommandTimeout = 30; $cmd.CommandText = $q; $rd = $cmd.ExecuteReader(); while ($rd.Read()) { $h = [ordered]@{}; for ($i = 0; $i -lt $rd.FieldCount; $i++) { $h[$rd.GetName($i)] = "$($rd.GetValue($i))".Trim() }; $rows += $h }; $rd.Close() } catch { $rows += @{ q = $q.Substring(0, 40); error = $_.Exception.Message } }
      }
      $out.saved = $rows; $out.ok = $true
      throw 'INSPECT_DONE'
    }
    if ($job.mode -eq 'inspect-cols') {
      # Read-only, production: the numeric column sizes the writer fills (an «Arithmetic overflow» on 01-11), and the writer's own orders today.
      $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[0]);Database=Resturant;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec)))
      try { $c.Open() } catch { $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[1]);Database=Resturant;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec))); $c.Open() }
      $out.mode = 'inspect-cols'; $rows = @()
      foreach($q in @("SELECT 'NC' k, t.name tb, c.name col, ty.name tp, c.precision pr, c.scale sc FROM sys.columns c JOIN sys.tables t ON t.object_id = c.object_id JOIN sys.types ty ON ty.user_type_id = c.user_type_id WHERE t.name IN ('Orders_M_Daily','Orders_D_Daily','Customers','Orders_Serials','Orders_Checks','CLedges','OrderLog','Counter','PrintedOrders') AND ty.name IN ('numeric','decimal','int','smallint','tinyint','money','smallmoney') AND (ty.name NOT IN ('numeric','decimal') OR c.precision < 18 OR c.scale > 0)",
                      "SELECT 'MX' k, MAX(ShiftSerial) ss, MAX(BranchShiftSerial) bss, MAX(TypeSerial) ts, MAX(BranchOrderNo) bon, MAX(PosSerial) ps, MAX(CheckNo) cn, MAX(OrderNo) mo, MAX(CustNo) cu FROM Orders_M_Daily WITH (NOLOCK)",
                      "SELECT 'CX' k, MAX(CustNo) cu FROM Customers WITH (NOLOCK)",
                      "SELECT 'W' k, m.OrderNo, m.ShiftSerial, m.BranchShiftSerial, m.TypeSerial, m.BranchNo, m.BranchOrderNo, m.PosNo, m.PosSerial, m.CheckNo, m.CustNo, m.SubTotal, m.Service, m.Tax, m.Discount, RTRIM(m.PayWay) pw, m.TimeIn FROM Orders_M_Daily m WITH (NOLOCK) WHERE m.OrderNo IN (SELECT OrderNo FROM OrderLog WITH (NOLOCK) WHERE Status = 'MARSAD')")){
        try { $cmd = $c.CreateCommand(); $cmd.CommandTimeout = 30; $cmd.CommandText = $q; $rd = $cmd.ExecuteReader(); while ($rd.Read()) { $h = [ordered]@{}; for ($i = 0; $i -lt $rd.FieldCount; $i++) { $h[$rd.GetName($i)] = "$($rd.GetValue($i))".Trim() }; $rows += $h }; $rd.Close() } catch { $rows += @{ q = $q.Substring(0, 40); error = $_.Exception.Message } }
      }
      $out.saved = $rows; $out.ok = $true
      throw 'INSPECT_DONE'
    }
    if ($job.mode -eq 'inspect-tal') {
      # Read-only, production: how staff enter Talabat orders today (sub, service, tax, discount, total, lines) — to match the writer to it.
      $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[0]);Database=Resturant;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec)))
      try { $c.Open() } catch { $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[1]);Database=Resturant;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec))); $c.Open() }
      $out.mode = 'inspect-tal'; $rows = @()
      foreach($q in @("SELECT TOP 60 'T' k, m.OrderNo, m.ShiftSerial, m.BranchNo, RTRIM(m.OnlineType) ot, RTRIM(m.PayWay) pw, m.SubTotal, m.Service, m.Tax, m.Discount, (m.SubTotal + m.Service + m.Tax - m.Discount) AS tot, m.o_LocationNo, LEFT(RTRIM(ISNULL(m.o_Sign,'')),60) sign, m.UserNo, m.TimeIn, (SELECT COUNT(*) FROM Orders_D_Daily d WITH (NOLOCK) WHERE d.OrderNo = m.OrderNo) lines, (SELECT SUM(d.ItemDiscount) FROM Orders_D_Daily d WITH (NOLOCK) WHERE d.OrderNo = m.OrderNo) idisc FROM Orders_M_Daily m WITH (NOLOCK) WHERE m.OnlineType LIKE 'TALABAT%' ORDER BY m.OrderNo DESC")){
        try { $cmd = $c.CreateCommand(); $cmd.CommandTimeout = 30; $cmd.CommandText = $q; $rd = $cmd.ExecuteReader(); while ($rd.Read()) { $h = [ordered]@{}; for ($i = 0; $i -lt $rd.FieldCount; $i++) { $h[$rd.GetName($i)] = "$($rd.GetValue($i))".Trim() }; $rows += $h }; $rd.Close() } catch { $rows += @{ q = $q.Substring(0, 40); error = $_.Exception.Message } }
      }
      $out.saved = $rows; $out.ok = $true
      throw 'INSPECT_DONE'
    }
    if ($job.mode -eq 'inspect-find') {
      # Read-only: today's online orders whose name fields hold given Talabat codes (how they were written, for matching).
      $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[0]);Database=Resturant;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec)))
      try { $c.Open() } catch { $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[1]);Database=Resturant;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec))); $c.Open() }
      $out.mode = 'inspect-find'; $rows = @()
      foreach($q in @("SELECT TOP 40 'O' k, m.OrderNo, m.ShiftSerial, m.BranchNo, RTRIM(m.OnlineType) ot, m.TimeIn, m.PosNo, m.UserNo, RTRIM(ISNULL(m.o_CustName,'')) cn, RTRIM(ISNULL(m.o_PersonName,'')) pn, RTRIM(ISNULL(m.PersonName,'')) pn2, (m.SubTotal + m.Service + m.Tax - m.Discount) tot FROM Orders_M_Daily m WITH (NOLOCK) WHERE m.OnlineType LIKE 'TALABAT%' AND (m.o_CustName LIKE '%9314%' OR m.o_CustName LIKE '%9315%' OR m.o_CustName LIKE '%9316%' OR m.o_CustName LIKE '%3495%' OR m.PersonName LIKE '%9314%' OR m.PersonName LIKE '%3495%' OR m.o_PersonName LIKE '%9314%' OR m.o_PersonName LIKE '%3495%' OR m.o_PersonName LIKE '%9315%' OR m.o_PersonName LIKE '%9316%')",
                      "SELECT TOP 30 'R' k, m.OrderNo, m.ShiftSerial, m.BranchNo, RTRIM(m.OnlineType) ot, m.TimeIn, RTRIM(ISNULL(m.o_CustName,'')) cn, RTRIM(ISNULL(m.o_PersonName,'')) pn, (m.SubTotal + m.Service + m.Tax - m.Discount) tot FROM Orders_M_Daily m WITH (NOLOCK) WHERE m.OnlineType LIKE 'TALABAT%' ORDER BY m.OrderNo DESC")){
        try { $cmd = $c.CreateCommand(); $cmd.CommandTimeout = 30; $cmd.CommandText = $q; $rd = $cmd.ExecuteReader(); while ($rd.Read()) { $h = [ordered]@{}; for ($i = 0; $i -lt $rd.FieldCount; $i++) { $h[$rd.GetName($i)] = "$($rd.GetValue($i))".Trim() }; $rows += $h }; $rd.Close() } catch { $rows += @{ q = $q.Substring(0, 40); error = $_.Exception.Message } }
      }
      $out.saved = $rows; $out.ok = $true
      throw 'INSPECT_DONE'
    }
    if ($job.mode -eq 'inspect-idx') {
      # Read-only: the indexes of the archive (Orders_M), to know if «yesterday's» order can be found cheaply.
      $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[0]);Database=Resturant;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec)))
      try { $c.Open() } catch { $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[1]);Database=Resturant;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec))); $c.Open() }
      $out.mode = 'inspect-idx'; $rows = @()
      foreach($q in @("SELECT 'F' k, RTRIM(OnlineType) ot, RTRIM(PayWay) pw, RTRIM(ISNULL(TakeAwayLoc,'')) tal, RTRIM(ISNULL(TableNo,'')) tn, GuestNo, RTRIM(ISNULL(TransType,'')) tt, ISNULL(CONVERT(varchar(20), DiscountType),'NULL') dt, ISNULL(CONVERT(varchar(20), HallNo),'NULL') hn, ISNULL(CONVERT(varchar(20), Otlob),'NULL') ob, ISNULL(CONVERT(varchar(20), DeliveryTrack),'NULL') dtr, TaxRatio, COUNT(*) n FROM Orders_M_Daily WITH (NOLOCK) WHERE OnlineType IS NOT NULL AND RTRIM(OnlineType) <> '' AND PosNo <> 70 GROUP BY RTRIM(OnlineType), RTRIM(PayWay), RTRIM(ISNULL(TakeAwayLoc,'')), RTRIM(ISNULL(TableNo,'')), GuestNo, RTRIM(ISNULL(TransType,'')), ISNULL(CONVERT(varchar(20), DiscountType),'NULL'), ISNULL(CONVERT(varchar(20), HallNo),'NULL'), ISNULL(CONVERT(varchar(20), Otlob),'NULL'), ISNULL(CONVERT(varchar(20), DeliveryTrack),'NULL'), TaxRatio")){
        try { $cmd = $c.CreateCommand(); $cmd.CommandTimeout = 30; $cmd.CommandText = $q; $rd = $cmd.ExecuteReader(); while ($rd.Read()) { $h = [ordered]@{}; for ($i = 0; $i -lt $rd.FieldCount; $i++) { $h[$rd.GetName($i)] = "$($rd.GetValue($i))".Trim() }; $rows += $h }; $rd.Close() } catch { $rows += @{ q = $q.Substring(0, 40); error = $_.Exception.Message } }
      }
      $out.saved = $rows; $out.ok = $true
      throw 'INSPECT_DONE'
    }
    if ($job.mode -eq 'inspect-lines') {
      # Read-only, production: every online order line today with the price staff's Apex used and the item's price lists — to check the writer prices the same.
      $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[0]);Database=Resturant;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec)))
      try { $c.Open() } catch { $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[1]);Database=Resturant;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec))); $c.Open() }
      $out.mode = 'inspect-lines'; $rows = @()
      foreach($q in @("SELECT 'L' k, m.OrderNo, m.BranchNo, RTRIM(m.OnlineType) ot, m.UserNo, d.ItemNo, d.Qty, d.Price, d.ItemDiscount, i.OnlinePrice op, i.DeliveryPrice dp, ib.Price bp, ib.OnPrice bo, (SELECT MIN(Price) FROM ItemsOnlineTypes x WITH (NOLOCK) WHERE x.ItemNo = d.ItemNo AND x.BranchNo = m.BranchNo) ot2, ISNULL(i.StopItem,0) st FROM Orders_M_Daily m WITH (NOLOCK) JOIN Orders_D_Daily d WITH (NOLOCK) ON d.OrderNo = m.OrderNo LEFT JOIN Items i WITH (NOLOCK) ON i.ItemNo = d.ItemNo LEFT JOIN ItemsBranches ib WITH (NOLOCK) ON ib.ItemNo = d.ItemNo AND ib.BranchNo = m.BranchNo WHERE m.OnlineType IS NOT NULL AND RTRIM(m.OnlineType) <> ''",
                      "SELECT 'M' k, m.OrderNo, m.BranchNo, RTRIM(m.OnlineType) ot, RTRIM(m.PayWay) pw, m.SubTotal, m.Service, m.Tax, m.Discount, m.TaxRatio, m.o_LocationNo, m.UserNo FROM Orders_M_Daily m WITH (NOLOCK) WHERE m.OnlineType IS NOT NULL AND RTRIM(m.OnlineType) <> ''")){
        try { $cmd = $c.CreateCommand(); $cmd.CommandTimeout = 30; $cmd.CommandText = $q; $rd = $cmd.ExecuteReader(); while ($rd.Read()) { $h = [ordered]@{}; for ($i = 0; $i -lt $rd.FieldCount; $i++) { $h[$rd.GetName($i)] = "$($rd.GetValue($i))".Trim() }; $rows += $h }; $rd.Close() } catch { $rows += @{ q = $q.Substring(0, 40); error = $_.Exception.Message } }
      }
      $out.saved = $rows; $out.ok = $true
      throw 'INSPECT_DONE'
    }
    if ($job.mode -eq 'inspect-diff') {
      # Read-only, production (Karim 01-11: our orders open empty in Apex — customer, tracking, receipt): our orders next to
      # staff's own Talabat orders of today, every column, and which tables hold rows for each order / customer.
      $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[0]);Database=Resturant;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec)))
      try { $c.Open() } catch { $c = New-Object System.Data.SqlClient.SqlConnection("Server=$($Servers[1]);Database=Resturant;Application Name=MarsadApexWriter-inspect;Connect Timeout=10", (New-Object System.Data.SqlClient.SqlCredential('marsad_reader', $readerSec))); $c.Open() }
      $out.mode = 'inspect-diff'; $rows = @()
      $rd2 = { param($q, $t) try { $cmd = $c.CreateCommand(); $cmd.CommandTimeout = $t; $cmd.CommandText = $q; $rd = $cmd.ExecuteReader(); $res = @(); while ($rd.Read()) { $h = [ordered]@{}; for ($i = 0; $i -lt $rd.FieldCount; $i++) { $h[$rd.GetName($i)] = "$($rd.GetValue($i))".Trim() }; $res += $h }; $rd.Close(); return ,$res } catch { return ,@(@{ error = $_.Exception.Message; q = $q.Substring(0, [Math]::Min(120, $q.Length)) }) } }
      # Extra read-only questions (the reader login can only read): SELECT statements only.
      if ($job.queries) { foreach ($q in @($job.queries)) { if ("$q" -match '^\s*SELECT\s' -and "$q" -notmatch '(?i)\b(insert|update|delete|merge|drop|alter|exec|execute|truncate|create|grant|into)\b') { foreach ($r in (& $rd2 "$q" 15)) { $rows += $r } } else { $rows += @{ error = 'not a plain SELECT'; q = "$q" } } }; $out.saved = $rows; $out.ok = $true; throw 'INSPECT_DONE' }
      $ours = @($job.ours | ForEach-Object { [int]$_ })
      $wu = [int]$WriterUserNo
      $manual = @((& $rd2 "SELECT TOP 3 OrderNo FROM Orders_M_Daily WITH (NOLOCK) WHERE RTRIM(ISNULL(OnlineType,'')) <> '' AND UserNo <> $wu AND OrderNo NOT IN ($($ours -join ',')) AND o_CustName LIKE '%#%' ORDER BY OrderNo DESC" 15) | ForEach-Object { [int]$_.OrderNo })
      $all = @($ours + $manual) | Where-Object { $_ -gt 0 }
      $list = $all -join ','
      $out.ours = $ours; $out.manual = $manual
      foreach ($r in (& $rd2 "SELECT 'M' k, * FROM Orders_M_Daily WITH (NOLOCK) WHERE OrderNo IN ($list)" 15)) { $rows += $r }
      foreach ($r in (& $rd2 "SELECT 'D' k, * FROM Orders_D_Daily WITH (NOLOCK) WHERE OrderNo IN ($list)" 15)) { $rows += $r }
      foreach ($r in (& $rd2 "SELECT 'C' k, c.* FROM Customers c WITH (NOLOCK) WHERE c.CustNo IN (SELECT CustNo FROM Orders_M_Daily WITH (NOLOCK) WHERE OrderNo IN ($list))" 15)) { $rows += $r }
      # Every table with an order / customer column: rows for each of these orders (small or indexed tables only).
      $cols = & $rd2 @"
SELECT t.name tb, c.name col, SUM(p.rows) n,
  MAX(CASE WHEN ic.key_ordinal = 1 THEN 1 ELSE 0 END) ix
FROM sys.tables t JOIN sys.columns c ON c.object_id = t.object_id
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)
LEFT JOIN sys.index_columns ic ON ic.object_id = t.object_id AND ic.column_id = c.column_id
WHERE c.name IN ('OrderNo','TOrderNo','Order_No','OrderID','CustNo','CustomerNo')
GROUP BY t.name, c.name
"@ 20
      $cust = @((& $rd2 "SELECT OrderNo, CustNo FROM Orders_M_Daily WITH (NOLOCK) WHERE OrderNo IN ($list)" 15))
      $custList = (@($cust | ForEach-Object { [int]$_.CustNo }) | Where-Object { $_ -gt 0 }) -join ','
      foreach ($t in $cols) {
        if ($t.error) { $rows += $t; continue }
        $isCust = $t.col -in @('CustNo','CustomerNo')
        $vals = if ($isCust) { $custList } else { $list }
        if (-not $vals) { continue }
        if ([long]$t.n -gt 300000 -and $t.ix -ne '1') { $rows += [ordered]@{ k = 'T'; tb = $t.tb; col = $t.col; n = $t.n; skipped = 'big' }; continue }
        foreach ($r in (& $rd2 "SELECT 'T' k, '$($t.tb)' tb, '$($t.col)' col, CONVERT(varchar(20), [$($t.col)]) v, COUNT(*) cnt FROM [$($t.tb)] WITH (NOLOCK) WHERE [$($t.col)] IN ($vals) GROUP BY [$($t.col)]" 8)) { $rows += $r }
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
      $cmd.CommandText += "; SELECT 'C' k, CustNo, RTRIM(Name) Name, RTRIM(CType) CType, RTRIM(Phone) Phone, RTRIM(Mobile) Mobile, LocationNo, UBranchNo, RTRIM(Note) Note, RTRIM(FlatNo) FlatNo, RTRIM(FloorNo) FloorNo FROM dbo.Customers WITH (NOLOCK) WHERE CustNo = (SELECT CustNo FROM dbo.Orders_M_Daily WITH (NOLOCK) WHERE OrderNo = @o); SELECT 'L' k, Status, WaiterName, Description FROM dbo.OrderLog WITH (NOLOCK) WHERE OrderNo = @o; SELECT 'H' k, Modified, CONVERT(varchar(40), operation_id) op, RTRIM(ISNULL(PersonName,'')) pn, RTRIM(ISNULL(o_PersonName,'')) opn FROM dbo.Orders_M_Daily WITH (NOLOCK) WHERE OrderNo = @o"
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

# Stopping/resuming items per branch (Karim 01-11), the way Apex's own screen does: a row in StoppedItems while stopped,
# the stop logged in StoppedItems_Trans. Only the changes admin queued; checked once a minute; production only when allowed here.
$script:stockNext = Get-Date
function Apply-Stock {
  if ((Get-Date) -lt $script:stockNext) { return }
  $script:stockNext = (Get-Date).AddSeconds(60)
  $s = Api '/api/apex-writer/stock-next' @{}
  if (-not $s.apply -or -not $s.queue) { return }
  $todo = @()
  foreach($br in $s.queue.PSObject.Properties){ foreach($it in $br.Value.PSObject.Properties){ $todo += [pscustomobject]@{ branch = [int]$br.Name; itemNo = [string]$it.Name; act = [string]$it.Value } } }
  if (-not $todo.Count) { return }
  if (-not $AllowLive) { throw 'production writes are locked on this PC ($AllowLive)' }
  $c = Open-Db 'live'; $done = @()
  try {
    foreach($t in $todo){
      try {
        $cmd = $c.CreateCommand(); $cmd.CommandTimeout = 15
        if ($t.act -eq 'stop') { $cmd.CommandText = "SET XACT_ABORT ON; BEGIN TRAN; IF NOT EXISTS (SELECT 1 FROM dbo.StoppedItems WHERE BranchNo = @b AND RTRIM(ItemNo) = @i) BEGIN INSERT INTO dbo.StoppedItems (BranchNo, ItemNo, StopStatus, ReasonNo) VALUES (@b, @i, 1, 0); INSERT INTO dbo.StoppedItems_Trans (BranchNo, ItemNo, ReasonNo, StopDate, StopTime, UserNo) VALUES (@b, @i, 0, CAST(CAST(GETDATE() AS date) AS datetime), GETDATE(), @u); END; COMMIT;" }
        elseif ($t.act -eq 'resume') { $cmd.CommandText = "DELETE FROM dbo.StoppedItems WHERE BranchNo = @b AND RTRIM(ItemNo) = @i;" }
        else { continue }
        [void]$cmd.Parameters.AddWithValue('@b', $t.branch); [void]$cmd.Parameters.AddWithValue('@i', $t.itemNo); [void]$cmd.Parameters.AddWithValue('@u', $WriterUserNo)
        [void]$cmd.ExecuteNonQuery()
        $done += @{ branch = $t.branch; itemNo = $t.itemNo; act = $t.act; ok = $true }
      } catch { $done += @{ branch = $t.branch; itemNo = $t.itemNo; act = $t.act; ok = $false; note = $_.Exception.Message } }
    }
  } finally { try { $c.Close() } catch {} }
  [void](Api '/api/apex-writer/stock' @{ done = $done })
  L ("stock: " + ($done | ConvertTo-Json -Compress))
}

L "writer started (pos $WriterPos)"
$failures = 0
for (;;) {
  try { if ((Get-Item $self).LastWriteTimeUtc -ne $selfStamp) { L 'script updated - restarting'; $mutex.ReleaseMutex(); $mutex.Dispose(); Start-Process powershell.exe -WindowStyle Hidden -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $self + '"'); exit 0 } } catch {}
  try { Self-Test } catch { L "self-test: $($_.Exception.Message)" }
  try { Apply-Stock } catch { L "stock: $($_.Exception.Message)" }
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
        $res.detail = "gap=$($r.Gap) discount=$($r.RestDiscountAll) sub=$($r.SubTotal) tax=$($r.Tax) ratio=$($r.TaxRatio) service=$($r.Service) template=$($r.Template) posSerial=$($r.PosSerial) typeSerial=$($r.TypeSerial) cust=$($r.CustNo) | " + (($job.items | ForEach-Object { "$($_.itemNo)x$($_.qty): $($_.candidates -join ',')" }) -join ' ; ')
        $want = $(if ($job.targetTotal) { $job.targetTotal } else { $job.expectedTotal })
        $res.gap = [math]::Round([double]$r.Gap, 2); $res.short = [math]::Round([double]$r.Short, 2); $res.before = [math]::Round([double]$r.Before, 2); $res.service = [double]$r.Service
      } else {
        $res.orderNo = $r.OrderNo; $res.shiftSerial = $r.ShiftSerial; $res.branchOrderNo = $r.BranchOrderNo; $res.total = [double]$r.Total
        $res.prints = ($r.Prints -eq $true -or "$($r.Prints)" -eq '1' -or "$($r.Prints)" -eq 'True')   # Apex's printed copy saved (needs the Prints grant)
        # The price difference, for admin's «فروق الأسعار» (the order is saved either way).
        $res.gap = [math]::Round([double]$r.Gap, 2); $res.short = [math]::Round([double]$r.Short, 2); $res.before = [math]::Round([double]$r.Before, 2); $res.service = [double]$r.Service; $res.target = $job.targetTotal
        if ($r.r -eq 'written' -and [int]$r.SameBranchNo -gt 1) { $res.error = 'رقم الفرع اتكرر مع أوردر تاني؛ راجعه' }
      }
      [void](Api '/api/apex-writer/result' $res)
      L ("job " + $job.source + ':' + $job.ref + ' -> ' + ($res | ConvertTo-Json -Compress))
      continue
    }
  } catch {
    $failures++
    L "error: $($_.Exception.Message)"
    # What the failed job carried (numbers only, no customer details), so the cause can be found from this log.
    if ($job) { try { L ("  job " + $job.source + ':' + $job.ref + ' branch=' + $job.branchNo + ' loc=' + $job.locationNo + ' areaService=' + $job.areaService + ' pay=' + $job.payment + ' disc=' + $job.restaurantDiscount + ' target=' + $job.targetTotal + ' phoneLen=' + ([string]$job.customer.phone).Length + ' items=' + (($job.items | ForEach-Object { "$($_.itemNo)x$($_.qty)@$($_.price)" }) -join ',')) } catch {} }
    if ($job -and $_.Exception.Message -notmatch 'Unable to connect|timed out|remote name') { try { [void](Api '/api/apex-writer/result' @{ source = $job.source; ref = $job.ref; ok = $false; error = $_.Exception.Message }) } catch {} }
  } finally { if ($c) { try { $c.Close() } catch {} }; $job = $null }
  Start-Sleep -Seconds ([math]::Min(120, $PollSeconds * [math]::Max(1, $failures)))
}
