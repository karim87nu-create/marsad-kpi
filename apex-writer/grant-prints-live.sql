-- صلاحية «نسخة الطباعة» وسجل العميل لكاتب المرصد (قاعدة الإنتاج Resturant). يتشغل مرة واحدة من SSMS بحساب المدير.
-- نفس اللي شاشة Apex بتكتبه مع كل أوردر بيتحفظ: Orders_M_Prints / Orders_D_Prints (الإيصال) و Customers_Log. إضافة بس، مفيش حذف ولا تعديل.
USE [Resturant];
GRANT SELECT, INSERT ON dbo.Orders_M_Prints TO [marsad_writer];
GRANT SELECT, INSERT ON dbo.Orders_D_Prints TO [marsad_writer];
GRANT SELECT, INSERT ON dbo.Customers_Log TO [marsad_writer];
