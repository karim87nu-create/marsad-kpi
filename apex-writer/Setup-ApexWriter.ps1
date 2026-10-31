# Apex writer setup: saves the Resturant_Test writer login for this Windows user only (DPAPI), then restarts the writer.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$f = New-Object System.Windows.Forms.Form
$f.Text = 'كاتب Apex — دخول قاعدة الاختبار'; $f.RightToLeft = 'Yes'; $f.RightToLeftLayout = $true
$f.Size = New-Object System.Drawing.Size(420, 260); $f.StartPosition = 'CenterScreen'; $f.Font = New-Object System.Drawing.Font('Tahoma', 11)
$f.FormBorderStyle = 'FixedDialog'; $f.MaximizeBox = $false; $f.MinimizeBox = $false
function Lbl($t, $y){ $l = New-Object System.Windows.Forms.Label; $l.Text = $t; $l.Location = New-Object System.Drawing.Point(20, $y); $l.AutoSize = $true; $f.Controls.Add($l) }
Lbl 'اسم الدخول:' 25
$u = New-Object System.Windows.Forms.TextBox; $u.Location = New-Object System.Drawing.Point(20, 50); $u.Width = 360; $u.Text = 'marsad_writer_test'; $u.RightToLeft = 'No'; $f.Controls.Add($u)
Lbl 'كلمة السر (نفس اللي اتكتبت في SSMS):' 90
$p = New-Object System.Windows.Forms.TextBox; $p.Location = New-Object System.Drawing.Point(20, 115); $p.Width = 360; $p.UseSystemPasswordChar = $true; $p.RightToLeft = 'No'; $f.Controls.Add($p)
$ok = New-Object System.Windows.Forms.Button; $ok.Text = 'حفظ'; $ok.Location = New-Object System.Drawing.Point(20, 165); $ok.Width = 120; $ok.DialogResult = 'OK'; $f.Controls.Add($ok); $f.AcceptButton = $ok
$cancel = New-Object System.Windows.Forms.Button; $cancel.Text = 'إلغاء'; $cancel.Location = New-Object System.Drawing.Point(150, 165); $cancel.Width = 120; $cancel.DialogResult = 'Cancel'; $f.Controls.Add($cancel)
if ($f.ShowDialog() -ne 'OK') { exit 0 }
if (-not $u.Text.Trim() -or -not $p.Text) { [System.Windows.Forms.MessageBox]::Show('اكتب الاسم وكلمة السر', 'كاتب Apex') | Out-Null; exit 1 }
Set-Content -Path (Join-Path $here 'writer_user.txt') -Value $u.Text.Trim() -Encoding ASCII
$sec = ConvertTo-SecureString $p.Text -AsPlainText -Force
Set-Content -Path (Join-Path $here 'writer_cred.dat') -Value ($sec | ConvertFrom-SecureString) -Encoding ASCII
$p.Text = ''
# The monitor keeps the writer running; touching it makes it restart and read the new login.
(Get-Item (Join-Path $here 'marsad_apex_writer.ps1')).LastWriteTime = Get-Date
[System.Windows.Forms.MessageBox]::Show('اتحفظ. الكاتب هيستخدم الدخول ده على قاعدة الاختبار.', 'كاتب Apex') | Out-Null
