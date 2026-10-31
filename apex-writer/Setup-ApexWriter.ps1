# تجهيز كاتب Apex على جهاز الكاشير — يحفظ المفتاح وبيانات الدخول مشفرة لهذا المستخدم فقط (Windows DPAPI)، ويشغّل الكاتب.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
function SaveSecret($file, $sec){ Set-Content -Path (Join-Path $here $file) -Value ($sec | ConvertFrom-SecureString) -Encoding ASCII }
Write-Host 'كاتب Apex للمرصد' -ForegroundColor Cyan
Write-Host '1) مفتاح الكاتب (اختياري): دوس Enter علشان يستخدم مفتاح المرصد اللي على الجهاز.'
$t = Read-Host -AsSecureString 'المفتاح'
if ($t.Length -ge 20) { SaveSecret 'writer_token.dat' $t } elseif ($t.Length -gt 0) { throw 'المفتاح قصير؛ انسخه تاني أو دوس Enter' }
Write-Host '2) دخول الكتابة على Apex (للتجربة والتشغيل بس؛ المعاينة مش محتاجاه). لو لسه مفيش، دوس Enter وكمل.'
$u = Read-Host 'اسم دخول الكتابة (مثلا marsad_writer_test)'
if ($u) {
  $p = Read-Host -AsSecureString 'كلمة السر'
  Set-Content -Path (Join-Path $here 'writer_user.txt') -Value $u.Trim() -Encoding ASCII
  SaveSecret 'writer_cred.dat' $p
}
# Start at sign-in (hidden), and now.
$vbs = Join-Path $here 'run_writer_hidden.vbs'
Set-Content -Path $vbs -Encoding ASCII -Value ('CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""' + (Join-Path $here 'marsad_apex_writer.ps1') + '""", 0, False')
$startup = [Environment]::GetFolderPath('Startup')
$lnk = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $startup 'Marsad Apex Writer.lnk'))
$lnk.TargetPath = 'wscript.exe'; $lnk.Arguments = '//B "' + $vbs + '"'; $lnk.WorkingDirectory = $here; $lnk.Save()
# The monitor keeps the writer running; touch it so it restarts and picks up the new login now.
(Get-Item (Join-Path $here 'marsad_apex_writer.ps1')).LastWriteTime = Get-Date
Write-Host 'تمام. الكاتب اشتغل، وهيشتغل لوحده مع تشغيل الجهاز. حالته بتظهر في صفحة الإدارة.' -ForegroundColor Green
Read-Host 'دوس Enter للخروج'
