-- صلاحية «تعديل لاغي للفرع» لكاتب المرصد (قاعدة الإنتاج Resturant). يتشغل مرة واحدة من SSMS بحساب المدير.
-- أوردر طلبات اتلغى على طلبات وهو على Apex: نفس التعديل اللي الكول سنتر بيبعته بإيده (اتقرا من Apex 11-14، أوردر 3530409):
-- التعليق بيبقى «لاغي»، نسخة طباعة جديدة، والفرع بيطبعه تاني. بعد 5 دقايق الإلغاء التلقائي بيشيله.
USE [Resturant];
GRANT UPDATE ON dbo.Orders_M_Daily (Remarks, PrintsNo, OrderTime) TO [marsad_writer];
GRANT SELECT, UPDATE ON dbo.PrintedOrders TO [marsad_writer];
GRANT SELECT, INSERT ON dbo.Orders_M_Prints TO [marsad_writer];
GRANT SELECT, INSERT ON dbo.Orders_D_Prints TO [marsad_writer];
