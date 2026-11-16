# Karim 11-17: after a restart (Windows update, power cut) nothing of the Marsad ran until someone logged on to Windows.
# This makes the existing task «MarsadOrdersMonitor» also start when the PC starts, even with nobody logged on.
# Windows asks for this PC user's own password once (typed by you in Windows' own box; it is kept by Windows, not by
# the Marsad). Run it as administrator on the cashier PC. To undo: Disable-MarsadAtStartup in the same folder.
$ErrorActionPreference = 'Stop'
$name = 'MarsadOrdersMonitor'
$t = Get-ScheduledTask -TaskName $name
$user = "$env:USERDOMAIN\$env:USERNAME"
Write-Host "المهمة: $name — المستخدم: $user"
$cred = Get-Credential -UserName $user -Message 'اكتب باسورد الويندوز بتاع الجهاز ده (اللي بتدخل بيه)'
if (-not $cred) { Write-Host 'اتلغى'; exit 1 }
$pass = $cred.GetNetworkCredential().Password
if (-not $pass) { Write-Host 'المستخدم ده من غير باسورد — ويندوز مش بيسمح بالتشغيل من غير دخول. شوف الملف: الحل التاني (الدخول التلقائي).'; exit 1 }
$boot = New-ScheduledTaskTrigger -AtStartup
$boot.Delay = 'PT2M'   # two minutes for the network
$triggers = @($t.Triggers | Where-Object { $_.CimClass.CimClassName -ne 'MSFT_TaskBootTrigger' }) + $boot
Set-ScheduledTask -TaskName $name -Trigger $triggers -User $user -Password $pass | Out-Null
$pass = $null
$n = Get-ScheduledTask -TaskName $name
Write-Host ('تمام: ' + $n.Principal.LogonType + ' — التشغيل: ' + (($n.Triggers | ForEach-Object { $_.CimClass.CimClassName -replace 'MSFT_Task|Trigger' }) -join ', '))
Write-Host 'جرّب: اعمل ريستارت ومتدخلش، وبعد 5 دقايق افتح صفحة «السيستم» في المرصد.'
