-- تعريف جهاز المرصد (POS 70) في قايمة أجهزة Apex، علشان تقارير Apex تحسب أوردرات التحويل الآلي في عدد أوردرات كل فرع.
-- يتشغّل مرة واحدة من SSMS بحساب المدير. بيضيف سطر واحد بس لو مش موجود، ومش بيغيّر أي جهاز تاني.
USE [Resturant];
IF NOT EXISTS (SELECT 1 FROM dbo.Pos WHERE PosNo = 70)
  INSERT INTO dbo.Pos (PosNo, PosUsed) VALUES (70, 1);
SELECT PosNo, PosUsed FROM dbo.Pos WHERE PosNo IN (35, 70);
