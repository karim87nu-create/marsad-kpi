-- صلاحية إيقاف/رجوع الأصناف لكل فرع لكاتب المرصد (قاعدة الإنتاج Resturant). يتشغل مرة واحدة من SSMS بحساب المدير.
-- نفس جداول شاشة Apex: StoppedItems (الصنف الواقف دلوقتي) و StoppedItems_Trans (سجل الإيقاف). مفيش أي صلاحية تانية.
USE [Resturant];
GRANT SELECT, INSERT, DELETE ON dbo.StoppedItems TO [marsad_writer];
GRANT INSERT ON dbo.StoppedItems_Trans TO [marsad_writer];
