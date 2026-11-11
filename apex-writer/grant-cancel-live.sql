-- صلاحية الإلغاء التلقائي لكاتب المرصد (قاعدة الإنتاج Resturant). يتشغل مرة واحدة من SSMS بحساب المدير.
-- نفس اللي شاشة Apex بتعمله وهي بتلغي أوردر (اتقرا من Apex 11-11، أوردر 701607): الأوردر وأصنافه بيتنقلوا لـ DOrders_M / DOrders_D
-- وبيتشالوا من Orders_M_Daily / Orders_D_Daily / Invoice. مفيش أي صلاحية تانية.
USE [Resturant];
GRANT SELECT, DELETE ON dbo.Orders_M_Daily TO [marsad_writer];
GRANT SELECT, DELETE ON dbo.Orders_D_Daily TO [marsad_writer];
GRANT SELECT, DELETE ON dbo.Invoice TO [marsad_writer];
GRANT SELECT, INSERT ON dbo.DOrders_M TO [marsad_writer];
GRANT SELECT, INSERT ON dbo.DOrders_D TO [marsad_writer];
GRANT SELECT ON dbo.Orders_Components_daily TO [marsad_writer];
GRANT SELECT ON dbo.Orders_Modify_daily TO [marsad_writer];
