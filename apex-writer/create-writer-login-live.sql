-- دخول كتابة لقاعدة الإنتاج (Resturant) لكاتب المرصد. يتشغل مرة واحدة من SSMS بحساب المدير.
-- اكتب كلمة سر قوية مكان CHANGE_ME قبل التشغيل، واكتبها بعد كده في Setup-ApexWriter على جهاز الكاشير.
-- مفيش حذف ولا تعديل إعدادات: إضافة أوردرات بس، وتحديث العداد بتاع الكاتب وإحصائيات العميل.
USE [master];
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'marsad_writer')
  CREATE LOGIN [marsad_writer] WITH PASSWORD = N'CHANGE_ME', CHECK_POLICY = ON, DEFAULT_DATABASE = [Resturant];
GO
USE [Resturant];
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'marsad_writer')
  CREATE USER [marsad_writer] FOR LOGIN [marsad_writer];
GO
-- Read what the writer checks; write only the tables an Apex order save writes.
GRANT SELECT ON dbo.Counter TO [marsad_writer];
GRANT SELECT ON dbo.Items TO [marsad_writer];
GRANT SELECT ON dbo.ItemsBranches TO [marsad_writer];
GRANT SELECT ON dbo.ItemsOnlineTypes TO [marsad_writer];
GRANT SELECT ON dbo.Orders_M TO [marsad_writer];
GRANT SELECT, INSERT ON dbo.Orders_M_Daily TO [marsad_writer];
GRANT SELECT, INSERT ON dbo.Orders_D_Daily TO [marsad_writer];
GRANT SELECT, INSERT ON dbo.Orders_Serials TO [marsad_writer];
GRANT SELECT, INSERT ON dbo.Orders_Checks TO [marsad_writer];
GRANT SELECT, INSERT ON dbo.OrderLog TO [marsad_writer];
GRANT SELECT, INSERT ON dbo.PrintedOrders TO [marsad_writer];
GRANT SELECT, INSERT, UPDATE ON dbo.Customers TO [marsad_writer];
GRANT SELECT, INSERT ON dbo.CLedges TO [marsad_writer];
GRANT UPDATE ON dbo.Counter TO [marsad_writer];
GO
-- The writer uses its own POS number (70). Check it has exactly one Counter row in production (it reads, never creates it).
SELECT COUNT(*) AS counter_rows_for_pos_70 FROM dbo.Counter WHERE num = 70;
