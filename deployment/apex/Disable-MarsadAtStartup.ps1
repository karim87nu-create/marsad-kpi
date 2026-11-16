# Undo Enable-MarsadAtStartup: back to running only while this user is logged on.
$ErrorActionPreference = 'Stop'
$name = 'MarsadOrdersMonitor'
$t = Get-ScheduledTask -TaskName $name
$triggers = @($t.Triggers | Where-Object { $_.CimClass.CimClassName -ne 'MSFT_TaskBootTrigger' })
$p = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive
Set-ScheduledTask -TaskName $name -Trigger $triggers -Principal $p | Out-Null
Write-Host 'رجعت زي الأول (بتشتغل بس لما حد يدخل الويندوز).'
